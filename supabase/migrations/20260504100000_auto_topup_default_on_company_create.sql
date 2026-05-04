-- MP-CR-01 — Auto Top-up attivo di default su nuove company
--
-- Comportamento richiesto: ogni nuova azienda nasce con auto-ricarica
-- pre-configurata per Email/AI/WhatsApp con valori safe (soglia €5, importo €25).
-- L'utente puo' modificare gli importi o disabilitare singoli wallet.
--
-- Importante: l'effettiva ricarica scatta SOLO quando esiste anche
-- stripe_payment_method_id (popolato dal webhook al primo pagamento manuale).
-- Quindi default = "armato ma in attesa di carta salvata".

-- ════════════════════════════════════════════════════════════════════════════
-- 1) Funzione che inserisce 3 righe di default per una company
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.seed_default_auto_topup(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert idempotente: ON CONFLICT DO NOTHING evita duplicati
  -- per company che gia' hanno la config (es. legacy).
  INSERT INTO public.company_auto_topup
    (company_id, wallet_type, enabled, threshold_eur, topup_amount_eur, payment_method)
  VALUES
    (p_company_id, 'email',    true, 5.00, 25.00, 'stripe'),
    (p_company_id, 'ai',       true, 5.00, 25.00, 'stripe'),
    (p_company_id, 'whatsapp', true, 5.00, 25.00, 'stripe')
  ON CONFLICT (company_id, wallet_type) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_default_auto_topup FROM public, anon;
GRANT EXECUTE ON FUNCTION public.seed_default_auto_topup TO authenticated, service_role;

COMMENT ON FUNCTION public.seed_default_auto_topup IS
  'Crea le 3 righe di default in company_auto_topup (email/ai/whatsapp) per una company.';

-- ════════════════════════════════════════════════════════════════════════════
-- 2) Trigger su companies INSERT → seed automatico
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.tg_seed_auto_topup_on_company_create()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.seed_default_auto_topup(NEW.id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Non bloccare la creazione della company se per qualunque motivo
  -- il seed fallisce (es. tabella mancante in env di test).
  RAISE WARNING 'seed_default_auto_topup failed for company %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_auto_topup_on_company_create ON public.companies;
CREATE TRIGGER trg_seed_auto_topup_on_company_create
  AFTER INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.tg_seed_auto_topup_on_company_create();

COMMENT ON TRIGGER trg_seed_auto_topup_on_company_create ON public.companies IS
  'Auto-attiva auto top-up Email+AI+WhatsApp con default safe su ogni nuova company.';

-- ════════════════════════════════════════════════════════════════════════════
-- 3) Backfill — insert default per company esistenti senza config
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_company record;
  v_inserted int := 0;
BEGIN
  FOR v_company IN
    SELECT c.id FROM public.companies c
  LOOP
    -- Conta quante config esistono per questa company
    -- (non usiamo seed_default_auto_topup direttamente per logging)
    INSERT INTO public.company_auto_topup
      (company_id, wallet_type, enabled, threshold_eur, topup_amount_eur, payment_method)
    SELECT v_company.id, w, true, 5.00, 25.00, 'stripe'
    FROM (VALUES ('email'), ('ai'), ('whatsapp')) AS t(w)
    ON CONFLICT (company_id, wallet_type) DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
  END LOOP;
  RAISE NOTICE 'Backfill auto_topup completato — righe nuove: %', v_inserted;
END $$;
