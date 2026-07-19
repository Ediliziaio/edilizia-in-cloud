-- =====================================================================
-- Tesoreria MANUALE — conti/casse senza Open Banking
-- =====================================================================
-- Permette alle aziende che NON collegano la banca via Open Banking di
-- gestire comunque la tesoreria: conti/casse creati a mano (anche più d'uno),
-- movimenti manuali e import dell'estratto conto (CSV/Excel o foto/PDF letta
-- dall'AI, edge function `ai-bank-statement-parser`).
--
-- I conti manuali sono normali righe di `bank_accounts` con `is_manual = true`
-- e `connection_id = NULL`; i movimenti sono righe di `bank_transactions`.
-- Così alimentano ESATTAMENTE come i conti reali: tesoreria, previsionali di
-- cassa, stato patrimoniale e controllo di gestione, senza query nuove.
--
-- NB: già applicato in produzione via execute_sql (MCP). Questo file è la
-- source-of-truth versionata; il DB live NON viene aggiornato da `db push`.
-- =====================================================================

-- ── Colonne di supporto ───────────────────────────────────────────────
ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS opening_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_manual boolean NOT NULL DEFAULT false;

ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS source text; -- 'manuale' | 'import_csv' | 'import_ai' | NULL(open banking)

-- I conti manuali non hanno una connessione Open Banking.
ALTER TABLE public.bank_accounts ALTER COLUMN connection_id DROP NOT NULL;
-- NB: external_account_id resta NOT NULL + UNIQUE(company_id, external_account_id):
-- il frontend genera per i conti manuali un id sintetico `manual:<uuid>`.
-- Idem external_transaction_id su bank_transactions (id sintetico per i movimenti
-- manuali, prefisso account_id per gli import → unicità cross-conto + dedup).

-- ── Ricalcolo del saldo del conto manuale = apertura + somma movimenti ─
CREATE OR REPLACE FUNCTION public.bank_account_recompute_manual_balance(p_account uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_account IS NULL THEN RETURN; END IF;
  UPDATE public.bank_accounts ba
     SET current_balance = COALESCE(ba.opening_balance,0)
           + COALESCE((SELECT SUM(bt.amount) FROM public.bank_transactions bt WHERE bt.account_id = ba.id), 0),
         balance_updated_at = now()
   WHERE ba.id = p_account AND ba.is_manual = true;
END; $function$;

-- ── Trigger statement-level (transition tables): un solo ricalcolo per
--    conto toccato, efficiente anche sugli import di massa ──────────────
CREATE OR REPLACE FUNCTION public.trg_bank_tx_manual_balance_ins()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.bank_account_recompute_manual_balance(a)
  FROM (SELECT DISTINCT account_id AS a FROM newrows WHERE account_id IS NOT NULL) s;
  RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.trg_bank_tx_manual_balance_del()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.bank_account_recompute_manual_balance(a)
  FROM (SELECT DISTINCT account_id AS a FROM oldrows WHERE account_id IS NOT NULL) s;
  RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.trg_bank_tx_manual_balance_upd()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.bank_account_recompute_manual_balance(a)
  FROM (
    SELECT account_id AS a FROM newrows WHERE account_id IS NOT NULL
    UNION
    SELECT account_id AS a FROM oldrows WHERE account_id IS NOT NULL
  ) s;
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS trg_bank_tx_manual_balance_ins ON public.bank_transactions;
DROP TRIGGER IF EXISTS trg_bank_tx_manual_balance_del ON public.bank_transactions;
DROP TRIGGER IF EXISTS trg_bank_tx_manual_balance_upd ON public.bank_transactions;

CREATE TRIGGER trg_bank_tx_manual_balance_ins
  AFTER INSERT ON public.bank_transactions
  REFERENCING NEW TABLE AS newrows
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_bank_tx_manual_balance_ins();

CREATE TRIGGER trg_bank_tx_manual_balance_del
  AFTER DELETE ON public.bank_transactions
  REFERENCING OLD TABLE AS oldrows
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_bank_tx_manual_balance_del();

CREATE TRIGGER trg_bank_tx_manual_balance_upd
  AFTER UPDATE ON public.bank_transactions
  REFERENCING OLD TABLE AS oldrows NEW TABLE AS newrows
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_bank_tx_manual_balance_upd();

-- ── AI Router: task per la lettura AI dell'estratto conto ─────────────
INSERT INTO public.ai_router_config
  (task_key, task_label, task_description, primary_model, fallback_models, default_params, category, estimated_cost_per_million, enabled, tier_key)
VALUES
  ('bank_statement_ocr',
   'Lettura estratto conto (AI)',
   'Estrae i movimenti (data, descrizione, importo con segno) da foto o PDF di un estratto conto bancario per la tesoreria manuale',
   'google/gemini-2.5-flash',
   '["openai/gpt-4o-mini","anthropic/claude-haiku-4.5","openrouter/auto"]'::jsonb,
   '{"max_tokens":4000,"temperature":0.05}'::jsonb,
   'extraction',
   0.2700,
   true,
   't1_economic')
ON CONFLICT (task_key) DO UPDATE SET
   primary_model = EXCLUDED.primary_model,
   fallback_models = EXCLUDED.fallback_models,
   default_params = EXCLUDED.default_params,
   enabled = true,
   updated_at = now();
