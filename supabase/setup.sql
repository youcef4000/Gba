-- ============================================================================
-- Bornz Studio : messages du formulaire, statistiques de visite, espace admin.
--
-- A executer une seule fois : Supabase > SQL Editor > New query > coller > Run.
-- Peut etre relance sans risque (rien n'est efface).
--
-- Principe : les visiteurs ne touchent jamais aux tables. Ils appellent deux
-- fonctions (submit_message, track_event) qui valident et enregistrent.
-- Les fonctions admin_* ne repondent qu'a un compte connecte dont l'e-mail
-- figure dans la table admins.
-- ============================================================================

create schema if not exists private;

-- ---------------------------------------------------------------- tables

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  status text not null default 'new' check (status in ('new', 'read', 'archived')),
  name text, contact text not null, business text,
  project_type text, options text, timing text,
  details text, message text,
  lang text, country text, ip_hash text
);
create index if not exists messages_created_idx on public.messages (created_at desc);
create index if not exists messages_ip_idx on public.messages (ip_hash, created_at);

create table if not exists public.events (
  id bigint generated always as identity primary key,
  ts timestamptz not null default now(),
  day date not null,                       -- jour a l'heure d'Alger
  type text not null,                      -- pageview | reach | click | lang
  label text, path text, lang text, country text,
  device text, referrer text, visitor text
);
create index if not exists events_day_idx on public.events (day, type);
create index if not exists events_visitor_idx on public.events (visitor, day);

-- Comptes autorises a ouvrir l'espace admin.
create table if not exists public.admins (email text primary key);
insert into public.admins (email) values ('youcef.ny@gmail.com') on conflict do nothing;

-- Sel secret des empreintes (IP et visiteurs ne sont jamais stockes en clair).
create table if not exists private.settings (id int primary key default 1 check (id = 1), salt text not null);
insert into private.settings (salt)
values (md5(random()::text || clock_timestamp()::text) || md5(random()::text))
on conflict do nothing;

-- Aucun acces direct aux tables depuis le site : tout passe par les fonctions.
alter table public.messages enable row level security;
alter table public.events enable row level security;
alter table public.admins enable row level security;
revoke all on public.messages, public.events, public.admins from anon, authenticated;

-- ---------------------------------------------------------------- outils

create or replace function private.header(name text) returns text
language sql stable as $$
  select coalesce(current_setting('request.headers', true)::json ->> name, '')
$$;

create or replace function private.client_ip() returns text
language sql stable as $$
  select coalesce(
    nullif(private.header('cf-connecting-ip'), ''),
    nullif(private.header('x-real-ip'), ''),
    nullif(btrim(split_part(private.header('x-forwarded-for'), ',', 1)), ''),
    '0.0.0.0')
$$;

create or replace function private.hash(v text) returns text
language sql stable as $$
  select encode(sha256(convert_to((select salt from private.settings) || '|' || v, 'UTF8')), 'hex')
$$;

create or replace function private.today() returns date
language sql stable as $$
  select (now() at time zone 'Africa/Algiers')::date
$$;

-- Retire les caracteres de controle (garde les retours a la ligne) et coupe.
create or replace function private.clean(v text, n int) returns text
language sql immutable as $$
  select left(btrim(regexp_replace(coalesce(v, ''), '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]', '', 'g')), n)
$$;

create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u
    join public.admins a on lower(a.email) = lower(u.email)
    where u.id = auth.uid() and u.email_confirmed_at is not null)
$$;

-- Classement d'une colonne des visites (pays, source, appareil, langue).
create or replace function private.top(col text, f date, t date) returns jsonb
language plpgsql stable as $$
declare r jsonb;
begin
  execute format(
    'select coalesce(jsonb_agg(jsonb_build_object(''k'', k, ''n'', n) order by n desc), ''[]''::jsonb)
     from (select %I as k, count(distinct visitor || day) as n from public.events
           where type = ''pageview'' and day between $1 and $2
           group by 1 order by 2 desc limit 8) s', col)
  into r using f, t;
  return r;
end $$;

-- ------------------------------------------------- fonctions publiques

-- Formulaire de contact du site.
create or replace function public.submit_message(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_contact text := private.clean(p ->> 'contact', 120);
  v_ip text := left(private.hash('ip|' || private.client_ip()), 24);
  v_opts text;
  v_id bigint;
begin
  -- Champ piege invisible : un robot le remplit, un humain jamais.
  if private.clean(p ->> 'website', 200) <> '' then
    return jsonb_build_object('ok', true);
  end if;
  if not (v_contact ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'
          or (v_contact ~ '^\+?[0-9\s().-]{8,22}$'
              and length(regexp_replace(v_contact, '\D', '', 'g')) between 8 and 15)) then
    return jsonb_build_object('ok', false, 'error', 'invalid_contact');
  end if;
  if (select count(*) from public.messages
      where ip_hash = v_ip and created_at > now() - interval '1 hour') >= 5 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  select string_agg(o, ', ') into v_opts
  from (select private.clean(x, 60) as o
        from jsonb_array_elements_text(
          case when jsonb_typeof(p -> 'options') = 'array' then p -> 'options' else '[]'::jsonb end) x
        limit 12) s
  where o <> '';

  insert into public.messages (name, contact, business, project_type, options, timing,
                               details, message, lang, country, ip_hash)
  values (private.clean(p ->> 'name', 80), v_contact, private.clean(p ->> 'business', 120),
          private.clean(p ->> 'type', 60), coalesce(v_opts, ''), private.clean(p ->> 'when', 60),
          private.clean(p ->> 'details', 2000), private.clean(p ->> 'message', 4000),
          case when p ->> 'lang' in ('fr', 'ar', 'en') then p ->> 'lang' else 'fr' end,
          upper(left(private.header('cf-ipcountry'), 2)), v_ip)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- Statistiques de visite : sans cookie, l'IP n'est jamais stockee.
-- L'empreinte d'un visiteur change chaque jour ; les robots sont ignores.
create or replace function public.track_event(p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_ua text := private.header('user-agent');
  v_type text := p ->> 'type';
  v_day date := private.today();
  v_visitor text;
  v_ref text;
  v_host text;
  v_src text := '';
begin
  if v_ua = '' or v_ua ~* 'bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|whatsapp|telegram|curl|wget|python|monitor|scan' then
    return;
  end if;
  if v_type is null or v_type not in ('pageview', 'reach', 'click', 'lang') then
    return;
  end if;
  v_visitor := left(private.hash('v|' || v_day || '|' || private.client_ip() || '|' || v_ua), 20);
  -- Garde-fou contre le remplissage : 300 evenements par visiteur et par jour.
  if (select count(*) from public.events where visitor = v_visitor and day = v_day) >= 300 then
    return;
  end if;

  if v_type = 'pageview' then
    v_ref := private.clean(p ->> 'ref', 300);
    if private.clean(p ->> 'utm', 40) <> '' then
      v_src := private.clean(p ->> 'utm', 40);
    elsif v_ref = '' then
      v_src := 'Direct';
    else
      v_host := lower(regexp_replace(coalesce(substring(v_ref from '^[a-zA-Z]+://([^/:?#]+)'), ''), '^www\.', ''));
      v_src := case
        when v_host = '' then 'Direct'
        when v_host ~ 'instagram' then 'Instagram'
        when v_host ~ 'facebook|fb\.|messenger' then 'Facebook'
        when v_host ~ 'tiktok' then 'TikTok'
        when v_host ~ 'google\.' then 'Google'
        when v_host ~ 'bing\.' then 'Bing'
        when v_host ~ 'linkedin|lnkd' then 'LinkedIn'
        when v_host ~ '(^|\.)t\.co$|twitter|(^|\.)x\.com$' then 'X'
        when v_host ~ 'youtube|youtu\.be' then 'YouTube'
        when v_host ~ 'whatsapp|wa\.me' then 'WhatsApp'
        when v_host ~ 'snapchat' then 'Snapchat'
        else left(v_host, 60) end;
    end if;
  end if;

  insert into public.events (day, type, label, path, lang, country, device, referrer, visitor)
  values (v_day, v_type, private.clean(p ->> 'label', 60),
          coalesce(nullif(private.clean(p ->> 'path', 120), ''), '/'),
          case when p ->> 'lang' in ('fr', 'ar', 'en') then p ->> 'lang' else 'fr' end,
          upper(left(private.header('cf-ipcountry'), 2)),
          case when v_ua ~* 'iPad|Tablet' or (v_ua ~* 'Android' and v_ua !~* 'Mobile') then 'Tablette'
               when v_ua ~* 'Mobi|iPhone|Android' then 'Mobile' else 'Ordinateur' end,
          v_src, v_visitor);
end $$;

-- ------------------------------------------------- fonctions admin

create or replace function public.admin_ping() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_messages(p_status text default 'inbox') returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'ok', true,
    'messages', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at desc) from (
        select m.id, (extract(epoch from m.created_at) * 1000)::bigint as created_at, m.status,
               m.name, m.contact, m.business, m.project_type, m.options, m.timing,
               m.details, m.message, m.lang, m.country
        from public.messages m
        where case when p_status = 'all' then true
                   when p_status in ('new', 'read', 'archived') then m.status = p_status
                   else m.status <> 'archived' end
        order by m.created_at desc limit 300) r), '[]'::jsonb),
    'counts', jsonb_build_object(
      'new', (select count(*) from public.messages where status = 'new'),
      'read', (select count(*) from public.messages where status = 'read'),
      'archived', (select count(*) from public.messages where status = 'archived')));
end $$;

create or replace function public.admin_set_status(p_id bigint, p_status text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('new', 'read', 'archived') then
    return jsonb_build_object('ok', false, 'error', 'bad_request');
  end if;
  update public.messages set status = p_status where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_delete_message(p_id bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.messages where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_stats(p_days int default 30) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  d int := case when p_days in (7, 30, 90) then p_days else 30 end;
  t date := private.today();
  f date := t - (d - 1);
  pt date := t - d;
  pf date := t - (2 * d - 1);
  cur_views int; cur_visits int; prev_views int; prev_visits int; msg_cur int; msg_prev int;
begin
  if not private.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;

  select count(*), count(distinct visitor || day) into cur_views, cur_visits
  from public.events where type = 'pageview' and day between f and t;
  select count(*), count(distinct visitor || day) into prev_views, prev_visits
  from public.events where type = 'pageview' and day between pf and pt;
  select count(*) into msg_cur from public.messages
  where (created_at at time zone 'Africa/Algiers')::date between f and t;
  select count(*) into msg_prev from public.messages
  where (created_at at time zone 'Africa/Algiers')::date between pf and pt;

  -- Menage occasionnel : les evenements de plus de 400 jours partent.
  if random() < 0.05 then delete from public.events where day < t - 400; end if;

  return jsonb_build_object(
    'ok', true, 'days', d, 'from', f, 'to', t,
    'totals', jsonb_build_object('visits', cur_visits, 'views', cur_views, 'messages', msg_cur,
      'conversion', case when cur_visits > 0 then msg_cur::numeric / cur_visits else 0 end),
    'previous', jsonb_build_object('visits', prev_visits, 'views', prev_views, 'messages', msg_prev,
      'conversion', case when prev_visits > 0 then msg_prev::numeric / prev_visits else 0 end),
    'series', (
      select jsonb_agg(jsonb_build_object('day', to_char(g.d, 'YYYY-MM-DD'),
               'visits', coalesce(e.visits, 0), 'views', coalesce(e.views, 0), 'messages', coalesce(m.n, 0))
             order by g.d)
      from (select generate_series(f, t, interval '1 day')::date as d) g
      left join (select day, count(*) as views, count(distinct visitor) as visits from public.events
                 where type = 'pageview' and day between f and t group by day) e on e.day = g.d
      left join (select (created_at at time zone 'Africa/Algiers')::date as day, count(*) as n
                 from public.messages group by 1) m on m.day = g.d),
    'funnel', jsonb_build_array(
      jsonb_build_object('key', 'visits', 'n', cur_visits),
      jsonb_build_object('key', 'projets', 'n', (select count(distinct visitor || day) from public.events
        where type = 'reach' and label = 'projets' and day between f and t)),
      jsonb_build_object('key', 'contact', 'n', (select count(distinct visitor || day) from public.events
        where type = 'reach' and label = 'contact' and day between f and t)),
      jsonb_build_object('key', 'messages', 'n', msg_cur)),
    'countries', private.top('country', f, t),
    'sources', private.top('referrer', f, t),
    'devices', private.top('device', f, t),
    'langs', private.top('lang', f, t),
    'clicks', coalesce((
      select jsonb_agg(jsonb_build_object('k', k, 'n', n) order by n desc) from (
        select label as k, count(*) as n from public.events
        where type = 'click' and day between f and t group by label order by n desc limit 10) c), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------- droits

revoke all on schema private from anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function
  public.submit_message(jsonb), public.track_event(jsonb), public.admin_ping(),
  public.admin_messages(text), public.admin_set_status(bigint, text),
  public.admin_delete_message(bigint), public.admin_stats(int)
from public, anon, authenticated;
grant execute on function public.submit_message(jsonb), public.track_event(jsonb) to anon, authenticated;
grant execute on function
  public.admin_ping(), public.admin_messages(text), public.admin_set_status(bigint, text),
  public.admin_delete_message(bigint), public.admin_stats(int)
to authenticated;
