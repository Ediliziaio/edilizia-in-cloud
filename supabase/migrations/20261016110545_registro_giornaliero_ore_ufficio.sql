-- Locale: riusa il registro rapportini e il suo trigger dei costi. Nessuna policy o permesso di piano cambiato.
alter table public.campo_rapportini add column if not exists ufficio_employee_id uuid references public.employees(id);
alter table public.campo_rapportini add column if not exists ufficio_created_by uuid references public.profiles(id);
create unique index if not exists ufficio_ore_un_giorno on public.campo_rapportini(company_id,order_id,data_lavoro,ufficio_employee_id)
 where ufficio_employee_id is not null and stato <> 'rifiutato';
alter table public.order_employees add column if not exists planned_hours numeric check(planned_hours >= 0 and planned_hours < 'Infinity'::numeric);
alter table public.order_employees add column if not exists planned_hourly_rate numeric check(planned_hourly_rate >= 0 and planned_hourly_rate < 'Infinity'::numeric);

create or replace function public.ufficio_registra_ore(p_request_id uuid,p_order_id uuid,p_employee_id uuid,p_giorno date,p_ore numeric,p_note text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c uuid; assigned uuid; r public.campo_rapportini; tariffa numeric; n text; totale numeric;
begin
 if auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno() then
  raise exception 'Sessione non autorizzata.' using errcode='42501'; end if;
 select company_id,assigned_to into c,assigned from public.orders where id=p_order_id and deleted_at is null;
 perform public.assert_company_access(c);
 if c is null or c is distinct from public.get_effective_company_id()
  or public.has_permission_for_company(auth.uid(),'can_edit_orders',c) is not true
  or public.has_permission_for_company(auth.uid(),'can_view_orders',c) is not true
  or public.has_permission_for_company(auth.uid(),'can_view_employees',c) is not true
  or public.has_permission_for_company(auth.uid(),'can_view_giornale_lavori',c) is not true
  or public.check_staff_visibility(auth.uid(),assigned) is not true
  or public.campo_e_ufficio(c) is not true then
  raise exception 'Non hai il permesso di registrare ore su questa commessa.' using errcode='42501'; end if;
 if p_request_id is null or p_giorno is null or p_giorno > (now() at time zone 'Europe/Rome')::date
  or p_ore is null or p_ore::text in ('NaN','Infinity','-Infinity') or p_ore<=0 or p_ore>24 or scale(p_ore)>2
  or length(coalesce(p_note,''))>4000 then raise exception 'Inserisci una data non futura e ore valide, maggiori di zero e fino a 24 (massimo due decimali).'; end if;
 select trim(concat_ws(' ',first_name,last_name)) into n from public.employees where id=p_employee_id and company_id=c and is_active is true for share;
 if not found then raise exception 'Dipendente non disponibile in questa azienda.' using errcode='42501'; end if;
 -- Un lock per persona/giorno protegge anche inserimenti simultanei su cantieri diversi.
 perform pg_advisory_xact_lock(hashtextextended(c::text||p_employee_id::text||p_giorno::text,0));
 select * into r from public.campo_rapportini where id=p_request_id;
 if found then
  if r.ufficio_created_by is distinct from auth.uid() or r.company_id<>c or r.order_id<>p_order_id
   or r.ufficio_employee_id is distinct from p_employee_id or r.data_lavoro<>p_giorno or r.ore_lavorate<>p_ore
   or coalesce(r.note,'')<>coalesce(nullif(trim(p_note),''),'') then raise exception 'Richiesta già utilizzata per un altro inserimento.'; end if;
  if r.stato='rifiutato' then raise exception 'Questa richiesta è già stata annullata. Registra una nuova giornata.'; end if;
  return jsonb_build_object('id',r.id,'stato',r.stato,'da_valorizzare',r.stato='inviato');
 end if;
 if exists(select 1 from public.campo_rapportini cr cross join lateral jsonb_array_elements(public.campo_presenze_effettive(cr)) p
  where cr.company_id=c and cr.order_id=p_order_id and cr.data_lavoro=p_giorno and cr.stato in ('inviato','approvato') and p->>'employee_id'=p_employee_id::text and coalesce((p->>'ore')::numeric,0)>0) then
  raise exception 'Questa persona ha già ore o un rapportino in attesa su questo cantiere per il giorno scelto. Verifica la registrazione esistente prima di aggiungerne un’altra.'; end if;
 select coalesce(sum((p->>'ore')::numeric),0) into totale from public.campo_rapportini cr
 cross join lateral jsonb_array_elements(public.campo_presenze_effettive(cr)) p
 where cr.company_id=c and cr.data_lavoro=p_giorno and cr.stato in ('inviato','approvato') and p->>'employee_id'=p_employee_id::text;
 if totale+p_ore>24 then raise exception 'La giornata supera 24 ore sommando tutti i cantieri, incluse le ore in attesa.'; end if;
 tariffa := public.costo_orario_dipendente(p_employee_id);
 -- user_id NULL: l'autore amministrativo è separato dal dipendente, che può non avere un account.
 insert into public.campo_rapportini(id,company_id,order_id,user_id,role_type,data_lavoro,ore_lavorate,ore_straordinario,descrizione_lavori,note,presenze,source,stato,ufficio_employee_id,ufficio_created_by)
 values(p_request_id,c,p_order_id,null,'employee',p_giorno,p_ore,0,'Ore registrate dall’ufficio',nullif(trim(p_note),''),jsonb_build_array(jsonb_build_object('employee_id',p_employee_id,'nome',n,'ore',p_ore)),'manual','inviato',p_employee_id,auth.uid());
 if tariffa>0 then
  update public.campo_rapportini set stato='approvato',approvato=true,approvato_da=auth.uid(),approvato_at=now() where id=p_request_id;
 end if;
 return jsonb_build_object('id',p_request_id,'stato',case when tariffa>0 then 'approvato' else 'inviato' end,'da_valorizzare',coalesce(tariffa,0)<=0);
end $$;
revoke all on function public.ufficio_registra_ore(uuid,uuid,uuid,date,numeric,text) from public,anon;
grant execute on function public.ufficio_registra_ore(uuid,uuid,uuid,date,numeric,text) to authenticated;

create or replace function public.ufficio_annulla_ore(p_id uuid,p_updated_at timestamptz)
returns void language plpgsql security definer set search_path=public as $$
declare r public.campo_rapportini; assigned uuid;
begin
 select * into r from public.campo_rapportini where id=p_id for update;
 if auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno() or r.ufficio_employee_id is null then raise exception 'Registrazione non disponibile.' using errcode='42501'; end if;
 perform public.assert_company_access(r.company_id);
 select assigned_to into assigned from public.orders where id=r.order_id and deleted_at is null;
 if not found or r.company_id is distinct from public.get_effective_company_id()
  or public.has_permission_for_company(auth.uid(),'can_edit_orders',r.company_id) is not true
  or public.has_permission_for_company(auth.uid(),'can_view_orders',r.company_id) is not true
  or public.has_permission_for_company(auth.uid(),'can_view_employees',r.company_id) is not true
  or public.has_permission_for_company(auth.uid(),'can_view_giornale_lavori',r.company_id) is not true
  or public.check_staff_visibility(auth.uid(),assigned) is not true or public.campo_e_ufficio(r.company_id) is not true then raise exception 'Non hai il permesso di annullare queste ore.' using errcode='42501'; end if;
 if r.stato='rifiutato' then return; end if;
 if r.updated_at is distinct from p_updated_at then raise exception 'Registrazione cambiata: aggiorna prima di annullare.'; end if;
 update public.campo_rapportini set stato='rifiutato',approvato=false,motivo_rifiuto='Annullato dall’ufficio',approvato_da=auth.uid(),approvato_at=now() where id=p_id;
 -- Il trigger esistente storna esattamente lo snapshot storico, senza ricalcolare tariffe.
end $$;
revoke all on function public.ufficio_annulla_ore(uuid,timestamptz) from public,anon;
grant execute on function public.ufficio_annulla_ore(uuid,timestamptz) to authenticated;

-- Tutte le approvazioni, anche da Campo, serializzano la stessa persona/giornata.
-- Il trigger di costo e i suoi controlli restano quelli esistenti.
create or replace function public.ufficio_serializza_ore() returns trigger
language plpgsql security definer set search_path=public as $$
declare e text;
begin
 if new.stato='approvato' or old.stato='approvato' then
  for e in select distinct p->>'employee_id' from jsonb_array_elements(
   coalesce(public.campo_presenze_effettive(new),'[]'::jsonb) ||
   coalesce(public.campo_presenze_effettive(old),'[]'::jsonb)) p
   where p->>'employee_id' is not null order by 1 loop
   perform pg_advisory_xact_lock(hashtextextended(new.company_id::text||e||new.data_lavoro::text,0));
  end loop;
 end if;
 return new;
end $$;
revoke all on function public.ufficio_serializza_ore() from public,anon,authenticated;
drop trigger if exists aa_ufficio_serializza_ore on public.campo_rapportini;
create trigger aa_ufficio_serializza_ore before update on public.campo_rapportini for each row execute function public.ufficio_serializza_ore();
