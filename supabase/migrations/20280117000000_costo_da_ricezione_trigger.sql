-- Il costo della fornitura deve nascere QUANDO l'ordine risulta ricevuto,
-- da QUALUNQUE strada ci arrivi.
--
-- Prima lo creava solo il pulsante "Ricevuto" nel browser: chi riceveva via
-- scanner (receive_from_oda_via_scans mette status='ricevuto' ma non tocca i
-- costi) o da un percorso futuro qualsiasi otteneva un ordine chiuso che NON
-- esisteva per la cassa ne' per i costi aziendali. Merce in magazzino, zero
-- da pagare: il buco perfetto.
--
-- Un trigger sul passaggio di stato chiude tutte le strade in un colpo:
-- pulsante, scanner, edge functions, Silvio, quello che verra'.
--
-- Il client NON inserisce piu' il costo (il codice frontend viene svuotato in
-- pari data): se lo facesse ancora, il controllo NOT EXISTS qui sotto e il
-- pre-check gia' presente nel client si coprono a vicenda.

create or replace function public.crea_costo_da_ricezione_oda()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_fornitore  record;
  v_termini    text;
  v_giorni     int;
  v_scadenza   date;
  v_vat        numeric;
begin
  -- Solo sul VERO passaggio a ricevuto, una volta sola.
  if new.status <> 'ricevuto' or old.status = 'ricevuto' then
    return new;
  end if;
  -- Idempotenza: un ordine puo' ripassare di qui (ripristini, doppi update).
  if exists (select 1 from company_costs c where c.purchase_order_id = new.id) then
    return new;
  end if;
  -- Un ordine senza importo non ha niente da pagare: un costo a zero sarebbe
  -- solo rumore in tesoreria.
  if coalesce(new.subtotal, 0) <= 0 then
    return new;
  end if;

  select name, payment_method into v_fornitore
  from suppliers where id = new.supplier_id;

  -- Scadenza dai termini di pagamento: quelli dell'ordine, o quelli abituali
  -- del fornitore. Stessa grammatica del parser frontend
  -- (src/lib/terminiPagamento.ts): "30 gg", "60 giorni", "fine mese",
  -- "alla consegna". Testo incomprensibile => si paga oggi, dichiaratamente:
  -- meglio di una data inventata con l'aria di essere giusta.
  v_termini := coalesce(nullif(new.payment_terms, ''), v_fornitore.payment_method, '');
  if v_termini ~* '(alla\s+consegna|a\s+vista|contanti|immediato|anticipat)' then
    v_giorni := 0;
  else
    v_giorni := nullif((regexp_match(v_termini, '(\d{1,3})\s*(?:gg|giorni|g\.?g\.?|days?|dd)', 'i'))[1], '')::int;
  end if;

  if v_giorni is null then
    v_scadenza := current_date;
  elsif v_termini ~* '(fine\s*mese|f\.?\s*m\.?)' then
    v_scadenza := (date_trunc('month', current_date + v_giorni) + interval '1 month - 1 day')::date;
  else
    v_scadenza := current_date + v_giorni;
  end if;

  v_vat := case when coalesce(new.vat_total, 0) > 0 and new.subtotal > 0
                then round(new.vat_total / new.subtotal * 100)
                else 22 end;

  insert into company_costs (
    company_id, purchase_order_id, order_id, supplier_id,
    name, cost_type, amount, vat_rate, category, recurrence,
    due_date, is_paid, notes
  ) values (
    new.company_id, new.id, new.order_id, new.supplier_id,
    'OdA ' || new.oda_number || ' - ' || coalesce(v_fornitore.name, 'Fornitore'),
    'variable', new.subtotal, v_vat, 'materiali', 'once',
    v_scadenza, false,
    'Generato automaticamente alla ricezione di ' || new.oda_number
  );

  return new;
end $$;

drop trigger if exists trg_po_costo_da_ricezione on public.purchase_orders;
create trigger trg_po_costo_da_ricezione
  after update of status on public.purchase_orders
  for each row execute function public.crea_costo_da_ricezione_oda();

-- Niente backfill sui 26 "ricevuto" storici: sono dati dimostrativi, e
-- creargli costi con scadenza di oggi inquinerebbe la cassa piu' di quanto
-- la completi. Da qui in avanti nessuna strada resta scoperta.
