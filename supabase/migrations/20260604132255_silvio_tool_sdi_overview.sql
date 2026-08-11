-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

CREATE OR REPLACE FUNCTION public.silvio_tool_sdi_overview(p_company_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT d.id, d.numero, d.tipo, d.stato, d.sdi_stato, d.sdi_errori,
           d.data_emissione, d.totale_documento,
           COALESCE(
             NULLIF(d.cliente_snapshot->>'ragione_sociale', ''),
             NULLIF(d.cliente_snapshot->>'name', ''),
             NULLIF(trim(concat_ws(' ', d.cliente_snapshot->>'nome', d.cliente_snapshot->>'cognome')), '')
           ) AS cliente
      FROM public.documenti_fiscali d
     WHERE d.company_id = p_company_id
       AND d.tipo IN ('fattura', 'nota_credito')
       AND COALESCE(d.stato, '') <> 'annullata'
  )
  SELECT jsonb_build_object(
    'legenda', 'sdi_stato: NS=scartata, RC=consegnata, MC=mancata_consegna(PEC), AT=trasmessa/in attesa, non_inviata=da trasmettere',
    'per_stato_sdi', COALESCE((
      SELECT jsonb_agg(s) FROM (
        SELECT COALESCE(sdi_stato, 'non_inviata') AS sdi_stato,
               count(*) AS n,
               round(COALESCE(sum(totale_documento), 0)::numeric, 2) AS totale_eur
          FROM base GROUP BY 1 ORDER BY n DESC
      ) s
    ), '[]'::jsonb),
    'scartate', COALESCE((
      SELECT jsonb_agg(x) FROM (
        SELECT id, numero, tipo, cliente, data_emissione, totale_documento, sdi_errori
          FROM base WHERE sdi_stato = 'NS'
         ORDER BY data_emissione DESC LIMIT 15
      ) x
    ), '[]'::jsonb),
    'da_inviare', (SELECT count(*) FROM base WHERE sdi_stato IS NULL AND COALESCE(stato, '') NOT IN ('bozza', '')),
    'note_credito_recenti', COALESCE((
      SELECT jsonb_agg(x) FROM (
        SELECT id, numero, cliente, data_emissione, totale_documento, COALESCE(sdi_stato, 'non_inviata') AS sdi_stato
          FROM base WHERE tipo = 'nota_credito'
         ORDER BY data_emissione DESC LIMIT 10
      ) x
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.silvio_tool_sdi_overview(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.silvio_tool_sdi_overview(uuid) TO authenticated, service_role;
