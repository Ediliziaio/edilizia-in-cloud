-- ═══════════════════════════════════════════════════════════════════════════
-- SPRINT E1 — Email client foundations + Beta gate per Demo Azienda
-- ---------------------------------------------------------------------------
-- 1. Feature flag 'email_client' (Beta) + override per Demo Azienda S.r.l.
-- 2. email_inbox.user_id (per-user isolation) + index + RLS strict
-- 3. email_threads (raggruppamento conversazioni per Message-ID)
-- 4. email_outbox (queue invio: draft/queued/sending/sent/failed)
-- 5. email_labels (tag colorati Gmail-style, per-user)
-- 6. email_attachments (allegati pre-invio, puntano a Storage bucket)
-- 7. email_folders.user_id (folders private per utente, NULL = condivise)
-- 8. email_inbox.thread_id, folder_id, is_starred, is_archived (Gmail flags)
-- 9. View v_my_email_inbox (filtra per auth.uid() + scope company)
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1) FEATURE FLAG 'email_client'
-- ───────────────────────────────────────────────────────────────────────────

-- Catalogo legacy 'feature_flags' (compat hook locale)
INSERT INTO public.feature_flags (key, label, description, scope, is_active, default_value)
VALUES (
  'email_client',
  'Email Client (Beta)',
  'Client email integrato stile Gmail: connetti Google/Outlook/IMAP, leggi, classifica con AI, scrivi e invia. Per-utente isolato.',
  'company',
  true,
  false  -- default OFF per tutte le aziende, override esplicito per le abilitate
)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  is_active = true;

-- Catalogo authoritative 'platform_feature_flags' (usato da resolve_company_features
-- — è da QUESTA tabella che la sidebar legge i flag, non da feature_flags).
-- Bug fix: senza questo insert, il flag non appare nel resolver e il tab sidebar
-- resta nascosto anche se l'override è presente.
INSERT INTO public.platform_feature_flags (
  key, name, description, category, is_beta, default_value, sort_order, icon
)
VALUES (
  'email_client',
  'Email Client (Beta)',
  'Client email integrato stile Gmail: connetti Google/Outlook/IMAP, leggi, classifica con AI, scrivi e invia. Per-utente isolato.',
  'productivity',
  true,
  false,
  100,
  'Mail'
)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_beta = true;

-- Override per Demo Azienda S.r.l. → ENABLED in Beta
INSERT INTO public.company_feature_overrides (
  company_id, feature_key, is_enabled, override_reason, override_by
)
SELECT
  id,
  'email_client',
  true,
  'Beta program — pilot azienda demo per Email client integrato',
  NULL
FROM public.companies
WHERE name = 'Demo Azienda S.r.l.'
ON CONFLICT (company_id, feature_key) DO UPDATE SET
  is_enabled = true,
  override_reason = EXCLUDED.override_reason;

-- ───────────────────────────────────────────────────────────────────────────
-- 2) email_inbox.user_id — PER-USER ISOLATION
-- ---------------------------------------------------------------------------
-- Aggiungo user_id NULLABLE prima, poi backfill copiando da
-- email_oauth_connections.user_id se possibile (matching su account_id /
-- email_address). Le righe orfane restano NULL e vengono filtrate dalla
-- view v_my_email_inbox (NULL = email triage company-wide legacy, visibile
-- solo a company_admin).
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE public.email_inbox
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS thread_id UUID,
  ADD COLUMN IF NOT EXISTS folder_id UUID,
  ADD COLUMN IF NOT EXISTS in_reply_to TEXT,
  ADD COLUMN IF NOT EXISTS references_ids TEXT[],
  ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_starred BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_trashed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS oauth_connection_id UUID REFERENCES public.email_oauth_connections(id) ON DELETE SET NULL;

-- Backfill user_id dalla oauth_connection_id se popolata, oppure dal match
-- to_email = email_oauth_connections.email_address
UPDATE public.email_inbox i
SET user_id = c.user_id
FROM public.email_oauth_connections c
WHERE i.user_id IS NULL
  AND i.company_id = c.company_id
  AND lower(i.to_email) = lower(c.email_address);

CREATE INDEX IF NOT EXISTS idx_email_inbox_user_received
  ON public.email_inbox (user_id, received_at DESC)
  WHERE is_trashed = false;

CREATE INDEX IF NOT EXISTS idx_email_inbox_thread
  ON public.email_inbox (thread_id, received_at);

CREATE INDEX IF NOT EXISTS idx_email_inbox_folder
  ON public.email_inbox (user_id, folder_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_inbox_unread
  ON public.email_inbox (user_id)
  WHERE is_read = false AND is_trashed = false;

-- ───────────────────────────────────────────────────────────────────────────
-- 3) email_threads — raggruppamento conversazioni
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.email_threads (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_normalized TEXT NOT NULL,  -- subject senza Re:/Fwd: prefix per matching
  participants      TEXT[] NOT NULL DEFAULT '{}',
  message_count     INT NOT NULL DEFAULT 0,
  unread_count      INT NOT NULL DEFAULT 0,
  has_starred       BOOLEAN NOT NULL DEFAULT false,
  has_attachments   BOOLEAN NOT NULL DEFAULT false,
  first_received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_received_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  preview           TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_threads_user_last
  ON public.email_threads (user_id, last_received_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_threads_subject
  ON public.email_threads (user_id, subject_normalized);

ALTER TABLE public.email_threads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_threads_owner" ON public.email_threads;
CREATE POLICY "email_threads_owner" ON public.email_threads
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "email_threads_service" ON public.email_threads;
CREATE POLICY "email_threads_service" ON public.email_threads
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- FK su email_inbox.thread_id (nullable: alcuni messaggi possono non avere
-- thread ricostruito subito; la edge email-thread-resolver lo popola async)
ALTER TABLE public.email_inbox
  DROP CONSTRAINT IF EXISTS fk_email_inbox_thread;
ALTER TABLE public.email_inbox
  ADD CONSTRAINT fk_email_inbox_thread
  FOREIGN KEY (thread_id) REFERENCES public.email_threads(id) ON DELETE SET NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- 4) email_folders — estendi con user_id (NULL = condivisa company)
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE public.email_folders
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS color TEXT,
  ADD COLUMN IF NOT EXISTS icon TEXT;

CREATE INDEX IF NOT EXISTS idx_email_folders_user
  ON public.email_folders (user_id) WHERE user_id IS NOT NULL;

-- FK su email_inbox.folder_id
ALTER TABLE public.email_inbox
  DROP CONSTRAINT IF EXISTS fk_email_inbox_folder;
ALTER TABLE public.email_inbox
  ADD CONSTRAINT fk_email_inbox_folder
  FOREIGN KEY (folder_id) REFERENCES public.email_folders(id) ON DELETE SET NULL;

-- Seed cartelle di sistema per ogni utente (idempotente via ON CONFLICT)
-- NOTA: i folder 'system' (Inbox/Sent/Drafts/Spam/Trash) sono creati on-demand
-- dall'edge function quando l'utente collega la prima email — non qui.

-- ───────────────────────────────────────────────────────────────────────────
-- 5) email_outbox — queue invio
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.email_outbox (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  oauth_connection_id UUID REFERENCES public.email_oauth_connections(id) ON DELETE SET NULL,
  thread_id         UUID REFERENCES public.email_threads(id) ON DELETE SET NULL,
  in_reply_to_id    UUID REFERENCES public.email_inbox(id) ON DELETE SET NULL,
  -- Destinatari
  to_emails         TEXT[] NOT NULL,
  cc_emails         TEXT[] DEFAULT '{}',
  bcc_emails        TEXT[] DEFAULT '{}',
  reply_to          TEXT,
  -- Contenuto
  subject           TEXT NOT NULL DEFAULT '',
  body_html         TEXT,
  body_text         TEXT,
  attachments       JSONB DEFAULT '[]'::jsonb,  -- [{name, size, storage_path, mime}]
  -- Stati
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft',      -- bozza locale, salvata auto-save
    'queued',     -- l'utente ha cliccato Invia, in attesa cron
    'sending',    -- edge function in lavorazione
    'sent',       -- spedita con successo
    'failed',     -- errore (vedi last_error)
    'cancelled'   -- annullata dall'utente prima del send
  )),
  -- Lifecycle
  scheduled_for     TIMESTAMPTZ DEFAULT now(),
  sent_at           TIMESTAMPTZ,
  attempts          INT NOT NULL DEFAULT 0,
  max_attempts      INT NOT NULL DEFAULT 3,
  last_error        TEXT,
  -- Provider response
  provider_message_id TEXT,
  provider_response JSONB,
  -- Audit
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_outbox_user_status
  ON public.email_outbox (user_id, status, scheduled_for);

CREATE INDEX IF NOT EXISTS idx_email_outbox_processing
  ON public.email_outbox (status, scheduled_for)
  WHERE status IN ('queued', 'sending');

ALTER TABLE public.email_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_outbox_owner" ON public.email_outbox;
CREATE POLICY "email_outbox_owner" ON public.email_outbox
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "email_outbox_service" ON public.email_outbox;
CREATE POLICY "email_outbox_service" ON public.email_outbox
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ───────────────────────────────────────────────────────────────────────────
-- 6) email_labels — tag colorati Gmail-style (per-user)
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.email_labels (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT '#94a3b8',  -- slate-400 default
  description TEXT,
  is_system   BOOLEAN NOT NULL DEFAULT false,  -- true per Important/Promotion/etc auto-AI
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

ALTER TABLE public.email_labels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_labels_owner" ON public.email_labels;
CREATE POLICY "email_labels_owner" ON public.email_labels
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- M2M: messaggi ↔ labels
CREATE TABLE IF NOT EXISTS public.email_inbox_labels (
  inbox_id  UUID NOT NULL REFERENCES public.email_inbox(id) ON DELETE CASCADE,
  label_id  UUID NOT NULL REFERENCES public.email_labels(id) ON DELETE CASCADE,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (inbox_id, label_id)
);

ALTER TABLE public.email_inbox_labels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_inbox_labels_owner" ON public.email_inbox_labels;
CREATE POLICY "email_inbox_labels_owner" ON public.email_inbox_labels
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.email_labels l
      WHERE l.id = label_id AND l.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.email_labels l
      WHERE l.id = label_id AND l.user_id = auth.uid()
    )
  );

-- ───────────────────────────────────────────────────────────────────────────
-- 7) email_attachments — registry upload pre-invio
-- ---------------------------------------------------------------------------
-- Quando l'utente carica un file in compose, lo salviamo in
-- Storage bucket 'email-attachments' sotto path /<user_id>/<uuid>/<filename>
-- e creiamo questa riga. Quando invia, il path viene messo nell'outbox.attachments
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.email_attachments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  outbox_id     UUID REFERENCES public.email_outbox(id) ON DELETE CASCADE,
  inbox_id      UUID REFERENCES public.email_inbox(id) ON DELETE CASCADE,
  filename      TEXT NOT NULL,
  mime_type     TEXT,
  size_bytes    BIGINT NOT NULL DEFAULT 0,
  storage_path  TEXT NOT NULL,  -- 'user_id/uuid/filename'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (outbox_id IS NOT NULL OR inbox_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_email_attachments_outbox ON public.email_attachments (outbox_id);
CREATE INDEX IF NOT EXISTS idx_email_attachments_inbox  ON public.email_attachments (inbox_id);

ALTER TABLE public.email_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_attachments_owner" ON public.email_attachments;
CREATE POLICY "email_attachments_owner" ON public.email_attachments
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ───────────────────────────────────────────────────────────────────────────
-- 8) RLS strict su email_inbox (filtra per user_id)
-- ---------------------------------------------------------------------------
-- Riga visibile a un utente solo se user_id = auth.uid() oppure se NULL
-- (legacy triage data) E user è company_admin/super_admin.
-- ───────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "email_inbox_select" ON public.email_inbox;
CREATE POLICY "email_inbox_select" ON public.email_inbox
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      user_id IS NULL
      AND company_id = public.get_my_company_id()
      AND (public.is_super_admin() OR public.has_role(auth.uid(), 'company_admin'::public.app_role))
    )
  );

DROP POLICY IF EXISTS "email_inbox_update" ON public.email_inbox;
CREATE POLICY "email_inbox_update" ON public.email_inbox
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "email_inbox_delete" ON public.email_inbox;
CREATE POLICY "email_inbox_delete" ON public.email_inbox
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "email_inbox_service" ON public.email_inbox;
CREATE POLICY "email_inbox_service" ON public.email_inbox
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ───────────────────────────────────────────────────────────────────────────
-- 9) View v_my_email_inbox — comodità query frontend
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_my_email_inbox AS
SELECT
  i.id,
  i.company_id,
  i.user_id,
  i.thread_id,
  i.folder_id,
  i.message_id,
  i.in_reply_to,
  i.from_email,
  i.from_name,
  i.to_email,
  i.subject,
  i.received_at,
  i.ai_category,
  i.ai_priority,
  i.ai_summary,
  i.attachments,
  i.is_read,
  i.is_starred,
  i.is_archived,
  i.is_trashed,
  CASE
    WHEN i.raw_text IS NOT NULL THEN LEFT(i.raw_text, 200)
    ELSE NULL
  END AS preview,
  i.oauth_connection_id,
  i.status
FROM public.email_inbox i
WHERE i.user_id = auth.uid()
  AND i.is_trashed = false;

GRANT SELECT ON public.v_my_email_inbox TO authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 10) Trigger updated_at
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_email_outbox_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_email_outbox_updated ON public.email_outbox;
CREATE TRIGGER trg_email_outbox_updated
  BEFORE UPDATE ON public.email_outbox
  FOR EACH ROW EXECUTE FUNCTION public.fn_email_outbox_updated_at();

DROP TRIGGER IF EXISTS trg_email_threads_updated ON public.email_threads;
CREATE TRIGGER trg_email_threads_updated
  BEFORE UPDATE ON public.email_threads
  FOR EACH ROW EXECUTE FUNCTION public.fn_email_outbox_updated_at();

-- ───────────────────────────────────────────────────────────────────────────
-- 11) Storage bucket 'email-attachments' (creato se non esiste)
-- ───────────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('email-attachments', 'email-attachments', false, 26214400)  -- 25 MB
ON CONFLICT (id) DO NOTHING;

-- Policy storage: solo owner del path /<user_id>/...
DROP POLICY IF EXISTS "email_attachments_owner_read" ON storage.objects;
CREATE POLICY "email_attachments_owner_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'email-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "email_attachments_owner_write" ON storage.objects;
CREATE POLICY "email_attachments_owner_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'email-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "email_attachments_owner_delete" ON storage.objects;
CREATE POLICY "email_attachments_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'email-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

COMMIT;
