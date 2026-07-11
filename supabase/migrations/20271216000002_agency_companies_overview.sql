-- ============================================================================
-- Multi-azienda stile GoHighLevel — Blocco 4: overview aggregata agenzia.
-- ----------------------------------------------------------------------------
-- Ritorna, per OGNI azienda a cui l'utente corrente ha accesso (primaria +
-- multi_company_access attive + rivenditori figli se la primaria e' un
-- produttore), una riga di sintesi. Sicuro per costruzione: l'insieme delle
-- aziende deriva SOLO dai grant del chiamante, non da un company_id in input →
-- nessun rischio cross-tenant. Alimenta la "console agenzia" con drill-down.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.agency_companies_overview()
RETURNS TABLE (
  company_id        uuid,
  company_name      text,
  is_primary        boolean,
  access_role       text,
  relation          text,
  open_orders_count bigint,
  month_revenue     numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH me AS (SELECT auth.uid() AS uid),
  primary_c AS (
    SELECT p.company_id FROM public.profiles p WHERE p.id = (SELECT uid FROM me)
  ),
  accessible AS (
    -- azienda primaria
    SELECT pc.company_id AS cid, true AS is_primary, 'company_admin'::text AS role, 'primaria'::text AS relation
    FROM primary_c pc WHERE pc.company_id IS NOT NULL
    UNION
    -- accessi multi-azienda attivi
    SELECT mca.company_id, false, mca.access_role, 'collegata'
    FROM public.multi_company_access mca
    WHERE mca.user_id = (SELECT uid FROM me)
      AND mca.status = 'active'
      AND (mca.expires_at IS NULL OR mca.expires_at > now())
    UNION
    -- rivenditori figli (se la primaria e' un produttore)
    SELECT c.id, false, 'company_admin', 'rivenditore'
    FROM public.companies c
    WHERE c.parent_company_id = (SELECT company_id FROM primary_c)
  ),
  dedup AS (
    SELECT DISTINCT ON (cid) cid, is_primary, role, relation
    FROM accessible WHERE cid IS NOT NULL
    ORDER BY cid, is_primary DESC
  )
  SELECT
    d.cid,
    co.name,
    d.is_primary,
    d.role,
    d.relation,
    (SELECT count(*) FROM public.orders o
       WHERE o.company_id = d.cid AND o.status <> 'completato'),
    (SELECT COALESCE(sum(i.subtotal), 0) FROM public.invoices i
       WHERE i.company_id = d.cid AND i.issue_date >= date_trunc('month', current_date))
  FROM dedup d
  JOIN public.companies co ON co.id = d.cid
  ORDER BY d.is_primary DESC, co.name;
$function$;

GRANT EXECUTE ON FUNCTION public.agency_companies_overview() TO authenticated;
