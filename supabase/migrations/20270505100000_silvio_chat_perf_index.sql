-- FIX 7 (M3) Sprint AI Hardening 1
-- Indice DESC per ORDER BY created_at DESC LIMIT N (load history Silvio).
-- L'indice ASC esistente (idx_icmsg_ch) supporta DESC scan inverso ma è
-- sub-ottimale su tabelle grandi (~100k+ messaggi).
--
-- Postgres con un index DESC esplicito esegue forward scan + LIMIT in O(N)
-- sui top messaggi senza dover scorrere all'indietro.

CREATE INDEX IF NOT EXISTS idx_icmsg_channel_created_desc
  ON public.internal_chat_messages (channel_id, created_at DESC);

COMMENT ON INDEX public.idx_icmsg_channel_created_desc IS
  'FIX 7 (M3): supporta load history con ORDER BY created_at DESC LIMIT N. Usato da silvio-chat e SilvioChatSheet.';
