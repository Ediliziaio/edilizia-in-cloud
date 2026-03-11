
CREATE TABLE IF NOT EXISTS user_calendar_preferences (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  company_id            uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  sync_enabled          boolean NOT NULL DEFAULT true,
  sync_direction        text NOT NULL DEFAULT 'both' CHECK (sync_direction IN ('to_google','from_google','both')),
  default_calendar_id   text,
  default_calendar_name text,
  buffer_before_min     integer NOT NULL DEFAULT 0 CHECK (buffer_before_min >= 0),
  buffer_after_min      integer NOT NULL DEFAULT 0 CHECK (buffer_after_min >= 0),
  block_busy_slots      boolean NOT NULL DEFAULT true,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

CREATE INDEX idx_user_cal_prefs_user_id ON user_calendar_preferences(user_id);

ALTER TABLE user_calendar_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_access_cal_prefs" ON user_calendar_preferences
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  );
