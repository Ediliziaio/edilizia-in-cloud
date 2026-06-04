-- Gap #1 (Manutenzione/Assistenza): RPC read-only per Silvio.
-- Panoramica: ticket aperti, contratti manutenzione in scadenza, garanzie impianti
-- in scadenza. SECURITY DEFINER + scope esplicito company_id (tenant-safe).
CREATE OR REPLACE FUNCTION public.silvio_tool_manutenzione_overview(p_company_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'ticket', jsonb_build_object(
      'aperti',          (SELECT count(*) FROM public.tickets t WHERE t.company_id = p_company_id AND t.status <> 'risolto'),
      'in_lavorazione',  (SELECT count(*) FROM public.tickets t WHERE t.company_id = p_company_id AND t.status = 'in_lavorazione'),
      'urgenti',         (SELECT count(*) FROM public.tickets t WHERE t.company_id = p_company_id AND t.status <> 'risolto' AND t.priority = 'urgente'),
      'lista', COALESCE((
        SELECT jsonb_agg(x) FROM (
          SELECT t.id,
                 COALESCE(NULLIF(t.titolo, ''), t.subject)            AS titolo,
                 t.status::text                                       AS stato,
                 COALESCE(NULLIF(t.priorita, ''), t.priority::text)   AS priorita,
                 NULLIF(trim(concat(p.first_name, ' ', p.last_name)), '') AS cliente,
                 t.data_intervento_prevista                          AS data_prevista,
                 t.created_at
            FROM public.tickets t
            LEFT JOIN public.profiles p ON p.id = t.customer_id
           WHERE t.company_id = p_company_id AND t.status <> 'risolto'
           ORDER BY (t.priority = 'urgente') DESC, t.created_at DESC
           LIMIT 15
        ) x
      ), '[]'::jsonb)
    ),
    'contratti_in_scadenza', COALESCE((
      SELECT jsonb_agg(x) FROM (
        SELECT c.id,
               c.nome_contratto AS nome,
               NULLIF(trim(concat(p.first_name, ' ', p.last_name)), '') AS cliente,
               c.data_scadenza,
               c.importo_canone,
               (c.data_scadenza - CURRENT_DATE) AS giorni_alla_scadenza
          FROM public.contratti_manutenzione c
          LEFT JOIN public.profiles p ON p.id = c.customer_id
         WHERE c.company_id = p_company_id
           AND c.data_scadenza IS NOT NULL
           AND c.data_scadenza BETWEEN CURRENT_DATE - 7 AND CURRENT_DATE + 90
           AND COALESCE(lower(c.stato), 'attivo') NOT IN ('cessato', 'annullato', 'disdetto', 'chiuso')
         ORDER BY c.data_scadenza ASC
         LIMIT 15
      ) x
    ), '[]'::jsonb),
    'garanzie_in_scadenza', COALESCE((
      SELECT jsonb_agg(x) FROM (
        SELECT i.id,
               NULLIF(trim(concat_ws(' ', i.tipo_impianto, i.marca, i.modello)), '') AS impianto,
               NULLIF(trim(concat(p.first_name, ' ', p.last_name)), '') AS cliente,
               i.garanzia_scadenza,
               (i.garanzia_scadenza - CURRENT_DATE) AS giorni_alla_scadenza
          FROM public.impianti_cliente i
          LEFT JOIN public.profiles p ON p.id = i.customer_id
         WHERE i.company_id = p_company_id
           AND COALESCE(i.attivo, true) = true
           AND i.garanzia_scadenza IS NOT NULL
           AND i.garanzia_scadenza BETWEEN CURRENT_DATE - 7 AND CURRENT_DATE + 90
         ORDER BY i.garanzia_scadenza ASC
         LIMIT 15
      ) x
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.silvio_tool_manutenzione_overview(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.silvio_tool_manutenzione_overview(uuid) TO authenticated, service_role;
