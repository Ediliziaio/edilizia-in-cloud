-- ════════════════════════════════════════════════════════════════════════════
-- renova: l'importo delle commesse nate dalle fatture torna senza IVA
-- ════════════════════════════════════════════════════════════════════════════
-- Richiesta di Florin del 29/10/2026: «le commesse create in passato dalle
-- fatture hanno gli importi con l'IVA sommata, quindi più alti: va sistemato».
--
-- Le 41 commesse di renova solution srl sono state create una volta sola, da
-- uno script fuori dal registro (created_by vuoto, data = data della fattura
-- a mezzanotte), con importo = fatture IVA INCLUSA meno note di credito IVA
-- INCLUSA. Misurato il 29/10/2026: vale per tutte le 41, al centesimo. Ma
-- l'importo di una commessa (`orders.total_amount`) è l'IMPONIBILE: lo legge
-- così il margine (v_ordine_marginalita), e il lordo per le rate è
-- total_amount × (1 + vat_rate). Il ricavo era gonfiato di 50.705 € (512.990
-- → 462.285) e il lordo contava l'IVA due volte.
--
-- In più l'aliquota era 22 su tutte, anche dove le fatture dicono 10 o 0.
--
-- La correzione, per ogni commessa di renova con fatture:
--   · total_amount = imponibile delle fatture − imponibile delle note di credito;
--   · vat_rate     = imposta / imponibile delle fatture (non delle note),
--                    arrotondata all'intero se è 0, 4, 5, 10 o 22, altrimenti a
--                    quattro decimali (O-0025 ha righe al 10% e al 22%: 14,4576,
--                    così il lordo torna 18.210,20 come la fattura).
-- Solo dove l'importo è ANCORA il lordo calcolato così: se qualcuno nel
-- frattempo l'ha toccato a mano, non si sovrascrive. Rilanciabile.
--
-- Esito atteso: 40 commesse aggiornate — 37 nell'importo e nell'aliquota, 3 solo
-- nell'aliquota (senza IVA: erano segnate al 22%).
-- NON si tocca O-0007: il suo importo è NEGATIVO (−19.616,54 € lordi), perché
-- porta una nota di credito da 20.454 € che storna fatture precedenti non
-- collegate qui. Il netto sarebbe −18.091 € e una commessa non può valere
-- meno di zero (validate_order_total lo rifiuta, giustamente): va decisa a
-- mano, scollegando la nota o ricollegandola alle fatture che storna.
--
-- Effetti controllati prima: nessun semaforo di margine peggiora (le verdi
-- restano verdi, O-0023 era già rossa), quindi nessun avviso; nessun venditore
-- né variante sulle commesse di renova; l'unica rata (O-0041) è a zero e non
-- blocca il controllo sul totale. Le automazioni sulle commesse scattano su
-- stato e date, non sull'importo.
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';
set local statement_timeout = '60s';

do $$
declare
  v_az     uuid;
  v_n      integer;
  v_lordi  integer;
begin
  select id into v_az from public.companies where name = 'renova solution srl';
  if v_az is null then
    raise notice 'renova solution srl non c''è: niente da fare';
    return;
  end if;

  with f as (
    select i.order_id,
           sum(case when i.document_type = 'credit_note' then -i.total    else i.total    end) as lordo,
           sum(case when i.document_type = 'credit_note' then -i.subtotal else i.subtotal end) as netto,
           sum(i.tax_amount) filter (where i.document_type <> 'credit_note') as imposta,
           sum(i.subtotal)   filter (where i.document_type <> 'credit_note') as imponibile
      from public.invoices i
     where i.company_id = v_az and i.deleted_at is null and i.order_id is not null
     group by i.order_id
  ), nuovi as (
    select f.order_id, round(f.netto, 2) as netto,
           case
             when coalesce(f.imponibile, 0) = 0 then null
             when round(100 * f.imposta / f.imponibile) in (0, 4, 5, 10, 22)
                  and abs(100 * f.imposta / f.imponibile - round(100 * f.imposta / f.imponibile)) < 0.1
               then round(100 * f.imposta / f.imponibile)
             else round(100 * f.imposta / f.imponibile, 4)
           end as aliquota
      from f
  )
  update public.orders o
     set total_amount = n.netto,
         vat_rate     = coalesce(n.aliquota, o.vat_rate)
    from f join nuovi n on n.order_id = f.order_id
   where o.id = f.order_id
     and o.company_id = v_az
     and o.deleted_at is null
     and abs(o.total_amount - f.lordo) < 0.01
     and n.netto >= 0
     and (abs(f.lordo - f.netto) >= 0.01 or o.vat_rate is distinct from coalesce(n.aliquota, o.vat_rate));
  get diagnostics v_n = row_count;
  raise notice 'Commesse renova corrette: %', v_n;

  -- Controllo: nessuna commessa di renova con fatture IVA è rimasta al lordo.
  select count(*) into v_lordi
    from public.orders o
    join (select i.order_id,
                 sum(case when i.document_type = 'credit_note' then -i.total    else i.total    end) as lordo,
                 sum(case when i.document_type = 'credit_note' then -i.subtotal else i.subtotal end) as netto
            from public.invoices i
           where i.company_id = v_az and i.deleted_at is null and i.order_id is not null
           group by i.order_id) f on f.order_id = o.id
   where o.company_id = v_az and o.deleted_at is null
     and abs(f.lordo - f.netto) >= 0.01
     and f.netto >= 0
     and abs(o.total_amount - f.lordo) < 0.01;
  if v_lordi > 0 then
    raise exception 'Restano % commesse renova con l''importo IVA inclusa', v_lordi;
  end if;
end $$;
