-- Il prezzo arriva dopo la merce: si valorizza il movimento esistente, mai un nuovo carico.
-- Il costo medio si ricalcola soltanto con uno storico completo e prezzi conosciuti.
set local lock_timeout='5s';
create unique index if not exists ddt_consegne_movimento_unico on public.ddt_consegne(movimento_id) where movimento_id is not null;

create or replace function public.ddt_prezzo_stock(p_company uuid,p_stock uuid)
returns void language plpgsql security definer set search_path=public as $$
declare s public.warehouse_stock%rowtype; m record; saldo numeric:=0; medio numeric:=0;
 prezzo numeric; incerto boolean:=false; incoerente boolean:=false; n integer:=0;
begin
 select * into s from warehouse_stock where id=p_stock and company_id=p_company for update;
 if not found then return; end if;
 -- Si corregge solo il prezzo dei movimenti riconducibili alla riga originale.
 update warehouse_movements w set unit_cost=r.prezzo_unitario
 from ddt_consegne c join ddt_righe r on r.id=c.riga_id and r.company_id=c.company_id
 where c.movimento_id=w.id and c.stock_item_id=s.id and c.company_id=p_company
 and w.company_id=p_company and c.tipo='ingresso' and r.prezzo_unitario is not null
 and w.unit_cost is distinct from r.prezzo_unitario;

 for m in
  select w.*,c.id as consegna_ddt,r.prezzo_unitario as prezzo_ddt
  from warehouse_movements w
  left join ddt_consegne c on c.movimento_id=w.id and c.company_id=p_company
  left join ddt_righe r on r.id=c.riga_id and r.company_id=p_company
  where w.stock_item_id=s.id and w.company_id=p_company
  order by w.created_at,w.id limit 10001
 loop
  n:=n+1;
  if n>10000 then incoerente:=true;exit;end if;
  if m.quantity is null or m.quantity<=0 then incoerente:=true;continue;end if;
  if m.movement_type='carico' then
   prezzo:=case when m.consegna_ddt is not null then m.prezzo_ddt else m.unit_cost end;
   if prezzo is null or (m.consegna_ddt is null and prezzo<=0) then incerto:=true;
   elsif coalesce(m.valorizza_medio,true) then
    medio:=case when saldo<=0 then prezzo else (saldo*medio+m.quantity*prezzo)/(saldo+m.quantity) end;
   end if;
   saldo:=saldo+m.quantity;
  elsif m.movement_type='scarico' then
   saldo:=saldo-m.quantity;
   if saldo<0 then incoerente:=true;end if;
   if saldo=0 then incerto:=false;medio:=0;end if;
  else incoerente:=true;
  end if;
 end loop;
 if n=0 or abs(saldo-s.quantity)>0.000001 then incoerente:=true;end if;
 if not incerto and not incoerente then
  update warehouse_stock set unit_cost=round(medio,4),prezzo_da_definire=false,updated_at=now() where id=s.id and company_id=p_company;
 elsif incerto or s.prezzo_da_definire then
  update warehouse_stock set prezzo_da_definire=true,updated_at=now() where id=s.id and company_id=p_company;
 end if;
end $$;
revoke all on function public.ddt_prezzo_stock(uuid,uuid) from public,anon,authenticated;

create or replace function public.ddt_prezzo_stock_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
declare stock uuid;
begin
 if tg_table_name='ddt_consegne' then
  if new.stock_item_id is not null then perform public.ddt_prezzo_stock(new.company_id,new.stock_item_id);end if;
 else
  for stock in select distinct stock_item_id from ddt_consegne where riga_id=new.id and company_id=new.company_id and stock_item_id is not null order by stock_item_id loop
   perform public.ddt_prezzo_stock(new.company_id,stock);
  end loop;
 end if;
 return new;
end $$;
revoke all on function public.ddt_prezzo_stock_trigger() from public,anon,authenticated;
create trigger ddt_consegna_prezzo_stock after insert on public.ddt_consegne for each row execute function public.ddt_prezzo_stock_trigger();
create trigger ddt_riga_prezzo_stock after update of prezzo_unitario on public.ddt_righe for each row when(old.prezzo_unitario is distinct from new.prezzo_unitario) execute function public.ddt_prezzo_stock_trigger();
