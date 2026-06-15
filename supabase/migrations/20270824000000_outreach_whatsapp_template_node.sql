-- ── Outreach · Nodo WhatsApp con TEMPLATE approvato (compliance Meta) ─────────
-- Estende i nodi messaggio WhatsApp (migrazione 20270823000000) con la
-- possibilità di inviare un TEMPLATE Meta approvato invece del (o in fallback al)
-- testo libero. È la via conforme per i contatti COLD: fuori dalla Customer
-- Service Window 24h Meta RIFIUTA il testo libero (errore 131047) e degrada la
-- quality rating del numero; un template approvato passa anche a finestra chiusa.
--
-- ADDITIVA e IDEMPOTENTE. Nessun dato esistente cambia:
--   • Tre nuove colonne NULLABLE su outreach_sequence_steps. Default NULL =
--     "nessun template" → comportamento attuale (testo libero in finestra).
--   • Le righe esistenti (template_name NULL) restano testo libero: zero regressioni.
--   • Niente nuove tabelle/RLS: le policy super_admin/service di outreach_*
--     (migrazione 20270815000000) coprono già la tabella; aggiungere colonne non le tocca.
--
-- Colonne:
--   template_name     text  — nome del template Meta approvato (NULL = testo libero).
--   template_language text  — lingua del template (es. 'it'); usata per template.language.code.
--   template_params   jsonb — mappa POSIZIONALE variabile→valore dei parametri body
--                             del template: { "1": "{{first_name}}", "2": "Edilizia in Cloud" }.
--                             Ogni valore è una variabile ({{first_name}}…, renderizzata
--                             al send coi dati del contatto) o testo fisso. Scelto jsonb
--                             (non text[]) per coerenza con wa_meta_templates.variable_mapping
--                             (anch'esso jsonb posizionale) e perché i valori sono eterogenei.
--
-- Tecnica coerente con 20270822000000/20270823000000: ADD COLUMN IF NOT EXISTS
-- (additivo/idempotente) + guard su pg_constraint per il CHECK (re-run sicuro).
-- NOTA: migrazione LOCALE — applicare con apply_migration quando pronto.
-- Forward-dated come il resto dello storico migrazioni del progetto.

-- ── 1. Colonne template sul nodo step ────────────────────────────────────────
ALTER TABLE public.outreach_sequence_steps
  ADD COLUMN IF NOT EXISTS template_name     text,
  ADD COLUMN IF NOT EXISTS template_language text,
  ADD COLUMN IF NOT EXISTS template_params   jsonb;

-- ── 2. CHECK coerenza: i parametri esistono solo con un template ──────────────
-- Un template_params valorizzato senza template_name non avrebbe significato (i
-- parametri sono i placeholder del template). Vincolo soft (NOT VALID) per non
-- riscrivere le righe esistenti, che hanno tutte i tre campi NULL → conformi.
-- template_params, quando presente, deve essere un OGGETTO JSON (mappa posizionale).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.outreach_sequence_steps'::regclass
      AND conname = 'outreach_steps_template_params_chk'
  ) THEN
    ALTER TABLE public.outreach_sequence_steps
      ADD CONSTRAINT outreach_steps_template_params_chk
      CHECK (
        template_params IS NULL
        OR (template_name IS NOT NULL AND jsonb_typeof(template_params) = 'object')
      ) NOT VALID;
  END IF;
END $$;
