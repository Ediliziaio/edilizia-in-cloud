-- ── Outreach · Sequenze condizionali a GRAFO (Fase 1 — modello dati) ─────────
-- Estende le cadenze cold da lineari (step_order) a GRAFO: nodi tipizzati
-- (email/wait/condition/end) collegati da rami (next_default = successore o ramo
-- "SÌ"; next_alt = ramo "NO" delle condizioni). Additiva e idempotente:
-- le sequenze esistenti restano lineari (node_type='email', next_* NULL,
-- enrollment.current_node_id NULL → il dispatcher usa il percorso step_order).
--
-- RLS invariata: le tabelle outreach_* hanno già le policy super_admin/service
-- (migrazione 20270815000000); aggiungere colonne non le tocca.
--
-- NOTA: migrazione LOCALE — applicare con apply_migration quando pronto.
-- Forward-dated come il resto dello storico migrazioni del progetto.

-- ── 1. Nodi del grafo su outreach_sequence_steps ─────────────────────────────
-- node_type:      tipo del nodo. Default 'email' → gli step legacy restano email.
-- condition_type: solo per node_type='condition'. Quale segnale valutare.
-- next_default:   successore (email/wait) oppure ramo "SÌ" (condition).
-- next_alt:       ramo "NO" (solo condition).
-- pos_x / pos_y:  coordinate per il builder visuale (Fase 2, UI). Nullable.
--
-- FK auto-referenziali a outreach_sequence_steps(id) con ON DELETE SET NULL:
-- cancellare un nodo destinazione non spezza l'INSERT, lascia il puntatore NULL
-- (il dispatcher tratta next NULL = fine cadenza → enrollment 'completed').
ALTER TABLE public.outreach_sequence_steps
  ADD COLUMN IF NOT EXISTS node_type      text NOT NULL DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS condition_type text,
  ADD COLUMN IF NOT EXISTS next_default   uuid,
  ADD COLUMN IF NOT EXISTS next_alt       uuid,
  ADD COLUMN IF NOT EXISTS pos_x          integer,
  ADD COLUMN IF NOT EXISTS pos_y          integer;

-- CHECK su node_type / condition_type. Aggiunti separatamente e in modo
-- idempotente (ADD CONSTRAINT non supporta IF NOT EXISTS su tutte le versioni:
-- usiamo un guard sul catalogo). NOT VALID per non riscrivere righe esistenti;
-- i default ('email', NULL) li soddisfano comunque.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.outreach_sequence_steps'::regclass
      AND conname = 'outreach_steps_node_type_chk'
  ) THEN
    ALTER TABLE public.outreach_sequence_steps
      ADD CONSTRAINT outreach_steps_node_type_chk
      CHECK (node_type IN ('email','wait','condition','end')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.outreach_sequence_steps'::regclass
      AND conname = 'outreach_steps_condition_type_chk'
  ) THEN
    ALTER TABLE public.outreach_sequence_steps
      ADD CONSTRAINT outreach_steps_condition_type_chk
      CHECK (condition_type IS NULL
             OR condition_type IN ('opened','not_opened','replied','not_replied')) NOT VALID;
  END IF;

  -- FK auto-referenziali (idempotenti via guard). ON DELETE SET NULL.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.outreach_sequence_steps'::regclass
      AND conname = 'outreach_steps_next_default_fk'
  ) THEN
    ALTER TABLE public.outreach_sequence_steps
      ADD CONSTRAINT outreach_steps_next_default_fk
      FOREIGN KEY (next_default) REFERENCES public.outreach_sequence_steps(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.outreach_sequence_steps'::regclass
      AND conname = 'outreach_steps_next_alt_fk'
  ) THEN
    ALTER TABLE public.outreach_sequence_steps
      ADD CONSTRAINT outreach_steps_next_alt_fk
      FOREIGN KEY (next_alt) REFERENCES public.outreach_sequence_steps(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── 2. Nodo corrente dell'iscrizione (traversata a grafo) ────────────────────
-- current_node_id NULL = iscrizione legacy (lineare): il dispatcher usa
-- current_step/step_order. Quando il dispatcher entra in modalità grafo lo
-- valorizza col nodo "entry" e poi lo avanza ad ogni passo.
ALTER TABLE public.outreach_enrollments
  ADD COLUMN IF NOT EXISTS current_node_id uuid;

-- FK soft: il nodo può essere cancellato senza bloccare (ON DELETE SET NULL →
-- ricade su legacy/completamento gestito dal dispatcher). Idempotente.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.outreach_enrollments'::regclass
      AND conname = 'outreach_enrollments_current_node_fk'
  ) THEN
    ALTER TABLE public.outreach_enrollments
      ADD CONSTRAINT outreach_enrollments_current_node_fk
      FOREIGN KEY (current_node_id) REFERENCES public.outreach_sequence_steps(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Indice per risolvere rapidamente i puntatori in ingresso (entry node = nodo
-- non referenziato da alcun next_*). Utile al builder e alla traversata.
CREATE INDEX IF NOT EXISTS idx_outreach_steps_next_default
  ON public.outreach_sequence_steps (next_default);
CREATE INDEX IF NOT EXISTS idx_outreach_steps_next_alt
  ON public.outreach_sequence_steps (next_alt);

-- ── 3. Coda: nodo di provenienza + tipo riga (send vs advance) ────────────────
-- node_id: a quale nodo del grafo si riferisce questa riga (NULL per le righe
--          legacy lineari). Informativo + utile a diagnostica/idempotenza.
-- kind:    'send'    → riga email da spedire (comportamento attuale, default).
--          'advance' → riga di SOLO instradamento, NON spedita: serve a DIFFERIRE
--                      la traversata dopo un nodo 'wait' (il dispatcher, quando è
--                      dovuta, riprende il grafo dal next_default del wait, valuta
--                      le condizioni con i segnali aggiornati e accoda l'email
--                      risultante o completa). channel resta 'email' → il CHECK
--                      esistente su channel non va toccato.
-- Le righe legacy hanno kind='send' (default) e node_id NULL → percorso invariato.
ALTER TABLE public.outreach_send_queue
  ADD COLUMN IF NOT EXISTS node_id uuid,
  ADD COLUMN IF NOT EXISTS kind    text NOT NULL DEFAULT 'send';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.outreach_send_queue'::regclass
      AND conname = 'outreach_queue_kind_chk'
  ) THEN
    ALTER TABLE public.outreach_send_queue
      ADD CONSTRAINT outreach_queue_kind_chk
      CHECK (kind IN ('send','advance')) NOT VALID;
  END IF;

  -- node_id → outreach_sequence_steps(id), soft (ON DELETE SET NULL).
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.outreach_send_queue'::regclass
      AND conname = 'outreach_queue_node_fk'
  ) THEN
    ALTER TABLE public.outreach_send_queue
      ADD CONSTRAINT outreach_queue_node_fk
      FOREIGN KEY (node_id) REFERENCES public.outreach_sequence_steps(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Indice per il pass "advance" del dispatcher: righe di instradamento dovute.
CREATE INDEX IF NOT EXISTS idx_outreach_queue_advance
  ON public.outreach_send_queue (scheduled_for)
  WHERE status = 'queued' AND kind = 'advance';
