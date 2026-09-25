-- Schema de la base D1. Pour reference : l'API cree ces tables toute seule
-- au premier appel (voir lib/server.js), il n'y a rien a executer.

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',   -- new | read | archived
  name TEXT, contact TEXT NOT NULL, business TEXT,
  project_type TEXT, options TEXT, timing TEXT,
  details TEXT, message TEXT,
  lang TEXT, country TEXT, ip_hash TEXT
);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages (created_at);
CREATE INDEX IF NOT EXISTS idx_messages_ip ON messages (ip_hash, created_at);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL, day TEXT NOT NULL,  -- day : AAAA-MM-JJ a l'heure d'Alger
  type TEXT NOT NULL,                      -- pageview | reach | click | lang
  label TEXT, path TEXT, lang TEXT, country TEXT,
  device TEXT, referrer TEXT, visitor TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_day ON events (day, type);

CREATE TABLE IF NOT EXISTS login_attempts (ip_hash TEXT NOT NULL, ts INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_login_ip ON login_attempts (ip_hash, ts);
