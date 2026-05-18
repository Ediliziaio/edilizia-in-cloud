-- ============================================================================
-- v8.6.51 — Internal chat: pin canale a livello utente
--
-- Permette a ciascun utente di pinnare le proprie chat preferite in alto.
-- Pin è PER-UTENTE (non globale): ogni membro del canale decide se vuole
-- vederlo in cima alla sua sidebar.
--
-- Schema: ADD COLUMN is_pinned BOOLEAN su internal_chat_members.
-- Default FALSE → backward compatible: tutti i canali esistenti restano
-- ordinati per ultima attività finché l'utente non ne pinna uno.
-- ============================================================================

ALTER TABLE public.internal_chat_members
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE;

-- Index per la query sidebar (pinned first, poi per last activity)
CREATE INDEX IF NOT EXISTS idx_internal_chat_members_pinned
  ON public.internal_chat_members(user_id, is_pinned DESC)
  WHERE is_pinned = TRUE;
