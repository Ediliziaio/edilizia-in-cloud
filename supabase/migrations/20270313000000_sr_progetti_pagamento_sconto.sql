-- Estende sr_progetti per supportare:
--  - Modalità di pagamento cliente (acconto + step intermedi + saldo) come
--    JSONB array di {label, percentuale, when}.
--  - Aggancio alla regola di sconto azienda (discount_rules.id) per audit
--    e per propagazione del valore preimpostato senza re-input manuale.
--  - Aggancio diretto a una RIGA della tabella finanziamento (non solo la
--    tabella) per memorizzare la "rata scelta" senza dover ricalcolare.
--
-- Tutti i campi sono opzionali: i progetti esistenti continuano a funzionare
-- con anticipo/piani manuali.
-- Idempotente.

ALTER TABLE public.sr_progetti
  ADD COLUMN IF NOT EXISTS pagamento_milestones JSONB,
  ADD COLUMN IF NOT EXISTS discount_rule_id UUID REFERENCES public.discount_rules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fin_tabella_riga_id UUID REFERENCES public.eic_tabelle_finanziamento_righe(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.sr_progetti.pagamento_milestones IS
  'Modalità di pagamento cliente come JSONB array di {label, percentuale, when?}. '
  'Esempio: [{"label":"Acconto firma","percentuale":30,"when":"Alla firma"},'
  '{"label":"Inizio lavori","percentuale":40,"when":"Consegna materiale"},'
  '{"label":"Saldo","percentuale":30,"when":"Fine collaudo"}]. '
  'La somma dovrebbe fare 100%. NULL = nessuna milestone, pagamento unico.';

COMMENT ON COLUMN public.sr_progetti.discount_rule_id IS
  'FK alla regola di sconto azienda applicata. Sblocca lo sconto pre-configurato '
  'senza richiedere input manuale. NULL = sconto manuale o nessuno sconto.';

COMMENT ON COLUMN public.sr_progetti.fin_tabella_riga_id IS
  'FK alla riga specifica della tabella finanziamento usata (importo×durata→rata). '
  'Permette di mostrare al cliente importo rata + TAEG + ICC senza ricalcolo. '
  'NULL = nessun finanziamento selezionato o solo simulazione manuale.';

NOTIFY pgrst, 'reload schema';
