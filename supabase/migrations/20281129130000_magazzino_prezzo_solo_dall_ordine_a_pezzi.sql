-- Il prezzo che entra nel medio del magazzino: solo dall'ordine d'acquisto, solo
-- a pezzi, solo se le quantità parlano della stessa cosa.
--
-- Questa migrazione chiude il filtro aperto in 20281129120000. Il filtro
-- sull'unità di misura non bastava, per due motivi scoperti provandolo sui dati
-- veri:
--
-- 1. `unita_confrontabile('')` restituisce 'pz'. Le righe di commessa hanno
--    `unita_misura` a null molto spesso, quindi passavano tutte come «a pezzi»
--    anche quando non lo erano. La riga che ha fatto emergere il problema —
--    «Cementi, malte e rasanti», 1 unità a 3.776,60 €, agganciata a un articolo
--    di magazzino che si conta a sacchi da 7,50 € — passava ancora dal ripiego
--    su `order_items.purchase_price` e portava il medio della scheda da 7,50 a
--    3.776,60.
-- 2. Un prezzo per unità è attendibile solo se la quantità che si sta caricando
--    conta la stessa cosa della quantità comprata. Se si caricano 10 pezzi su
--    una riga che ne ha comprato 1, i due numeri non stanno contando la stessa
--    cosa: il prezzo non si può dividere.
--
-- Quindi, da qui in avanti, per un carico che non dice quanto è stato pagato:
--   • il prezzo si prende SOLO dalle righe dell'ordine d'acquisto la cui unità
--     di misura è scritta ed è un pezzo. Sui dati di oggi le righe d'ordine hanno
--     sempre l'unità scritta: 864 «corpo» e 215 «pz». Le prime non entrano, e
--     fanno bene: 3.776,60 € a corpo non sono 3.776,60 € il pezzo.
--   • e solo se la quantità del carico non supera quella comprata.
--   • il ripiego su `order_items.purchase_price` NON c'è più: l'unità lì è vuota
--     troppo spesso perché quel numero possa dirsi un prezzo per pezzo.
--
-- Quando il prezzo non è attendibile la funzione non restituisce niente, il
-- congelamento ripiega sul medio della scheda e **il medio non si muove**. Un
-- medio che resta fermo si vede e si corregge; un medio sbagliato di cinquecento
-- volte entra in tutte le commesse che prelevano quell'articolo.
--
-- Resta la strada diretta per chi il prezzo lo conosce: passare `unit_cost` sul
-- movimento. È quello che fa `batch_carico_from_scans` quando l'operatore scrive
-- il prezzo della bolla, ed è la strada da usare per i percorsi di carico che
-- un domani vorranno valorizzare il magazzino col prezzo vero.

drop function if exists public.magazzino_prezzo_acquisto_riga(uuid);

create or replace function public.magazzino_prezzo_acquisto_riga(
  p_order_item uuid,
  p_quantita numeric default null
) returns numeric
language sql stable security definer
set search_path = public
as $$
  select case
    -- Niente da dividere, o si sta caricando più di quanto comprato: i due
    -- numeri non contano la stessa cosa, il prezzo non è attendibile.
    when coalesce(o.quantita, 0) <= 0 then null
    when p_quantita is not null and p_quantita > o.quantita + 0.0001 then null
    else round(o.valore / o.quantita, 4)
  end
  from (
    select sum(poi.quantity) as quantita,
           sum(coalesce(poi.line_total,
                        poi.quantity * poi.unit_price * (1 - coalesce(poi.discount_percent, 0) / 100))) as valore
      from public.purchase_order_items poi
      join public.purchase_orders po on po.id = poi.purchase_order_id
     where poi.order_item_id = p_order_item
       and po.status in ('inviato', 'confermato', 'parziale', 'ricevuto')
       -- L'unità deve essere scritta ED essere un pezzo: `unita_confrontabile`
       -- fa diventare 'pz' anche l'unità vuota, e il vuoto non è una garanzia.
       and coalesce(btrim(poi.unit_of_measure), '') <> ''
       and public.unita_confrontabile(poi.unit_of_measure) = 'pz'
  ) o
$$;

comment on function public.magazzino_prezzo_acquisto_riga(uuid, numeric) is
  'Prezzo unitario pagato per una riga di commessa, PER PEZZO, dalle sole righe d''ordine d''acquisto con unità scritta e a pezzi, e solo se la quantità che si carica non supera quella comprata. Null quando non è attendibile: chi lo chiama lascia il medio della scheda dov''è.';

revoke all on function public.magazzino_prezzo_acquisto_riga(uuid, numeric) from public, anon;
grant execute on function public.magazzino_prezzo_acquisto_riga(uuid, numeric) to authenticated, service_role;

-- Il congelamento passa anche la quantità, così la funzione può rifiutare.
create or replace function public.warehouse_movement_snapshot_unit_cost()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_prezzo numeric;
begin
  if new.unit_cost is not null then
    return new;
  end if;

  -- Un carico che non dice quanto è stato pagato: si guarda l'ordine d'acquisto
  -- della riga di commessa. I rientri dalla commessa no: quelli il costo lo
  -- portano già, ed è quello con cui la merce era uscita.
  if new.movement_type = 'carico'
     and new.order_item_id is not null
     and not coalesce(new.rientro_commessa, false) then
    v_prezzo := public.magazzino_prezzo_acquisto_riga(new.order_item_id, new.quantity);
    if coalesce(v_prezzo, 0) > 0 then
      new.unit_cost := round(v_prezzo, 4);
      return new;
    end if;
  end if;

  select ws.unit_cost
   into new.unit_cost
    from public.warehouse_stock ws
   where ws.id = new.stock_item_id
     -- Alcuni percorsi legacy valorizzano company_id con un secondo trigger
     -- BEFORE INSERT. Lo stock_item_id resta comunque univoco: non perdiamo
     -- il costo se questo trigger viene eseguito per primo.
     and (new.company_id is null or ws.company_id = new.company_id);
  return new;
end;
$$;
