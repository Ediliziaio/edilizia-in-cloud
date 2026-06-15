-- ── Outreach · Nodi messaggio MULTICANALE (WhatsApp / SMS) nel grafo ─────────
-- Estende le sequenze a grafo (Fase 1, migrazione 20270822000000) con due nuovi
-- tipi di nodo INVIANTE oltre all'email: 'whatsapp' e 'sms'. Sono nodi-messaggio
-- analoghi all'email (1 ingresso, 1 uscita = next_default) ma spediti su un canale
-- diverso (Telnyx per SMS, Meta Graph per WhatsApp) dal dispatcher.
--
-- ADDITIVA e IDEMPOTENTE. Nessun dato esistente cambia:
--   • outreach_sequence_steps.node_type ha default 'email' → gli step legacy restano email;
--     qui si AMPLIA soltanto il CHECK per ammettere anche 'whatsapp'/'sms'.
--   • I CHECK su channel di outreach_sequence_steps e outreach_send_queue ammettono
--     GIÀ ('email','whatsapp','sms') nello schema corrente: NON vanno toccati. Per
--     robustezza (ambienti dove fossero più stretti) li ri-allineiamo in modo
--     idempotente con un guard sul catalogo, senza mai restringerli.
--   • outreach_send_queue ha GIÀ la colonna to_phone: nessuna nuova colonna.
--
-- Tecnica coerente con 20270822000000: DROP CONSTRAINT IF EXISTS + ADD ... NOT VALID
-- dentro un guard su pg_constraint (così non si riscrivono le righe esistenti, che
-- soddisfano comunque il vincolo ampliato).
--
-- RLS invariata: nessuna nuova tabella/colonna sensibile.
-- NOTA: migrazione LOCALE — applicare con apply_migration quando pronto.
-- Forward-dated come il resto dello storico migrazioni del progetto.

-- ── 1. node_type: ammetti i nodi messaggio multicanale ───────────────────────
-- Prima (20270822000000): CHECK node_type IN ('email','wait','condition','end').
-- Ora: + 'whatsapp','sms'. Si fa DROP+ADD (NOT VALID) perché il set ammesso
-- CAMBIA: non basta un guard "crea-se-assente", il vincolo esiste già con il set
-- vecchio. Il DROP è IF EXISTS (idempotente) e l'ADD è guardato per evitare doppioni
-- se la migrazione viene rieseguita dopo il primo apply.
DO $$
BEGIN
  -- Rimuovi la versione precedente del vincolo (qualunque set ammetta) se presente.
  ALTER TABLE public.outreach_sequence_steps
    DROP CONSTRAINT IF EXISTS outreach_steps_node_type_chk;

  -- Ricrea col set ampliato, solo se non già ricreato (re-run sicuro).
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.outreach_sequence_steps'::regclass
      AND conname = 'outreach_steps_node_type_chk'
  ) THEN
    ALTER TABLE public.outreach_sequence_steps
      ADD CONSTRAINT outreach_steps_node_type_chk
      CHECK (node_type IN ('email','wait','condition','end','whatsapp','sms')) NOT VALID;
  END IF;
END $$;

-- ── 2. channel: garantisci ('email','whatsapp','sms') su step e coda ──────────
-- Nello schema corrente i CHECK su channel ammettono già questi tre valori; qui
-- li RI-ALLINEIAMO in modo idempotente (drop+add) così la migrazione è
-- self-contained e sicura anche su ambienti dove il vincolo fosse più stretto
-- (es. solo 'email'). Mai si restringe: il set è sempre i tre canali.
-- channel ha default 'email' su entrambe le tabelle → righe esistenti conformi.
DO $$
BEGIN
  -- outreach_sequence_steps.channel
  ALTER TABLE public.outreach_sequence_steps
    DROP CONSTRAINT IF EXISTS outreach_sequence_steps_channel_check;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.outreach_sequence_steps'::regclass
      AND conname = 'outreach_sequence_steps_channel_check'
  ) THEN
    ALTER TABLE public.outreach_sequence_steps
      ADD CONSTRAINT outreach_sequence_steps_channel_check
      CHECK (channel IN ('email','whatsapp','sms')) NOT VALID;
  END IF;

  -- outreach_send_queue.channel
  ALTER TABLE public.outreach_send_queue
    DROP CONSTRAINT IF EXISTS outreach_send_queue_channel_check;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.outreach_send_queue'::regclass
      AND conname = 'outreach_send_queue_channel_check'
  ) THEN
    ALTER TABLE public.outreach_send_queue
      ADD CONSTRAINT outreach_send_queue_channel_check
      CHECK (channel IN ('email','whatsapp','sms')) NOT VALID;
  END IF;
END $$;

-- ── 3. Indice: pass del dispatcher per i canali messaggio (whatsapp/sms) ──────
-- Il dispatcher raccoglie le righe email (channel='email') separatamente dalle
-- righe whatsapp/sms (un pass dedicato per-canale). Questo indice parziale rende
-- efficiente la coda dovuta dei due canali non-email senza impattare la query email.
CREATE INDEX IF NOT EXISTS idx_outreach_queue_msg_channel
  ON public.outreach_send_queue (channel, scheduled_for)
  WHERE status = 'queued' AND kind = 'send' AND channel <> 'email';
