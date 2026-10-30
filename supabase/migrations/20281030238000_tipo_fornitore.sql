-- Il tipo del fornitore: decide dove va il costo delle sue fatture (30/10/2026).
--
-- TIM, il grossista di materiali e la ditta in subappalto erano la stessa cosa:
-- un fornitore con una categoria scritta a mano (213 su 330 senza). Ora un tipo
-- fisso tra otto (src/lib/fornitori/tipiFornitore.ts): materiali, subappalto,
-- noli_servizi, professionisti, mezzi, agenti, generali, finanza_enti. La
-- categoria libera (product_category) resta come dettaglio.
-- subappaltatore_id collega la scheda fornitore a quella del subappaltatore
-- (contratti, SAL, documenti): oggi sono due elenchi separati, 9 in comune su 187.
-- Solo struttura: nessuna riga cambia.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.suppliers add column if not exists tipo text;
alter table public.suppliers drop constraint if exists suppliers_tipo_check;
alter table public.suppliers add constraint suppliers_tipo_check check (
  tipo is null or tipo in ('materiali', 'subappalto', 'noli_servizi', 'professionisti', 'mezzi', 'agenti', 'generali', 'finanza_enti')
);
comment on column public.suppliers.tipo is 'Dove va il costo: materiali, subappalto, noli_servizi, professionisti, mezzi, agenti, generali, finanza_enti (src/lib/fornitori/tipiFornitore.ts)';

alter table public.suppliers add column if not exists subappaltatore_id uuid references public.subappaltatori(id) on delete set null;
create index if not exists suppliers_subappaltatore_idx on public.suppliers(subappaltatore_id) where subappaltatore_id is not null;
create index if not exists suppliers_company_tipo_idx on public.suppliers(company_id, tipo);

-- La scheda del subappaltatore deve essere della stessa azienda.
create or replace function public.supplier_subappaltatore_stessa_azienda()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.subappaltatore_id is not null
     and not exists (select 1 from public.subappaltatori s where s.id = new.subappaltatore_id and s.company_id = new.company_id) then
    raise exception using errcode = '42501', message = 'Il subappaltatore non è di questa azienda.';
  end if;
  return new;
end $$;
revoke all on function public.supplier_subappaltatore_stessa_azienda() from public, anon, authenticated;

drop trigger if exists supplier_subappaltatore_stessa_azienda on public.suppliers;
create trigger supplier_subappaltatore_stessa_azienda
  before insert or update of subappaltatore_id, company_id on public.suppliers
  for each row execute function public.supplier_subappaltatore_stessa_azienda();
