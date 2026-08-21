-- La commessa si ricorda da quale opportunità è nata.
--
-- La catena commerciale si spezzava all'ultimo anello: opportunità →
-- preventivo c'era (quotes.opportunity_id), preventivo → commessa c'era
-- (orders.quote_id), ma la commessa non sapeva nulla del deal. Il vinto
-- non si ricollegava mai al cantiere, e chiudere il cerchio nei report
-- era impossibile.
--
-- NIENTE conversione diretta opportunità→commessa: l'opportunità non ha
-- righe né prezzi. La commessa continua a nascere SOLO dal preventivo;
-- questa colonna registra il legame quando il fatto avviene.

alter table public.orders
  add column if not exists opportunity_id uuid references public.marketing_opportunities(id) on delete set null;

create index if not exists idx_orders_opportunity_id
  on public.orders (opportunity_id)
  where opportunity_id is not null;

comment on column public.orders.opportunity_id is
  'Opportunità CRM da cui questa commessa è nata (via preventivo convertito). Compilata da converti-preventivo-cantiere quando il preventivo era legato a un deal.';
