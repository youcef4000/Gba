-- ============================================================================
-- Bornz Studio : projets affiches sur le site, geres depuis l'espace admin.
--
-- A executer une fois APRES setup.sql : Supabase > SQL Editor > New query >
-- coller > Run. Peut etre relance sans risque (les projets existants restent).
-- ============================================================================

create table if not exists public.projects (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  title text not null,
  kind text not null default 'site' check (kind in ('site', 'app', 'demo')),
  url text not null default '',
  year int,
  cat jsonb not null default '{}'::jsonb,      -- {"fr": "...", "en": "...", "ar": "..."}
  summary jsonb not null default '{}'::jsonb,  -- idem
  tags jsonb not null default '{}'::jsonb,     -- {"fr": ["..."], "en": [...], "ar": [...]}
  color_bg text not null default '#0a0a0d',
  color_accent text not null default '#e8b84a',
  color_accent2 text not null default '#9b6bff',
  cover text not null default '',               -- capture ordinateur : chemin du site ou adresse Supabase Storage
  cover_mobile text not null default '',        -- capture telephone (facultative)
  position int not null default 0,
  published boolean not null default true
);
alter table public.projects add column if not exists cover_mobile text not null default '';
create index if not exists projects_position_idx on public.projects (position, id);
alter table public.projects enable row level security;
revoke all on public.projects from anon, authenticated;

-- ---------------------------------------------------------------- outils

create or replace function private.color(v text, fallback text) returns text
language sql immutable as $$
  select case when v ~ '^#[0-9a-fA-F]{6}$' then lower(v) else fallback end
$$;

-- Texte par langue : {"fr": "...", "en": "...", "ar": "..."}, chaque valeur nettoyee.
create or replace function private.i18n_text(v jsonb, n int) returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'fr', private.clean(v ->> 'fr', n),
    'en', private.clean(v ->> 'en', n),
    'ar', private.clean(v ->> 'ar', n))
$$;

-- Etiquettes par langue : listes de 8 elements maximum.
create or replace function private.i18n_tags(v jsonb) returns jsonb
language sql immutable as $$
  select jsonb_object_agg(l, coalesce((
    select jsonb_agg(t) from (
      select private.clean(x, 40) as t
      from jsonb_array_elements_text(case when jsonb_typeof(v -> l) = 'array' then v -> l else '[]'::jsonb end) x
      limit 8) s where t <> ''), '[]'::jsonb))
  from unnest(array['fr', 'en', 'ar']) l
$$;

create or replace function private.project_json(p public.projects) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', p.id, 'title', p.title, 'kind', p.kind, 'url', p.url, 'year', p.year,
    'cat', p.cat, 'summary', p.summary, 'tags', p.tags,
    'bg', p.color_bg, 'accent', p.color_accent, 'accent2', p.color_accent2,
    'cover', p.cover, 'cover_m', p.cover_mobile, 'position', p.position, 'published', p.published)
$$;

-- ------------------------------------------------- lecture publique

create or replace function public.get_projects() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(private.project_json(p) order by p.position, p.id), '[]'::jsonb)
  from public.projects p where p.published
$$;

-- ------------------------------------------------- fonctions admin

create or replace function public.admin_projects() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object('ok', true, 'projects', coalesce((
    select jsonb_agg(private.project_json(p) order by p.position, p.id) from public.projects p), '[]'::jsonb));
end $$;

create or replace function public.admin_save_project(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id bigint := nullif(p ->> 'id', '')::bigint;
  v_title text := private.clean(p ->> 'title', 80);
  v_url text := private.clean(p ->> 'url', 300);
  v_cover text := private.clean(p ->> 'cover', 500);
  v_cover_m text := private.clean(p ->> 'cover_m', 500);
  v_kind text := case when p ->> 'kind' in ('site', 'app', 'demo') then p ->> 'kind' else 'site' end;
  v_year int := case when p ->> 'year' ~ '^[0-9]{4}$' then (p ->> 'year')::int end;
begin
  if not private.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_title = '' then return jsonb_build_object('ok', false, 'error', 'title_required'); end if;
  if v_url <> '' and v_url !~ '^https?://' then return jsonb_build_object('ok', false, 'error', 'bad_url'); end if;
  if (v_cover <> '' and v_cover !~ '^(https?://|assets/)') or (v_cover_m <> '' and v_cover_m !~ '^(https?://|assets/)') then
    return jsonb_build_object('ok', false, 'error', 'bad_cover');
  end if;

  if v_id is null then
    insert into public.projects (title, kind, url, year, cat, summary, tags, color_bg, color_accent, color_accent2,
                                 cover, cover_mobile, position, published)
    values (v_title, v_kind, v_url, v_year,
            private.i18n_text(p -> 'cat', 60), private.i18n_text(p -> 'summary', 600), private.i18n_tags(p -> 'tags'),
            private.color(p ->> 'bg', '#0a0a0d'), private.color(p ->> 'accent', '#e8b84a'),
            private.color(p ->> 'accent2', '#9b6bff'), v_cover, v_cover_m,
            coalesce((select max(position) + 1 from public.projects), 0),
            coalesce((p ->> 'published')::boolean, true))
    returning id into v_id;
  else
    update public.projects set
      title = v_title, kind = v_kind, url = v_url, year = v_year,
      cat = private.i18n_text(p -> 'cat', 60), summary = private.i18n_text(p -> 'summary', 600),
      tags = private.i18n_tags(p -> 'tags'),
      color_bg = private.color(p ->> 'bg', color_bg), color_accent = private.color(p ->> 'accent', color_accent),
      color_accent2 = private.color(p ->> 'accent2', color_accent2),
      cover = v_cover, cover_mobile = v_cover_m, published = coalesce((p ->> 'published')::boolean, published), updated_at = now()
    where id = v_id;
    if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.admin_delete_project(p_id bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.projects where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

-- Deplace un projet d'un cran (p_dir = -1 vers le haut, 1 vers le bas).
create or replace function public.admin_move_project(p_id bigint, p_dir int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  ids bigint[];
  i int;
  j int;
  tmp bigint;
begin
  if not private.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select array_agg(id order by position, id) into ids from public.projects;
  i := array_position(ids, p_id);
  if i is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  j := i + case when p_dir < 0 then -1 else 1 end;
  if j >= 1 and j <= array_length(ids, 1) then
    tmp := ids[i]; ids[i] := ids[j]; ids[j] := tmp;
  end if;
  update public.projects p set position = s.ord - 1
  from unnest(ids) with ordinality as s(id, ord) where p.id = s.id;
  return jsonb_build_object('ok', true);
end $$;

-- ------------------------------------------------- images (Storage)

-- Dossier public "projects" : tout le monde peut voir les images,
-- seul l'admin peut en ajouter, remplacer ou supprimer.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('projects', 'projects', true, 8388608, array['image/webp', 'image/jpeg', 'image/png', 'image/avif', 'image/gif'])
on conflict (id) do nothing;

grant usage on schema private to authenticated;
grant execute on function private.is_admin() to authenticated;

drop policy if exists "bornz projects insert" on storage.objects;
drop policy if exists "bornz projects update" on storage.objects;
drop policy if exists "bornz projects delete" on storage.objects;
drop policy if exists "bornz projects select" on storage.objects;
create policy "bornz projects select" on storage.objects for select to authenticated
  using (bucket_id = 'projects' and private.is_admin());
create policy "bornz projects insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'projects' and private.is_admin());
create policy "bornz projects update" on storage.objects for update to authenticated
  using (bucket_id = 'projects' and private.is_admin());
create policy "bornz projects delete" on storage.objects for delete to authenticated
  using (bucket_id = 'projects' and private.is_admin());

-- ---------------------------------------------------------------- droits

revoke execute on function private.color(text, text), private.i18n_text(jsonb, int), private.i18n_tags(jsonb),
  private.project_json(public.projects) from public, anon, authenticated;
revoke execute on function public.get_projects(), public.admin_projects(), public.admin_save_project(jsonb),
  public.admin_delete_project(bigint), public.admin_move_project(bigint, int) from public, anon, authenticated;
grant execute on function public.get_projects() to anon, authenticated;
grant execute on function public.admin_projects(), public.admin_save_project(jsonb),
  public.admin_delete_project(bigint), public.admin_move_project(bigint, int) to authenticated;

-- ---------------------------------------------------------------- projets de depart

do $$
begin
  if exists (select 1 from public.projects) then return; end if;
  insert into public.projects (title, kind, url, year, cat, summary, tags, color_bg, color_accent, color_accent2, cover, cover_mobile, position) values
  ('Hooked Lab', 'app', 'https://hooked-lab.com/', 2026,
   '{"fr": "SaaS IA", "en": "AI SaaS", "ar": "برمجية ذكاء اصطناعي"}',
   '{"fr": "Collez le lien d''une pub TikTok, Instagram ou Facebook : l''IA reconstitue le script, note le hook, trouve le fournisseur sur 1688, calcule la marge par marché et rédige les textes Meta. Un rapport complet en trois minutes.",
     "en": "Paste a TikTok, Instagram or Facebook ad link: the AI rebuilds the script, scores the hook, finds the 1688 supplier, works out the margin per market and writes the Meta copy. A full report in three minutes.",
     "ar": "الصق رابط إعلان من تيك توك أو إنستغرام أو فيسبوك: يعيد الذكاء الاصطناعي بناء السكريبت، يقيّم الـ Hook، يجد المورّد على 1688، يحسب الهامش لكل سوق ويكتب نصوص Meta. تقرير كامل في ثلاث دقائق."}',
   '{"fr": ["IA Claude", "Analyse vidéo", "Sourcing 1688", "Abonnements"], "en": ["Claude AI", "Video analysis", "1688 sourcing", "Subscriptions"], "ar": ["ذكاء Claude", "تحليل الفيديو", "توريد 1688", "اشتراكات"]}',
   '#07060a', '#e0be55', '#b87333', 'assets/img/projects/hooked-lab.webp', 'assets/img/projects/hooked-lab-m.webp', 0),
  ('Hooked Academy', 'site', 'https://hooked-academy.tech/', 2026,
   '{"fr": "Formation en ligne", "en": "Online academy", "ar": "أكاديمية على الإنترنت"}',
   '{"fr": "Une école en ligne pour apprendre à monter des pubs qui vendent : leçons animées de deux minutes en darija, quiz, espace étudiant avec XP et badges, atelier IA et certificat de fin de formation.",
     "en": "An online school to learn how to make ads that sell: two-minute animated lessons in darija, quizzes, a student area with XP and badges, an AI workshop and a final certificate.",
     "ar": "مدرسة على الإنترنت لتعلّم صناعة إعلانات تبيع: دروس متحركة من دقيقتين بالدارجة، اختبارات، فضاء للطالب مع نقاط وشارات، ورشة ذكاء اصطناعي وشهادة في النهاية."}',
   '{"fr": ["Leçons vidéo", "Espace étudiant", "XP & badges", "FR · AR · EN"], "en": ["Video lessons", "Student area", "XP & badges", "FR · AR · EN"], "ar": ["دروس فيديو", "فضاء الطالب", "نقاط وشارات", "FR · AR · EN"]}',
   '#0b0a0a', '#ff3d17', '#ff8a3d', 'assets/img/projects/hooked-academy.webp', 'assets/img/projects/hooked-academy-m.webp', 1),
  ('The Algerian Exporter', 'site', 'https://thealgerianexporter.com/', 2025,
   '{"fr": "Plateforme d''import B2B", "en": "B2B sourcing platform", "ar": "منصة استيراد B2B"}',
   '{"fr": "L''abonnement des acheteurs étrangers pour importer à la source : un catalogue de producteurs vérifiés, des demandes de sourcing, des estimations de fret et un accompagnement jusqu''aux papiers d''export.",
     "en": "The subscription for foreign buyers who import at the source: a catalogue of verified producers, sourcing requests, freight estimates and support all the way to the export paperwork.",
     "ar": "اشتراك المشترين الأجانب للاستيراد من المصدر: كتالوج منتجين موثّقين، طلبات توريد، تقديرات الشحن، ومرافقة حتى وثائق التصدير."}',
   '{"fr": ["1 579 fiches produits", "Sourcing", "Abonnements", "FR · EN"], "en": ["1,579 product sheets", "Sourcing", "Subscriptions", "FR · EN"], "ar": ["1579 بطاقة منتج", "التوريد", "اشتراكات", "FR · EN"]}',
   '#0c2219', '#e8b84a', '#2f8a5f', 'assets/img/projects/exporter.webp', 'assets/img/projects/exporter-m.webp', 2),
  ('Swiftly DZ', 'app', 'https://swiftlydz.com/', 2025,
   '{"fr": "Plateforme IA", "en": "AI platform", "ar": "منصة ذكاء اصطناعي"}',
   '{"fr": "Toute l''IA en une seule connexion : GPT, Claude, Gemini, DeepSeek, Grok et FLUX dans une interface unifiée, avec chat, studio d''images, espace développeur et agent de recherche.",
     "en": "All of AI in one login: GPT, Claude, Gemini, DeepSeek, Grok and FLUX in a single interface, with chat, an image studio, a developer space and a research agent.",
     "ar": "كل الذكاء الاصطناعي بتسجيل دخول واحد: GPT، Claude، Gemini، DeepSeek، Grok و FLUX في واجهة موحّدة، مع الدردشة واستوديو الصور وفضاء المطوّرين ووكيل البحث."}',
   '{"fr": ["6+ modèles IA", "Studio image", "Abonnements"], "en": ["6+ AI models", "Image studio", "Subscriptions"], "ar": ["+6 نماذج", "استوديو الصور", "اشتراكات"]}',
   '#0d0a22', '#9b6bff', '#2fd3e6', 'assets/img/projects/swiftly.webp', 'assets/img/projects/swiftly-m.webp', 3),
  ('Tlemceni', 'demo', 'https://demos.bornzstudio.com/tlemceni/', 2026,
   '{"fr": "Démo · Chaussures & mode", "en": "Demo · Footwear & fashion", "ar": "عرض تجريبي · أحذية وأزياء"}',
   '{"fr": "Le site d''une marque de chaussures, de qamis et de parfums : au scroll, sa basket en 3D se démonte pièce par pièce, du lacet à la semelle.",
     "en": "A footwear, qamis and fragrance brand: as you scroll, its 3D sneaker comes apart piece by piece, from the laces to the sole.",
     "ar": "موقع علامة أحذية وقمصان تقليدية وعطور: مع التمرير، يتفكك حذاؤها ثلاثي الأبعاد قطعةً قطعة، من الرباط إلى النعل."}',
   '{"fr": ["Basket 3D", "Démontage au scroll", "Guide des pointures"], "en": ["3D sneaker", "Scroll teardown", "Size guide"], "ar": ["حذاء ثلاثي الأبعاد", "تفكيك بالتمرير", "دليل المقاسات"]}',
   '#0d0809', '#ef3b46', '#d8b56a', 'assets/img/projects/tlemceni.webp', 'assets/img/projects/tlemceni-m.webp', 4),
  ('Villa Lumen', 'demo', 'https://demos.bornzstudio.com/villa-lumen-dubai/', 2026,
   '{"fr": "Démo · Immobilier de prestige", "en": "Demo · Luxury real estate", "ar": "عرض تجريبي · عقارات فاخرة"}',
   '{"fr": "Une villa qu''on visite en faisant défiler : on survole la côte, on pousse la porte, puis chaque pièce s''ouvre avec son plan animé.",
     "en": "A villa toured by scrolling: fly over the coast, open the door, then every room unfolds with its animated floor plan.",
     "ar": "فيلا تُزار بالتمرير: نحلّق فوق الساحل، نفتح الباب، ثم تنفتح كل غرفة مع مخططها المتحرك."}',
   '{"fr": ["Visite au scroll", "Plans animés", "Visite en visio"], "en": ["Scroll tour", "Animated plans", "Video tours"], "ar": ["زيارة بالتمرير", "مخططات متحركة", "زيارة عبر الفيديو"]}',
   '#0e0c0a', '#d9b77c', '#3d8e9d', 'assets/img/projects/villa.webp', 'assets/img/projects/villa-m.webp', 5),
  ('Stickprod', 'demo', 'https://demos.bornzstudio.com/stickprod/', 2026,
   '{"fr": "Démo · Production audiovisuelle", "en": "Demo · Video production", "ar": "عرض تجريبي · إنتاج سمعي بصري"}',
   '{"fr": "Le site d''un studio de production vidéo : les réalisations tournent en spirale 3D et chaque film détaille le brief, l''approche et ce qui a été livré.",
     "en": "A video production studio: the work spins in a 3D spiral, and each film shows the brief, the approach and what was delivered.",
     "ar": "موقع استوديو إنتاج فيديو: الأعمال تدور في حلزون ثلاثي الأبعاد، وكل فيلم يعرض الموجز والمقاربة وما تم تسليمه."}',
   '{"fr": ["Spirale WebGL", "Fiches projets", "Espace admin"], "en": ["WebGL spiral", "Project sheets", "Admin area"], "ar": ["حلزون WebGL", "بطاقات المشاريع", "فضاء الإدارة"]}',
   '#0b0b0c', '#ff4a1c', '#ffb38a', 'assets/img/projects/stickprod.webp', 'assets/img/projects/stickprod-m.webp', 6);
end $$;
