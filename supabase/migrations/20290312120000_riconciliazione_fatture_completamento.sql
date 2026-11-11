-- Quantità riconciliate, equivalenze e conversioni: nessun nuovo costo o carico.
set local lock_timeout='5s';
set local statement_timeout='60s';
alter table fattura_riconciliazioni_ai add column quantita_complete boolean not null default false;
create table public.fattura_equivalenze_fornitore (
 id uuid primary key default gen_random_uuid(),company_id uuid not null references companies(id),supplier_id uuid not null references suppliers(id),
 fattura_descrizione text not null,fattura_codice text not null default '',documento_descrizione text not null,documento_codice text not null default '',
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),attiva boolean not null default true,
 chiave text generated always as (md5(fattura_descrizione||chr(31)||fattura_codice||chr(31)||documento_descrizione||chr(31)||documento_codice)) stored,
 unique(company_id,supplier_id,chiave)
);
create index fattura_equivalenze_supplier on fattura_equivalenze_fornitore(company_id,supplier_id);
create table public.fattura_conversioni_fornitore (
 id uuid primary key default gen_random_uuid(),company_id uuid not null references companies(id),supplier_id uuid not null references suppliers(id),
 descrizione_articolo text not null,codice_articolo text not null default '',unita_fattura text not null,unita_ddt text not null,
 fattore numeric not null check(fattore>0 and fattore<=1000000),created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 chiave text generated always as (md5(descrizione_articolo||chr(31)||codice_articolo||chr(31)||unita_fattura||chr(31)||unita_ddt)) stored,
 unique(company_id,supplier_id,chiave)
);
create table public.fattura_ddt_quantita (
 id uuid primary key default gen_random_uuid(),company_id uuid not null references companies(id),fattura_id uuid not null references fatture_ricevute(id),
 fattura_riga text not null,ddt_riga uuid not null references ddt_righe(id),quantita_fattura numeric not null check(quantita_fattura>0 and quantita_fattura<=1000000000),
 quantita_ddt numeric not null check(quantita_ddt>0 and quantita_ddt<=1000000000),unita_fattura text not null,unita_ddt text not null,
 fattore numeric not null check(fattore>0 and fattore<=1000000),rettifica_di uuid references fattura_ddt_quantita(id),
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 unique nulls not distinct(fattura_id,fattura_riga,ddt_riga,rettifica_di)
);
create index fattura_ddt_quantita_riga on fattura_ddt_quantita(company_id,ddt_riga);
create index fattura_ddt_quantita_rettifica on fattura_ddt_quantita(rettifica_di);
create index fattura_ddt_quantita_fattura on fattura_ddt_quantita(fattura_id);
create or replace function public.fattura_unita(p text) returns text language sql immutable set search_path=public as $$
 select case regexp_replace(lower(replace(replace(coalesce(p,''),'²','2'),'³','3')),'[^a-z0-9]','','g')
 when 'pezzi' then 'pz' when 'pezzo' then 'pz' when 'pzi' then 'pz' when 'nr' then 'pz' when 'n' then 'pz'
 when 'm2' then 'mq' when 'm3' then 'mc' when 'mt' then 'm' when 'metri' then 'm' when 'ml' then 'm'
 when 'ore' then 'h' when 'ora' then 'h' when 'lt' then 'l'
 else regexp_replace(lower(coalesce(p,'')),'[^a-z0-9]','','g') end $$;
create or replace function public.fattura_identita(p text) returns text language sql immutable set search_path=public as $$ select regexp_replace(lower(btrim(coalesce(p,''))),'\s+',' ','g') $$;
revoke all on function fattura_unita(text),fattura_identita(text) from public,anon;
grant execute on function fattura_unita(text),fattura_identita(text) to authenticated;

-- Quantità realmente consumata. Valorizzazioni e riconciliazioni della stessa
-- fattura non si sommano due volte; una nota di credito rilascia solo la quota originaria.
create or replace function public.fattura_ddt_consumi(p_company uuid,p_ddt uuid[],p_escludi uuid default null)
returns table(fattura_id uuid,riga_id uuid,ddt_id uuid,quantita numeric)
language sql stable security definer set search_path=public as $$
 with base as (
 select q.fattura_id,q.ddt_riga riga_id,r.ddt_ricezione_id ddt_id,sum(q.quantita_ddt) quantita
 from fattura_ddt_quantita q join ddt_righe r on r.id=q.ddt_riga and r.company_id=q.company_id
 where q.company_id=p_company and r.ddt_ricezione_id=any(p_ddt) and q.rettifica_di is null and q.fattura_id is distinct from p_escludi group by 1,2,3
 union all
 select v.fattura_id,v.riga_id,v.ddt_id,v.quantita from ddt_valorizzazioni v
 where v.company_id=p_company and v.ddt_id=any(p_ddt) and v.fattura_id is distinct from p_escludi
 ), storni as (
 select a.fattura_id,a.ddt_riga,sum(s.quantita_ddt) quantita from fattura_ddt_quantita s
 join fattura_ddt_quantita a on a.id=s.rettifica_di and a.company_id=s.company_id
 where s.company_id=p_company and s.fattura_id is distinct from p_escludi group by 1,2
 ) select b.fattura_id,b.riga_id,b.ddt_id,greatest(0,max(b.quantita)-coalesce(s.quantita,0))
 from base b left join storni s on s.fattura_id=b.fattura_id and s.ddt_riga=b.riga_id group by 1,2,3,s.quantita
$$;
revoke all on function fattura_ddt_consumi(uuid,uuid[],uuid) from public,anon,authenticated;

-- Anche il vecchio flusso di valorizzazione deve rispettare le quantità riconciliate.
create or replace function public.fattura_ddt_guardia_valorizzazione() returns trigger language plpgsql security definer set search_path=public as $$
declare r ddt_righe%rowtype; usata numeric; propria numeric; restituita numeric; begin
 select * into r from ddt_righe where id=new.riga_id and company_id=new.company_id and ddt_ricezione_id=new.ddt_id;
 if not found then raise exception 'Riga DDT di un’altra azienda o non disponibile.' using errcode='42501'; end if;
 perform id from ddt_ricezione where id=r.ddt_ricezione_id for update;
 select coalesce(sum(quantita),0) into usata from fattura_ddt_consumi(new.company_id,array[new.ddt_id],new.fattura_id) where riga_id=r.id;
 select coalesce(sum(quantita_ddt),0) into propria from fattura_ddt_quantita where fattura_id=new.fattura_id and ddt_riga=r.id and rettifica_di is null;
 select coalesce(sum(st.quantita_ddt),0) into restituita from fattura_ddt_quantita st join fattura_ddt_quantita orig on orig.id=st.rettifica_di where orig.fattura_id=new.fattura_id and orig.ddt_riga=r.id;
 if greatest(new.quantita,propria)-restituita+usata>r.quantita+0.000001 then raise exception 'Quantità già fatturata o riconciliata: aggiorna il residuo del DDT.' using errcode='23514'; end if;
 return new;
end $$;
revoke all on function fattura_ddt_guardia_valorizzazione() from public,anon,authenticated;
create trigger fattura_ddt_quantita_guardia before insert or update on ddt_valorizzazioni for each row execute function fattura_ddt_guardia_valorizzazione();

-- Lettura consentita agli stessi ruoli del confronto. Scrittura soltanto attraverso RPC validate.
alter table fattura_equivalenze_fornitore enable row level security;
alter table fattura_conversioni_fornitore enable row level security;
alter table fattura_ddt_quantita enable row level security;
create policy equivalenze_legge on fattura_equivalenze_fornitore for select to authenticated using(not utente_bloccato() and not utente_e_cliente_esterno() and (e_super_admin_dentro(company_id) or company_id=any(aziende_con_permesso('can_view_costs')||aziende_con_permesso('can_manage_purchasing'))));
create policy conversioni_legge on fattura_conversioni_fornitore for select to authenticated using(not utente_bloccato() and not utente_e_cliente_esterno() and (e_super_admin_dentro(company_id) or company_id=any(aziende_con_permesso('can_view_costs')||aziende_con_permesso('can_manage_purchasing'))));
create policy quantita_legge on fattura_ddt_quantita for select to authenticated using(not utente_bloccato() and not utente_e_cliente_esterno() and (e_super_admin_dentro(company_id) or company_id=any(aziende_con_permesso('can_view_costs')||aziende_con_permesso('can_manage_purchasing'))));
revoke all on fattura_equivalenze_fornitore,fattura_conversioni_fornitore,fattura_ddt_quantita from anon,authenticated;
grant select on fattura_equivalenze_fornitore,fattura_conversioni_fornitore,fattura_ddt_quantita to authenticated;
grant all on fattura_equivalenze_fornitore,fattura_conversioni_fornitore,fattura_ddt_quantita to service_role;
create or replace function public.fattura_numero(p text) returns numeric language sql immutable set search_path=public as $$
 select case when x ~ '^[+-]?[0-9]+([.][0-9]+)?$' then x::numeric else null end from
 (select case when position(',' in coalesce(p,''))>0 then replace(replace(p,'.',''),',','.') else btrim(p) end x) t $$;
revoke all on function fattura_numero(text) from public,anon;
grant execute on function fattura_numero(text) to authenticated;

create or replace function public.fattura_riconciliazione_imputa(p_analisi uuid,p_impronta text,p_righe jsonb,p_revisione integer,p_completa boolean default false)
returns jsonb language plpgsql security definer set search_path=public set lock_timeout='5s' as $$
<<imputa>>
declare a fattura_riconciliazioni_ai%rowtype; f fatture_ricevute%rowtype; r ddt_righe%rowtype; origine fattura_ddt_quantita%rowtype;
 c jsonb;x jsonb;rf jsonb; q numeric; fattore numeric; uf text; ud text; maxq numeric; usata numeric; n integer; ids uuid[]:='{}'; alloc_id uuid;
begin
 select * into a from fattura_riconciliazioni_ai where id=p_analisi;
 if not found then raise exception 'Analisi non disponibile.' using errcode='P0002';end if;
 c:=fattura_riconciliazione_contesto(a.fattura_id,a.documenti);
 if not (c->>'puo_modificare')::boolean then raise exception 'Il tuo ruolo consente solo la lettura.' using errcode='42501';end if;
 if jsonb_typeof(p_righe) is distinct from 'array' or jsonb_array_length(p_righe)>2000 then raise exception 'Ripartizione non valida.' using errcode='22023';end if;
 perform id from ddt_ricezione where company_id=a.company_id and id in(select e.value::uuid from jsonb_array_elements_text(a.documenti->'ddt') e(value)) order by id for update;
 select * into f from fatture_ricevute where id=a.fattura_id for update;
 select * into a from fattura_riconciliazioni_ai where id=p_analisi for update;
 c:=fattura_riconciliazione_contesto(f.id,a.documenti);
 if c->>'impronta' is distinct from p_impronta or a.impronta is distinct from p_impronta then raise exception 'Altri documenti o quantità sono cambiati. Aggiorna il confronto.' using errcode='PT409';end if;
 if a.revisione<>p_revisione then raise exception 'Un collega ha aggiornato il confronto. Ricarica prima di salvare.' using errcode='PT409';end if;
 if f.fornitore_id is null then raise exception 'Associa il fornitore della fattura prima di ripartire le quantità.' using errcode='22023';end if;
 if (select count(distinct (e.value->>'fattura_riga',e.value->>'ddt_riga',e.value->>'rettifica_di')) from jsonb_array_elements(p_righe) e(value))<>jsonb_array_length(p_righe) then raise exception 'Una riga DDT è stata ripetuta per la stessa voce.' using errcode='22023';end if;
 for x in select * from jsonb_array_elements(p_righe) loop
  select z into rf from jsonb_array_elements(f.righe) with ordinality z(z,i) where coalesce(z->>'numero_linea',i::text)=x->>'fattura_riga';
  if rf is null then raise exception 'Voce della fattura non disponibile.' using errcode='22023';end if;
  if not exists(select 1 from jsonb_array_elements(a.proposta->'righe') pr where pr->>'fattura'=x->>'fattura_riga' and a.decisioni->>(pr->>'fattura')='accettata' and (pr->'ddt') ? (x->>'ddt_riga')) then raise exception 'Conferma prima l’abbinamento tra la voce e il DDT.' using errcode='22023';end if;
  select rr.* into r from ddt_righe rr join ddt_ricezione d on d.id=rr.ddt_ricezione_id and d.company_id=rr.company_id
   where rr.id=(x->>'ddt_riga')::uuid and rr.company_id=f.company_id and d.supplier_id=f.fornitore_id and d.id in(select v::uuid from jsonb_array_elements_text(a.documenti->'ddt') v) for update of rr;
  if not found or r.quantita is null or r.quantita<0 then raise exception 'Riga DDT o quantità non disponibile per questo fornitore.' using errcode='42501';end if;
  if f.tipo_documento<>'TD04' and coalesce((x->>'conferma_residuo')::boolean,false)=false and (
   exists(select 1 from fattura_ddt l where l.ddt_ricezione_id=r.ddt_ricezione_id and l.fattura_ricevuta_id<>f.id and not coalesce((select qa.quantita_complete from fattura_riconciliazioni_ai qa where qa.fattura_id=l.fattura_ricevuta_id order by coalesce(qa.rivista_il,qa.created_at) desc,qa.created_at desc,qa.id limit 1),false))
   or exists(select 1 from jsonb_array_elements(c->'contesto'->'revisioni_precedenti') rp where rp->>'riga_id'=r.id::text and not coalesce((rp->>'completa')::boolean,false))
  ) then raise exception 'Controlla le altre fatture collegate e conferma esplicitamente la quantità disponibile.' using errcode='23514';end if;

  uf:=fattura_unita(coalesce(nullif(rf->>'unita_misura',''),nullif(rf->>'unita',''),nullif(rf->>'um',''),x->>'unita_fattura'));
  ud:=fattura_unita(coalesce(nullif(r.unita_misura,''),x->>'unita_ddt'));
  q:=fattura_numero(x->>'quantita_fattura');fattore:=fattura_numero(x->>'fattore');
  if uf='' or ud='' or q is null or q<=0 or q>1000000000 or fattore is null or fattore<=0 or fattore>1000000 then raise exception 'Controlla quantità, unità e fattore di conversione.' using errcode='22023';end if;
  if (fattura_unita(coalesce(rf->>'unita_misura',rf->>'unita',rf->>'um'))='' or fattura_unita(r.unita_misura)='') and coalesce((x->>'conferma_unita')::boolean,false)=false then raise exception 'Conferma esplicitamente le unità mancanti nell’originale.' using errcode='22023';end if;
  if uf=ud and fattore<>1 then raise exception 'Con la stessa unità il fattore deve essere 1.' using errcode='22023';end if;
  if uf<>ud and coalesce((x->>'conferma_conversione')::boolean,false)=false and not exists(select 1 from fattura_conversioni_fornitore cv where cv.company_id=f.company_id and cv.supplier_id=f.fornitore_id and cv.descrizione_articolo=fattura_identita(rf->>'descrizione') and cv.codice_articolo=fattura_identita(coalesce(rf->>'codice_articolo',rf->>'codice',rf->>'sku',rf->'codici_articolo'->0->>'valore')) and cv.unita_fattura=uf and cv.unita_ddt=ud and cv.fattore=imputa.fattore) then raise exception 'Conferma il fattore di conversione tra le due unità.' using errcode='22023';end if;
  if f.tipo_documento='TD04' then
   select * into origine from fattura_ddt_quantita where id=nullif(x->>'rettifica_di','')::uuid and company_id=f.company_id and ddt_riga=r.id and rettifica_di is null and fattura_id<>f.id;
   if not found then raise exception 'Per la nota di credito scegli la quantità della fattura originale da stornare.' using errcode='22023';end if;
  elsif nullif(x->>'rettifica_di','') is not null then raise exception 'Solo una nota di credito può stornare una quantità.' using errcode='22023';end if;
  insert into fattura_ddt_quantita(company_id,fattura_id,fattura_riga,ddt_riga,quantita_fattura,quantita_ddt,unita_fattura,unita_ddt,fattore,rettifica_di,created_by)
   values(f.company_id,f.id,x->>'fattura_riga',r.id,q,q*fattore,uf,ud,fattore,case when f.tipo_documento='TD04' then origine.id end,auth.uid())
   on conflict(fattura_id,fattura_riga,ddt_riga,rettifica_di) do update set quantita_fattura=excluded.quantita_fattura,quantita_ddt=excluded.quantita_ddt,unita_fattura=excluded.unita_fattura,unita_ddt=excluded.unita_ddt,fattore=excluded.fattore,rettifica_di=excluded.rettifica_di
   returning id into alloc_id;
  ids:=array_append(ids,alloc_id);
  if uf<>ud and coalesce((x->>'ricorda_conversione')::boolean,false) then
   insert into fattura_conversioni_fornitore(company_id,supplier_id,descrizione_articolo,codice_articolo,unita_fattura,unita_ddt,fattore,created_by)
    values(f.company_id,f.fornitore_id,fattura_identita(rf->>'descrizione'),fattura_identita(coalesce(rf->>'codice_articolo',rf->>'codice',rf->>'sku',rf->'codici_articolo'->0->>'valore')),uf,ud,fattore,auth.uid())
    on conflict(company_id,supplier_id,chiave) do update set fattore=excluded.fattore,created_by=auth.uid(),created_at=now();
  end if;
 end loop;
 if exists(select 1 from fattura_ddt_quantita aq join fattura_ddt_quantita s on s.rettifica_di=aq.id where aq.fattura_id=f.id and not(aq.id=any(ids))) then raise exception 'Questa ripartizione ha già note di credito collegate: non può essere eliminata.' using errcode='23514';end if;
 delete from fattura_ddt_quantita where fattura_id=f.id and not(id=any(ids));
 for rf in select z||jsonb_build_object('_id',coalesce(z->>'numero_linea',i::text)) from jsonb_array_elements(f.righe) with ordinality t(z,i) loop
  maxq:=abs(fattura_numero(rf->>'quantita'));
  select coalesce(sum(quantita_fattura),0) into usata from fattura_ddt_quantita where fattura_id=f.id and fattura_riga=rf->>'_id';
  if usata>0 and (maxq is null or usata>maxq+0.000001) then raise exception 'La ripartizione supera la quantità della voce in fattura.' using errcode='23514';end if;
 end loop;
 if exists(select 1 from fattura_ddt_quantita qa left join lateral(select sum(s.quantita_ddt) q from fattura_ddt_quantita s where s.rettifica_di=qa.id) s on true where qa.company_id=f.company_id and qa.ddt_riga in(select ddt_riga from fattura_ddt_quantita where fattura_id=f.id) and coalesce(s.q,0)>qa.quantita_ddt+0.000001) then raise exception 'La nota di credito supera la quantità della fattura originale.' using errcode='23514';end if;
 if exists(select 1 from fattura_ddt_consumi(f.company_id,array(select v::uuid from jsonb_array_elements_text(a.documenti->'ddt') v),null) cd join ddt_righe rr on rr.id=cd.riga_id group by rr.id,rr.quantita having sum(cd.quantita)>rr.quantita+0.000001) then raise exception 'Le quantità superano il residuo DDT. Un collega può aver riconciliato un’altra fattura.' using errcode='23514';end if;
 if exists(select 1 from ddt_valorizzazioni v join (select ddt_riga,sum(quantita_ddt) q from fattura_ddt_quantita where fattura_id=f.id and rettifica_di is null group by ddt_riga) q on q.ddt_riga=v.riga_id where v.fattura_id=f.id and abs(v.quantita-q.q)>0.000001) then raise exception 'La quantità differisce dalla valorizzazione già registrata per questa fattura.' using errcode='23514';end if;
 -- Il riferimento viene collegato al documento reale senza duplicare l'eventuale riferimento XML.
 for r in select rr.* from ddt_righe rr where rr.id in(select ddt_riga from fattura_ddt_quantita where fattura_id=f.id) loop
  if not exists(select 1 from fattura_ddt where fattura_ricevuta_id=f.id and ddt_ricezione_id=r.ddt_ricezione_id) then
   update fattura_ddt l set ddt_ricezione_id=d.id from ddt_ricezione d where l.fattura_ricevuta_id=f.id and l.company_id=f.company_id and l.ddt_ricezione_id is null and d.id=r.ddt_ricezione_id and l.numero_ddt=d.numero_ddt and l.data_ddt=d.data_ricezione;
   if not found then insert into fattura_ddt(company_id,fattura_ricevuta_id,ddt_ricezione_id,numero_ddt,data_ddt,origine,created_by) select f.company_id,f.id,id,numero_ddt,data_ricezione,'manuale',auth.uid() from ddt_ricezione where id=r.ddt_ricezione_id;end if;
  end if;
 end loop;
 if p_completa and exists(select 1 from jsonb_array_elements(a.proposta->'righe') pr join lateral(select z from jsonb_array_elements(f.righe) with ordinality t(z,i) where coalesce(z->>'numero_linea',i::text)=pr->>'fattura') fr on true where jsonb_array_length(pr->'ddt')>0 and (a.decisioni->>(pr->>'fattura') is distinct from 'accettata' or fattura_numero(fr.z->>'quantita') is null or abs(coalesce((select sum(quantita_fattura) from fattura_ddt_quantita where fattura_id=f.id and fattura_riga=pr->>'fattura'),0)-abs(fattura_numero(fr.z->>'quantita')))>0.000001)) then raise exception 'Per confermare la ripartizione completa controlla tutte le voci abbinate ai DDT.' using errcode='23514';end if;
 update fattura_riconciliazioni_ai set quantita_complete=coalesce(p_completa,false),revisione=revisione+1,rivista_da=auth.uid(),rivista_il=now() where id=a.id;
 return jsonb_build_object('fattura_id',f.id,'righe',cardinality(ids));
end $$;
revoke all on function fattura_riconciliazione_imputa(uuid,text,jsonb,integer,boolean) from public,anon;
grant execute on function fattura_riconciliazione_imputa(uuid,text,jsonb,integer,boolean) to authenticated;

create or replace function public.fattura_riconciliazione_ricorda(p_analisi uuid,p_revisione integer,p_decisioni jsonb,p_ricorda boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a fattura_riconciliazioni_ai%rowtype; f fatture_ricevute%rowtype; c jsonb; out jsonb;r jsonb;rf jsonb;rd jsonb; n int:=0;
begin
 out:=fattura_riconciliazione_salva(p_analisi,p_revisione,p_decisioni);
 if not p_ricorda then return out;end if;
 select * into a from fattura_riconciliazioni_ai where id=p_analisi;
 select * into f from fatture_ricevute where id=a.fattura_id;
 if f.fornitore_id is null then raise exception 'Associa il fornitore prima di ricordare le equivalenze.' using errcode='22023';end if;
 c:=fattura_riconciliazione_contesto(f.id,a.documenti)->'contesto';
 for r in select * from jsonb_array_elements(a.proposta->'righe') pr where p_decisioni->>(pr->>'fattura')='accettata' loop
  select z into rf from jsonb_array_elements(f.righe) with ordinality t(z,i) where coalesce(z->>'numero_linea',i::text)=r->>'fattura';
  if length(fattura_identita(rf->>'descrizione'))<8 or fattura_identita(rf->>'descrizione') in('materiale vario','materiali','varie','articoli vari') then continue;end if;
  for rd in
   select rr from jsonb_array_elements(c->'ddt') d cross join lateral jsonb_array_elements(d->'righe') rr where r->'ddt' ? (rr->>'id')
   union all select jsonb_build_object('descrizione',rr->>'description','codice_articolo',rr->>'sku') from jsonb_array_elements(c->'oda') d cross join lateral jsonb_array_elements(d->'righe') rr where r->'oda' ? (rr->>'id')
  loop
   insert into fattura_equivalenze_fornitore(company_id,supplier_id,fattura_descrizione,fattura_codice,documento_descrizione,documento_codice,created_by)
    values(f.company_id,f.fornitore_id,fattura_identita(rf->>'descrizione'),fattura_identita(coalesce(rf->>'codice_articolo',rf->>'codice',rf->>'sku',rf->'codici_articolo'->0->>'valore')),fattura_identita(rd->>'descrizione'),fattura_identita(rd->>'codice_articolo'),auth.uid())
    on conflict(company_id,supplier_id,chiave) do update set attiva=true;
   n:=n+1;
  end loop;
 end loop;
 return out||jsonb_build_object('equivalenze_salvate',n);
end $$;
revoke all on function fattura_riconciliazione_ricorda(uuid,integer,jsonb,boolean) from public,anon;
grant execute on function fattura_riconciliazione_ricorda(uuid,integer,jsonb,boolean) to authenticated;

create or replace function public.fattura_equivalenza_disattiva(p_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare e fattura_equivalenze_fornitore%rowtype;begin
 select * into e from fattura_equivalenze_fornitore where id=p_id;
 if auth.uid() is null or utente_bloccato() or utente_e_cliente_esterno() or not coalesce(e_super_admin_dentro(e.company_id) or e.company_id=any(aziende_con_permesso('can_view_costs')||aziende_con_permesso('can_manage_purchasing')),false) or utente_sola_lettura(e.company_id) then raise exception 'Modifica non consentita.' using errcode='42501';end if;
 update fattura_equivalenze_fornitore set attiva=false where id=p_id;
end $$;
revoke all on function fattura_equivalenza_disattiva(uuid) from public,anon;
grant execute on function fattura_equivalenza_disattiva(uuid) to authenticated;

create or replace function public.fattura_riconciliazione_contesto(p_fattura uuid, p_documenti jsonb)
returns jsonb language plpgsql security definer set search_path = public set statement_timeout = '15s'
as $$
declare f public.fatture_ricevute%rowtype; v_ddt uuid[]; v_oda uuid[];
  c jsonb; ds jsonb; os jsonb; vs jsonb; af jsonb; rp jsonb; n integer;
begin
  if auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno() then
    raise exception 'Accesso al confronto non consentito.' using errcode='42501';
  end if;
  select * into f from public.fatture_ricevute where id=p_fattura;
  if not found or not coalesce(public.e_super_admin_dentro(f.company_id) or f.company_id = any(public.aziende_con_permesso('can_view_costs') || public.aziende_con_permesso('can_manage_purchasing')),false) then
    raise exception 'Fattura non disponibile per la tua azienda.' using errcode='42501';
  end if;
  if jsonb_typeof(p_documenti) is distinct from 'object' or jsonb_typeof(p_documenti->'ddt') is distinct from 'array' or jsonb_typeof(p_documenti->'oda') is distinct from 'array' then
    raise exception 'Selezione documenti non valida.' using errcode='22023';
  end if;
  if jsonb_array_length(p_documenti->'ddt') + jsonb_array_length(p_documenti->'oda') not between 1 and 200 then
    raise exception 'Seleziona da uno a duecento documenti.' using errcode='22023';
  end if;
  select coalesce(array_agg(distinct x::uuid order by x::uuid),'{}'::uuid[]) into v_ddt from jsonb_array_elements_text(p_documenti->'ddt') x;
  select coalesce(array_agg(distinct x::uuid order by x::uuid),'{}'::uuid[]) into v_oda from jsonb_array_elements_text(p_documenti->'oda') x;
  select count(*) into n from public.ddt_ricezione where id=any(v_ddt) and company_id=f.company_id and (f.fornitore_id is null or supplier_id is null or supplier_id=f.fornitore_id);
  if n<>cardinality(v_ddt) then raise exception 'Un DDT non è disponibile o appartiene a un altro fornitore.' using errcode='42501'; end if;
  select count(*) into n from public.purchase_orders where id=any(v_oda) and company_id=f.company_id and (f.fornitore_id is null or supplier_id is null or supplier_id=f.fornitore_id);
  if n<>cardinality(v_oda) then raise exception 'Un ordine non è disponibile o appartiene a un altro fornitore.' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'numero',d.numero_ddt,'supplier_id',d.supplier_id,'stato',d.stato,'righe',
    (select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'codice_articolo',r.codice_articolo,'descrizione',r.descrizione,'unita_misura',r.unita_misura,'quantita',r.quantita,'prezzo_unitario',r.prezzo_unitario,'importo',r.importo) order by r.posizione,r.id),'[]'::jsonb)
     from public.ddt_righe r where r.ddt_ricezione_id=d.id and r.company_id=f.company_id)) order by d.id),'[]'::jsonb)
    into ds from public.ddt_ricezione d where d.id=any(v_ddt) and d.company_id=f.company_id;
  select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'numero',d.oda_number,'supplier_id',d.supplier_id,'stato',d.status,'righe',
    (select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'sku',r.sku,'description',r.description,'unit_of_measure',r.unit_of_measure,'quantity',r.quantity,'unit_price',r.unit_price,'price_pending',r.price_pending,'discount_percent',r.discount_percent,'line_total',r.line_total) order by r.sort_order,r.id),'[]'::jsonb)
     from public.purchase_order_items r where r.purchase_order_id=d.id and r.company_id=f.company_id)) order by d.id),'[]'::jsonb)
    into os from public.purchase_orders d where d.id=any(v_oda) and d.company_id=f.company_id;
  select coalesce(jsonb_agg(jsonb_build_object('riga_id',riga_id,'fattura_id',fattura_id,'quantita',quantita,'ddt_id',ddt_id) order by id),'[]'::jsonb)
    into vs from public.ddt_valorizzazioni where company_id=f.company_id and ddt_id=any(v_ddt) and fattura_id<>f.id;
  select coalesce(jsonb_agg(jsonb_build_object('ddt_ricezione_id',ddt_ricezione_id,'fattura_ricevuta_id',fattura_ricevuta_id,'completa',coalesce((select qa.quantita_complete from fattura_riconciliazioni_ai qa where qa.fattura_id=fattura_ddt.fattura_ricevuta_id order by coalesce(qa.rivista_il,qa.created_at) desc,qa.created_at desc,qa.id limit 1),false)) order by id),'[]'::jsonb)
    into af from public.fattura_ddt where company_id=f.company_id and ddt_ricezione_id=any(v_ddt) and fattura_ricevuta_id<>f.id;
  -- Una revisione su un'altra fattura è un segnale di possibile utilizzo, non una quantità inventata.
  select coalesce(jsonb_agg(jsonb_build_object('fattura_id',a.fattura_id,'riga_id',rr.id,'completa',a.quantita_complete) order by a.fattura_id,rr.id),'[]'::jsonb) into rp
  from (
    select distinct on (fattura_id) * from public.fattura_riconciliazioni_ai
    where company_id=f.company_id and fattura_id<>f.id
    order by fattura_id,coalesce(rivista_il,created_at) desc,created_at desc,id
  ) a
  cross join lateral jsonb_array_elements(a.proposta->'righe') r
  join public.ddt_righe rr on rr.company_id=f.company_id and rr.ddt_ricezione_id=any(v_ddt)
    and rr.id::text in (select jsonb_array_elements_text(r->'ddt'))
  where a.decisioni->>(r->>'fattura')='accettata';
  c:=jsonb_build_object('fattura',jsonb_build_object('id',f.id,'company_id',f.company_id,'fornitore_id',f.fornitore_id,'tipo_documento',f.tipo_documento,'righe',f.righe),'ddt',ds,'oda',os,'valorizzazioni',vs,'altre_fatture',af,'revisioni_precedenti',rp,
 'consumi',(select coalesce(jsonb_agg(to_jsonb(v)),'[]'::jsonb) from fattura_ddt_consumi(f.company_id,v_ddt,f.id) v),
 'allocazioni_questa_fattura',(select coalesce(jsonb_agg(to_jsonb(v) order by v.fattura_riga,v.ddt_riga),'[]'::jsonb) from fattura_ddt_quantita v where v.company_id=f.company_id and v.fattura_id=f.id),
 'allocazioni_origine',(select coalesce(jsonb_agg(to_jsonb(v)||jsonb_build_object('numero_fattura',fr.numero_fattura,'residuo_stornabile',v.quantita_ddt-coalesce((select sum(st.quantita_ddt) from fattura_ddt_quantita st where st.rettifica_di=v.id and st.fattura_id<>f.id),0))),'[]'::jsonb) from fattura_ddt_quantita v join fatture_ricevute fr on fr.id=v.fattura_id where v.company_id=f.company_id and fr.fornitore_id=f.fornitore_id and v.rettifica_di is null and v.fattura_id<>f.id and v.ddt_riga in(select id from ddt_righe where ddt_ricezione_id=any(v_ddt))),
 'equivalenze',(select coalesce(jsonb_agg(to_jsonb(v)),'[]'::jsonb) from fattura_equivalenze_fornitore v where v.company_id=f.company_id and v.supplier_id=f.fornitore_id and v.attiva),
 'conversioni',(select coalesce(jsonb_agg(to_jsonb(v)),'[]'::jsonb) from fattura_conversioni_fornitore v where v.company_id=f.company_id and v.supplier_id=f.fornitore_id));
  return jsonb_build_object('contesto',c,'impronta',md5('riconciliazione-v3:'||(c-'equivalenze'-'conversioni'-'allocazioni_questa_fattura'-'allocazioni_origine')::text),'puo_modificare',not public.utente_sola_lettura(f.company_id));
end $$;
revoke all on function public.fattura_riconciliazione_contesto(uuid,jsonb) from public,anon;
grant execute on function public.fattura_riconciliazione_contesto(uuid,jsonb) to authenticated;


CREATE OR REPLACE FUNCTION public.ddt_valorizza_da_fattura(p_ddt uuid, p_fattura uuid, p_righe jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare d public.ddt_ricezione%rowtype; f public.fatture_ricevute%rowtype; r public.ddt_righe%rowtype; v public.ddt_valorizzazioni%rowtype;
 x jsonb; q numeric; prezzo numeric; totale_q numeric; medio numeric; n integer:=0;
begin
 select * into d from ddt_ricezione where id=p_ddt for update;
 if not found or auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno() or public.utente_sola_lettura(d.company_id) or not coalesce(public.user_can_access_company(d.company_id),false)
 or not coalesce(public.has_permission_for_company(auth.uid(),'can_manage_purchasing',d.company_id) or public.e_super_admin_dentro(d.company_id),false) then raise exception 'Non puoi valorizzare questa bolla' using errcode='42501'; end if;
 select * into f from fatture_ricevute where id=p_fattura and company_id=d.company_id for update;
 if not found or d.supplier_id is null or not exists(select 1 from suppliers s where s.id=d.supplier_id and s.company_id=d.company_id and (f.fornitore_id=s.id or (nullif(regexp_replace(regexp_replace(upper(coalesce(f.cedente_piva,'')),'[^A-Z0-9]','','g'),'^IT',''),'') is not null and regexp_replace(regexp_replace(upper(coalesce(f.cedente_piva,'')),'[^A-Z0-9]','','g'),'^IT','')=regexp_replace(regexp_replace(upper(coalesce(s.vat_number,'')),'[^A-Z0-9]','','g'),'^IT','')))) then raise exception 'La fattura deve appartenere allo stesso fornitore e alla stessa azienda' using errcode='42501'; end if;
 if f.tipo_documento='TD04' then raise exception 'Per una nota di credito ripartisci lo storno sulla fattura originale.' using errcode='22023';end if;
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
  if r.quantita is null then raise exception 'Le quantità fatturate superano la quantità sulla bolla'; end if;
  insert into ddt_valorizzazioni(company_id,ddt_id,riga_id,fattura_id,quantita,prezzo_unitario,created_by) values(d.company_id,d.id,r.id,f.id,q,prezzo,auth.uid());
  select sum(c.quantita),sum(c.quantita*pv.prezzo_unitario)/nullif(sum(c.quantita),0) into totale_q,medio from fattura_ddt_consumi(d.company_id,array[d.id],null) c join ddt_valorizzazioni pv on pv.fattura_id=c.fattura_id and pv.riga_id=c.riga_id where c.riga_id=r.id;
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
end $function$;
-- Ogni richiesta elabora un lotto: ripresa e avanzamento non dipendono dalla scheda aperta.
create table public.fattura_riconciliazione_lotti (
 id uuid primary key default gen_random_uuid(),company_id uuid not null references companies(id),fattura_id uuid not null references fatture_ricevute(id),impronta text not null,
 indice integer not null default 0,totale integer not null,parti jsonb not null default '[]'::jsonb,modelli jsonb not null default '[]'::jsonb,
 tentativi integer not null default 0,blocco uuid,blocco_fino timestamptz,errore text,created_by uuid not null references auth.users(id),updated_at timestamptz not null default now(),
 unique(company_id,fattura_id,impronta)
);
alter table fattura_riconciliazione_lotti enable row level security;
create policy lotti_legge on fattura_riconciliazione_lotti for select to authenticated using(not utente_bloccato() and not utente_e_cliente_esterno() and (e_super_admin_dentro(company_id) or company_id=any(aziende_con_permesso('can_view_costs')||aziende_con_permesso('can_manage_purchasing'))));
revoke all on fattura_riconciliazione_lotti from anon,authenticated;
grant select on fattura_riconciliazione_lotti to authenticated;
grant all on fattura_riconciliazione_lotti to service_role;

create index fattura_equivalenze_actor on fattura_equivalenze_fornitore(created_by);
create index fattura_conversioni_actor on fattura_conversioni_fornitore(created_by);
create index fattura_quantita_actor on fattura_ddt_quantita(created_by);
create index fattura_lotti_actor on fattura_riconciliazione_lotti(created_by);
create index fattura_lotti_fattura on fattura_riconciliazione_lotti(fattura_id);
create index fattura_equivalenze_supplier_fk on fattura_equivalenze_fornitore(supplier_id);
create index fattura_conversioni_supplier_fk on fattura_conversioni_fornitore(supplier_id);
create index fattura_quantita_riga_fk on fattura_ddt_quantita(ddt_riga);
