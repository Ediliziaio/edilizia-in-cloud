-- Non tutti gli acquisti nascono da un ordine spedito via email.
-- In edilizia se ne comprano di quattro modi diversi, e finora l'app ne
-- conosceva uno solo, obbligando tutti a passare per bozza -> inviato ->
-- confermato -> ricevuto anche quando la merce era gia' sul furgone:
--
--   email     l'ordine parte dal gestionale (percorso classico)
--   telefono  ordinato a voce, nessun documento
--   portale   comprato su un e-commerce o sul portale del fornitore:
--             esiste gia' una conferma d'ordine da allegare
--   documento ordine su carta/PDF (modulo del fornitore o il proprio firmato)
--   negozio   acquisto al banco: ordine, consegna e scontrino coincidono
--
-- La contabilita' non cambia: impegno quando si ordina, costo quando arriva
-- la merce. Cambia solo quali passaggi hanno senso mostrare.

alter table public.purchase_orders
  add column if not exists origine text not null default 'email';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'purchase_orders_origine_check'
      and conrelid = 'public.purchase_orders'::regclass
  ) then
    alter table public.purchase_orders
      add constraint purchase_orders_origine_check
      check (origine in ('email', 'telefono', 'portale', 'documento', 'negozio'));
  end if;
end $$;

comment on column public.purchase_orders.origine is
  'Come e'' stato piazzato l''ordine: email dal gestionale, a voce, e-commerce/portale fornitore, documento caricato, acquisto al banco. Determina quali passaggi di stato hanno senso.';

-- Le liste filtrano spesso per origine (es. "quanto compriamo al banco?").
create index if not exists idx_purchase_orders_origine
  on public.purchase_orders(company_id, origine);

-- Gli ordini gia' esistenti restano 'email': e' l'unico percorso che l'app
-- offriva finora, quindi e' anche l'unico che possono avere seguito.
