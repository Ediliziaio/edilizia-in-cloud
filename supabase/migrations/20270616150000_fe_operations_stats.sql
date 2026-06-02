-- Aggregazione per la dashboard super_admin "Fatturazione Elettronica / FE Operations".
-- Ritorna, per ogni azienda che USA la FE (ha config cedente OPPURE ha inviato/ricevuto
-- almeno una fattura): stato onboarding, delega, volumi inviate/ricevute (totali + mese),
-- e gli invii openapi reali (da sdi_provider_responses) usati per stimare i costi.
--
-- SICUREZZA: SECURITY DEFINER ma eseguibile SOLO da service_role (l'edge function
-- fe-operations, che a sua volta verifica super_admin via JWT+allowlist). REVOKE da
-- anon/authenticated impedisce chiamate dirette via PostgREST da utenti normali.
CREATE OR REPLACE FUNCTION public.fe_operations_stats()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
WITH inv AS (
  SELECT company_id,
    count(*) FILTER (WHERE sdi_id_trasmissione IS NOT NULL OR sdi_stato IS NOT NULL) AS sent_total,
    count(*) FILTER (WHERE (sdi_id_trasmissione IS NOT NULL OR sdi_stato IS NOT NULL)
                     AND coalesce(data_emissione, created_at::date) >= date_trunc('month', now())::date) AS sent_month,
    max(coalesce(sdi_data_consegna, created_at)) AS last_sent
  FROM public.documenti_fiscali
  WHERE deleted_at IS NULL
    AND tipo IN ('fattura','fattura_pa','nota_credito','nota_debito','autofattura','fattura_riepilogativa')
  GROUP BY company_id
),
oa AS (
  SELECT company_id,
    count(*) FILTER (WHERE status_code BETWEEN 200 AND 299) AS oa_sent_total,
    count(*) FILTER (WHERE status_code BETWEEN 200 AND 299
                     AND created_at >= date_trunc('month', now())) AS oa_sent_month,
    max(created_at) AS last_oa
  FROM public.sdi_provider_responses
  WHERE provider = 'openapi' AND endpoint ILIKE '%invoice%'
  GROUP BY company_id
),
rec AS (
  SELECT company_id,
    count(*) AS rec_total,
    count(*) FILTER (WHERE created_at >= date_trunc('month', now())) AS rec_month,
    max(created_at) AS last_rec
  FROM public.fatture_ricevute
  GROUP BY company_id
),
ids AS (
  SELECT company_id FROM public.sdi_cedente_config WHERE company_id IS NOT NULL
  UNION SELECT company_id FROM inv
  UNION SELECT company_id FROM rec
),
rows AS (
  SELECT
    i.company_id,
    coalesce(aa.ragione_sociale, c.business_name, c.name, '—') AS name,
    coalesce(scc.fiscal_id, aa.partita_iva, c.vat_number) AS fiscal_id,
    coalesce(scc.provider, aa.sdi_provider) AS provider,
    coalesce(scc.stato, 'non_attivo') AS stato,
    coalesce(scc.delega_stato, 'none') AS delega_stato,
    scc.last_error,
    scc.registered_at,
    coalesce(inv.sent_total, 0) AS sent_total,
    coalesce(inv.sent_month, 0) AS sent_month,
    coalesce(oa.oa_sent_total, 0) AS oa_sent_total,
    coalesce(oa.oa_sent_month, 0) AS oa_sent_month,
    coalesce(rec.rec_total, 0) AS rec_total,
    coalesce(rec.rec_month, 0) AS rec_month,
    greatest(inv.last_sent, oa.last_oa, rec.last_rec) AS last_activity
  FROM ids i
  LEFT JOIN public.sdi_cedente_config scc ON scc.company_id = i.company_id
  LEFT JOIN public.companies c ON c.id = i.company_id
  LEFT JOIN public.anagrafica_azienda aa ON aa.company_id = i.company_id
  LEFT JOIN inv ON inv.company_id = i.company_id
  LEFT JOIN oa ON oa.company_id = i.company_id
  LEFT JOIN rec ON rec.company_id = i.company_id
),
agg AS (
  SELECT
    jsonb_agg(to_jsonb(r) ORDER BY r.last_activity DESC NULLS LAST) AS companies,
    count(*) AS n,
    count(*) FILTER (WHERE r.stato = 'attivo' OR r.delega_stato = 'attiva') AS n_attive,
    coalesce(sum(r.sent_total), 0) AS sent_total,
    coalesce(sum(r.sent_month), 0) AS sent_month,
    coalesce(sum(r.oa_sent_total), 0) AS oa_sent_total,
    coalesce(sum(r.oa_sent_month), 0) AS oa_sent_month,
    coalesce(sum(r.rec_total), 0) AS rec_total,
    coalesce(sum(r.rec_month), 0) AS rec_month
  FROM rows r
)
SELECT jsonb_build_object(
  'companies', coalesce(companies, '[]'::jsonb),
  'totals', jsonb_build_object(
    'companies', n,
    'companies_attive', n_attive,
    'sent_total', sent_total,
    'sent_month', sent_month,
    'oa_sent_total', oa_sent_total,
    'oa_sent_month', oa_sent_month,
    'rec_total', rec_total,
    'rec_month', rec_month
  )
) FROM agg;
$$;

REVOKE ALL ON FUNCTION public.fe_operations_stats() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fe_operations_stats() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fe_operations_stats() TO service_role;

COMMENT ON FUNCTION public.fe_operations_stats() IS
  'FE Operations: aggregati per-azienda (volumi invio/ricezione + invii openapi) per la dashboard super_admin. Solo service_role.';
