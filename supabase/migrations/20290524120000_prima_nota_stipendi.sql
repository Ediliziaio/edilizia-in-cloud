-- Prima Nota, movimento diviso: gli stipendi (23/11/2026, lotto 4).
--
-- Una quota «dipendente» paga lo stipendio di un mese a una persona: la riga di Prima Nota
-- porta employee_id e, se nell'app c'è il cedolino di quel mese, cedolino_id; il cedolino
-- risulta pagato quel giorno. Senza cedolino (quasi tutte le aziende) la quota vale lo stesso.
-- Lo stipendio NON va sulle commesse: la manodopera ci arriva già dai rapportini.
--
-- prima_nota_dipendenti dice a chi registra quali dipendenti pagare e quanto proporre
-- (netto del cedolino del mese, altrimenti il netto della scheda): gli importi solo a chi
-- vede le paghe (amministratore, commercialista, super admin), agli altri solo i nomi.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.prima_nota_entries ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL;
ALTER TABLE public.prima_nota_entries ADD COLUMN IF NOT EXISTS cedolino_id uuid REFERENCES public.hr_cedolini(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS prima_nota_entries_dipendente ON public.prima_nota_entries(employee_id) WHERE employee_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.prima_nota_dipendenti(p_company uuid, p_anno integer, p_mese integer)
RETURNS TABLE(id uuid, nome text, netto_proposto numeric, origine text, cedolino_id uuid, pagato_il date)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_importi boolean;
BEGIN
  IF auth.uid() IS NULL OR public.utente_bloccato() OR NOT (
       public.user_can_write_accountant_company(p_company)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR (p_company = public.get_my_company_id() AND (public.e_amministratore_di(p_company)
        OR public.has_permission(auth.uid(), 'can_view_prima_nota')))) THEN
    RAISE EXCEPTION 'Non hai il permesso di registrare movimenti per questa azienda' USING ERRCODE = '42501';
  END IF;
  IF p_mese NOT BETWEEN 1 AND 12 OR p_anno NOT BETWEEN 2000 AND 2100 THEN
    RAISE EXCEPTION 'Mese non valido' USING ERRCODE = '22023';
  END IF;
  v_importi := public.user_can_write_accountant_company(p_company) OR public.has_role(auth.uid(), 'super_admin'::app_role)
               OR (p_company = public.get_my_company_id() AND public.e_amministratore_di(p_company));
  RETURN QUERY
  SELECT e.id, btrim(coalesce(e.last_name, '') || ' ' || coalesce(e.first_name, '')),
         CASE WHEN v_importi THEN coalesce(c.netto, e.net_salary) END,
         CASE WHEN c.netto IS NOT NULL THEN 'cedolino'::text WHEN e.net_salary IS NOT NULL THEN 'scheda'::text END,
         c.id,
         coalesce(c.data_pagamento, (SELECT max(p.entry_date) FROM public.prima_nota_entries p
                                      WHERE p.company_id = p_company AND p.employee_id = e.id AND p.category = 'stipendi'
                                        AND p.description LIKE '%· ' || lpad(p_mese::text, 2, '0') || '/' || p_anno))
    FROM public.employees e
    LEFT JOIN LATERAL (SELECT x.id, x.netto, x.data_pagamento FROM public.hr_cedolini x
                        WHERE x.employee_id = e.id AND x.company_id = p_company
                          AND x.anno = p_anno AND x.mese = p_mese AND x.stato <> 'bozza' LIMIT 1) c ON true
   WHERE e.company_id = p_company AND (coalesce(e.is_active, true) OR c.id IS NOT NULL)
   ORDER BY 2;
END $function$;
REVOKE ALL ON FUNCTION public.prima_nota_dipendenti(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prima_nota_dipendenti(uuid, integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.prima_nota_registra_divisa(p_company uuid, p_testata jsonb, p_quote jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public' AS $function$
DECLARE
  v_dir text := p_testata->>'direction';
  v_data date := (p_testata->>'data')::date;
  v_tot numeric := round((p_testata->>'importo')::numeric, 2);
  v_metodo text := nullif(btrim(coalesce(p_testata->>'metodo', '')), '');
  v_rif text := nullif(btrim(coalesce(p_testata->>'riferimento', '')), '');
  v_conto text := coalesce(nullif(p_testata->>'account_label', ''), CASE WHEN lower(coalesce(v_metodo, '')) IN ('contanti', 'cash', 'mp01') THEN 'cassa' ELSE 'banca' END);
  v_banca uuid := nullif(p_testata->>'bank_account_id', '')::uuid;
  v_liq uuid := nullif(p_testata->>'conto_liquidita_id', '')::uuid;
  v_note text := nullif(btrim(coalesce(p_testata->>'note', '')), '');
  v_gruppo uuid; q jsonb; v_imp numeric; v_somma numeric := 0; v_tipo text; v_id uuid;
  v_costo uuid; v_pn uuid; v_mov uuid; v_esito jsonb; v_righe jsonb := '[]'::jsonb;
  v_desc text; r record; v_n int := 0; v_anno int; v_mese int; v_ced uuid;
BEGIN
  IF auth.uid() IS NULL OR public.utente_bloccato() OR NOT (
       public.user_can_write_accountant_company(p_company)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR (p_company = public.get_my_company_id() AND (public.e_amministratore_di(p_company)
        OR public.has_permission(auth.uid(), 'can_view_prima_nota')))) THEN
    RAISE EXCEPTION 'Non hai il permesso di registrare movimenti per questa azienda' USING ERRCODE = '42501';
  END IF;
  IF v_dir NOT IN ('entrata', 'uscita') OR v_data IS NULL OR v_tot IS NULL OR v_tot <= 0 THEN
    RAISE EXCEPTION 'Indica entrata o uscita, la data e un importo maggiore di zero' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_quote) <> 'array' OR jsonb_array_length(p_quote) = 0 THEN
    RAISE EXCEPTION 'Aggiungi almeno una quota' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_quote) > 200 THEN RAISE EXCEPTION 'Al massimo 200 quote per movimento' USING ERRCODE = '22023'; END IF;

  -- Controlli su tutte le quote prima di scrivere: somma, verso, doppioni.
  FOR q IN SELECT * FROM jsonb_array_elements(p_quote) LOOP
    v_n := v_n + 1;
    v_tipo := q->>'tipo';
    v_imp := (q->>'importo')::numeric;
    IF v_imp IS NULL OR v_imp <= 0 OR v_imp <> round(v_imp, 2) THEN
      RAISE EXCEPTION 'Quota %: importo non valido', v_n USING ERRCODE = '22023';
    END IF;
    IF v_tipo NOT IN ('fattura_ricevuta', 'costo', 'documento', 'invoice', 'libera', 'dipendente') THEN
      RAISE EXCEPTION 'Quota %: tipo «%» sconosciuto', v_n, v_tipo USING ERRCODE = '22023';
    END IF;
    IF v_dir = 'entrata' AND v_tipo = 'dipendente' THEN
      RAISE EXCEPTION 'Quota %: uno stipendio è un''uscita', v_n USING ERRCODE = '22023';
    END IF;
    IF v_tipo = 'dipendente' AND (coalesce((q->>'mese')::int, 0) NOT BETWEEN 1 AND 12 OR coalesce((q->>'anno')::int, 0) NOT BETWEEN 2000 AND 2100) THEN
      RAISE EXCEPTION 'Quota %: indica il mese dello stipendio', v_n USING ERRCODE = '22023';
    END IF;
    IF (v_dir = 'entrata' AND v_tipo IN ('fattura_ricevuta', 'costo')) OR (v_dir = 'uscita' AND v_tipo IN ('documento', 'invoice')) THEN
      RAISE EXCEPTION 'Quota %: una fattura % non va in un movimento in %', v_n,
        CASE WHEN v_tipo IN ('fattura_ricevuta', 'costo') THEN 'ricevuta' ELSE 'emessa' END, v_dir USING ERRCODE = '22023';
    END IF;
    IF v_tipo = 'libera' AND nullif(btrim(coalesce(q->>'categoria', '')), '') IS NULL THEN
      RAISE EXCEPTION 'Quota %: scegli la categoria', v_n USING ERRCODE = '22023';
    END IF;
    IF v_tipo <> 'libera' AND nullif(q->>'id', '') IS NULL THEN
      RAISE EXCEPTION 'Quota %: manca il documento', v_n USING ERRCODE = '22023';
    END IF;
    v_somma := v_somma + v_imp;
  END LOOP;
  IF abs(v_somma - v_tot) > 0.004 THEN
    RAISE EXCEPTION 'Le quote fanno % € ma il movimento è di % €', replace(to_char(v_somma, 'FM9999999990.00'), '.', ','), replace(to_char(v_tot, 'FM9999999990.00'), '.', ',') USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_quote) e WHERE e->>'tipo' <> 'libera'
             GROUP BY e->>'tipo', e->>'id', e->>'anno', e->>'mese' HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Lo stesso documento compare in due quote: uniscile' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.prima_nota_gruppi(company_id, direction, descrizione, importo, entry_date, payment_method, reference_number)
  VALUES (p_company, v_dir, coalesce(nullif(btrim(coalesce(p_testata->>'descrizione', '')), ''),
            CASE WHEN v_dir = 'entrata' THEN 'Incasso diviso' ELSE 'Pagamento diviso' END),
          v_tot, v_data, v_metodo, v_rif)
  RETURNING id INTO v_gruppo;

  FOR q IN SELECT * FROM jsonb_array_elements(p_quote) LOOP
    v_tipo := q->>'tipo';
    v_imp := round((q->>'importo')::numeric, 2);
    v_id := nullif(q->>'id', '')::uuid;
    v_pn := NULL;

    IF v_tipo IN ('fattura_ricevuta', 'costo') THEN
      IF v_tipo = 'fattura_ricevuta' THEN
        SELECT company_cost_id INTO v_costo FROM public.fatture_ricevute WHERE id = v_id AND company_id = p_company;
        IF NOT FOUND THEN RAISE EXCEPTION 'Fattura ricevuta non trovata' USING ERRCODE = '22023'; END IF;
        IF v_costo IS NULL THEN
          v_costo := nullif(public.contabilizza_fattura_ricevuta(v_id)->>'company_cost_id', '')::uuid;
          IF v_costo IS NULL THEN RAISE EXCEPTION 'Una fattura ricevuta non si può contabilizzare: aprila e contabilizzala a mano' USING ERRCODE = '22023'; END IF;
        END IF;
      ELSE
        SELECT id INTO v_costo FROM public.company_costs WHERE id = v_id AND company_id = p_company;
        IF NOT FOUND THEN RAISE EXCEPTION 'Costo non trovato' USING ERRCODE = '22023'; END IF;
      END IF;
      v_esito := public.registra_pagamento_costo_con_conto(v_costo, gen_random_uuid(), v_imp, v_data,
                   coalesce(v_metodo, 'bonifico'), v_rif, v_banca, v_liq);
      v_pn := nullif(v_esito->>'prima_nota_id', '')::uuid;
      IF v_pn IS NULL THEN RAISE EXCEPTION 'Un pagamento non è stato registrato: il costo risulta già pagato' USING ERRCODE = '22023'; END IF;
      UPDATE public.prima_nota_entries SET gruppo_id = v_gruppo, account_label = v_conto,
             notes = coalesce(notes, v_note)
       WHERE id = v_pn;

    ELSIF v_tipo = 'documento' THEN
      v_mov := public.registra_incasso_atomico(p_company, v_id, v_imp, coalesce(v_metodo, 'bonifico'), v_data, v_rif, v_note);
      UPDATE public.prima_nota_entries SET gruppo_id = v_gruppo, account_label = v_conto,
             bank_account_id = v_banca, conto_liquidita_id = v_liq
       WHERE movimento_id = v_mov AND company_id = p_company
       RETURNING id INTO v_pn;

    ELSIF v_tipo = 'invoice' THEN
      SELECT i.invoice_number, i.client_company_name, i.order_id,
             round(coalesce(i.total, 0) - coalesce(i.paid_amount, 0), 2) AS residuo
        INTO r FROM public.invoices i
       WHERE i.id = v_id AND i.company_id = p_company AND i.deleted_at IS NULL
         AND i.status NOT IN ('paid', 'cancelled', 'credited', 'draft');
      IF NOT FOUND THEN RAISE EXCEPTION 'Una fattura emessa non è più da incassare' USING ERRCODE = '22023'; END IF;
      IF v_imp > r.residuo + 0.01 THEN
        RAISE EXCEPTION 'Fattura %: incasso di % € oltre il residuo di % €', r.invoice_number, v_imp, r.residuo USING ERRCODE = '22023';
      END IF;
      v_desc := btrim(format('Incasso fattura %s%s', coalesce(r.invoice_number, ''), coalesce(' - ' || r.client_company_name, '')));
      INSERT INTO public.prima_nota_entries(company_id, direction, category, description, amount, entry_date, payment_method,
        reference_number, order_id, invoice_id, account_label, bank_account_id, conto_liquidita_id, notes,
        attachment_url, attachment_name, is_auto, created_by, gruppo_id)
      VALUES (p_company, 'entrata', 'incasso', v_desc, v_imp, v_data, v_metodo, coalesce(v_rif, 'Fatt. ' || r.invoice_number),
        r.order_id, v_id, v_conto, v_banca, v_liq, v_note,
        p_testata->>'attachment_url', p_testata->>'attachment_name', false, auth.uid(), v_gruppo)
      RETURNING id INTO v_pn;
      INSERT INTO public.invoice_payments(invoice_id, company_id, amount, payment_date, payment_method, reference, notes)
      VALUES (v_id, p_company, v_imp, v_data, v_metodo, 'prima_nota:' || v_pn, 'Incasso registrato dalla Prima nota');

    ELSIF v_tipo = 'dipendente' THEN
      v_anno := (q->>'anno')::int; v_mese := (q->>'mese')::int; v_ced := NULL;
      SELECT e.first_name, e.last_name INTO r FROM public.employees e WHERE e.id = v_id AND e.company_id = p_company;
      IF NOT FOUND THEN RAISE EXCEPTION 'Dipendente non trovato' USING ERRCODE = '22023'; END IF;
      SELECT c.id INTO v_ced FROM public.hr_cedolini c
       WHERE c.company_id = p_company AND c.employee_id = v_id AND c.anno = v_anno AND c.mese = v_mese AND c.stato <> 'bozza' LIMIT 1;
      INSERT INTO public.prima_nota_entries(company_id, direction, category, description, amount, entry_date, payment_method,
        reference_number, account_label, bank_account_id, conto_liquidita_id, notes,
        attachment_url, attachment_name, is_auto, created_by, gruppo_id, employee_id, cedolino_id)
      VALUES (p_company, 'uscita', 'stipendi',
        format('Stipendio %s %s · %s/%s', coalesce(r.last_name, ''), coalesce(r.first_name, ''), lpad(v_mese::text, 2, '0'), v_anno),
        v_imp, v_data, v_metodo, v_rif, v_conto, v_banca, v_liq, v_note,
        p_testata->>'attachment_url', p_testata->>'attachment_name', false, auth.uid(), v_gruppo, v_id, v_ced)
      RETURNING id INTO v_pn;
      -- Il cedolino del mese risulta pagato quel giorno, se chi registra può scriverlo (le regole
      -- dei cedolini lo lasciano fare solo all'amministratore: per gli altri non cambia niente).
      IF v_ced IS NOT NULL THEN
        UPDATE public.hr_cedolini SET data_pagamento = v_data, stato = 'pagato', updated_at = now() WHERE id = v_ced;
      END IF;

    ELSE -- libera
      INSERT INTO public.prima_nota_entries(company_id, direction, category, description, amount, entry_date, payment_method,
        reference_number, order_id, supplier_id, account_label, bank_account_id, conto_liquidita_id, notes,
        attachment_url, attachment_name, is_auto, created_by, gruppo_id)
      VALUES (p_company, v_dir, btrim(q->>'categoria'),
        coalesce(nullif(btrim(coalesce(q->>'descrizione', '')), ''), nullif(btrim(coalesce(p_testata->>'descrizione', '')), ''), 'Quota'),
        v_imp, v_data, v_metodo, v_rif, nullif(q->>'order_id', '')::uuid, nullif(q->>'supplier_id', '')::uuid,
        v_conto, v_banca, v_liq, v_note, p_testata->>'attachment_url', p_testata->>'attachment_name', false, auth.uid(), v_gruppo)
      RETURNING id INTO v_pn;
    END IF;

    IF v_pn IS NULL THEN RAISE EXCEPTION 'Una quota non è stata registrata' USING ERRCODE = '22023'; END IF;
    v_righe := v_righe || jsonb_build_object('tipo', v_tipo, 'id', v_id, 'prima_nota_id', v_pn, 'importo', v_imp);
  END LOOP;

  RETURN jsonb_build_object('gruppo_id', v_gruppo, 'righe', v_righe);
END $function$;
REVOKE ALL ON FUNCTION public.prima_nota_registra_divisa(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prima_nota_registra_divisa(uuid, jsonb, jsonb) TO authenticated;
