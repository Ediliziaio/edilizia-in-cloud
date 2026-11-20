set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.purchase_order_items
  add column if not exists destinazioni_previste jsonb not null default '[]'::jsonb;

create or replace function private.oda_normalizza_destinazioni_riga()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  ordine public.purchase_orders%rowtype;
  voce jsonb;
  destinazione_id uuid;
  tipo text;
  nome text;
  indirizzo text;
  quantita numeric;
  totale numeric := 0;
  piano jsonb := '[]'::jsonb;
  chiavi text[] := '{}';
  titolo text;
begin
  if tg_op = 'UPDATE' and old.destinazioni_previste = new.destinazioni_previste
      and new.quantity = old.quantity and new.order_item_id is not distinct from old.order_item_id
      and new.purchase_order_id = old.purchase_order_id and new.company_id = old.company_id then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.destinazioni_previste is distinct from old.destinazioni_previste
      and greatest(new.quantity_received, old.quantity_received) > 0 then
    raise exception 'La consegna è iniziata. Modifica la destinazione dalle consegne registrate.' using errcode = '23514';
  end if;
  if new.destinazioni_previste = '[]'::jsonb then return new; end if;
  if jsonb_typeof(new.destinazioni_previste) is distinct from 'array'
      or jsonb_array_length(new.destinazioni_previste) > 30 then
    raise exception 'Indica al massimo 30 destinazioni per articolo.' using errcode = '22023';
  end if;
  select * into ordine from public.purchase_orders p
    where p.id = new.purchase_order_id and p.company_id = new.company_id for share;
  if not found then raise exception 'Ordine d’acquisto non disponibile.' using errcode = '42501'; end if;

  for voce in select value from jsonb_array_elements(new.destinazioni_previste) loop
    tipo := voce->>'tipo';
    if jsonb_typeof(voce) is distinct from 'object' or tipo is null or tipo not in ('commessa', 'magazzino')
      or coalesce(voce->>'id', '') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
      or jsonb_typeof(voce->'quantita') is distinct from 'number'
      or coalesce(voce->>'quantita', '') !~ '^[0-9]{1,9}(\.[0-9]{1,3})?$' then
      raise exception 'Destinazione o quantità non valida. Usa al massimo tre decimali.' using errcode = '22023';
    end if;
    destinazione_id := (voce->>'id')::uuid;
    quantita := (voce->>'quantita')::numeric;
    titolo := tipo || ':' || destinazione_id;
    if quantita <= 0 or titolo = any(chiavi) then
      raise exception 'Usa quantità positive e una riga per ogni destinazione.' using errcode = '23514';
    end if;
    if ordine.order_id is not null and (tipo <> 'commessa' or destinazione_id <> ordine.order_id) then
      raise exception 'Per distribuire l’ordine su più destinazioni, rimuovi la commessa dalla testata.' using errcode = '23514';
    end if;
    if new.order_item_id is not null and not exists (
      select 1 from public.order_items r join public.orders c on c.id = r.order_id
      where r.id = new.order_item_id and c.company_id = new.company_id and c.id = destinazione_id and tipo = 'commessa'
    ) then
      raise exception 'Questa voce è collegata a un materiale di commessa. Aggiungi una voce d’acquisto per un’altra destinazione.' using errcode = '23514';
    end if;
    if tipo = 'commessa' then
      select coalesce(nullif(btrim(c.order_code),''), 'Cantiere'), c.work_address
        into nome, indirizzo from public.orders c
        where c.id = destinazione_id and c.company_id = new.company_id and c.deleted_at is null;
    else
      select w.name, null::text into nome, indirizzo from public.warehouses w
        where w.id = destinazione_id and w.company_id = new.company_id and w.is_active;
    end if;
    if not found then raise exception 'Destinazione non disponibile per questa azienda.' using errcode = '42501'; end if;
    chiavi := array_append(chiavi,titolo);
    totale := totale + quantita;
    piano := piano || jsonb_build_array(jsonb_build_object('tipo',tipo,'id',destinazione_id,'quantita',quantita,
      'nome',nome,'indirizzo',indirizzo));
  end loop;
  if totale <> new.quantity then
    raise exception 'Le destinazioni coprono % su % unità.', totale, new.quantity using errcode = '23514';
  end if;
  new.destinazioni_previste := piano;
  return new;
end $$;
revoke all on function private.oda_normalizza_destinazioni_riga() from public, anon, authenticated;
drop trigger if exists a_oda_destinazioni_riga on public.purchase_order_items;
create trigger a_oda_destinazioni_riga before insert or update of destinazioni_previste,quantity,order_item_id,purchase_order_id,company_id
  on public.purchase_order_items for each row execute function private.oda_normalizza_destinazioni_riga();

create or replace function private.oda_verifica_commessa_testata()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.order_id is distinct from old.order_id and new.order_id is not null and exists (
    select 1 from public.purchase_order_items r cross join lateral jsonb_array_elements(r.destinazioni_previste) d
    where r.purchase_order_id = new.id and r.company_id = new.company_id
      and (d->>'tipo' <> 'commessa' or (d->>'id')::uuid <> new.order_id)
  ) then
    raise exception 'Quest’ordine ha destinazioni diverse sulle righe. Controlla la ripartizione prima di scegliere una sola commessa.' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function private.oda_verifica_commessa_testata() from public, anon, authenticated;
drop trigger if exists a_oda_destinazioni_testata on public.purchase_orders;
create trigger a_oda_destinazioni_testata before update of order_id
  on public.purchase_orders for each row execute function private.oda_verifica_commessa_testata();

notify pgrst, 'reload schema';
