-- ================================================================
-- ムキムキタスくん３ - クエストツリー機能
-- 002_quest_tree.sql
-- ================================================================

-- tasks テーブルに階層カラムを追加
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_task_id BIGINT REFERENCES tasks(id) ON DELETE CASCADE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS depth INT NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS target_date DATE;

-- task_type の CHECK 制約を 'default' を含む形に更新
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_task_type_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_task_type_check
  CHECK (task_type IN ('mission', 'appointment', 'default'));

-- 階層インデックス
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks (parent_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user_depth ON tasks (user_id, depth);

-- ジャーナル紐づけテーブル
CREATE TABLE IF NOT EXISTS task_journals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL,
  task_id     BIGINT REFERENCES tasks(id) ON DELETE CASCADE,
  journal_id  UUID REFERENCES journals(id) ON DELETE SET NULL,
  linked_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_task_journals_task    ON task_journals (task_id);
CREATE INDEX IF NOT EXISTS idx_task_journals_user    ON task_journals (user_id);
CREATE INDEX IF NOT EXISTS idx_task_journals_journal ON task_journals (journal_id);

ALTER TABLE task_journals ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  EXECUTE 'CREATE POLICY "service_role_all" ON task_journals FOR ALL USING (true)';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
