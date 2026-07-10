-- Chat — fresh DB bootstrap: chat_profiles, chat_messages, RLS, realtime publication, updated_at triggers.
-- Apply before 20260429120000_chat_messages_telegram_after_insert.sql (trigger needs chat_messages).

CREATE TABLE IF NOT EXISTS chat_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  user_email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  avatar_emoji TEXT NOT NULL DEFAULT '',
  is_chat_disabled BOOLEAN NOT NULL DEFAULT false,
  chat_banned_until TIMESTAMPTZ NULL,
  chat_spam_strikes INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES chat_profiles (id) ON DELETE RESTRICT,
  content TEXT NOT NULL CHECK (char_length(trim(content)) > 0 AND char_length(content) <= 1000),
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE chat_profiles
  ADD COLUMN IF NOT EXISTS user_id UUID NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS chat_last_read_message_id UUID NULL,
  ADD COLUMN IF NOT EXISTS chat_last_read_at TIMESTAMPTZ NULL;

DO $fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_chat_profiles_last_read_message'
  ) THEN
    ALTER TABLE chat_profiles
      ADD CONSTRAINT fk_chat_profiles_last_read_message
      FOREIGN KEY (chat_last_read_message_id) REFERENCES chat_messages (id) ON DELETE SET NULL;
  END IF;
END
$fk$;

CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_profile_created ON chat_messages (profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_profiles_user_id ON chat_profiles (user_id);

CREATE OR REPLACE FUNCTION set_timestamp_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_profiles_set_updated_at ON chat_profiles;
CREATE TRIGGER trg_chat_profiles_set_updated_at
BEFORE UPDATE ON chat_profiles
FOR EACH ROW
EXECUTE FUNCTION set_timestamp_updated_at();

DROP TRIGGER IF EXISTS trg_chat_messages_set_updated_at ON chat_messages;
CREATE TRIGGER trg_chat_messages_set_updated_at
BEFORE UPDATE ON chat_messages
FOR EACH ROW
EXECUTE FUNCTION set_timestamp_updated_at();

ALTER TABLE chat_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read chat_profiles" ON chat_profiles;
CREATE POLICY "Anyone can read chat_profiles" ON chat_profiles
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "Anyone can read chat_messages" ON chat_messages;
CREATE POLICY "Anyone can read chat_messages" ON chat_messages
  FOR SELECT USING (true);

DO $pub$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE chat_profiles;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
  END IF;
END
$pub$;
