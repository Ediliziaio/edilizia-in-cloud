-- ════════════════════════════════════════════════════════════════════════════
-- Preventivi dei moduli edili: numero progressivo vero (RST-2026-001…)
-- ════════════════════════════════════════════════════════════════════════════
-- Ristrutturazione, Bagni, Climatizzazione, Elettrico, Termoidraulico,
-- Pavimenti, Piscine e Tetti numeravano il preventivo contando i progetti
-- dell'azienda (di tutti gli anni) nel browser: il numero non ripartiva a
-- gennaio, si ripeteva cancellando un progetto, e due salvataggi insieme
-- prendevano lo stesso.
--
-- genera_codice_progetto(azienda, modulo) dà il prossimo numero dell'anno:
-- contatore per azienda+modulo+anno sotto lock, che al primo uso dell'anno
-- riparte dal massimo già usato nella tabella del modulo (cestinati compresi),
-- così nessun numero già dato torna in circolo. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.progetto_codice_contatori (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  modulo text NOT NULL,
  anno integer NOT NULL,
  ultimo integer NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, modulo, anno)
);
ALTER TABLE public.progetto_codice_contatori ENABLE ROW LEVEL SECURITY;
-- Nessuna policy: ci scrive solo la funzione qui sotto.
REVOKE ALL ON public.progetto_codice_contatori FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.genera_codice_progetto(p_company_id uuid, p_modulo text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_anno integer := EXTRACT(YEAR FROM (now() AT TIME ZONE 'Europe/Rome'))::integer;
  v_tabella text;
  v_prefisso text;
  v_regex text;
  v_massimo integer;
  v_ultimo integer;
BEGIN
  IF NOT public.user_can_access_company(p_company_id) THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  -- Solo i moduli conosciuti: il nome della tabella non arriva mai dal chiamante.
  SELECT t.tabella, t.prefisso INTO v_tabella, v_prefisso
    FROM (VALUES
      ('ristrutturazione', 'rst_progetti', 'RST'),
      ('bagni', 'bgn_progetti', 'BGN'),
      ('climatizzazione', 'clm_progetti', 'CLM'),
      ('elettrico', 'ele_progetti', 'ELE'),
      ('termoidraulico', 'idr_progetti', 'IDR'),
      ('pavimenti', 'pav_progetti', 'PAV'),
      ('piscine', 'pis_progetti', 'PIS'),
      ('tetti', 'tet_progetti', 'TET')
    ) AS t(modulo, tabella, prefisso)
   WHERE t.modulo = p_modulo;
  IF v_tabella IS NULL THEN
    RAISE EXCEPTION 'Modulo sconosciuto: %', p_modulo USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('codice_progetto:' || p_company_id::text || ':' || p_modulo || ':' || v_anno::text));

  IF NOT EXISTS (SELECT 1 FROM public.progetto_codice_contatori
                  WHERE company_id = p_company_id AND modulo = p_modulo AND anno = v_anno) THEN
    v_regex := '^' || v_prefisso || '-' || v_anno::text || '-([0-9]+)$';
    EXECUTE format(
      'SELECT COALESCE(MAX((regexp_match(code, %L))[1]::integer), 0) FROM public.%I WHERE company_id = $1 AND code ~ %L',
      v_regex, v_tabella, v_regex)
      INTO v_massimo USING p_company_id;
    INSERT INTO public.progetto_codice_contatori (company_id, modulo, anno, ultimo)
    VALUES (p_company_id, p_modulo, v_anno, v_massimo)
    ON CONFLICT DO NOTHING;
  END IF;

  UPDATE public.progetto_codice_contatori
     SET ultimo = ultimo + 1
   WHERE company_id = p_company_id AND modulo = p_modulo AND anno = v_anno
  RETURNING ultimo INTO v_ultimo;

  RETURN v_prefisso || '-' || v_anno::text || '-' || lpad(v_ultimo::text, 3, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.genera_codice_progetto(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.genera_codice_progetto(uuid, text) TO authenticated, service_role;
