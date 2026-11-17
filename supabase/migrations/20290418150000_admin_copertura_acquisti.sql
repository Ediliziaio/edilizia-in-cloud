-- Ondata 1 del piano acquisti e magazzino (docs/piano-acquisti-magazzino-potente.md): la
-- metrica che dice se l'ondata funziona. Per ogni azienda, sulle fatture passive degli
-- ultimi p_giorni (per data fattura): quanto imponibile è diventato costo, quanto di quel
-- costo ha una destinazione (commesse o magazzino) e quante fatture sono ferme da più di
-- 30 giorni senza essere registrate.
--
-- Le regole sono quelle del controllo di gestione (quotaNonRipartita in
-- src/lib/controlloGestione/strutturaCommessa.ts): un costo con order_id va tutto alla
-- commessa; senza, conta la somma delle percentuali di allocations; quota_magazzino è
-- giacenza; il resto è spesa generale. Escluse le note di credito e lo storico esterno;
-- un costo annullato conta come non registrato. «Arrivata» è la ricezione SDI, o il
-- caricamento se manca.
--
-- Solo super admin o service role: espone i numeri di tutte le aziende.
CREATE OR REPLACE FUNCTION public.admin_copertura_acquisti(p_giorni integer DEFAULT 90)
RETURNS TABLE (
  company_id uuid,
  azienda text,
  fatture integer,
  imponibile numeric,
  imponibile_registrato numeric,
  su_commesse numeric,
  a_magazzino numeric,
  spese_generali numeric,
  non_registrato numeric,
  pct_registrato numeric,
  pct_con_destinazione numeric,
  ferme_oltre_30_giorni integer,
  imponibile_fermo numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_giorni integer := greatest(1, least(coalesce(p_giorni, 90), 730));
BEGIN
  IF NOT (public.is_super_admin(auth.uid()) OR coalesce(auth.jwt() ->> 'role', '') = 'service_role') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH f AS (
    SELECT fr.company_id,
           coalesce(fr.data_ricezione_sdi::date, fr.created_at::date) AS arrivata,
           abs(coalesce(fr.imponibile_totale, fr.totale_documento - fr.iva_totale, 0)) AS imp,
           c.id AS cid, coalesce(c.amount, 0) AS amount, c.order_id, c.allocations,
           greatest(coalesce(c.quota_magazzino, 0), 0) AS qm
      FROM public.fatture_ricevute fr
      LEFT JOIN public.company_costs c
        ON c.id = fr.company_cost_id AND c.annullato_il IS NULL
     WHERE NOT coalesce(fr.storico_esterno, false)
       AND coalesce(fr.tipo_documento, '') NOT IN ('TD04', 'TD08', 'passive_credit_note')
       AND fr.data_fattura >= current_date - v_giorni
  ), d AS (
    SELECT f.*,
           CASE
             WHEN f.cid IS NULL THEN 0
             WHEN f.order_id IS NOT NULL THEN f.amount
             WHEN jsonb_typeof(f.allocations) = 'array' THEN
               f.amount * least(100, (
                 SELECT coalesce(sum(greatest(
                          CASE WHEN (a ->> 'pct') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN (a ->> 'pct')::numeric ELSE 0 END, 0)), 0)
                   FROM jsonb_array_elements(f.allocations) a)) / 100
             ELSE 0
           END AS commesse
      FROM f
  ), r AS (
    SELECT d.company_id,
           count(*)::integer AS n,
           sum(d.imp) AS imp,
           sum(d.imp) FILTER (WHERE d.cid IS NOT NULL) AS reg,
           sum(least(d.commesse, d.imp)) FILTER (WHERE d.cid IS NOT NULL) AS comm,
           sum(least(d.qm, greatest(d.imp - least(d.commesse, d.imp), 0))) FILTER (WHERE d.cid IS NOT NULL) AS mag,
           count(*) FILTER (WHERE d.cid IS NULL AND d.arrivata < current_date - 30)::integer AS ferme,
           sum(d.imp) FILTER (WHERE d.cid IS NULL AND d.arrivata < current_date - 30) AS imp_fermo
      FROM d
     GROUP BY d.company_id
  )
  SELECT r.company_id, co.name::text, r.n,
         round(r.imp, 2),
         round(coalesce(r.reg, 0), 2),
         round(coalesce(r.comm, 0), 2),
         round(coalesce(r.mag, 0), 2),
         round(greatest(coalesce(r.reg, 0) - coalesce(r.comm, 0) - coalesce(r.mag, 0), 0), 2),
         round(r.imp - coalesce(r.reg, 0), 2),
         round(100 * coalesce(r.reg, 0) / nullif(r.imp, 0), 1),
         round(100 * (coalesce(r.comm, 0) + coalesce(r.mag, 0)) / nullif(r.imp, 0), 1),
         r.ferme,
         round(coalesce(r.imp_fermo, 0), 2)
    FROM r
    JOIN public.companies co ON co.id = r.company_id
   ORDER BY r.imp DESC;
END $$;

REVOKE ALL ON FUNCTION public.admin_copertura_acquisti(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_copertura_acquisti(integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_copertura_acquisti(integer) IS
  'Metrica dell''ondata 1 (piano acquisti): per azienda, imponibile passivo registrato, con destinazione (commesse/magazzino) e fermo da oltre 30 giorni. Solo super admin o service role.';
