-- Storno: la nota di credito annulla TUTTE le scadenze della fattura.
--
-- 20281023174500 chiudeva le scadenze aperte della coppia, ma lasciava quelle
-- segnate «pagata» da una persona (es. su Dimora Torino cinque fatture e cinque
-- note erano state marcate «pagata» con bonifico il 21/10): un incasso e un
-- rimborso che non sono mai avvenuti, perché la nota di credito storna la
-- fattura. La regola giusta è semplice: se una fattura è stornata da una nota
-- di credito, la fattura NON è né da incassare né incassata — tutte le sue
-- scadenze (e quelle della nota) vanno annullate.
--
-- Vale solo per le fatture che lo storno chiude (paid_amount a zero sulla
-- fattura): una fattura con un incasso vero già registrato non viene stornata
-- al punto 2, quindi non arriva qui. L'incasso vero resta.
--
-- paid_amount della fattura resta com'era (0): lo stato «credited» la toglie
-- dal da incassare senza inventare un incasso.

CREATE OR REPLACE FUNCTION public.applica_note_di_credito(p_company_id uuid)
RETURNS TABLE(collegate integer, fatture_stornate integer, scadenze_chiuse integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET lock_timeout TO '3s'
SET statement_timeout TO '30s'
AS $$
#variable_conflict use_column
DECLARE
  v_collegate integer := 0;
  v_stornate integer := 0;
  v_scadenze integer := 0;
BEGIN
  -- 1. Collegamento per riferimento: stesso numero, stessa data se c'è,
  --    stesso cliente se entrambi i documenti lo identificano. Solo se il
  --    candidato è uno.
  WITH candidati AS (
    SELECT nc.id AS nc_id, f.id AS fattura_id,
           count(*) OVER (PARTITION BY nc.id) AS n
      FROM public.invoices nc
      JOIN public.invoices f
        ON f.company_id = nc.company_id
       AND f.id <> nc.id
       AND f.deleted_at IS NULL
       AND coalesce(f.document_type, 'invoice') IN ('invoice', 'fattura', 'fattura_accompagnatoria', 'parcella')
       AND btrim(f.invoice_number) = btrim(nc.rif_fattura_numero)
       AND (nc.rif_fattura_data IS NULL OR f.issue_date = nc.rif_fattura_data)
       AND f.issue_date <= nc.issue_date
       AND (
         public.nc_identificativo_cliente(nc.client_vat_number, nc.client_fiscal_code) IS NULL
         OR public.nc_identificativo_cliente(f.client_vat_number, f.client_fiscal_code) IS NULL
         OR public.nc_identificativo_cliente(f.client_vat_number, f.client_fiscal_code)
            = public.nc_identificativo_cliente(nc.client_vat_number, nc.client_fiscal_code)
         OR upper(btrim(f.client_fiscal_code)) = upper(btrim(nc.client_fiscal_code))
       )
     WHERE nc.company_id = p_company_id
       AND nc.document_type IN ('credit_note', 'nota_credito')
       AND nc.deleted_at IS NULL
       AND nc.credited_invoice_id IS NULL
       AND nullif(btrim(nc.rif_fattura_numero), '') IS NOT NULL
  )
  UPDATE public.invoices nc
     SET credited_invoice_id = c.fattura_id
    FROM candidati c
   WHERE nc.id = c.nc_id AND c.n = 1;
  GET DIAGNOSTICS v_collegate = ROW_COUNT;

  -- 2. Fatture non incassate coperte per intero dalle loro note.
  CREATE TEMP TABLE IF NOT EXISTS _nc_storni (fattura_id uuid, nc_ids uuid[]) ON COMMIT DROP;
  TRUNCATE _nc_storni;
  INSERT INTO _nc_storni
  SELECT f.id, array_agg(nc.id)
    FROM public.invoices f
    JOIN public.invoices nc
      ON nc.credited_invoice_id = f.id
     AND nc.document_type IN ('credit_note', 'nota_credito')
     AND nc.deleted_at IS NULL
   WHERE f.company_id = p_company_id
     AND f.deleted_at IS NULL
     AND coalesce(f.status, '') NOT IN ('paid', 'cancelled', 'draft')
     AND coalesce(f.paid_amount, 0) <= 0.01
     AND coalesce(f.total, 0) > 0
   GROUP BY f.id, f.total
  HAVING sum(coalesce(nc.total, 0)) >= coalesce(f.total, 0) - 0.01;

  UPDATE public.invoices f
     SET status = 'credited', updated_at = now()
    FROM _nc_storni s
   WHERE f.id = s.fattura_id AND f.status IS DISTINCT FROM 'credited';
  GET DIAGNOSTICS v_stornate = ROW_COUNT;

  -- La nota che compensa una fattura mai incassata non è un rimborso da fare.
  UPDATE public.invoices nc
     SET status = 'credited', updated_at = now()
    FROM _nc_storni s
   WHERE nc.id = ANY (s.nc_ids) AND nc.status IS DISTINCT FROM 'credited';

  -- 3. Tutte le scadenze della coppia vanno annullate: la fattura è stornata,
  --    quindi non è né da incassare né incassata; la nota non è un rimborso da
  --    fare. Si annulla anche la «pagata» segnata a mano, perché quell'incasso
  --    (o rimborso) non è avvenuto. Chi ha un incasso vero sulla fattura non
  --    viene stornato al punto 2, quindi non passa di qui.
  UPDATE public.scadenze sc
     SET status = 'annullata',
         notes = concat_ws(E'\n', nullif(sc.notes, ''), 'Chiusa: fattura stornata con nota di credito.'),
         updated_at = now()
    FROM _nc_storni s
   WHERE (sc.invoice_id = s.fattura_id OR sc.invoice_id = ANY (s.nc_ids))
     AND sc.status NOT IN ('annullata', 'cancelled');
  GET DIAGNOSTICS v_scadenze = ROW_COUNT;

  RETURN QUERY SELECT v_collegate, v_stornate, v_scadenze;
END;
$$;

REVOKE ALL ON FUNCTION public.applica_note_di_credito(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.applica_note_di_credito(uuid) TO service_role;
