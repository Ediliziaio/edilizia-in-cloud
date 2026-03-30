DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'internal_chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.internal_chat_messages;
  END IF;
END $$;
