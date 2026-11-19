set local lock_timeout='3s';
set local statement_timeout='60s';

-- Il valore precedente resta disponibile. Le anagrafiche esistenti lo leggono
-- come prima categoria senza un UPDATE massivo; al salvataggio viene normalizzato.
alter table public.suppliers add column if not exists product_categories text[] not null default array[]::text[];

create or replace function public.fornitore_allinea_categorie()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_categorie text[];
begin
  v_categorie:=coalesce(new.product_categories,array[]::text[]);
  if tg_op='INSERT' then
    if cardinality(v_categorie)=0 and nullif(btrim(new.product_category),'') is not null then
      v_categorie:=array[new.product_category];
    end if;
  elsif new.product_categories is not distinct from old.product_categories then
    if new.product_category is distinct from old.product_category then
      -- Un vecchio chiamante cambia solo la prima categoria: le altre restano.
      v_categorie:=array_prepend(new.product_category,array_remove(v_categorie,old.product_category));
    elsif cardinality(v_categorie)=0 and nullif(btrim(new.product_category),'') is not null then
      v_categorie:=array[new.product_category];
    end if;
  end if;

  select coalesce(array_agg(nome order by posizione),array[]::text[]) into new.product_categories
  from (
    select distinct on (lower(regexp_replace(btrim(valore),'[[:space:]]+',' ','g')))
      regexp_replace(btrim(valore),'[[:space:]]+',' ','g') as nome,posizione
    from unnest(v_categorie) with ordinality as c(valore,posizione)
    where nullif(btrim(valore),'') is not null
    order by lower(regexp_replace(btrim(valore),'[[:space:]]+',' ','g')),posizione
  ) categorie;
  if cardinality(new.product_categories)>30 then
    raise exception 'Puoi assegnare al massimo 30 categorie a un fornitore.' using errcode='22023';
  end if;
  new.product_category:=new.product_categories[1];
  return new;
end; $$;
revoke all on function public.fornitore_allinea_categorie() from public,anon,authenticated;
drop trigger if exists fornitore_allinea_categorie on public.suppliers;
create trigger fornitore_allinea_categorie before insert or update of product_category,product_categories
  on public.suppliers for each row execute function public.fornitore_allinea_categorie();
comment on column public.suppliers.product_categories is 'Categorie merceologiche multiple. Per le anagrafiche precedenti usare product_category come prima categoria se l''array è vuoto. Il tipo contabile resta in tipo.';
notify pgrst,'reload schema';
