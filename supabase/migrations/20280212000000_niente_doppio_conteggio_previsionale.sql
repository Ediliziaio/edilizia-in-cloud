-- Lo stesso acquisto non può pesare due volte sulla cassa prevista.
--
-- Il previsionale somma DUE fonti di uscita:
--   · gli articoli di commessa ancora "da ordinare/ordinato" (stima, presa da
--     order_items.purchase_price);
--   · i costi non pagati (company_costs), tra cui quello che nasce da solo
--     alla ricezione dell'ODA (trigger 20280117) e adesso anche quello che
--     nasce contabilizzando la fattura del fornitore.
--
-- Quando l'ODA viene ricevuto il costo compare, ma l'articolo NON cambia stato
-- da solo (in_magazzino lo mette una persona, e a volte la merce va dritta in
-- cantiere): da quel momento lo stesso euro è contato due volte, una come
-- articolo da pagare e una come costo da pagare.
--
-- Oggi in produzione i casi sono zero perché i 26 ODA storici "ricevuto" sono
-- rimasti senza costo per scelta. È una fortuna, non una garanzia: questa
-- vista è la garanzia.

create or replace view public.v_articoli_gia_a_costo
with (security_invoker = true) as
select distinct
  poi.order_item_id,
  cc.company_id,
  cc.id  as company_cost_id,
  cc.purchase_order_id
from public.purchase_order_items poi
join public.company_costs cc
  on cc.purchase_order_id = poi.purchase_order_id
where poi.order_item_id is not null;

comment on view public.v_articoli_gia_a_costo is
  'Articoli di commessa il cui acquisto è GIÀ diventato un costo (via ODA ricevuto o fattura contabilizzata). Il previsionale li esclude dalle uscite stimate per non contare due volte lo stesso euro.';

grant select on public.v_articoli_gia_a_costo to authenticated;
