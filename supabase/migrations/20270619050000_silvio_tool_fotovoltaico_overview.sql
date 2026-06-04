-- Gap #2 (Fotovoltaico): RPC read-only per Silvio.
-- Overview progetti FV: totali (potenza, valore, margine medio, firmati),
-- pipeline per stato e progetti recenti. SECURITY DEFINER + scope company_id.
CREATE OR REPLACE FUNCTION public.silvio_tool_fotovoltaico_overview(p_company_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'totali', (
      SELECT jsonb_build_object(
        'progetti_attivi',     count(*),
        'firmati',             count(*) FILTER (WHERE firmato_il IS NOT NULL),
        'potenza_kwp_totale',  round(COALESCE(sum(potenza_kwp), 0)::numeric, 2),
        'valore_totale_eur',   round(COALESCE(sum(prezzo_vendita_iva_inclusa), 0)::numeric, 2),
        'margine_medio_pct',   round(COALESCE(avg(margine_pct) FILTER (WHERE margine_pct IS NOT NULL), 0)::numeric, 1)
      )
      FROM public.fv_progetti
      WHERE company_id = p_company_id AND NOT COALESCE(annullato, false)
    ),
    'per_stato', COALESCE((
      SELECT jsonb_agg(s) FROM (
        SELECT COALESCE(NULLIF(stato, ''), '(senza stato)') AS stato,
               count(*) AS n,
               round(COALESCE(sum(prezzo_vendita_iva_inclusa), 0)::numeric, 2) AS valore_eur,
               round(COALESCE(sum(potenza_kwp), 0)::numeric, 2) AS potenza_kwp
          FROM public.fv_progetti
         WHERE company_id = p_company_id AND NOT COALESCE(annullato, false)
         GROUP BY 1
         ORDER BY n DESC
      ) s
    ), '[]'::jsonb),
    'recenti', COALESCE((
      SELECT jsonb_agg(r) FROM (
        SELECT pr.id, pr.numero, pr.titolo,
               NULLIF(trim(concat(p.first_name, ' ', p.last_name)), '') AS cliente,
               pr.comune,
               pr.potenza_kwp,
               pr.con_accumulo,
               pr.prezzo_vendita_iva_inclusa AS prezzo_eur,
               pr.margine_pct,
               pr.payback_anni,
               pr.stato,
               pr.firmato_il,
               pr.created_at
          FROM public.fv_progetti pr
          LEFT JOIN public.profiles p ON p.id = pr.cliente_id
         WHERE pr.company_id = p_company_id AND NOT COALESCE(pr.annullato, false)
         ORDER BY pr.created_at DESC
         LIMIT 12
      ) r
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.silvio_tool_fotovoltaico_overview(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.silvio_tool_fotovoltaico_overview(uuid) TO authenticated, service_role;
