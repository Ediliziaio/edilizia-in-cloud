-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- get_platform_consumption_summary — riepilogo consumo tool a costo (piattaforma)
-- Aggrega il credito CONSUMATO (direction='out') per tipo di tool dalla view
-- credit_transactions_unified (AI / Email / WhatsApp / Render), dal timestamp
-- p_since. Alimenta il widget "Consumo tool a costo" della dashboard super admin.
-- Sicurezza: SECURITY DEFINER (view cross-tenant) + guardia esplicita super_admin.
CREATE OR REPLACE FUNCTION public.get_platform_consumption_summary(p_since timestamptz)
RETURNS TABLE (credit_type text, total_eur numeric, tx_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden: super_admin only';
  END IF;

  RETURN QUERY
    SELECT u.credit_type,
           COALESCE(sum(u.amount), 0)::numeric AS total_eur,
           count(*)::bigint                    AS tx_count
    FROM public.credit_transactions_unified u
    WHERE u.direction = 'out'
      AND u.created_at >= p_since
    GROUP BY u.credit_type;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_platform_consumption_summary(timestamptz) TO authenticated;
