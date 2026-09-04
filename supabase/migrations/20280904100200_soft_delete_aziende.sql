-- F0-03 — La cancellazione di un'azienda diventa reversibile.
--
-- PRIMA: DELETE diretto su companies, con 702 vincoli ON DELETE CASCADE
-- appesi. Un clic distruggeva definitivamente ordini, preventivi, documenti e
-- fatture del cliente, senza backup e senza ripristino possibile dal prodotto.
-- ORA: l'azienda sparisce dall'operatività ma i dati restano per 30 giorni.
--
-- La vista di dashboard viene ricreata perché deve (a) escludere le aziende
-- cancellate e (b) leggere il MRR da mrr_snapshots invece di sommare i piani
-- assegnati: vedi il commento esteso più sotto.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS deleted_at           timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by           uuid,
  ADD COLUMN IF NOT EXISTS deletion_reason      text,
  ADD COLUMN IF NOT EXISTS status_before_delete text,
  ADD COLUMN IF NOT EXISTS deletion_export_path text;

COMMENT ON COLUMN public.companies.deleted_at IS
  'Cancellazione logica. Finché è valorizzata l''azienda è invisibile ma recuperabile; il purge definitivo avviene dopo 30 giorni.';

CREATE INDEX IF NOT EXISTS idx_companies_deleted_at
  ON public.companies (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_companies_vive
  ON public.companies (status) WHERE deleted_at IS NULL;

-- F1-01 / F1-04 — Una sola fonte di verità per il fatturato in dashboard.
--   mrr_eur                   → incassato reale, da mrr_snapshots (Stripe)
--   mrr_contrattualizzato_eur → piani assegnati, non necessariamente pagati
--   mrr_regalato_eur          → valore concesso gratuitamente
-- Prima erano tutti sommati in un unico numero: 4.360 €/mese dichiarati
-- contro 243 € realmente incassati.
-- Churn: contava le aziende sospese la cui RIGA era stata modificata negli
-- ultimi 30 giorni (un cambio di colore del brand bastava). Ora si basa sui
-- passaggi di stato registrati.
-- Conversione trial: misurava la quota di attive sul totale creato. Ora misura
-- chi, avendo concluso un trial, è diventato cliente.

DROP MATERIALIZED VIEW IF EXISTS public.admin_dashboard_summary;

CREATE MATERIALIZED VIEW public.admin_dashboard_summary AS
WITH company_counts AS (
  SELECT count(*) AS total_companies,
     count(*) FILTER (WHERE status = 'active')    AS active_companies,
     count(*) FILTER (WHERE status = 'trial')     AS trial_companies,
     count(*) FILTER (WHERE status = 'suspended') AS suspended_companies,
     count(*) FILTER (WHERE status = 'expired')   AS expired_companies,
     count(*) FILTER (WHERE created_at >= now() - interval '30 days') AS new_companies_30d,
     count(*) FILTER (WHERE status = 'trial' AND trial_ends_at IS NOT NULL
                        AND trial_ends_at < now())                    AS trial_scaduti_non_gestiti
    FROM public.companies
   WHERE COALESCE(is_platform_admin_company, false) = false
     AND deleted_at IS NULL
), snap AS (
  SELECT mrr_stripe_cents, mrr_interno_cents, mrr_regalato_cents, data
    FROM public.mrr_snapshots ORDER BY data DESC LIMIT 1
), contrattualizzato AS (
  SELECT COALESCE(sum(sp.price_monthly), 0)::numeric AS mrr_contratto
    FROM public.companies c
    JOIN public.subscription_plans sp ON c.subscription_plan_id = sp.id
   WHERE c.status = 'active'
     AND COALESCE(c.is_platform_admin_company, false) = false
     AND c.deleted_at IS NULL
), churn AS (
  SELECT count(DISTINCT company_id) AS churned_companies_30d
    FROM public.company_flag_audit_log
   WHERE field_name = 'status'
     AND new_value::text ILIKE ANY (ARRAY['%suspended%', '%expired%'])
     AND created_at >= now() - interval '30 days'
), trial_conv AS (
  SELECT CASE
           WHEN count(*) FILTER (WHERE trial_ends_at IS NOT NULL AND trial_ends_at < now()) = 0
             THEN NULL::numeric
           ELSE round(100.0 * count(*) FILTER (WHERE trial_ends_at IS NOT NULL
                                                 AND trial_ends_at < now()
                                                 AND status = 'active')
                      / count(*) FILTER (WHERE trial_ends_at IS NOT NULL AND trial_ends_at < now()), 1)
         END AS trial_conversion_rate
    FROM public.companies
   WHERE COALESCE(is_platform_admin_company, false) = false AND deleted_at IS NULL
), support_stats AS (
  SELECT count(*) FILTER (WHERE status <> ALL (ARRAY['resolved', 'closed'])) AS open_support_tickets
    FROM public.support_conversations
), user_count AS (
  SELECT count(*) AS total_users FROM public.user_roles WHERE role = 'customer'::app_role
)
SELECT 1 AS row_id,
   cc.total_companies, cc.active_companies, cc.trial_companies,
   cc.suspended_companies, cc.expired_companies, cc.new_companies_30d,
   cc.trial_scaduti_non_gestiti, ch.churned_companies_30d,
   round(COALESCE(s.mrr_stripe_cents, 0)::numeric / 100, 2)      AS mrr_eur,
   round(COALESCE(s.mrr_stripe_cents, 0)::numeric / 100 * 12, 2) AS arr_eur,
   round(COALESCE(s.mrr_regalato_cents, 0)::numeric / 100, 2)    AS mrr_regalato_eur,
   ct.mrr_contratto                                              AS mrr_contrattualizzato_eur,
   s.data                                                        AS mrr_snapshot_date,
   tc.trial_conversion_rate, ss.open_support_tickets, uc.total_users,
   now() AS calculated_at
  FROM company_counts cc
  CROSS JOIN contrattualizzato ct
  CROSS JOIN churn ch
  CROSS JOIN trial_conv tc
  CROSS JOIN support_stats ss
  CROSS JOIN user_count uc
  LEFT JOIN snap s ON true;

CREATE UNIQUE INDEX idx_admin_dashboard_summary_singleton
  ON public.admin_dashboard_summary USING btree (row_id);

GRANT SELECT ON public.admin_dashboard_summary TO authenticated, service_role;
