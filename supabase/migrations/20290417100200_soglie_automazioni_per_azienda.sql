-- Soglie dei collegamenti per azienda (piano punti aperti 16/11/2026, §5; deciso il 16/11).
--
-- I valori di oggi restano i default; ogni azienda li cambia in Impostazioni → Automazioni
-- (company_governance_settings, come le soglie dei rincari; scrive l'amministratore, regola cgs_write):
--   * banca: differenza ammessa per commissioni e arrotondamenti, 1 €;
--   * acquisti: quantità fattura contro bolla/ordine 0%, prezzo 0,5% con 2 centesimi d'arrotondamento;
--   * indirizzo del cantiere: resta solo proposta, mai automatico (nessuna colonna: non si cambia).
-- Chi le legge: private.tes_classifica (R-DIFF e finestra dei conflitti), private.bank_register_difference
-- (arrotondamento alla conferma) e la funzione riconcilia-fattura-ai (confronto righe, via
-- azienda_soglie_automazioni).

ALTER TABLE public.company_governance_settings
  ADD COLUMN IF NOT EXISTS banca_differenza_max numeric(10,2) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS acquisti_quantita_toll_perc numeric(6,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS acquisti_prezzo_toll_perc numeric(6,3) NOT NULL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS acquisti_prezzo_toll_cent integer NOT NULL DEFAULT 2;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cgs_soglie_collegamenti_valide') THEN
    ALTER TABLE public.company_governance_settings ADD CONSTRAINT cgs_soglie_collegamenti_valide CHECK (
      banca_differenza_max BETWEEN 0 AND 50
      AND acquisti_quantita_toll_perc BETWEEN 0 AND 20
      AND acquisti_prezzo_toll_perc BETWEEN 0 AND 20
      AND acquisti_prezzo_toll_cent BETWEEN 0 AND 10000);
  END IF;
END $$;

COMMENT ON COLUMN public.company_governance_settings.banca_differenza_max IS
  'Banca: differenza in euro ammessa fra movimento e partita (commissioni, arrotondamenti). Default 1.';
COMMENT ON COLUMN public.company_governance_settings.acquisti_quantita_toll_perc IS
  'Acquisti: scarto di quantità fattura/bolla/ordine ammesso, in percentuale. Default 0.';
COMMENT ON COLUMN public.company_governance_settings.acquisti_prezzo_toll_perc IS
  'Acquisti: scarto di prezzo unitario ammesso, in percentuale. Default 0,5.';
COMMENT ON COLUMN public.company_governance_settings.acquisti_prezzo_toll_cent IS
  'Acquisti: scarto d''importo di riga sempre ammesso (arrotondamenti), in centesimi. Default 2.';

-- La soglia della banca per il motore (default se manca la riga).
CREATE OR REPLACE FUNCTION private.soglia_banca_differenza(p_company uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT coalesce((SELECT g.banca_differenza_max FROM public.company_governance_settings g WHERE g.company_id = p_company), 1.00)
$$;
REVOKE ALL ON FUNCTION private.soglia_banca_differenza(uuid) FROM PUBLIC, anon, authenticated;

-- Tutte le soglie, per le funzioni del server e per le schermate (default se manca la riga).
CREATE OR REPLACE FUNCTION public.azienda_soglie_automazioni(p_company uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE g public.company_governance_settings;
BEGIN
  IF coalesce(auth.jwt()->>'role', '') <> 'service_role' AND NOT coalesce(public.user_can_access_company(p_company), false) THEN
    RAISE EXCEPTION 'Azienda non accessibile.' USING errcode = '42501';
  END IF;
  SELECT * INTO g FROM public.company_governance_settings WHERE company_id = p_company;
  RETURN jsonb_build_object(
    'banca_differenza_max', coalesce(g.banca_differenza_max, 1.00),
    'acquisti_quantita_toll_perc', coalesce(g.acquisti_quantita_toll_perc, 0),
    'acquisti_prezzo_toll_perc', coalesce(g.acquisti_prezzo_toll_perc, 0.5),
    'acquisti_prezzo_toll_cent', coalesce(g.acquisti_prezzo_toll_cent, 2),
    'indirizzo_cantiere', 'solo_proposta');
END $$;
REVOKE ALL ON FUNCTION public.azienda_soglie_automazioni(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.azienda_soglie_automazioni(uuid) TO authenticated, service_role;

-- ── Il motore della banca legge la soglia ────────────────────────────────────
DO $motore$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('private.tes_classifica(uuid,uuid)'::regprocedure);
  IF position('diff_max' IN d) > 0 THEN RETURN; END IF;
  n := replace(d, $a$cod_ordini jsonb:='{}'; cod jsonb; ord_ids uuid[];$a$,
                  $a$cod_ordini jsonb:='{}'; cod jsonb; ord_ids uuid[]; diff_max numeric:=private.soglia_banca_differenza(p_company);$a$);
  n := replace(n, $a$IF abs(rec.residuo-amt)<=1.00 THEN confl:=confl||jsonb_build_array(c); END IF;$a$,
                  $a$IF abs(rec.residuo-amt)<=greatest(diff_max,0.005) THEN confl:=confl||jsonb_build_array(c); END IF;$a$);
  n := replace(n, $a$ -- 3. Differenza fino a 1 € (commissione o arrotondamento), soggetto certo.$a$,
                  $a$ -- 3. Differenza fino alla soglia dell'azienda (default 1 €: commissione o arrotondamento), soggetto certo.$a$);
  n := replace(n, $a$abs((x->>'residuo')::numeric-amt) BETWEEN 0.005 AND 1.00;$a$,
                  $a$abs((x->>'residuo')::numeric-amt) BETWEEN 0.005 AND diff_max;$a$);
  IF (length(n) - length(replace(n, 'diff_max', ''))) / length('diff_max') <> 3 THEN
    RAISE EXCEPTION 'tes_classifica: forma inattesa, la soglia della banca non si è innestata';
  END IF;
  EXECUTE n;
END $motore$;

-- ── E l'arrotondamento registrato alla conferma ──────────────────────────────
DO $diff$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('private.bank_register_difference(uuid,uuid,numeric,text)'::regprocedure);
  IF position('soglia_banca_differenza' IN d) > 0 THEN RETURN; END IF;
  n := replace(d, $a$IF p_reason='arrotondamento' AND p_amount>1 THEN RAISE EXCEPTION 'Arrotondamento superiore a 1 euro: verifica la registrazione';END IF;$a$,
                  $a$IF p_reason='arrotondamento' AND p_amount>private.soglia_banca_differenza(p_company) THEN RAISE EXCEPTION 'Arrotondamento oltre la soglia dell''azienda (% €, Impostazioni → Automazioni): verifica la registrazione',private.soglia_banca_differenza(p_company);END IF;$a$);
  IF n = d THEN RAISE EXCEPTION 'bank_register_difference: forma inattesa, la soglia non si è innestata'; END IF;
  EXECUTE n;
END $diff$;
