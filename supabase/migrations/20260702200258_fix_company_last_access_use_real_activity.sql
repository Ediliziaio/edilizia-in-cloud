-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- "Ultimo accesso" azienda: prima usava solo auth.users.last_sign_in_at, che si
-- aggiorna SOLO al login esplicito (non a sessione già attiva) → mostrava date stale
-- (es. Suntech "29gg fa" pur avendo attività oggi). Ora combina (MAX) l'attività
-- reale da user_sessions.last_active_at (attribuita all'azienda della sessione →
-- corretto anche multi-azienda) col fallback dell'ultimo sign-in esplicito, così è
-- accurata e non regredisce mai.
CREATE OR REPLACE FUNCTION public.get_company_last_access()
 RETURNS TABLE(company_id uuid, last_access timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT company_id, MAX(last_access) AS last_access
  FROM (
    SELECT us.company_id, MAX(us.last_active_at) AS last_access
    FROM public.user_sessions us
    WHERE us.company_id IS NOT NULL
    GROUP BY us.company_id
    UNION ALL
    SELECT p.company_id, MAX(u.last_sign_in_at) AS last_access
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE p.company_id IS NOT NULL
    GROUP BY p.company_id
  ) x
  WHERE company_id IS NOT NULL
  GROUP BY company_id;
$function$;
