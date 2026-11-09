-- Reverse charge sugli ordini: la scelta sta in purchase_orders.document_details
-- (inversioneContabile), il fornitore può averla come predefinita, e ogni riga che entra
-- in un ordine in reverse charge nasce a IVA zero, da qualunque parte arrivi (dettaglio
-- ordine, ordina per fornitore, magazzino, WhatsApp): così i totali e la previsione di
-- cassa non contano un'IVA che al fornitore non si paga.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.suppliers
  add column if not exists inversione_contabile boolean not null default false;

create or replace function public.ordine_nasce_in_reverse_charge()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.supplier_id is not null
     and coalesce(new.document_details ->> 'inversioneContabile', '') = ''
     and exists (select 1 from public.suppliers s
                  where s.id = new.supplier_id and s.company_id = new.company_id and s.inversione_contabile) then
    new.document_details := coalesce(new.document_details, '{}'::jsonb) || '{"inversioneContabile": true}'::jsonb;
  end if;
  return new;
end
$$;
revoke all on function public.ordine_nasce_in_reverse_charge() from public, anon;

drop trigger if exists b_po_nasce_in_reverse_charge on public.purchase_orders;
create trigger b_po_nasce_in_reverse_charge
  before insert on public.purchase_orders
  for each row execute function public.ordine_nasce_in_reverse_charge();

create or replace function public.riga_ordine_iva_reverse_charge()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.purchase_orders o
              where o.id = new.purchase_order_id
                and o.document_details ->> 'inversioneContabile' = 'true') then
    new.vat_rate := 0;
  end if;
  return new;
end
$$;
revoke all on function public.riga_ordine_iva_reverse_charge() from public, anon;

drop trigger if exists b_poi_iva_reverse_charge on public.purchase_order_items;
create trigger b_poi_iva_reverse_charge
  before insert on public.purchase_order_items
  for each row execute function public.riga_ordine_iva_reverse_charge();
