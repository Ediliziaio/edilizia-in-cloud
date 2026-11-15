-- Stato patrimoniale: crediti e debiti commerciali alla data, note di credito una volta sola (15/11/2026)
--
-- Due errori nello Stato patrimoniale riclassificato:
--
-- 1. Crediti verso clienti e debiti verso fornitori di un anno chiuso usavano
--    gli incassi e i pagamenti di OGGI: una fattura del 2025 incassata a
--    febbraio 2026 risultava già incassata al 31/12/2025. Come per i conti (migrazione
--    20290330150000), adesso si guarda la situazione alla data:
--    - fatture (invoices): gli incassi registrati con la loro data
--      (invoice_payments), mai oltre l'incassato della fattura; dove manca la
--      riga, la data d'incasso della fattura; senza alcuna data l'incasso si
--      considera già avvenuto (come prima);
--    - documenti fiscali: incassati dopo la data → ancora da incassare;
--    - scadenze in uscita: pagate dopo la data → ancora da pagare; nate dopo
--      la data (scadenza e creazione successive) → non c'erano ancora.
--    Demo 2 al 31/12/2025: crediti 200.385 € → 257.510 €.
--
-- 2. Una nota di credito a un cliente con la sua scadenza di rimborso contava
--    due volte: in meno nei crediti (residuo della nota) e in più nei debiti
--    fornitori (la scadenza in uscita). Innovasol: 925.732 € da una parte e
--    dall'altra. E il residuo della nota non scende quando il rimborso è
--    pagato dalla scadenza (Best Infissi: 436.232 € di note già rimborsate che
--    abbassavano ancora i crediti). Adesso la nota con scadenze di rimborso
--    conta una volta, nei crediti, per quanto resta da rimborsare secondo le
--    sue scadenze non annullate; quelle scadenze escono dai debiti verso
--    fornitori. Una nota con le sole scadenze annullate resta col suo residuo.
--
-- Per l'anno in corso (data = oggi) i numeri non cambiano, salvo il punto 2.

create or replace function private.cg_crediti_clienti_al(p_company uuid, p_rif date)
returns numeric language sql stable security definer set search_path to '' as $$
  with emesse as (
    select f.*,
           i.payment_date as data_incasso_fattura,
           coalesce(i.total, 0) as totale_fattura,
           coalesce(i.paid_amount, 0) as incassato_fattura,
           d.pagato_at::date as data_incasso_documento,
           coalesce(d.totale_da_pagare, d.totale_documento, 0) as totale_documento
      from public.v_cg_fatture_emesse f
      left join public.invoices i on f.origine = 'invoices' and i.id = f.id
      left join public.documenti_fiscali d on f.origine = 'documenti_fiscali' and d.id = f.id
     where f.company_id = p_company and f.data <= p_rif
  ), righe as (
    select p.invoice_id,
           sum(p.amount) as tutte,
           sum(p.amount) filter (where p.payment_date <= p_rif) as entro
      from public.invoice_payments p
     where p.company_id = p_company
     group by p.invoice_id
  ), rimborsi as (
    -- Note di credito con scadenze di rimborso: quanto resta da rimborsare alla data.
    -- Una nota con le sole scadenze annullate resta col suo residuo, come prima.
    select s.invoice_id,
           sum(greatest(coalesce(s.amount, 0) - case
                 when s.paid_date is not null and s.paid_date > p_rif then 0
                 when s.status = 'pagata' then coalesce(s.amount, 0)
                 else coalesce(s.paid_amount, 0) end, 0)) as da_rimborsare
      from public.scadenze s
     where s.company_id = p_company and s.direction = 'uscita' and s.invoice_id is not null
       and s.status not in ('annullata', 'cancelled')
     group by s.invoice_id
  )
  select coalesce(sum(
    case
      when e.origine = 'invoices' and e.document_type = 'credit_note' and rb.invoice_id is not null
        then -rb.da_rimborsare
      when e.origine = 'invoices' then e.segno * greatest(e.totale_fattura - case
          -- Mai più dell'incassato registrato sulla fattura: oggi il numero è quello di prima.
          when r.invoice_id is not null then least(e.incassato_fattura, coalesce(r.entro, 0)
            + case when e.data_incasso_fattura is null or e.data_incasso_fattura <= p_rif
                   then greatest(e.incassato_fattura - r.tutte, 0) else 0 end)
          when e.data_incasso_fattura is null or e.data_incasso_fattura <= p_rif then e.incassato_fattura
          else 0 end, 0)
      when e.origine = 'documenti_fiscali' and e.data_incasso_documento > p_rif
        then e.segno * e.totale_documento
      else e.segno * e.residuo
    end), 0)
    from emesse e
    left join righe r on r.invoice_id = e.id
    left join rimborsi rb on rb.invoice_id = e.id
$$;
revoke all on function private.cg_crediti_clienti_al(uuid, date) from public, anon, authenticated;

create or replace function private.cg_debiti_fornitori_al(p_company uuid, p_rif date)
returns numeric language sql stable security definer set search_path to '' as $$
  select coalesce(sum(greatest(coalesce(s.amount, 0) - case
           when s.paid_date is not null and s.paid_date > p_rif then 0
           when s.status = 'pagata' then coalesce(s.amount, 0)
           else coalesce(s.paid_amount, 0) end, 0)), 0)
    from public.scadenze s
   where s.company_id = p_company
     and s.direction = 'uscita'
     and coalesce(s.is_previsionale, false) = false
     and s.status not in ('annullata', 'cancelled')
     -- Rimborsi di note di credito ai clienti: stanno nei crediti.
     and s.invoice_id is null
     -- Alla data il debito c'era già.
     and (s.due_date <= p_rif or s.created_at::date <= p_rif)
     and (s.tipo = 'pagamento_fornitore' or (s.tipo = 'costo_aziendale' and s.due_date <= p_rif))
$$;
revoke all on function private.cg_debiti_fornitori_al(uuid, date) from public, anon, authenticated;

do $p$
declare
  vecchio text := pg_get_functiondef('public.cg_get_stato_patrimoniale_riclassificato(uuid,integer,date)'::regprocedure);
  nuovo text := vecchio;
  crediti_prima text := $a$  SELECT COALESCE(sum(f.segno * f.residuo), 0)
  INTO v_crediti_clienti
  FROM public.v_cg_fatture_emesse f
  WHERE f.company_id = v_company_id
    AND f.data <= v_rif;$a$;
  debiti_prima text := $a$  SELECT COALESCE(sum(GREATEST(COALESCE(s.amount, 0) - COALESCE(s.paid_amount, 0), 0)), 0)
  INTO v_debiti_forn
  FROM public.scadenze s
  WHERE s.company_id = v_company_id
    AND s.direction = 'uscita'
    AND s.status IN ('da_pagare', 'parziale')
    AND COALESCE(s.is_previsionale, false) = false
    AND (
      s.tipo = 'pagamento_fornitore'
      OR (s.tipo = 'costo_aziendale' AND s.due_date <= v_rif)
    );$a$;
begin
  if position(crediti_prima in nuovo) > 0 then
    nuovo := replace(nuovo, crediti_prima, '  v_crediti_clienti := private.cg_crediti_clienti_al(v_company_id, v_rif);');
  elsif position('private.cg_crediti_clienti_al' in nuovo) = 0 then
    raise exception 'Stato patrimoniale: blocco dei crediti non trovato';
  end if;
  if position(debiti_prima in nuovo) > 0 then
    nuovo := replace(nuovo, debiti_prima, '  v_debiti_forn := private.cg_debiti_fornitori_al(v_company_id, v_rif);');
  elsif position('private.cg_debiti_fornitori_al' in nuovo) = 0 then
    raise exception 'Stato patrimoniale: blocco dei debiti verso fornitori non trovato';
  end if;
  if nuovo <> vecchio then
    execute nuovo;
  end if;
end $p$;
