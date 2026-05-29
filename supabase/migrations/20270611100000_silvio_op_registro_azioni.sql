-- ════════════════════════════════════════════════════════════════════════════
-- MP-SILVIO-01 · Registro azioni operative + permessi (per-azienda)
-- ────────────────────────────────────────────────────────────────────────────
-- Agente OPERATIVO per l'impresa (distinto dallo scaffold admin silvio_agent_*).
-- Definisce COSA Silvio può fare nel gestionale e CHI lo autorizza. NON esegue
-- (l'esecuzione è MP-SILVIO-02). Whitelist: nessuna azione esiste se non è qui.
-- Regola ferrea: denaro/esterno/irreversibile ⇒ MAI autonoma, sempre conferma.
-- Le azioni sono WRAPPER su funzioni REALI già esistenti (ponti MP-06→16).
-- ════════════════════════════════════════════════════════════════════════════

-- ── Catalogo globale (definito dalla piattaforma) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.silvio_azioni (
  chiave            text PRIMARY KEY,
  descrizione       text NOT NULL,
  modulo            text NOT NULL,
  funzione_target   text NOT NULL,                 -- edge function / RPC REALE
  input_schema      jsonb NOT NULL DEFAULT '{}'::jsonb,
  reversibilita     text NOT NULL CHECK (reversibilita IN ('reversibile','difficile','irreversibile')),
  categoria_rischio text NOT NULL CHECK (categoria_rischio IN ('interno','esterno','denaro')),
  autorizzazione    text NOT NULL CHECK (autorizzazione IN ('autonoma','conferma','vietata')),
  ruoli_consentiti  text[] NOT NULL DEFAULT '{}',  -- app_role labels
  azione_inversa    text,                          -- chiave dell'azione che annulla (undo, MP-06)
  attiva            boolean NOT NULL DEFAULT true,
  versione          int NOT NULL DEFAULT 1,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- ── Override per-azienda: SOLO restrittivo (mai allarga oltre il default) ────
CREATE TABLE IF NOT EXISTS public.silvio_azioni_override (
  company_id        uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  chiave            text NOT NULL REFERENCES public.silvio_azioni(chiave) ON DELETE CASCADE,
  autorizzazione    text CHECK (autorizzazione IN ('autonoma','conferma','vietata')),
  ruoli_consentiti  text[],
  attiva            boolean,
  updated_by        uuid REFERENCES auth.users(id),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, chiave)
);

-- ── Funzione di controllo: combina default + override + ruolo + regola ferrea ─
-- Ritorna 'autonoma' | 'conferma' | 'vietata' per l'utente/azienda correnti.
-- Sicura per costruzione: l'override può solo RESTRINGERE; denaro/esterno/
-- irreversibile non diventano mai 'autonoma'.
CREATE OR REPLACE FUNCTION public.silvio_puo_eseguire(p_chiave text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a public.silvio_azioni;
  o public.silvio_azioni_override;
  v_company uuid := public.get_effective_company_id();
  v_ruoli text[];
  v_eff_rank int;
  v_is_super boolean := public.is_super_admin(auth.uid());
  rank_map jsonb := '{"autonoma":0,"conferma":1,"vietata":2}'::jsonb;
BEGIN
  SELECT * INTO a FROM public.silvio_azioni WHERE chiave = p_chiave;
  IF NOT FOUND OR NOT a.attiva THEN RETURN 'vietata'; END IF;

  SELECT * INTO o FROM public.silvio_azioni_override WHERE company_id = v_company AND chiave = p_chiave;
  IF FOUND AND o.attiva IS NOT NULL AND o.attiva = false THEN RETURN 'vietata'; END IF;

  v_ruoli := coalesce(o.ruoli_consentiti, a.ruoli_consentiti);

  -- restrittività crescente: eff = max(default, override)
  v_eff_rank := (rank_map->>a.autorizzazione)::int;
  IF FOUND AND o.autorizzazione IS NOT NULL THEN
    v_eff_rank := greatest(v_eff_rank, (rank_map->>o.autorizzazione)::int);
  END IF;

  -- regola ferrea: denaro/esterno/irreversibile ⇒ almeno 'conferma'
  IF a.categoria_rischio IN ('denaro','esterno') OR a.reversibilita = 'irreversibile' THEN
    v_eff_rank := greatest(v_eff_rank, 1);
  END IF;

  -- gate ruolo (super_admin bypassa)
  IF NOT v_is_super THEN
    IF v_ruoli IS NULL OR NOT EXISTS (
      SELECT 1 FROM unnest(v_ruoli) r WHERE public.has_role(auth.uid(), r::app_role)
    ) THEN
      RETURN 'vietata';
    END IF;
  END IF;

  RETURN CASE v_eff_rank WHEN 0 THEN 'autonoma' WHEN 1 THEN 'conferma' ELSE 'vietata' END;
END $$;

-- Catalogo effettivo per la UI: ogni azione + autorizzazione risolta per chi chiama.
CREATE OR REPLACE FUNCTION public.silvio_catalogo()
RETURNS TABLE (
  chiave text, descrizione text, modulo text, funzione_target text,
  reversibilita text, categoria_rischio text, autorizzazione_default text,
  autorizzazione_effettiva text, ruoli_consentiti text[], attiva boolean
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.chiave, a.descrizione, a.modulo, a.funzione_target,
         a.reversibilita, a.categoria_rischio, a.autorizzazione AS autorizzazione_default,
         public.silvio_puo_eseguire(a.chiave) AS autorizzazione_effettiva,
         coalesce(o.ruoli_consentiti, a.ruoli_consentiti) AS ruoli_consentiti,
         coalesce(o.attiva, a.attiva) AS attiva
  FROM public.silvio_azioni a
  LEFT JOIN public.silvio_azioni_override o
    ON o.chiave = a.chiave AND o.company_id = public.get_effective_company_id()
  ORDER BY a.modulo, a.chiave;
$$;

-- Imposta un override (solo restrittivo; non può rendere 'autonoma' un default 'conferma').
CREATE OR REPLACE FUNCTION public.silvio_azione_override_set(
  p_chiave text, p_autorizzazione text DEFAULT NULL, p_attiva boolean DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.silvio_azioni; v_company uuid := public.get_effective_company_id();
  rank_map jsonb := '{"autonoma":0,"conferma":1,"vietata":2}'::jsonb;
BEGIN
  IF NOT public.is_email_staff_interno() THEN RAISE EXCEPTION 'non_autorizzato'; END IF;
  SELECT * INTO a FROM public.silvio_azioni WHERE chiave = p_chiave;
  IF NOT FOUND THEN RAISE EXCEPTION 'azione_inesistente'; END IF;
  -- un override può solo restringere: l'autorizzazione richiesta deve essere ≥ del default
  IF p_autorizzazione IS NOT NULL
     AND (rank_map->>p_autorizzazione)::int < (rank_map->>a.autorizzazione)::int THEN
    RAISE EXCEPTION 'override_non_puo_allargare';
  END IF;
  INSERT INTO public.silvio_azioni_override (company_id, chiave, autorizzazione, attiva, updated_by, updated_at)
  VALUES (v_company, p_chiave, p_autorizzazione, p_attiva, auth.uid(), now())
  ON CONFLICT (company_id, chiave) DO UPDATE
    SET autorizzazione = EXCLUDED.autorizzazione, attiva = EXCLUDED.attiva,
        updated_by = auth.uid(), updated_at = now();
END $$;

-- ── Seed catalogo iniziale (wrapper su funzioni REALI dei ponti MP-06→16) ───
INSERT INTO public.silvio_azioni (chiave, descrizione, modulo, funzione_target, input_schema, reversibilita, categoria_rischio, autorizzazione, ruoli_consentiti, azione_inversa) VALUES
 ('crea_bozza_fattura_passiva','Crea una bozza di fattura passiva dai dati estratti da un allegato','fatturazione','email-ai-estrai-allegato','{"email_id":"uuid","attachment_index":"int"}','reversibile','interno','conferma','{company_admin,company_staff}','elimina_bozza_documento'),
 ('crea_bozza_carico_magazzino','Crea una bozza di carico magazzino da un DDT','magazzino','email-ai-ddt-carico','{"documento_id":"uuid"}','reversibile','interno','conferma','{company_admin,company_staff}',NULL),
 ('apri_opportunita_preventivo','Apre un''opportunità + bozza preventivo da una richiesta','crm','email-ai-opportunita','{"email_id":"uuid"}','reversibile','interno','autonoma','{company_admin,company_staff,salesperson}',NULL),
 ('aggiungi_scadenza_previsionale','Aggiunge una scadenza previsionale al cashflow','scadenze','email-ai-scadenza','{"email_id":"uuid"}','reversibile','interno','autonoma','{company_admin,company_staff}',NULL),
 ('collega_email_entita','Collega un''email a un cantiere o pratica','email','sequenza_enroll','{"email_id":"uuid","oggetto_tipo":"text","oggetto_id":"uuid"}','reversibile','interno','autonoma','{company_admin,company_staff,employee}','scollega_email_entita'),
 ('proponi_evento_agenda','Propone un evento in agenda da un''email','calendario','email-ai-evento','{"email_id":"uuid"}','reversibile','interno','conferma','{company_admin,company_staff}',NULL),
 ('genera_bozza_risposta','Genera una bozza di risposta AI a un''email','email','email-ai-l4-draft','{"email_id":"uuid"}','reversibile','interno','autonoma','{company_admin,company_staff,salesperson}',NULL),
 ('invia_email','Invia una email','email','email-send','{"outbox_id":"uuid"}','irreversibile','esterno','conferma','{company_admin,company_staff}',NULL),
 ('invia_pec','Invia una PEC (valore legale)','email','email-send','{"outbox_id":"uuid"}','irreversibile','esterno','conferma','{company_admin}',NULL),
 ('attiva_sequenza_followup','Arruola un destinatario in una sequenza di follow-up','email','sequenza_enroll','{"sequenza_id":"uuid","destinatario":"text"}','difficile','esterno','conferma','{company_admin,company_staff}',NULL),
 ('aggiorna_iban_fornitore','Aggiorna l''IBAN noto di un fornitore','fornitori','suppliers.update','{"supplier_id":"uuid","iban":"text"}','difficile','denaro','conferma','{company_admin}',NULL),
 ('archivia_in_blocco','Archivia in blocco le email di una categoria','email','bonifica_archivia_categoria','{"categoria":"text"}','difficile','interno','conferma','{company_admin,company_staff}','bonifica_annulla'),
 ('registra_documento_definitivo','Registra definitivamente un documento estratto nel gestionale','fatturazione','email_scadenza_conferma','{"bozza_id":"uuid"}','difficile','interno','conferma','{company_admin,company_staff}',NULL)
ON CONFLICT (chiave) DO NOTHING;

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.silvio_azioni ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.silvio_azioni_override ENABLE ROW LEVEL SECURITY;

-- catalogo: leggibile da ogni utente autenticato; scrittura solo service/super
DROP POLICY IF EXISTS silvio_azioni_read ON public.silvio_azioni;
CREATE POLICY silvio_azioni_read ON public.silvio_azioni FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS silvio_azioni_service ON public.silvio_azioni;
CREATE POLICY silvio_azioni_service ON public.silvio_azioni FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS silvio_azioni_super ON public.silvio_azioni;
CREATE POLICY silvio_azioni_super ON public.silvio_azioni FOR ALL TO authenticated USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

-- override: staff interno della propria azienda
DROP POLICY IF EXISTS silvio_ovr_staff ON public.silvio_azioni_override;
CREATE POLICY silvio_ovr_staff ON public.silvio_azioni_override FOR ALL TO authenticated
  USING (company_id = public.get_effective_company_id() AND public.is_email_staff_interno())
  WITH CHECK (company_id = public.get_effective_company_id() AND public.is_email_staff_interno());
DROP POLICY IF EXISTS silvio_ovr_service ON public.silvio_azioni_override;
CREATE POLICY silvio_ovr_service ON public.silvio_azioni_override FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS silvio_ovr_super ON public.silvio_azioni_override;
CREATE POLICY silvio_ovr_super ON public.silvio_azioni_override FOR ALL TO authenticated USING (public.is_super_admin(auth.uid()));

-- grants RPC
REVOKE EXECUTE ON FUNCTION public.silvio_puo_eseguire(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.silvio_catalogo() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.silvio_azione_override_set(text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.silvio_puo_eseguire(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.silvio_catalogo() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.silvio_azione_override_set(text, text, boolean) TO authenticated, service_role;

COMMENT ON TABLE public.silvio_azioni IS 'MP-SILVIO-01: catalogo azioni operative dell''agente (wrapper su funzioni reali). Whitelist. Distinto dallo scaffold admin silvio_agent_*.';
COMMENT ON FUNCTION public.silvio_puo_eseguire(text) IS 'MP-SILVIO-01: autorizzazione effettiva (default+override+ruolo). Ferrea: denaro/esterno/irreversibile mai autonoma.';
