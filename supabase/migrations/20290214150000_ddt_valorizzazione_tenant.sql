-- Anche l’aggiornamento del prezzo verifica l’azienda della voce da valorizzare.
create or replace function public.ddt_valorizza_da_fattura(p_ddt uuid,p_fattura uuid,p_righe jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare d public.ddt_ricezione%rowtype; f public.fatture_ricevute%rowtype; r public.ddt_righe%rowtype; v public.ddt_valorizzazioni%rowtype;
 x jsonb; q numeric; prezzo numeric; totale_q numeric; medio numeric; n integer:=0;
begin
 select * into d from ddt_ricezione where id=p_ddt for update;
 if not found or auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno() or not coalesce(public.user_can_access_company(d.company_id),false)
 or not coalesce(public.has_permission_for_company(auth.uid(),'can_manage_purchasing',d.company_id) or public.e_super_admin_dentro(d.company_id),false) then raise exception 'Non puoi valorizzare questa bolla' using errcode='42501'; end if;
 select * into f from fatture_ricevute where id=p_fattura and company_id=d.company_id for update;
 if not found or d.supplier_id is null or not exists(select 1 from suppliers s where s.id=d.supplier_id and s.company_id=d.company_id and (f.fornitore_id=s.id or (nullif(regexp_replace(upper(coalesce(f.cedente_piva,'')),'^IT|[^A-Z0-9]','','g'),'') is not null and regexp_replace(upper(coalesce(f.cedente_piva,'')),'^IT|[^A-Z0-9]','','g')=regexp_replace(upper(coalesce(s.vat_number,'')),'^IT|[^A-Z0-9]','','g')))) then raise exception 'La fattura deve appartenere allo stesso fornitore e alla stessa azienda' using errcode='42501'; end if;
 if jsonb_typeof(p_righe) is distinct from 'array' or jsonb_array_length(p_righe) not between 1 and 500 then raise exception 'Scegli le righe della fattura da confrontare'; end if;
 for x in select * from jsonb_array_elements(p_righe) loop
  select * into r from ddt_righe where id=nullif(x->>'riga_id','')::uuid and ddt_ricezione_id=d.id for update;
  if not found then raise exception 'La riga non appartiene alla bolla' using errcode='42501'; end if;
  q:=nullif(x->>'quantita','')::numeric;prezzo:=nullif(x->>'prezzo_unitario','')::numeric;
  if q is null or q<=0 or q>1000000000 or q::text in ('NaN','Infinity','-Infinity') or prezzo is null or prezzo<0 or prezzo>1000000000 or prezzo::text in ('NaN','Infinity','-Infinity') then raise exception 'Controlla quantità fatturata e prezzo unitario IVA esclusa'; end if;
  select * into v from ddt_valorizzazioni where fattura_id=f.id and riga_id=r.id;
  if found then
   if v.quantita<>q or v.prezzo_unitario<>prezzo then raise exception 'Questa riga è già stata valorizzata con dati diversi: controlla la fattura e la registrazione precedente'; end if;
   continue;
  end if;
  if r.quantita is null or q+(select coalesce(sum(quantita),0) from ddt_valorizzazioni where riga_id=r.id)>r.quantita then raise exception 'Le quantità fatturate superano la quantità sulla bolla'; end if;
  insert into ddt_valorizzazioni(company_id,ddt_id,riga_id,fattura_id,quantita,prezzo_unitario,created_by) values(d.company_id,d.id,r.id,f.id,q,prezzo,auth.uid());
  select sum(quantita),sum(quantita*prezzo_unitario)/nullif(sum(quantita),0) into totale_q,medio from ddt_valorizzazioni where riga_id=r.id;
  -- Una valorizzazione parziale resta visibile come parziale, senza fingere che tutti i prezzi siano noti.
  if totale_q>=r.quantita then
   update ddt_righe set prezzo_unitario=medio,importo=round(r.quantita*medio,2) where id=r.id;
   update order_items set purchase_price=medio,prezzo_da_definire=false,updated_at=now() where ddt_riga_origine_id=r.id and exists(select 1 from orders o where o.id=order_items.order_id and o.company_id=d.company_id);
  end if;
  n:=n+1;
 end loop;
 if not exists(select 1 from fattura_ddt where fattura_ricevuta_id=f.id and ddt_ricezione_id=d.id) then
  insert into fattura_ddt(company_id,fattura_ricevuta_id,ddt_ricezione_id,numero_ddt,data_ddt,origine,created_by) values(d.company_id,f.id,d.id,d.numero_ddt,d.data_ricezione,'manuale',auth.uid());
 end if;
 return jsonb_build_object('righe',n,'fattura_id',f.id);
end $$;
revoke all on function public.ddt_valorizza_da_fattura(uuid,uuid,jsonb) from public,anon;
grant execute on function public.ddt_valorizza_da_fattura(uuid,uuid,jsonb) to authenticated;
