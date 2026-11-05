-- Il prezzo che entra nel medio del magazzino deve essere un prezzo PER PEZZO.
--
-- `magazzino_prezzo_acquisto_riga` (20281129100000) ricava il prezzo pagato
-- dall'ordine d'acquisto che copre la riga di commessa. Provandola sui dati veri
-- è venuto fuori il caso che rovina tutto: una riga «Cementi, malte e rasanti»
-- comprata **1 corpo a 3.776,60 €**, agganciata a un articolo di magazzino che si
-- conta a pezzi e vale 7,50 € l'uno. Quel prezzo non è 3.776,60 € il pezzo: è
-- 3.776,60 € l'intera fornitura. Caricando 10 pezzi, il medio della scheda saliva
-- da 7,50 a 3.776,60 — cioè esattamente l'errore di prezzo che il medio doveva
-- evitare.
--
-- `warehouse_stock.quantity` è un intero: il magazzino conta PEZZI e non ha unità
-- di misura. Quindi un prezzo al metro quadro, al chilo, al sacco o a corpo non è
-- un prezzo per pezzo e non può entrare nel medio. Da qui in avanti il prezzo si
-- prende solo dalle righe la cui unità di misura è un pezzo
-- (`unita_confrontabile(...) = 'pz'`, che è anche ciò che restituisce per l'unità
-- vuota: la convenzione del progetto).
--
-- Quando il prezzo non è attendibile la funzione non restituisce niente, e il
-- congelamento ripiega sul medio della scheda: il medio resta quello di prima.
-- Meglio un medio che non si muove che un medio sbagliato di cinquecento volte.

create or replace function public.magazzino_prezzo_acquisto_riga(p_order_item uuid)
returns numeric
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    -- L'ordine d'acquisto che copre la riga, solo le righe a pezzi, al netto
    -- dello sconto (la stessa formula di `oda_copertura_righe`).
    (select sum(coalesce(poi.line_total,
                         poi.quantity * poi.unit_price * (1 - coalesce(poi.discount_percent, 0) / 100)))
              / nullif(sum(poi.quantity), 0)
       from public.purchase_order_items poi
       join public.purchase_orders po on po.id = poi.purchase_order_id
      where poi.order_item_id = p_order_item
        and po.status in ('inviato', 'confermato', 'parziale', 'ricevuto')
        and public.unita_confrontabile(poi.unit_of_measure) = 'pz'),
    -- Altrimenti il prezzo d'acquisto della riga di commessa, alle stesse condizioni.
    (select nullif(oi.purchase_price, 0)
       from public.order_items oi
      where oi.id = p_order_item
        and public.unita_confrontabile(oi.unita_misura) = 'pz')
  )
$$;

comment on function public.magazzino_prezzo_acquisto_riga(uuid) is
  'Prezzo unitario pagato per una riga di commessa, PER PEZZO: dall''ordine d''acquisto che la copre (sconto incluso), altrimenti dal prezzo d''acquisto della riga. Solo righe a pezzi: il magazzino conta pezzi, e un prezzo a corpo o a mq non è un prezzo per pezzo. Senza una risposta attendibile restituisce null e il medio della scheda resta quello di prima.';
