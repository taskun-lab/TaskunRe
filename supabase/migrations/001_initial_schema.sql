-- ================================================================
-- ムキムキタスくん３ - 初期スキーマ
-- 既存テーブル + Phase1/2新機能
-- ================================================================

-- タスク一覧
CREATE TABLE IF NOT EXISTS tasks (
  id               BIGSERIAL PRIMARY KEY,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  task_name        TEXT,
  user_id          TEXT,
  complete_at      INTEGER,
  sort_order       INTEGER,
  priority         INTEGER,
  vision_score     INTEGER,
  excite_score     INTEGER,
  growth_score     INTEGER,
  pinned           BOOLEAN,
  remind_at        TIMESTAMPTZ,
  priority_level   TEXT DEFAULT 'normal',
  completed_at     TIMESTAMPTZ,
  -- Phase2: タスク種別
  task_type        TEXT DEFAULT 'mission' CHECK (task_type IN ('mission', 'appointment')),
  reason           TEXT
);
CREATE INDEX IF NOT EXISTS idx_tasks_user_id      ON tasks (user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_completed_at ON tasks (completed_at);

-- ユーザー情報
CREATE TABLE IF NOT EXISTS users (
  id                      BIGSERIAL PRIMARY KEY,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  user_id                 TEXT UNIQUE,
  name                    TEXT,
  level                   INTEGER DEFAULT 1,
  xp                      INTEGER DEFAULT 0,
  streak                  INTEGER DEFAULT 0,
  last_training_date      DATE,
  role                    TEXT DEFAULT 'user',
  plan_code               TEXT DEFAULT 'free',
  task_limit              INTEGER DEFAULT 3,
  can_status              BOOLEAN DEFAULT FALSE,
  can_journal             BOOLEAN DEFAULT FALSE,
  stripe_customer_id      TEXT,
  stripe_subscription_id  TEXT,
  subscription_status     TEXT,
  current_period_end      TIMESTAMPTZ,
  trial_end               TIMESTAMPTZ,
  plan_updated_at         TIMESTAMPTZ DEFAULT NOW()
);

-- プランマスタ
CREATE TABLE IF NOT EXISTS plan_entitlements (
  plan_code    TEXT PRIMARY KEY,
  task_limit   INTEGER NOT NULL,
  can_status   BOOLEAN NOT NULL,
  can_journal  BOOLEAN NOT NULL,
  display_name TEXT,
  price_jpy    INTEGER
);
INSERT INTO plan_entitlements VALUES
  ('free',  3, false, false, '無料プラン', 0),
  ('plus3', 6, false, false, 'PLUS3', 300),
  ('plus6', 9, false, false, 'PLUS6', 500),
  ('max',   9, true,  true,  'MAX', 800)
ON CONFLICT (plan_code) DO NOTHING;

-- ミッション
CREATE TABLE IF NOT EXISTS missions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  description TEXT,
  difficulty  INTEGER DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 3),
  xp_bonus    INTEGER DEFAULT 50,
  is_active   BOOLEAN DEFAULT TRUE,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_missions_active ON missions (is_active, expires_at);

-- ミッション達成記録
CREATE TABLE IF NOT EXISTS mission_completions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        TEXT NOT NULL,
  mission_id     UUID,
  completed_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, mission_id, completed_date)
);
CREATE INDEX IF NOT EXISTS idx_mission_completions_user    ON mission_completions (user_id, completed_date);
CREATE INDEX IF NOT EXISTS idx_mission_completions_mission ON mission_completions (mission_id);

-- =============================================
-- Phase2: 習慣カスタマイズ
-- =============================================

-- 習慣プリセットバンク
CREATE TABLE IF NOT EXISTS habit_presets (
  habit_id    TEXT PRIMARY KEY,
  habit_name  TEXT NOT NULL,
  category    TEXT NOT NULL CHECK (category IN ('体力','知力','精神力','節制','生産性','活力')),
  icon        TEXT DEFAULT '✅',
  is_custom   BOOLEAN DEFAULT FALSE
);

INSERT INTO habit_presets VALUES
  ('strength',    '筋トレ',           '体力',  '💪', false),
  ('running',     'ランニング',        '体力',  '🏃', false),
  ('stretching',  'ストレッチ',        '体力',  '🧘', false),
  ('sports',      'スポーツ',          '体力',  '⚽', false),
  ('reading',     '読書',             '知力',  '📚', false),
  ('language',    '語学学習',          '知力',  '🗣️', false),
  ('learning',    '動画学習',          '知力',  '🎓', false),
  ('podcast',     'ポッドキャスト',    '知力',  '🎧', false),
  ('meditation',  '瞑想',             '精神力', '🧘', false),
  ('journal',     'ジャーナル',        '精神力', '📝', false),
  ('gratitude',   '感謝日記',          '精神力', '🙏', false),
  ('digital_detox','デジタルデトックス','精神力','📵', false),
  ('no_alcohol',  '禁酒',             '節制',  '🚫', false),
  ('no_smoking',  '禁煙',             '節制',  '🚭', false),
  ('no_snack',    '間食なし',          '節制',  '🍽️', false),
  ('no_sns',      'SNS制限',          '節制',  '📱', false),
  ('side_work',   '副業作業',          '生産性', '💼', false),
  ('study',       '資格勉強',          '生産性', '📖', false),
  ('creative',    '創作活動',          '生産性', '🎨', false),
  ('morning_work','朝活',             '生産性', '🌅', false),
  ('early_wake',  '早起き',           '活力',  '⏰', false),
  ('sleep7',      '7時間睡眠',         '活力',  '😴', false),
  ('breakfast',   '朝食',             '活力',  '🍳', false),
  ('water2l',     '水2L',             '活力',  '💧', false)
ON CONFLICT (habit_id) DO NOTHING;

-- ユーザーが選んだ習慣
CREATE TABLE IF NOT EXISTS user_habits (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL,
  habit_id    TEXT NOT NULL,
  habit_name  TEXT NOT NULL,
  category    TEXT NOT NULL,
  icon        TEXT DEFAULT '✅',
  is_active   BOOLEAN DEFAULT TRUE,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, habit_id)
);
CREATE INDEX IF NOT EXISTS idx_user_habits_user ON user_habits (user_id, is_active);

-- 習慣ログ（ストリーク付き）
CREATE TABLE IF NOT EXISTS habit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL,
  habit_id    TEXT NOT NULL,
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  completed   BOOLEAN DEFAULT FALSE,
  streak      INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, habit_id, date)
);
CREATE INDEX IF NOT EXISTS idx_habit_logs_user      ON habit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_habit_logs_user_date ON habit_logs (user_id, date);

-- ジャーナル
CREATE TABLE IF NOT EXISTS journals (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                TEXT NOT NULL,
  date                   DATE NOT NULL,
  title                  TEXT,
  content                TEXT,
  tasks_completed_count  INTEGER DEFAULT 0,
  completed_tasks        JSONB DEFAULT '[]'::jsonb,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_journals_user      ON journals (user_id);
CREATE INDEX IF NOT EXISTS idx_journals_user_date ON journals (user_id, date DESC);

-- MSCカスタムデータ
CREATE TABLE IF NOT EXISTS user_msc_data (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              TEXT NOT NULL UNIQUE,
  custom_strength_name TEXT,
  custom_strength_icon TEXT DEFAULT '💪',
  custom_strength_desc TEXT,
  custom_weakness_name TEXT,
  custom_weakness_icon TEXT DEFAULT '📝',
  custom_weakness_desc TEXT,
  custom_bio           TEXT,
  mbti_type            TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_msc_data_user_id ON user_msc_data (user_id);

-- Stripeイベント（冪等性）
CREATE TABLE IF NOT EXISTS stripe_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     TEXT NOT NULL UNIQUE,
  event_type   TEXT NOT NULL,
  processed_at TIMESTAMPTZ DEFAULT NOW(),
  payload      JSONB
);

-- アプリ設定フラグ
CREATE TABLE IF NOT EXISTS app_config (
  id                  INTEGER PRIMARY KEY CHECK (id = 1),
  gating_enabled      BOOLEAN DEFAULT FALSE,
  billing_enabled     BOOLEAN DEFAULT FALSE,
  debug_menu_enabled  BOOLEAN DEFAULT TRUE,
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO app_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 監査ログ
CREATE TABLE IF NOT EXISTS audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id TEXT NOT NULL,
  action        TEXT NOT NULL,
  before_value  JSONB,
  after_value   JSONB,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor   ON audit_log (actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log (created_at DESC);

-- RLS有効化（全テーブル）
ALTER TABLE tasks               ENABLE ROW LEVEL SECURITY;
ALTER TABLE users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE missions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE mission_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_habits         ENABLE ROW LEVEL SECURITY;
ALTER TABLE habit_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE journals            ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_msc_data       ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_events       ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_config          ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log           ENABLE ROW LEVEL SECURITY;

-- ポリシー（Edge Functionsはservice_roleで動くので全許可）
DO $$ DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'tasks','users','missions','mission_completions',
    'user_habits','habit_logs','journals','user_msc_data',
    'stripe_events','app_config','audit_log','plan_entitlements','habit_presets'
  ]) LOOP
    EXECUTE format('CREATE POLICY "service_role_all" ON %I FOR ALL USING (true)', t);
  END LOOP;
END $$;
