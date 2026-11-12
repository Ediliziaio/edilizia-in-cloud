-- «Al 30% dei lavori»: l'importo del SAL è già progressivo (12/11/2026)
--
-- Corregge la regola scritta nella 20290313140000, che sommava gli importi dei SAL maturati
-- per sapere a che punto sono i lavori. Ma `sal_records.importo_totale` è il CUMULATIVO netto
-- — «lavori a tutto il …», come si scrive nei SAL — non l'importo del singolo stato: su una
-- commessa vera i diciotto SAL di un contratto da 1.148.252 € sommavano 9.872.654 €.
-- Sommandoli, la soglia si raggiungeva molto prima del dovuto e la rata sarebbe risultata
-- esigibile, e scaduta, quando non lo era.
--
-- Nessuna rata in produzione usava ancora questo momento, quindi l'errore non ha fatto danni:
-- il preventivo lo mandava apposta come SAL numerato finché la regola non fosse corretta.
-- Cambia solo il ramo `sal_percentuale`; la firma è la stessa, quindi la vista
-- `v_rate_commessa_stato` non va toccata.

create or replace function public.data_attesa_rata(
  p_evento text, p_expected_date date, p_status_id uuid, p_order_id uuid,
  p_created_at timestamptz, p_merce date, p_inizio date, p_fine date,
  p_posa date default null, p_quote_id uuid default null, p_numero integer default null,
  p_soglia numeric default null, p_fase text default null)
 returns date
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  SELECT CASE coalesce(p_evento, 'data_fissa')
    WHEN 'firma_contratto' THEN p_created_at::date
    WHEN 'accettazione_preventivo' THEN (
      SELECT coalesce(q.signed_at::date, q.updated_at::date) FROM public.quotes q WHERE q.id = p_quote_id
    )
    WHEN 'merce_magazzino' THEN p_merce
    WHEN 'consegna_cantiere' THEN (
      SELECT min(s.arrived_at)::date FROM public.shipments_to_site s
      WHERE s.order_id = p_order_id AND s.arrived_at IS NOT NULL
    )
    WHEN 'inizio_lavori' THEN p_inizio
    WHEN 'data_posa' THEN p_posa
    WHEN 'sal_numero' THEN (
      SELECT min(sl.maturato_il) FROM public.sal_records sl
      WHERE sl.order_id = p_order_id AND sl.maturato_il IS NOT NULL
        AND (p_numero IS NULL OR sl.numero_sal = p_numero)
    )
    -- Il primo SAL maturato che porta i lavori alla soglia. `importo_totale` è già
    -- «a tutto il …»: non va sommato.
    WHEN 'sal_percentuale' THEN (
      SELECT min(sl.maturato_il) FROM public.sal_records sl
      WHERE sl.order_id = p_order_id AND sl.maturato_il IS NOT NULL
        AND p_soglia IS NOT NULL
        AND (SELECT coalesce(o.total_amount, 0) FROM public.orders o WHERE o.id = p_order_id) > 0
        AND sl.importo_totale >= (SELECT o.total_amount FROM public.orders o WHERE o.id = p_order_id) * p_soglia / 100
    )
    -- «A completamento delle strutture»: quando quella fase del cantiere è chiusa.
    WHEN 'fase_completata' THEN (
      SELECT max(coalesce(f.completata_il::date, f.end_date))
        FROM public.order_work_phases f
       WHERE f.order_id = p_order_id
         AND p_fase IS NOT NULL
         AND lower(btrim(f.name)) = lower(btrim(p_fase))
         AND (f.completata_il IS NOT NULL OR f.status = 'completata')
    )
    WHEN 'fine_lavori' THEN p_fine
    -- Il collaudo non ha ancora una data sua: segue la fine dei lavori, e nel documento
    -- resta scritto «al collaudo», che è la condizione firmata.
    WHEN 'collaudo' THEN p_fine
    WHEN 'fattura_acconto' THEN (
      SELECT min(inv.issue_date) FROM public.invoices inv
      WHERE inv.order_id = p_order_id AND coalesce(inv.document_type, 'invoice') <> 'credit_note'
    )
    WHEN 'fattura_saldo' THEN (
      SELECT max(inv.issue_date) FROM public.invoices inv
      WHERE inv.order_id = p_order_id AND coalesce(inv.document_type, 'invoice') <> 'credit_note'
    )
    WHEN 'stato_commessa' THEN (
      SELECT min(h.changed_at)::date FROM public.order_status_history h
      WHERE h.order_id = p_order_id AND h.status_id = p_status_id
    )
    ELSE p_expected_date
  END;
$function$;
