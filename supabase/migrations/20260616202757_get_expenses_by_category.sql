-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Ripartizione delle uscite per categoria (ultimi N mesi) per il cruscotto Tesoreria.
CREATE OR REPLACE FUNCTION public.get_expenses_by_category(p_company_id uuid, p_months integer DEFAULT 3)
RETURNS TABLE(category text, total numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(NULLIF(t.category, ''), 'Non categorizzata') AS category,
         SUM(ABS(t.amount)) AS total
  FROM public.bank_transactions t
  WHERE t.company_id = p_company_id
    AND t.transaction_type = 'debit'
    AND t.status = 'booked'
    AND t.booking_date >= date_trunc('month', CURRENT_DATE) - make_interval(months => p_months - 1)
  GROUP BY 1
  ORDER BY 2 DESC;
$function$;

GRANT EXECUTE ON FUNCTION public.get_expenses_by_category(uuid, integer) TO authenticated, service_role;
