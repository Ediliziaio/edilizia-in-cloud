-- I dati del calcolo del cantiere (2/11/2026).
-- Vedi docs/superpowers/plans/2026-11-02-silvio-calcolo-cantiere.md.
--
-- rese_azienda è chiusa ai client: si legge e si scrive solo da qui, così non serve
-- nessuna policy nuova. Costi e margini restano a chi può già vederli.
SET LOCAL lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS public.rese_azienda (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  chiave_lavorazione text NOT NULL,
  descrizione text NOT NULL,
  ore_per_unita numeric NOT NULL CHECK (ore_per_unita > 0 AND ore_per_unita <= 10000),
  unita text,
  aggiornata_da uuid,
  aggiornata_il timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, chiave_lavorazione)
);
ALTER TABLE public.rese_azienda ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rese_azienda FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._piano_cantiere_controlla(p_company_id uuid, p_scrittura boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  IF COALESCE(auth.role(), '') = 'service_role'
     OR public.has_role(auth.uid(), 'super_admin')
     OR public.has_role(auth.uid(), 'company_admin')
     OR public.has_permission_for_company(auth.uid(), CASE WHEN p_scrittura THEN 'can_edit_orders' ELSE 'can_view_costs' END, p_company_id) THEN
    RETURN;
  END IF;
  RAISE EXCEPTION 'Non hai il permesso di vedere i costi di questa azienda' USING ERRCODE = '42501';
END;
$function$;
REVOKE ALL ON FUNCTION public._piano_cantiere_controlla(uuid, boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.piano_cantiere_dati(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  o public.orders%ROWTYPE;
  v_result jsonb;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = p_order_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN NULL; END IF;
  PERFORM public._piano_cantiere_controlla(o.company_id);

  SELECT jsonb_build_object(
    'commessa', jsonb_build_object(
      'id', o.id, 'company_id', o.company_id, 'codice', o.order_code, 'descrizione', o.description, 'stato', o.status,
      'inizio', o.work_start_date, 'fine', COALESCE(o.work_end_date, o.expected_date),
      'indirizzo', COALESCE(o.work_address, o.indirizzo_lavori)),
    'provincia', (SELECT COALESCE(NULLIF(c.operational_province, ''), NULLIF(c.legal_province, '')) FROM public.companies c WHERE c.id = o.company_id),
    'fasi', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', f.id, 'nome', f.name, 'dal', f.start_date, 'al', f.end_date, 'status', f.status, 'percentuale', f.percentuale,
        'ditta', (SELECT t.name FROM public.order_external_teams ot JOIN public.external_teams t ON t.id = ot.external_team_id WHERE ot.phase_id = f.id LIMIT 1)
      ) ORDER BY f.position, f.start_date), '[]'::jsonb) FROM public.order_work_phases f WHERE f.order_id = o.id),
    'voci_fase', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'fase', f.name, 'descrizione', v.descrizione, 'unita', v.unita, 'quantita', v.quantita, 'importo', v.importo,
        'costo_manodopera', v.costo_manodopera, 'costo_materiali', v.costo_materiali,
        'incidenza', (SELECT t.incidenza_manodopera_pct FROM public.tariffe_aziendali t WHERE t.id = v.tariffa_id)
      )), '[]'::jsonb) FROM public.order_work_phase_voci v JOIN public.order_work_phases f ON f.id = v.phase_id WHERE v.order_id = o.id),
    'voci_computo', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'capitolo', x.capitolo_nome, 'descrizione', x.descrizione, 'unita', x.unita_misura, 'quantita', x.quantita, 'importo', x.importo,
        'costo_manodopera', x.costo_manodopera, 'costo_materiali', x.costo_materiali, 'ore_previste', x.ore_previste, 'opzionale', x.opzionale
      )), '[]'::jsonb) FROM (
        SELECT v.capitolo_nome, v.descrizione, v.unita_misura::text, v.quantita, v.importo, v.costo_manodopera, v.costo_materiali, v.ore_previste, v.opzionale FROM public.rst_computo_voci v JOIN public.rst_progetti p ON p.id = v.progetto_id WHERE p.company_id = o.company_id AND (p.ordine_id = o.id OR p.origine_quote_id = o.quote_id)
        UNION ALL SELECT v.capitolo_nome, v.descrizione, v.unita_misura::text, v.quantita, v.importo, v.costo_manodopera, v.costo_materiali, v.ore_previste, v.opzionale FROM public.bgn_computo_voci v JOIN public.bgn_progetti p ON p.id = v.progetto_id WHERE p.company_id = o.company_id AND p.origine_quote_id = o.quote_id
        UNION ALL SELECT v.capitolo_nome, v.descrizione, v.unita_misura::text, v.quantita, v.importo, v.costo_manodopera, v.costo_materiali, v.ore_previste, v.opzionale FROM public.clm_computo_voci v JOIN public.clm_progetti p ON p.id = v.progetto_id WHERE p.company_id = o.company_id AND p.origine_quote_id = o.quote_id
        UNION ALL SELECT v.capitolo_nome, v.descrizione, v.unita_misura::text, v.quantita, v.importo, v.costo_manodopera, v.costo_materiali, v.ore_previste, v.opzionale FROM public.ele_computo_voci v JOIN public.ele_progetti p ON p.id = v.progetto_id WHERE p.company_id = o.company_id AND p.origine_quote_id = o.quote_id
        UNION ALL SELECT v.capitolo_nome, v.descrizione, v.unita_misura::text, v.quantita, v.importo, v.costo_manodopera, v.costo_materiali, v.ore_previste, v.opzionale FROM public.idr_computo_voci v JOIN public.idr_progetti p ON p.id = v.progetto_id WHERE p.company_id = o.company_id AND p.origine_quote_id = o.quote_id
        UNION ALL SELECT v.capitolo_nome, v.descrizione, v.unita_misura::text, v.quantita, v.importo, v.costo_manodopera, v.costo_materiali, v.ore_previste, v.opzionale FROM public.pav_computo_voci v JOIN public.pav_progetti p ON p.id = v.progetto_id WHERE p.company_id = o.company_id AND p.origine_quote_id = o.quote_id
        UNION ALL SELECT v.capitolo_nome, v.descrizione, v.unita_misura::text, v.quantita, v.importo, v.costo_manodopera, v.costo_materiali, v.ore_previste, v.opzionale FROM public.pis_computo_voci v JOIN public.pis_progetti p ON p.id = v.progetto_id WHERE p.company_id = o.company_id AND p.origine_quote_id = o.quote_id
      ) x),
    'righe_preventivo', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'descrizione', i.name, 'unita', i.unit_of_measure, 'quantita', i.quantity, 'importo', i.line_total,
        'costo_materiali', NULLIF(i.prezzo_acquisto, 0), 'opzionale', i.is_optional,
        'incidenza', COALESCE(
          (SELECT t.incidenza_manodopera_pct FROM public.tariffe_aziendali t WHERE t.id = i.tariffa_id),
          (SELECT v.incidenza_manodopera_pct FROM public.prezzario_voce v WHERE i.codice_prezzario IS NOT NULL AND v.codice = i.codice_prezzario AND v.incidenza_manodopera_pct > 0 LIMIT 1))
      ) ORDER BY i.sort_order), '[]'::jsonb) FROM public.quote_items i WHERE i.quote_id = o.quote_id AND i.parent_item_id IS NULL),
    'ditte', (SELECT COALESCE(jsonb_agg(jsonb_build_object('nome', t.name, 'costo', COALESCE(NULLIF(ot.total_cost, 0), ot.cost_preventivo), 'phase_id', ot.phase_id)), '[]'::jsonb)
      FROM public.order_external_teams ot JOIN public.external_teams t ON t.id = ot.external_team_id WHERE ot.order_id = o.id),
    'economia', (SELECT jsonb_build_object(
        'ricavi', m.preventivo_totale,
        'manodopera', m.costo_manodopera - COALESCE((SELECT SUM(ot.total_cost) FROM public.order_external_teams ot WHERE ot.order_id = o.id), 0),
        'ditte', COALESCE((SELECT SUM(ot.total_cost) FROM public.order_external_teams ot WHERE ot.order_id = o.id), 0),
        'materiali', m.costo_acquisti + m.costo_materiali_magazzino,
        'altri', m.costo_provvigioni + m.costo_rimborsi_km + m.costo_errori + m.costo_diretto
      ) FROM public.v_ordine_marginalita m WHERE m.id = o.id),
    'persone', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', e.id, 'role_type', e.role_type, 'area', e.area, 'costo_orario', NULLIF(e.costo_orario, 0))), '[]'::jsonb)
      FROM public.employees e WHERE e.company_id = o.company_id AND COALESCE(e.is_active, true)),
    'assegnati', (SELECT COALESCE(jsonb_agg(jsonb_build_object('employee_id', oe.employee_id, 'phase_id', oe.phase_id)), '[]'::jsonb) FROM public.order_employees oe WHERE oe.order_id = o.id),
    'rese', (SELECT COALESCE(jsonb_agg(jsonb_build_object('chiave', r.chiave_lavorazione, 'ore_per_unita', r.ore_per_unita)), '[]'::jsonb) FROM public.rese_azienda r WHERE r.company_id = o.company_id),
    'ultimo_rapportino', (SELECT MAX(r.data_lavoro) FROM public.campo_rapportini r WHERE r.order_id = o.id AND r.stato IN ('inviato', 'approvato')),
    'calendario', jsonb_build_object(
      'calendario', (SELECT to_jsonb(k) - 'company_id' - 'updated_by' FROM public.silvio_calendario k WHERE k.company_id = o.company_id),
      'festivita', (SELECT COALESCE(jsonb_agg(jsonb_build_object('data', f.data, 'descrizione', f.descrizione, 'ricorrente', f.ricorrente)), '[]'::jsonb) FROM public.hr_festivita f WHERE f.company_id = o.company_id)),
    -- Fasi chiuse con ore vere e ore stimate: da qui si impara quanto si scosta la stima.
    'storico_fasi', (SELECT COALESCE(jsonb_agg(jsonb_build_object('nome', z.nome, 'ore_vere', z.ore_vere, 'costo_manodopera', z.costo)), '[]'::jsonb) FROM (
      SELECT f.name AS nome, h.ore AS ore_vere, c.costo
      FROM public.order_work_phases f
      JOIN LATERAL (SELECT SUM(v.quantita * v.costo_manodopera) AS costo FROM public.order_work_phase_voci v WHERE v.phase_id = f.id) c ON c.costo > 0
      JOIN LATERAL (
        SELECT SUM(CASE WHEN x->>'ore' ~ '^[0-9]+([.,][0-9]+)?$' THEN replace(x->>'ore', ',', '.')::numeric ELSE 0 END) AS ore
        FROM public.campo_rapportini r CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(r.fasi_lavorate) = 'array' THEN r.fasi_lavorate ELSE '[]'::jsonb END) x
        WHERE r.order_id = f.order_id AND x->>'phase_id' = f.id::text AND r.stato = 'approvato'
      ) h ON h.ore > 0
      WHERE f.company_id = o.company_id AND f.status = 'completata' AND f.order_id <> o.id
      LIMIT 300) z)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION public.piano_cantiere_dati(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.piano_cantiere_dati(uuid) TO authenticated, service_role;

-- Quanta manodopera c'è di solito in lavori simili, secondo il prezzario: mediana e quartili di
-- 30 voci simili, della regione se la si conosce. È una stima e chi la mostra lo dice.
CREATE OR REPLACE FUNCTION public.piano_cantiere_incidenze(p_company_id uuid, p_testi text[], p_regione text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public._piano_cantiere_controlla(p_company_id);
  IF COALESCE(array_length(p_testi, 1), 0) > 10 THEN
    RAISE EXCEPTION 'Massimo 10 testi per volta';
  END IF;

  WITH q AS (
    SELECT t AS testo, (
      SELECT string_agg(w, ' | ') FROM (
        SELECT DISTINCT w FROM regexp_split_to_table(lower(regexp_replace(t, '[^[:alpha:] ]', ' ', 'g')), ' +') w
        WHERE length(w) > 4 LIMIT 6) parole
    ) AS parole
    FROM unnest(p_testi) t
  ),
  fonti AS (
    SELECT DISTINCT ON (f.regione) f.id FROM public.prezzario_fonte f
    WHERE p_regione IS NULL OR f.regione = p_regione
    ORDER BY f.regione, f.anno DESC NULLS LAST
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('testo', q.testo, 'frazione', r.mediana, 'min', r.p25, 'max', r.p75, 'campioni', r.n)), '[]'::jsonb) INTO v_result
  FROM q
  CROSS JOIN LATERAL (
    SELECT COUNT(*) AS n,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY s.i) AS mediana,
      percentile_cont(0.25) WITHIN GROUP (ORDER BY s.i) AS p25,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY s.i) AS p75
    FROM (
      SELECT v.incidenza_manodopera_pct AS i
      FROM public.prezzario_voce v
      WHERE v.fonte_id IN (SELECT id FROM fonti)
        AND v.search @@ to_tsquery('italian', q.parole)
        AND v.incidenza_manodopera_pct > 0
      ORDER BY ts_rank(v.search, to_tsquery('italian', q.parole)) DESC
      LIMIT 30
    ) s
  ) r
  WHERE q.parole IS NOT NULL AND r.n >= 5;

  RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION public.piano_cantiere_incidenze(uuid, text[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.piano_cantiere_incidenze(uuid, text[], text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.piano_cantiere_salva_resa(p_company_id uuid, p_chiave text, p_descrizione text, p_ore_per_unita numeric, p_unita text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public._piano_cantiere_controlla(p_company_id, true);
  IF p_ore_per_unita IS NULL OR p_ore_per_unita <= 0 THEN
    DELETE FROM public.rese_azienda WHERE company_id = p_company_id AND chiave_lavorazione = p_chiave;
    RETURN;
  END IF;
  INSERT INTO public.rese_azienda (company_id, chiave_lavorazione, descrizione, ore_per_unita, unita, aggiornata_da)
  VALUES (p_company_id, left(p_chiave, 120), left(p_descrizione, 300), p_ore_per_unita, p_unita, auth.uid())
  ON CONFLICT (company_id, chiave_lavorazione) DO UPDATE
    SET descrizione = EXCLUDED.descrizione, ore_per_unita = EXCLUDED.ore_per_unita, unita = EXCLUDED.unita,
        aggiornata_da = EXCLUDED.aggiornata_da, aggiornata_il = now();
END;
$function$;
REVOKE ALL ON FUNCTION public.piano_cantiere_salva_resa(uuid, text, text, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.piano_cantiere_salva_resa(uuid, text, text, numeric, text) TO authenticated, service_role;

-- Le commesse aperte con le fasi e l'ultimo rapportino: da qui la previsione di fine.
CREATE OR REPLACE FUNCTION public.piano_cantiere_avanzamenti(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public._piano_cantiere_controlla(p_company_id);
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', x.id, 'codice', x.order_code, 'descrizione', left(x.description, 120), 'fine', COALESCE(x.work_end_date, x.expected_date),
    'indirizzo', COALESCE(x.work_address, x.indirizzo_lavori),
    'ultimo_rapportino', (SELECT MAX(r.data_lavoro) FROM public.campo_rapportini r WHERE r.order_id = x.id AND r.stato IN ('inviato', 'approvato')),
    'fasi', (SELECT COALESCE(jsonb_agg(jsonb_build_object('nome', f.name, 'dal', f.start_date, 'al', f.end_date, 'status', f.status, 'percentuale', f.percentuale) ORDER BY f.position), '[]'::jsonb)
             FROM public.order_work_phases f WHERE f.order_id = x.id)
  )), '[]'::jsonb) INTO v_result
  FROM (
    SELECT o.* FROM public.orders o
    WHERE o.company_id = p_company_id AND o.deleted_at IS NULL
      AND o.status NOT IN ('completato', 'completata', 'annullato', 'annullata', 'chiuso', 'chiusa')
      AND EXISTS (SELECT 1 FROM public.order_work_phases f WHERE f.order_id = o.id AND f.status IS DISTINCT FROM 'completata')
    ORDER BY COALESCE(o.work_end_date, o.expected_date) DESC NULLS LAST
    LIMIT 300
  ) x;
  RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION public.piano_cantiere_avanzamenti(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.piano_cantiere_avanzamenti(uuid) TO authenticated, service_role;
