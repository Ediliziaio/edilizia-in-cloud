-- Fatturazione — i difetti che toccano dati di clienti veri (audit 20/09/2026).
--
-- 1. Un incasso registrato in app su una fattura IMPORTATA azzerava quello che
--    il gestionale esterno sapeva: il trigger ricalcolava paid_amount dalla sola
--    somma di invoice_payments (per le importate: zero). Provato in produzione su
--    una fattura Best Infissi da 2.867 € già saldata su FIC: un incasso da 1 €
--    la portava a paid_amount = 1,00. 1.985 fatture erano esposte.
--    Per le fatture importate la verità sta nel gestionale: il trigger non le
--    tocca più, ci pensa l'import (e billing-payment-push aggiorna subito dopo
--    aver scritto su FIC).
--
-- 2. Le righe riscrivevano il totale di testata anche sulle fatture importate:
--    recalculate_invoice_totals faceva UPDATE invoices SET total = somma righe,
--    senza eccezioni. Una fattura importata da 1.000 € con una riga da 800
--    diventava da 800 (provato). Su cassa previdenziale, rivalsa, ritenuta e
--    bollo il totale giusto NON è la somma delle righe, e invoices non ha
--    colonne per quelle voci.
--
-- 3. invoice_lines usava get_user_company_id (solo profiles.company_id) invece
--    di get_my_company_id: il commercialista di Demo vedeva 204 fatture e ZERO
--    righe, il super admin dentro Best 2.208 fatture e ZERO righe.
--
-- 4. can_view_billing — un permesso di sola lettura — dava anche INSERT, UPDATE
--    e DELETE sulle fatture e sulle righe (policy FOR ALL). Ora la scrittura
--    vuole can_manage_payments (che has_permission concede già ad admin e super
--    admin) o il ruolo commercialista.
--
-- 5. Le fatture dei fornitori erano visibili a chiunque fosse nell'azienda: un
--    venditore di Best ne vedeva 6.979 pur non vedendo nessuna fattura di
--    vendita. Ora servono i permessi dell'area: fatturazione, costi, fornitori,
--    prima nota o tesoreria (così restano dentro anche la scheda contabile
--    dell'ordine d'acquisto e l'analisi acquisti).
--
-- 6. La vista fattura_pagamento_stato sommava i movimenti con tipo = 'entrata',
--    valore che il vincolo di movimenti_cassa_native non ammette
--    (incasso|pagamento|storno|rettifica): incassato sempre zero.

SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ── 1. Il pagato delle fatture importate lo decide il gestionale ────────────
CREATE OR REPLACE FUNCTION public.fn_update_invoice_on_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice_id uuid;
  v_total_paid numeric;
  v_invoice_total numeric;
  v_last_payment_date date;
  v_esterna boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_invoice_id := OLD.invoice_id;
  ELSE
    v_invoice_id := NEW.invoice_id;
  END IF;

  SELECT total, external_provider IS NOT NULL
    INTO v_invoice_total, v_esterna
    FROM public.invoices
   WHERE id = v_invoice_id;

  -- Fattura importata: il pagato e lo stato arrivano dal gestionale esterno.
  -- L'incasso registrato in app viene spinto là da billing-payment-push e
  -- torna indietro col prossimo allineamento: qui non si tocca niente,
  -- altrimenti si sovrascrive il dato buono con una somma parziale.
  IF v_esterna THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(amount), 0), MAX(payment_date)
    INTO v_total_paid, v_last_payment_date
    FROM public.invoice_payments
   WHERE invoice_id = v_invoice_id;

  UPDATE public.invoices
     SET paid_amount = v_total_paid,
         payment_date = v_last_payment_date,
         updated_at = now()
   WHERE id = v_invoice_id;

  IF v_total_paid >= v_invoice_total THEN
    UPDATE public.invoices SET status = 'paid'
     WHERE id = v_invoice_id AND status <> 'cancelled';
  ELSIF v_total_paid = 0 THEN
    UPDATE public.invoices SET status = 'issued'
     WHERE id = v_invoice_id AND status = 'paid';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

-- Su invoice_payments ci sono DUE trigger che scrivono paid_amount:
-- fn_update_invoice_on_payment (sopra) e trg_update_paid_amount, una copia più
-- povera dello stesso calcolo. Restano entrambi — toglierne uno è una decisione
-- a parte — ma la guardia sulle fatture importate vale per tutti e due.
CREATE OR REPLACE FUNCTION public.trg_update_paid_amount()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_invoice_id UUID;
BEGIN
  v_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);

  -- Fattura importata: il pagato è quello del gestionale esterno.
  IF EXISTS (SELECT 1 FROM invoices WHERE id = v_invoice_id AND external_provider IS NOT NULL) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  UPDATE invoices SET
    paid_amount = COALESCE(
      (SELECT SUM(amount) FROM invoice_payments WHERE invoice_id = v_invoice_id), 0
    ),
    status = CASE
      WHEN COALESCE(
        (SELECT SUM(amount) FROM invoice_payments WHERE invoice_id = v_invoice_id), 0
      ) >= total THEN 'paid'
      ELSE status
    END,
    updated_at = NOW()
  WHERE id = v_invoice_id;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- ── 2. I totali delle fatture importate non li riscrivono le righe ──────────
CREATE OR REPLACE FUNCTION public.recalculate_invoice_totals(p_invoice_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE invoices SET
    subtotal   = COALESCE((SELECT SUM(line_net)   FROM invoice_lines WHERE invoice_id = p_invoice_id), 0),
    tax_amount = COALESCE((SELECT SUM(line_tax)   FROM invoice_lines WHERE invoice_id = p_invoice_id), 0),
    total      = COALESCE((SELECT SUM(line_gross) FROM invoice_lines WHERE invoice_id = p_invoice_id), 0),
    updated_at = NOW()
  WHERE id = p_invoice_id
    -- Le importate hanno i totali del gestionale esterno, che comprendono voci
    -- senza colonna qui dentro (cassa previdenziale, rivalsa, ritenuta, bollo):
    -- la somma delle righe non è il totale della fattura.
    AND external_provider IS NULL;
END;
$function$;

-- ── 3-4. Righe fattura: azienda giusta, e la lettura non è la scrittura ─────
DROP POLICY IF EXISTS invoice_lines_via_invoice ON public.invoice_lines;
DROP POLICY IF EXISTS invoice_lines_lettura ON public.invoice_lines;
DROP POLICY IF EXISTS invoice_lines_scrittura ON public.invoice_lines;

CREATE POLICY invoice_lines_lettura ON public.invoice_lines
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.invoices i
     WHERE i.id = invoice_lines.invoice_id
       AND (
         (SELECT public.user_can_read_accountant_company(i.company_id))
         OR (
           i.company_id = (SELECT public.get_my_company_id())
           AND (SELECT public.has_permission((SELECT auth.uid()), 'can_view_billing'))
         )
         OR i.client_id = (SELECT auth.uid())
         OR EXISTS (SELECT 1 FROM public.orders o WHERE o.id = i.order_id AND o.customer_id = (SELECT auth.uid()))
       )
  ));

CREATE POLICY invoice_lines_scrittura ON public.invoice_lines
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.invoices i
     WHERE i.id = invoice_lines.invoice_id
       AND (
         (SELECT public.user_can_write_accountant_company(i.company_id))
         OR (
           i.company_id = (SELECT public.get_my_company_id())
           AND (SELECT public.has_permission((SELECT auth.uid()), 'can_manage_payments'))
         )
       )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.invoices i
     WHERE i.id = invoice_lines.invoice_id
       AND (
         (SELECT public.user_can_write_accountant_company(i.company_id))
         OR (
           i.company_id = (SELECT public.get_my_company_id())
           AND (SELECT public.has_permission((SELECT auth.uid()), 'can_manage_payments'))
         )
       )
  ));

-- ── 4b. Fatture: leggere resta a can_view_billing, scrivere no ──────────────
-- invoices_lettura_authenticated copre già la SELECT con lo stesso cancello.
DROP POLICY IF EXISTS invoices_billing_write ON public.invoices;
DROP POLICY IF EXISTS invoices_billing_insert ON public.invoices;
DROP POLICY IF EXISTS invoices_billing_update ON public.invoices;
DROP POLICY IF EXISTS invoices_billing_delete ON public.invoices;

CREATE POLICY invoices_billing_insert ON public.invoices
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = (SELECT public.get_my_company_id())
    AND (SELECT public.has_permission((SELECT auth.uid()), 'can_manage_payments'))
  );

CREATE POLICY invoices_billing_update ON public.invoices
  FOR UPDATE TO authenticated
  USING (
    company_id = (SELECT public.get_my_company_id())
    AND (SELECT public.has_permission((SELECT auth.uid()), 'can_manage_payments'))
  )
  WITH CHECK (
    company_id = (SELECT public.get_my_company_id())
    AND (SELECT public.has_permission((SELECT auth.uid()), 'can_manage_payments'))
  );

CREATE POLICY invoices_billing_delete ON public.invoices
  FOR DELETE TO authenticated
  USING (
    company_id = (SELECT public.get_my_company_id())
    AND (SELECT public.has_permission((SELECT auth.uid()), 'can_manage_payments'))
  );

-- ── 5. Fatture dei fornitori: servono i permessi dell'area ──────────────────
CREATE OR REPLACE FUNCTION public.puo_vedere_documenti_fornitore()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- has_permission dice già sì a company_admin e super_admin.
  SELECT public.has_permission(auth.uid(), 'can_view_billing')
      OR public.has_permission(auth.uid(), 'can_view_costs')
      OR public.has_permission(auth.uid(), 'can_manage_suppliers')
      OR public.has_permission(auth.uid(), 'can_view_prima_nota')
      OR public.has_permission(auth.uid(), 'can_view_tesoreria')
      OR public.has_role(auth.uid(), 'accountant'::app_role);
$function$;

COMMENT ON FUNCTION public.puo_vedere_documenti_fornitore() IS
  'Chi, dentro la propria azienda, può vedere le fatture ricevute: area fatturazione, costi, fornitori, prima nota o tesoreria. Serve alle policy di fatture_ricevute.';

REVOKE ALL ON FUNCTION public.puo_vedere_documenti_fornitore() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.puo_vedere_documenti_fornitore() TO authenticated;

DROP POLICY IF EXISTS fatture_ricevute_company_isolation ON public.fatture_ricevute;
DROP POLICY IF EXISTS fatture_ricevute_lettura ON public.fatture_ricevute;
DROP POLICY IF EXISTS fatture_ricevute_scrittura ON public.fatture_ricevute;

CREATE POLICY fatture_ricevute_lettura ON public.fatture_ricevute
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT public.get_my_company_id())
    AND (SELECT public.puo_vedere_documenti_fornitore())
  );

CREATE POLICY fatture_ricevute_scrittura ON public.fatture_ricevute
  FOR ALL TO authenticated
  USING (
    company_id = (SELECT public.get_my_company_id())
    AND (SELECT public.puo_vedere_documenti_fornitore())
  )
  WITH CHECK (
    company_id = (SELECT public.get_my_company_id())
    AND (SELECT public.puo_vedere_documenti_fornitore())
  );

-- ── 6. La vista degli incassi cercava un tipo di movimento inesistente ──────
CREATE OR REPLACE VIEW public.fattura_pagamento_stato AS
 SELECT df.id AS fattura_id,
    df.company_id,
    df.totale_da_pagare AS importo_totale,
    COALESCE(inc.tot, 0::numeric) AS importo_incassato,
    COALESCE(df.totale_da_pagare, 0::numeric) - COALESCE(inc.tot, 0::numeric) - COALESCE(nc.tot, 0::numeric) AS importo_residuo,
        CASE
            WHEN COALESCE(nc.tot, 0::numeric) >= COALESCE(df.totale_da_pagare, 0::numeric) AND COALESCE(df.totale_da_pagare, 0::numeric) > 0::numeric THEN 'stornata'::text
            WHEN (COALESCE(inc.tot, 0::numeric) + COALESCE(nc.tot, 0::numeric)) >= COALESCE(df.totale_da_pagare, 0::numeric) THEN 'pagata'::text
            WHEN (COALESCE(inc.tot, 0::numeric) + COALESCE(nc.tot, 0::numeric)) > 0::numeric THEN 'parziale'::text
            WHEN df.data_scadenza IS NOT NULL AND df.data_scadenza < CURRENT_DATE THEN 'scaduta'::text
            ELSE 'in_attesa'::text
        END AS stato_pagamento,
    inc.ultimo AS ultimo_incasso,
    COALESCE(inc.n, 0::bigint)::integer AS numero_incassi,
    COALESCE(nc.tot, 0::numeric) AS importo_stornato
   FROM documenti_fiscali df
     LEFT JOIN LATERAL ( SELECT sum(m.importo) AS tot,
            max(m.data_movimento) AS ultimo,
            count(*) AS n
           FROM movimenti_cassa_native m
          -- 'entrata' non è fra i tipi ammessi dal vincolo della tabella:
          -- incasso, pagamento, storno, rettifica.
          WHERE m.documento_id = df.id AND m.tipo = 'incasso'::text) inc ON true
     LEFT JOIN LATERAL ( SELECT sum(COALESCE(x.totale_da_pagare, x.totale_documento, 0::numeric)) AS tot
           FROM documenti_fiscali x
          WHERE x.documento_correlato_id = df.id AND x.tipo = 'nota_credito'::text AND (x.stato <> ALL (ARRAY['bozza'::text, 'annullata'::text])) AND x.deleted_at IS NULL) nc ON true
  WHERE df.stato <> 'annullata'::text AND documento_segno(df.tipo) = 1;
