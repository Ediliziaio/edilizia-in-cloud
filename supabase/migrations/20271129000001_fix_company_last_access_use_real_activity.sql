-- Fix "Ultimo accesso" azienda (lista /admin/aziende).
--
-- Bug: get_company_last_access() usava solo auth.users.last_sign_in_at, che in
-- Supabase si aggiorna SOLO al login esplicito (credenziali/OAuth) e NON quando
-- l'utente riapre l'app con una sessione già attiva. Risultato: aziende con
-- attività quotidiana mostravano date stale (es. Suntech "29gg fa" pur avendo un
-- accesso oggi). Inoltre attribuiva l'accesso solo via profiles.company_id
-- (azienda primaria), ignorando gli accessi ad aziende secondarie (multi-azienda).
--
-- Fix: usa l'attività reale da public.user_sessions.last_active_at, attribuita
-- all'azienda della sessione (user_sessions.company_id → corretto anche per utenti
-- multi-azienda), combinata col MAX del fallback last_sign_in_at (via
-- profiles.company_id) così nessuna azienda regredisce e chi non ha sessioni
-- tracciate mostra comunque l'ultimo login esplicito.
--
-- Firma invariata (company_id, last_access) → nessuna modifica frontend richiesta.
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
