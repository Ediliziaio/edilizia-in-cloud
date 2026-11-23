-- I documenti ancora aperti per il popup «Registra movimento» della Prima Nota (23/11/2026):
-- in entrata le fatture emesse (fatte con l'app e importate), in uscita le fatture ricevute,
-- ciascuna col residuo vero. Un elenco solo, così la ricerca per cliente o fornitore è una.
-- SECURITY DEFINER (documento_stornato_totale è chiusa agli utenti), con lo stesso controllo
-- di chi può scrivere in Prima Nota: è chi apre il popup.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.prima_nota_documenti_aperti(p_company uuid, p_direction text)
RETURNS TABLE(tipo text, id uuid, numero text, data date, controparte text, totale numeric, residuo numeric, order_id uuid, order_code text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF auth.uid() IS NULL OR public.utente_bloccato() OR NOT (
       public.user_can_write_accountant_company(p_company)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR (p_company = public.get_my_company_id() AND (public.e_amministratore_di(p_company)
        OR public.has_permission(auth.uid(), 'can_view_prima_nota')))) THEN
    RAISE EXCEPTION 'Non hai il permesso di registrare movimenti per questa azienda' USING ERRCODE = '42501';
  END IF;
  -- Le fatture ricevute: stesse regole di accesso di fatture_ricevute_saldi.
  IF p_direction = 'uscita' AND (public.utente_e_cliente_esterno() OR NOT coalesce(
       (p_company = public.get_my_company_id() AND public.puo_vedere_documenti_fornitore())
       OR public.user_can_read_accountant_company(p_company)
       OR public.e_super_admin_dentro(p_company), false)) THEN
    RAISE EXCEPTION 'Non puoi consultare i pagamenti delle fatture ricevute' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  -- Il saldo si calcola solo dove può esserci un residuo: fattura senza costo o costo non pagato
  -- (su 1.000 fatture, 3 secondi contro uno).
  SELECT 'fattura_ricevuta'::text, f.id, f.numero_fattura, f.data_fattura, f.cedente_ragione_sociale,
         s.dovuto, round(s.residuo, 2), k.order_id, o.order_code
    FROM public.fatture_ricevute f
    LEFT JOIN public.company_costs k ON k.id = f.company_cost_id
    LEFT JOIN public.orders o ON o.id = k.order_id
    CROSS JOIN LATERAL private.fatture_ricevute_calcola_saldi(f.company_id, NULL, f.id) s
   WHERE p_direction = 'uscita' AND f.company_id = p_company
     AND (k.id IS NULL OR NOT coalesce(k.is_paid, false))
     AND s.residuo > 0.005 AND NOT s.stornata
     AND f.stato <> 'rifiutata' AND f.tipo_documento NOT IN ('TD04', 'TD08', 'passive_credit_note')
  UNION ALL
  SELECT 'documento'::text, d.id, d.numero, d.data_emissione,
         coalesce(nullif(d.cliente_snapshot->>'ragione_sociale', ''), d.cliente_snapshot->>'nome'),
         d.totale_da_pagare,
         round(coalesce(d.totale_da_pagare, 0) - coalesce(d.importo_pagato, 0) - public.documento_stornato_totale(d.id), 2),
         d.ordine_id, o.order_code
    FROM public.documenti_fiscali d
    LEFT JOIN public.orders o ON o.id = d.ordine_id
   WHERE p_direction = 'entrata' AND d.company_id = p_company AND d.deleted_at IS NULL
     AND d.tipo NOT IN ('nota_credito', 'ddt', 'proforma', 'preventivo')
     AND d.stato NOT IN ('bozza', 'annullata', 'stornata', 'pagata')
     AND coalesce(d.totale_da_pagare, 0) - coalesce(d.importo_pagato, 0) - public.documento_stornato_totale(d.id) > 0.005
  UNION ALL
  SELECT 'invoice'::text, i.id, i.invoice_number, i.issue_date, i.client_company_name,
         i.total, round(coalesce(i.total, 0) - coalesce(i.paid_amount, 0), 2), i.order_id, o.order_code
    FROM public.invoices i
    LEFT JOIN public.orders o ON o.id = i.order_id
   WHERE p_direction = 'entrata' AND i.company_id = p_company AND i.deleted_at IS NULL
     AND i.document_type = 'invoice' AND i.status NOT IN ('paid', 'cancelled', 'credited', 'draft')
     AND coalesce(i.total, 0) - coalesce(i.paid_amount, 0) > 0.005;
END $function$;
REVOKE ALL ON FUNCTION public.prima_nota_documenti_aperti(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prima_nota_documenti_aperti(uuid, text) TO authenticated;
