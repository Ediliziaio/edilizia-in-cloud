-- Il costo generato dalla ricezione di un OdA era rintracciabile solo dal
-- testo del campo `name` ("OdA ODA-2026-037 - Fornitore X"). Cosi' nessuno
-- poteva rispondere in modo affidabile a due domande che contano:
--   1. questo ordine ha gia' prodotto un costo? (rischio doppio costo)
--   2. quale costo appartiene a quale ordine? (tre vie ordine-bolla-fattura)
-- Una colonna esplicita chiude entrambe.
--
-- ON DELETE SET NULL: se l'OdA sparisce il costo resta — e' gia' uscito dalla
-- cassa, cancellarlo falserebbe i conti.

alter table public.company_costs
  add column if not exists purchase_order_id uuid
  references public.purchase_orders(id) on delete set null;

comment on column public.company_costs.purchase_order_id is
  'Ordine d''acquisto che ha generato questo costo (ricezione merce). NULL per i costi inseriti a mano.';

create index if not exists idx_company_costs_purchase_order
  on public.company_costs(purchase_order_id)
  where purchase_order_id is not null;

-- Backfill dei costi gia' generati: il vecchio codice scriveva sempre
-- name = 'OdA <numero> - <fornitore>' e note = 'Generato automaticamente da OdA <numero>'.
-- Il numero OdA e' unico per azienda, quindi il match e' esatto entro company_id.
update public.company_costs c
set purchase_order_id = po.id
from public.purchase_orders po
where c.purchase_order_id is null
  and po.company_id = c.company_id
  and c.name like 'OdA ' || po.oda_number || ' -%';
