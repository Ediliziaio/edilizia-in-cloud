-- ─────────────────────────────────────────────────────────────────────────────
-- get_company_user_counts_v2 — separa staff vs clienti
-- ─────────────────────────────────────────────────────────────────────────────
--
-- La v1 in 20260224100344 contava TUTTI i profiles con company_id (staff +
-- clienti finali insieme). Risultato in admin/aziende: Demo Azienda 382
-- "utenti" senza poter distinguere staff vs portale clienti.
--
-- v2 ritorna 3 conteggi distinti:
--   staff_count    = ruoli di lavoro (company_admin/staff/employee/...)
--   customer_count = ruolo "customer" (portale clienti azienda)
--   total_count    = somma per backward compat con UI esistente
--
-- v1 resta intatta per chiamate legacy (es. export CSV). Nessun breaking change.
-- Idempotente (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public.get_company_user_counts_v2()
RETURNS TABLE(
  company_id uuid,
  staff_count bigint,
  customer_count bigint,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT
    p.company_id,
    COUNT(*) FILTER (
      WHERE ur.role IN (
        'company_admin', 'company_staff', 'employee', 'subcontractor',
        'salesperson', 'call_center', 'referrer'
      )
    )::bigint AS staff_count,
    COUNT(*) FILTER (WHERE ur.role = 'customer')::bigint AS customer_count,
    COUNT(*)::bigint AS total_count
  FROM public.profiles p
  LEFT JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE p.company_id IS NOT NULL
  GROUP BY p.company_id;
$$;

COMMENT ON FUNCTION public.get_company_user_counts_v2() IS
  'Conteggio utenti per company, distinguendo staff aziendale (admin/dipendenti/operai/ecc) da clienti del portale. Sostituisce visivamente get_company_user_counts che resta per export legacy.';
