-- get_my_company_id() era `SELECT company_id FROM profiles WHERE id = auth.uid()`:
-- NON onorava l'impersonation ("Visualizza come" del super-admin). È referenziata da
-- ~457 policy RLS (242 tabelle) + ~62 funzioni RPC company-scoped (cg_*, wh_*, sr_*,
-- silvio_*, *_company_allowed, ...) + 1 vista → TUTTE, sotto impersonation, operavano
-- sull'azienda del PROFILO del super-admin (NULL) invece che su quella impersonata,
-- bloccando SELECT/INSERT/UPDATE/DELETE e svuotando le RPC.
--
-- Fix: la rendo un alias di get_effective_company_id() (= COALESCE(
-- active_impersonations.target_company_id se attiva, profiles.company_id)). Effetti:
--  • Utenti normali: risultato IDENTICO (nessuna impersonation → fallback profiles.company_id).
--  • Super-admin sotto "Visualizza come": risolve l'azienda impersonata (comportamento atteso).
-- Un'unica CREATE OR REPLACE allinea in colpo solo tutte le 457 policy + 62 funzioni,
-- senza riscrivere DDL di policy (rischio refusi). Coerente con articoli_native (migration
-- 20271111000010, già su get_effective_company_id) e con le 72 policy che la usano già.
-- Reversibile: ripristinare il corpo `SELECT company_id FROM profiles WHERE id = auth.uid()`.
CREATE OR REPLACE FUNCTION public.get_my_company_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.get_effective_company_id()
$function$;
