-- F4-01 (completamento) — Sparisce il troncamento silenzioso a 5.000 aziende.
--
-- PROBLEMA
-- La lista aziende ordina per MRR, utenti, clienti, ordini o ultimo accesso
-- scaricando fino a 5.000 righe e ordinando lato client (`isClientSort` +
-- `query.limit(5000)` in CompaniesList.tsx). Oltre quella soglia la classifica
-- è semplicemente sbagliata e NULLA lo segnala: il SuperAdmin legge una "top"
-- che top non è. È il difetto di scala più insidioso perché non rallenta —
-- mente.
--
-- SOLUZIONE
-- Una funzione che ordina e pagina sul database, restituendo gli id della sola
-- pagina richiesta. Il frontend continua a caricare le righe complete con la
-- query che già usa, ma su un insieme di 50 id invece che su 5.000 righe.
--
-- Le colonne calcolate arrivano da mv_company_metrics (aggiornata ogni 15
-- minuti); nome, stato, settore e scadenza trial restano sulla tabella viva,
-- così i filtri anagrafici sono sempre esatti.

CREATE OR REPLACE FUNCTION public.admin_order_companies(
  p_sort       text    DEFAULT 'created_at',
  p_desc       boolean DEFAULT true,
  p_search     text    DEFAULT NULL,
  p_status     text    DEFAULT NULL,
  p_plan_id    uuid    DEFAULT NULL,
  p_allowed_ids uuid[] DEFAULT NULL,
  p_limit      integer DEFAULT 50,
  p_offset     integer DEFAULT 0
)
RETURNS TABLE (company_id uuid, posizione bigint, totale bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) AND NOT public.is_platform_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Accesso riservato allo staff di piattaforma' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH filtrato AS (
    SELECT c.id,
           c.name, c.status, c.sector, c.created_at, c.trial_ends_at,
           COALESCE(m.mrr_incassato, 0)  AS mrr_incassato,
           COALESCE(m.mrr_listino, 0)    AS mrr_listino,
           COALESCE(m.utenti_staff, 0)   AS utenti,
           COALESCE(m.clienti, 0)        AS clienti,
           COALESCE(m.ordini, 0)         AS ordini,
           m.ultimo_accesso,
           sp.name                        AS piano
      FROM public.companies c
      LEFT JOIN public.mv_company_metrics m ON m.company_id = c.id
      LEFT JOIN public.subscription_plans sp ON sp.id = c.subscription_plan_id
     WHERE COALESCE(c.is_platform_admin_company, false) = false
       AND c.deleted_at IS NULL
       AND (p_status IS NULL  OR c.status = p_status)
       AND (p_plan_id IS NULL OR c.subscription_plan_id = p_plan_id)
       AND (p_allowed_ids IS NULL OR c.id = ANY (p_allowed_ids))
       AND (p_search IS NULL OR p_search = '' OR
            c.name ILIKE '%' || p_search || '%' OR
            COALESCE(c.email, '') ILIKE '%' || p_search || '%' OR
            COALESCE(c.vat_number, '') ILIKE '%' || p_search || '%')
  ), ordinato AS (
    SELECT f.id,
           row_number() OVER (
             ORDER BY
               -- Ogni chiave ha due rami, ascendente e discendente: senza di
               -- essi ORDER BY con parametro booleano non usa gli indici.
               CASE WHEN p_desc THEN
                 CASE p_sort
                   WHEN 'mrr'        THEN f.mrr_incassato
                   WHEN 'mrrListino' THEN f.mrr_listino
                   WHEN 'users'      THEN f.utenti::numeric
                   WHEN 'customers'  THEN f.clienti::numeric
                   WHEN 'orders'     THEN f.ordini::numeric
                 END
               END DESC NULLS LAST,
               CASE WHEN NOT p_desc THEN
                 CASE p_sort
                   WHEN 'mrr'        THEN f.mrr_incassato
                   WHEN 'mrrListino' THEN f.mrr_listino
                   WHEN 'users'      THEN f.utenti::numeric
                   WHEN 'customers'  THEN f.clienti::numeric
                   WHEN 'orders'     THEN f.ordini::numeric
                 END
               END ASC NULLS LAST,
               CASE WHEN p_desc AND p_sort = 'lastAccess' THEN f.ultimo_accesso END DESC NULLS LAST,
               CASE WHEN NOT p_desc AND p_sort = 'lastAccess' THEN f.ultimo_accesso END ASC NULLS LAST,
               CASE WHEN p_desc AND p_sort = 'plan' THEN f.piano END DESC NULLS LAST,
               CASE WHEN NOT p_desc AND p_sort = 'plan' THEN f.piano END ASC NULLS LAST,
               CASE WHEN p_desc AND p_sort = 'name' THEN f.name END DESC,
               CASE WHEN NOT p_desc AND p_sort = 'name' THEN f.name END ASC,
               CASE WHEN p_desc AND p_sort = 'trial' THEN f.trial_ends_at END DESC NULLS LAST,
               CASE WHEN NOT p_desc AND p_sort = 'trial' THEN f.trial_ends_at END ASC NULLS LAST,
               -- Ripiego stabile: senza un criterio finale deterministico la
               -- paginazione può ripetere o saltare righe fra una pagina e l'altra.
               f.created_at DESC, f.id
           ) AS rn
      FROM filtrato f
  ), conteggio AS (SELECT count(*) AS n FROM filtrato)
  SELECT o.id, o.rn, c.n
  FROM ordinato o CROSS JOIN conteggio c
  WHERE o.rn > GREATEST(0, p_offset)
    AND o.rn <= GREATEST(0, p_offset) + GREATEST(1, LEAST(p_limit, 200))
  ORDER BY o.rn;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_order_companies(text, boolean, text, text, uuid, uuid[], integer, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_order_companies(text, boolean, text, text, uuid, uuid[], integer, integer)
  TO authenticated, service_role;
