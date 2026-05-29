-- =====================================================
-- SQL для создания таблиц в Supabase
-- Версия: полная, идемпотентная (можно запускать повторно)
-- =====================================================

-- 1. Пользователи и роли
CREATE TABLE IF NOT EXISTS app_users (
  id         SERIAL PRIMARY KEY,
  tg_id      BIGINT UNIQUE NOT NULL,
  name       TEXT NOT NULL,
  username   TEXT,
  role       TEXT DEFAULT NULL,
  site       TEXT DEFAULT 'РУС',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Справочник кормов
CREATE TABLE IF NOT EXISTS feeds (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  unit         TEXT DEFAULT 'т',
  per_month_t  NUMERIC(10,3) DEFAULT 0,
  sort_order   INTEGER DEFAULT 0,
  active       BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- 3. Остатки на 1-е число
CREATE TABLE IF NOT EXISTS opening_balances (
  id               SERIAL PRIMARY KEY,
  feed_id          TEXT REFERENCES feeds(id) ON DELETE CASCADE,
  site             TEXT NOT NULL,
  year             INTEGER NOT NULL,
  month            INTEGER NOT NULL,
  opening_balance  NUMERIC(10,3) DEFAULT 0,
  UNIQUE(feed_id, site, year, month)
);

-- 4. Данные по дням
CREATE TABLE IF NOT EXISTS day_records (
  id       SERIAL PRIMARY KEY,
  feed_id  TEXT REFERENCES feeds(id) ON DELETE CASCADE,
  site     TEXT NOT NULL,
  year     INTEGER NOT NULL,
  month    INTEGER NOT NULL,
  day      INTEGER NOT NULL,
  intake   NUMERIC(10,3) DEFAULT 0,
  expense  NUMERIC(10,3) DEFAULT 0,
  UNIQUE(feed_id, site, year, month, day)
);

-- 5. Лог приходов
CREATE TABLE IF NOT EXISTS intake_log (
  id         SERIAL PRIMARY KEY,
  feed_id    TEXT REFERENCES feeds(id) ON DELETE SET NULL,
  feed_name  TEXT,
  site       TEXT NOT NULL,
  year       INTEGER NOT NULL,
  month      INTEGER NOT NULL,
  day        INTEGER NOT NULL,
  user_name  TEXT,
  user_role  TEXT,
  amount     NUMERIC(10,3) NOT NULL,
  note       TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- ИНДЕКСЫ
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_dr_site_ym   ON day_records(site, year, month);
CREATE INDEX IF NOT EXISTS idx_ob_site_ym   ON opening_balances(site, year, month);
CREATE INDEX IF NOT EXISTS idx_log_site_ym  ON intake_log(site, year, month);
CREATE INDEX IF NOT EXISTS idx_users_tg_id  ON app_users(tg_id);

-- =====================================================
-- RLS
-- =====================================================
ALTER TABLE app_users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE feeds             ENABLE ROW LEVEL SECURITY;
ALTER TABLE opening_balances  ENABLE ROW LEVEL SECURITY;
ALTER TABLE day_records       ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_log        ENABLE ROW LEVEL SECURITY;

-- Удаляем старые политики если есть, затем создаём заново
DROP POLICY IF EXISTS "allow_all_users" ON app_users;
DROP POLICY IF EXISTS "allow_all_feeds" ON feeds;
DROP POLICY IF EXISTS "allow_all_ob"    ON opening_balances;
DROP POLICY IF EXISTS "allow_all_dr"    ON day_records;
DROP POLICY IF EXISTS "allow_all_log"   ON intake_log;

CREATE POLICY "allow_all_users" ON app_users        FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_feeds" ON feeds             FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_ob"    ON opening_balances  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_dr"    ON day_records       FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_log"   ON intake_log        FOR ALL USING (true) WITH CHECK (true);

-- =====================================================
-- НАЧАЛЬНЫЕ ДАННЫЕ — корма из файла 2-рац
-- =====================================================
INSERT INTO feeds (id, name, unit, per_month_t, sort_order, active) VALUES
  ('zernosmec',   'Зерносмесь (мука)',        'т', 529.590, 1,  true),
  ('senazh_m',    'Сенаж/силос многолет',     'т', 914.250, 2,  true),
  ('senazh_o',    'Сенаж/силос однолет',      'т', 647.700, 3,  true),
  ('silos_k',     'Силос кукурузный',         'т', 676.071, 4,  true),
  ('soloma',      'Солома',                   'т', 150.304, 5,  true),
  ('piv_drobina', 'Пивная дробина',           'т', 552.331, 6,  true),
  ('shrot_raps',  'Шрот рапсовый',            'т', 115.209, 7,  true),
  ('shrot_soy',   'Шрот соевый',              'т',  82.807, 8,  true),
  ('kukuruza',    'Кукуруза',                 'т', 130.626, 9,  true),
  ('patoka',      'Патока',                   'т',  41.700, 10, true),
  ('soya_extr',   'Соя экструдированная',     'т',  19.980, 11, true),
  ('lnyanoy',     'Льняной жмых',             'т',  13.800, 12, true),
  ('mel',         'Мел',                      'т',  14.321, 13, true),
  ('sol',         'Соль',                     'т',   7.062, 14, true),
  ('soda',        'Сода (бикарбонат натрия)', 'т',   8.820, 15, true)
ON CONFLICT (id) DO NOTHING;
