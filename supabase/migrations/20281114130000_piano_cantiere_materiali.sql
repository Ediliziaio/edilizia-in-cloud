-- Materiali dalle righe della commessa (2/11/2026): sono la stessa fonte del «costo previsto»
-- mostrato in commessa. Senza, il calcolo diceva che mancavano e dava un margine molto più alto.
SET LOCAL lock_timeout = '3s';

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
        'ditta', (SELECT t.name FROM public.order_external_teams ot JOIN public.external_teams t ON t.id = ot.external_team_id WHERE ot.phase_id = f.id LIMIT 1),
        'costo_registrato', (SELECT SUM(oe.total_cost) FROM public.order_employees oe WHERE oe.order_id = o.id AND oe.phase_id = f.id)
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
        SELECT v.capitolo_nome, v.descrizione, v.unita_misura::text, v.quantita, v.importo, v.costo_manodopera, v.costo_materiali, v.ore_previste, v.opzionale FROM public.rst_computo_voci v JOIN public.rst_progetti p ON p.id = v.progetto_id WHERE p.company_id = o.company_id AND p.deleted_at IS NULL AND (p.ordine_id = o.id OR p.origine_quote_id = o.quote_id)
        UNION ALL SELECT v.capitolo_nome, v.descrizione, v.unita_misura::text, v.quantita, v.importo, v.costo_manodopera, v.costo_materiali, v.ore_previste, v.opzionale FROM public.bgn_computo_voci v JOIN public.bgn_progetti p ON p.id = v.progetto_id WHERE p.company_id = o.company_id AND p.deleted_at IS NULL AND p.origine_quote_id = o.quote_id
        UNION ALL SELECT v.capitolo_nome, v.descrizione, v.unita_misura::text, v.quantita, v.importo, v.costo_manodopera, v.costo_materiali, v.ore_previste, v.opzionale FROM public.clm_computo_voci v JOIN public.clm_progetti p ON p.id = v.progetto_id WHERE p.company_id = o.company_id AND p.deleted_at IS NULL AND p.origine_quote_id = o.quote_id
        UNION ALL SELECT v.capitolo_nome, v.descrizione, v.unita_misura::text, v.quantita, v.importo, v.costo_manodopera, v.costo_materiali, v.ore_previste, v.opzionale FROM public.ele_computo_voci v JOIN public.ele_progetti p ON p.id = v.progetto_id WHERE p.company_id = o.company_id AND p.deleted_at IS NULL AND p.origine_quote_id = o.quote_id
        UNION ALL SELECT v.capitolo_nome, v.descrizione, v.unita_misura::text, v.quantita, v.importo, v.costo_manodopera, v.costo_materiali, v.ore_previste, v.opzionale FROM public.idr_computo_voci v JOIN public.idr_progetti p ON p.id = v.progetto_id WHERE p.company_id = o.company_id AND p.deleted_at IS NULL AND p.origine_quote_id = o.quote_id
        UNION ALL SELECT v.capitolo_nome, v.descrizione, v.unita_misura::text, v.quantita, v.importo, v.costo_manodopera, v.costo_materiali, v.ore_previste, v.opzionale FROM public.pav_computo_voci v JOIN public.pav_progetti p ON p.id = v.progetto_id WHERE p.company_id = o.company_id AND p.deleted_at IS NULL AND p.origine_quote_id = o.quote_id
        UNION ALL SELECT v.capitolo_nome, v.descrizione, v.unita_misura::text, v.quantita, v.importo, v.costo_manodopera, v.costo_materiali, v.ore_previste, v.opzionale FROM public.pis_computo_voci v JOIN public.pis_progetti p ON p.id = v.progetto_id WHERE p.company_id = o.company_id AND p.deleted_at IS NULL AND p.origine_quote_id = o.quote_id
      ) x),
    'righe_preventivo', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'descrizione', i.name, 'unita', i.unit_of_measure, 'quantita', i.quantity, 'importo', i.line_total,
        'costo_materiali', CASE WHEN i.item_type IN ('manodopera', 'labor') THEN NULL ELSE NULLIF(i.prezzo_acquisto, 0) END,
        'costo_manodopera', CASE WHEN i.item_type IN ('manodopera', 'labor') THEN NULLIF(i.prezzo_acquisto, 0) END,
        'opzionale', i.is_optional,
        'incidenza', COALESCE(
          (SELECT t.incidenza_manodopera_pct FROM public.tariffe_aziendali t WHERE t.id = i.tariffa_id),
          (SELECT v.incidenza_manodopera_pct FROM public.prezzario_voce v WHERE i.codice_prezzario IS NOT NULL AND v.codice = i.codice_prezzario AND v.incidenza_manodopera_pct > 0 LIMIT 1))
      ) ORDER BY i.sort_order), '[]'::jsonb) FROM public.quote_items i WHERE i.quote_id = o.quote_id AND i.parent_item_id IS NULL),
    'ditte', (SELECT COALESCE(jsonb_agg(jsonb_build_object('nome', t.name, 'costo', GREATEST(COALESCE(ot.total_cost, 0), COALESCE(ot.cost_preventivo, 0)) / (1 + COALESCE(ot.vat_rate, 0) / 100), 'phase_id', ot.phase_id)), '[]'::jsonb)
      FROM public.order_external_teams ot JOIN public.external_teams t ON t.id = ot.external_team_id WHERE ot.order_id = o.id),
    'economia', (SELECT jsonb_build_object(
        'ricavi', m.preventivo_totale,
        'manodopera', m.costo_manodopera - COALESCE((SELECT SUM(ot.total_cost / (1 + COALESCE(ot.vat_rate, 0) / 100)) FROM public.order_external_teams ot WHERE ot.order_id = o.id), 0),
        'ditte', COALESCE((SELECT SUM(ot.total_cost / (1 + COALESCE(ot.vat_rate, 0) / 100)) FROM public.order_external_teams ot WHERE ot.order_id = o.id), 0),
        'materiali', m.costo_acquisti + m.costo_materiali_magazzino,
        'altri', m.costo_provvigioni + m.costo_rimborsi_km + m.costo_errori + m.costo_diretto
      ) FROM public.v_ordine_marginalita m WHERE m.id = o.id),
    -- Le righe della commessa: la stessa fonte del «costo previsto» mostrato in commessa.
    'materiali_commessa', (SELECT jsonb_build_object(
        'costo', COALESCE(SUM(i.quantity * COALESCE(NULLIF(i.purchase_price, 0), i.standard_cost, 0)), 0),
        'righe', COUNT(*),
        'senza_costo', COUNT(*) FILTER (WHERE COALESCE(NULLIF(i.purchase_price, 0), i.standard_cost, 0) = 0))
      FROM public.order_items i WHERE i.order_id = o.id),
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

