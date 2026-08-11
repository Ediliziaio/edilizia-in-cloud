-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

ALTER TABLE public.silvio_azioni ADD COLUMN IF NOT EXISTS ambito text NOT NULL DEFAULT 'generale';
UPDATE public.silvio_azioni SET ambito = 'finanza'   WHERE chiave IN ('crea_bozza_fattura_passiva','aggiungi_scadenza_previsionale','aggiorna_iban_fornitore','registra_documento_definitivo');
UPDATE public.silvio_azioni SET ambito = 'magazzino'  WHERE chiave IN ('crea_bozza_carico_magazzino');
UPDATE public.silvio_azioni SET ambito = 'marketing'  WHERE chiave IN ('apri_opportunita_preventivo','attiva_sequenza_followup');
UPDATE public.silvio_azioni SET ambito = 'generale'   WHERE chiave IN ('collega_email_entita','proponi_evento_agenda','genera_bozza_risposta','invia_email','invia_pec','archivia_in_blocco','notifica_digest');

CREATE OR REPLACE FUNCTION public.silvio_ambito_consentito(p_ambito text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE ok boolean := false; uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RETURN false; END IF;
  IF public.is_super_admin(uid) OR public.has_role(uid, 'company_admin') THEN RETURN true; END IF;
  IF public.has_role(uid, 'company_staff') AND p_ambito <> 'hr' THEN ok := true; END IF;
  IF public.has_role(uid, 'accountant') AND p_ambito IN ('finanza','clienti','generale') THEN ok := true; END IF;
  IF public.has_role(uid, 'salesperson') AND p_ambito IN ('marketing','clienti','generale') THEN ok := true; END IF;
  IF (public.has_role(uid, 'employee') OR public.has_role(uid, 'worker'))
     AND p_ambito IN ('cantieri','magazzino','generale') THEN ok := true; END IF;
  RETURN ok;
END $$;

CREATE OR REPLACE FUNCTION public.silvio_ambiti_utente()
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(array_agg(a), '{}') FROM unnest(ARRAY['finanza','marketing','clienti','cantieri','magazzino','hr','generale']) a
  WHERE public.silvio_ambito_consentito(a);
$$;

CREATE OR REPLACE FUNCTION public.silvio_puo_eseguire(p_chiave text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a public.silvio_azioni; o public.silvio_azioni_override;
  v_company uuid := public.get_effective_company_id();
  v_ruoli text[]; v_eff_rank int; v_is_super boolean := public.is_super_admin(auth.uid());
  rank_map jsonb := '{"autonoma":0,"conferma":1,"vietata":2}'::jsonb;
BEGIN
  SELECT * INTO a FROM public.silvio_azioni WHERE chiave = p_chiave;
  IF NOT FOUND OR NOT a.attiva THEN RETURN 'vietata'; END IF;
  SELECT * INTO o FROM public.silvio_azioni_override WHERE company_id = v_company AND chiave = p_chiave;
  IF FOUND AND o.attiva IS NOT NULL AND o.attiva = false THEN RETURN 'vietata'; END IF;
  v_ruoli := coalesce(o.ruoli_consentiti, a.ruoli_consentiti);
  v_eff_rank := (rank_map->>a.autorizzazione)::int;
  IF FOUND AND o.autorizzazione IS NOT NULL THEN
    v_eff_rank := greatest(v_eff_rank, (rank_map->>o.autorizzazione)::int);
  END IF;
  IF a.categoria_rischio IN ('denaro','esterno') OR a.reversibilita = 'irreversibile' THEN
    v_eff_rank := greatest(v_eff_rank, 1);
  END IF;
  IF NOT v_is_super THEN
    IF v_ruoli IS NULL OR NOT EXISTS (
      SELECT 1 FROM unnest(v_ruoli) r WHERE public.has_role(auth.uid(), r::app_role)
    ) THEN RETURN 'vietata'; END IF;
    IF NOT public.silvio_ambito_consentito(a.ambito) THEN RETURN 'vietata'; END IF;
  END IF;
  RETURN CASE v_eff_rank WHEN 0 THEN 'autonoma' WHEN 1 THEN 'conferma' ELSE 'vietata' END;
END $$;

DROP FUNCTION IF EXISTS public.silvio_catalogo();
CREATE OR REPLACE FUNCTION public.silvio_catalogo()
RETURNS TABLE (
  chiave text, descrizione text, modulo text, funzione_target text,
  reversibilita text, categoria_rischio text, ambito text, autorizzazione_default text,
  autorizzazione_effettiva text, ruoli_consentiti text[], attiva boolean
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.chiave, a.descrizione, a.modulo, a.funzione_target,
         a.reversibilita, a.categoria_rischio, a.ambito, a.autorizzazione AS autorizzazione_default,
         public.silvio_puo_eseguire(a.chiave) AS autorizzazione_effettiva,
         coalesce(o.ruoli_consentiti, a.ruoli_consentiti) AS ruoli_consentiti,
         coalesce(o.attiva, a.attiva) AS attiva
  FROM public.silvio_azioni a
  LEFT JOIN public.silvio_azioni_override o
    ON o.chiave = a.chiave AND o.company_id = public.get_effective_company_id()
  ORDER BY a.modulo, a.chiave;
$$;

REVOKE EXECUTE ON FUNCTION public.silvio_ambito_consentito(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.silvio_ambiti_utente() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.silvio_catalogo() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.silvio_ambito_consentito(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.silvio_ambiti_utente() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.silvio_catalogo() TO authenticated, service_role;
