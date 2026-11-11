-- Acquisizione unica, lettura persistente e registrazione documentale atomica.
set local lock_timeout='5s';
create table public.ddt_document_jobs (
 id uuid primary key,
 company_id uuid not null references public.companies(id) on delete cascade,
 created_by uuid references public.profiles(id),
 employee_id uuid references public.employees(id),
 order_id uuid references public.orders(id),
 source text not null check(source in ('desktop','campo','whatsapp')),
 source_key text,
 file_hash text not null check(file_hash ~ '^[0-9a-f]{64}$'),
 files jsonb not null check(jsonb_typeof(files)='array' and jsonb_array_length(files) between 1 and 12),
 status text not null default 'queued' check(status in ('queued','processing','review','registered','error')),
 result jsonb,
 attempts integer not null default 0 check(attempts between 0 and 5),
 lease_id uuid,
 lease_until timestamptz,
 retry_at timestamptz not null default now(),
 last_error text,
 ddt_id uuid references public.ddt_ricezione(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(company_id,file_hash)
);
create index ddt_document_jobs_pending on public.ddt_document_jobs(retry_at,created_at) where status in ('queued','processing');
create index ddt_document_jobs_company on public.ddt_document_jobs(company_id,created_at desc);
create index ddt_document_jobs_owner on public.ddt_document_jobs(created_by,created_at desc);
create index ddt_document_jobs_order on public.ddt_document_jobs(order_id) where order_id is not null;
alter table public.ddt_document_jobs enable row level security;
create policy ddt_jobs_lettura on public.ddt_document_jobs for select to authenticated using (
 public.user_can_access_company(company_id) and (
 created_by=(select auth.uid()) or public.campo_e_ufficio(company_id) or public.e_super_admin_dentro(company_id))
);
grant select on public.ddt_document_jobs to authenticated;
grant all on public.ddt_document_jobs to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('ddt-documenti','ddt-documenti',false,18874368,array['application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif','image/bmp']) on conflict(id) do nothing;
create policy ddt_originali_carica on storage.objects for insert to authenticated with check (
 bucket_id='ddt-documenti' and (storage.foldername(name))[2]=(select auth.uid())::text
 and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
 and public.user_can_access_company(((storage.foldername(name))[1])::uuid)
 and not public.utente_e_cliente_esterno()
);
create policy ddt_originali_leggi on storage.objects for select to authenticated using (
 bucket_id='ddt-documenti' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
 and public.user_can_access_company(((storage.foldername(name))[1])::uuid)
 and ((storage.foldername(name))[2]=(select auth.uid())::text
      or public.campo_e_ufficio(((storage.foldername(name))[1])::uuid)
      or public.e_super_admin_dentro(((storage.foldername(name))[1])::uuid))
);
alter table public.ddt_ricezione add column ddt_file_bucket text;

create or replace function public.ddt_documento_accoda(p_id uuid,p_company uuid,p_order uuid,p_files jsonb,p_hash text,p_source text default 'desktop')
returns jsonb language plpgsql security definer set search_path=public as $$
declare j public.ddt_document_jobs%rowtype; f jsonb; percorso text; prefisso text;
begin
 if auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno() or not coalesce(public.user_can_access_company(p_company),false) then raise exception 'Non puoi acquisire documenti di questa azienda' using errcode='42501'; end if;
 if p_source not in ('desktop','campo') or p_id is null or p_hash !~ '^[0-9a-f]{64}$' or p_hash is null then raise exception 'Documento non valido' using errcode='22023'; end if;
 if p_order is not null and not exists(select 1 from orders where id=p_order and company_id=p_company and deleted_at is null) then raise exception 'Commessa non disponibile' using errcode='42501'; end if;
 if not coalesce(public.campo_e_ufficio(p_company) or public.e_super_admin_dentro(p_company),false) and (p_order is null or not coalesce(public.campo_lavoro_su_commessa(p_order),false)) then raise exception 'Puoi caricare solo sui tuoi cantieri' using errcode='42501'; end if;
 if p_files is null or jsonb_typeof(p_files)<>'array' or jsonb_array_length(p_files) not between 1 and 12 then raise exception 'Scegli da una a dodici pagine dello stesso documento' using errcode='22023'; end if;
 if exists(select 1 from jsonb_array_elements(p_files) x where coalesce((x->>'size')::bigint,0)<=0 or coalesce(x->>'mime','') not in ('application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif','image/bmp')) then raise exception 'Formato o dimensione non validi'; end if;
 if (select coalesce(sum((x->>'size')::bigint),0) from jsonb_array_elements(p_files) x)>18874368 then raise exception 'Il documento supera 18 MB'; end if;
 prefisso:=p_company::text||'/'||auth.uid()::text||'/'||p_id::text||'/';
 for f in select * from jsonb_array_elements(p_files) loop
  foreach percorso in array array[f->>'path',coalesce(f->>'prepared_path',f->>'path')] loop
   if percorso is null or left(percorso,length(prefisso))<>prefisso or percorso ~ '[%?#\\]' or percorso ~ '(^|/)\.\.?(/|$)' or percorso ~ '[[:cntrl:]]' then raise exception 'Percorso documento non valido' using errcode='42501'; end if;
   if not exists(select 1 from storage.objects where bucket_id='ddt-documenti' and name=percorso) then raise exception 'Il caricamento non è completo: ritenta senza scattare di nuovo'; end if;
  end loop;
 end loop;
 select * into j from ddt_document_jobs where id=p_id;
 if found then
  if j.company_id<>p_company or j.created_by is distinct from auth.uid() or j.file_hash<>p_hash then raise exception 'Identità documento già usata' using errcode='42501'; end if;
  return jsonb_build_object('id',j.id,'status',j.status,'duplicate',true);
 end if;
 insert into ddt_document_jobs(id,company_id,created_by,order_id,source,file_hash,files)
 values(p_id,p_company,auth.uid(),p_order,p_source,p_hash,p_files) on conflict(company_id,file_hash) do nothing returning * into j;
 if not found then
  select * into j from ddt_document_jobs where company_id=p_company and file_hash=p_hash;
  if j.created_by is distinct from auth.uid() and not coalesce(public.campo_e_ufficio(p_company) or public.e_super_admin_dentro(p_company),false) then return jsonb_build_object('duplicate',true,'id',null,'status','already_present'); end if;
  return jsonb_build_object('id',j.id,'status',j.status,'duplicate',true);
 end if;
 return jsonb_build_object('id',j.id,'status',j.status,'duplicate',false);
end $$;
revoke all on function public.ddt_documento_accoda(uuid,uuid,uuid,jsonb,text,text) from public,anon;
grant execute on function public.ddt_documento_accoda(uuid,uuid,uuid,jsonb,text,text) to authenticated;

-- Solo il processore può prendere la lease. Il token impedisce scritture da tentativi scaduti.
create or replace function public.ddt_documento_prendi(p_id uuid default null)
returns setof public.ddt_document_jobs language plpgsql security definer set search_path=public as $$
begin
 update ddt_document_jobs set status='error',last_error='Lettura interrotta più volte: originale conservato, riprova dal documento',lease_id=null,lease_until=null,updated_at=now() where status='processing' and lease_until<now() and attempts>=5;
 return query
 with candidato as (
  select id from ddt_document_jobs where (p_id is null or id=p_id)
   and attempts<5 and retry_at<=now()
   and (status='queued' or (status='processing' and lease_until<now()))
  order by created_at for update skip locked limit 1
 ) update ddt_document_jobs j set status='processing',attempts=j.attempts+1,lease_id=gen_random_uuid(),lease_until=now()+interval '4 minutes',updated_at=now()
 from candidato c where j.id=c.id returning j.*;
end $$;
revoke all on function public.ddt_documento_prendi(uuid) from public,anon,authenticated;
grant execute on function public.ddt_documento_prendi(uuid) to service_role;

create or replace function public.ddt_documento_ritenta(p_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare j public.ddt_document_jobs%rowtype;
begin
 select * into j from ddt_document_jobs where id=p_id for update;
 if not found or auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno() or not coalesce(public.user_can_access_company(j.company_id),false) or not coalesce(j.created_by=auth.uid() or public.campo_e_ufficio(j.company_id) or public.e_super_admin_dentro(j.company_id),false) then raise exception 'Documento non disponibile' using errcode='42501'; end if;
 if j.status<>'error' then raise exception 'Puoi riprovare soltanto una lettura non riuscita'; end if;
 update ddt_document_jobs set status='queued',attempts=0,retry_at=now(),last_error=null,updated_at=now() where id=p_id;
end $$;
revoke all on function public.ddt_documento_ritenta(uuid) from public,anon;
grant execute on function public.ddt_documento_ritenta(uuid) to authenticated;

create or replace function public.ddt_documento_registra(p_id uuid,p_dati jsonb,p_altra_versione boolean default false)
returns uuid language plpgsql security definer set search_path=public as $$
declare j public.ddt_document_jobs%rowtype; v_id uuid; v_order uuid; v_supplier uuid; v_oda uuid; v_numero text; v_data date; v_dest text; v_wh uuid; r jsonb; n int:=0; f jsonb;
begin
 select * into j from ddt_document_jobs where id=p_id for update;
 if not found or auth.uid() is null or public.utente_bloccato() or not coalesce(public.user_can_access_company(j.company_id),false)
 or not coalesce(public.has_permission_for_company(auth.uid(),'can_edit_orders',j.company_id) or public.has_permission_for_company(auth.uid(),'can_manage_purchasing',j.company_id) or public.e_super_admin_dentro(j.company_id),false) then raise exception 'Non puoi registrare questo documento' using errcode='42501'; end if;
 if j.ddt_id is not null then return j.ddt_id; end if;
 if j.status not in ('review','error') then raise exception 'Aspetta la lettura del documento'; end if;
 v_order:=nullif(p_dati->>'order_id','')::uuid;v_supplier:=nullif(p_dati->>'supplier_id','')::uuid;v_oda:=nullif(p_dati->>'purchase_order_id','')::uuid;
 v_dest:=coalesce(p_dati->>'destinazione','cantiere');v_numero:=btrim(p_dati->>'numero_ddt');v_data:=nullif(p_dati->>'data_ricezione','')::date;
 if coalesce(v_numero,'')='' or length(v_numero)>100 or v_data is null or v_dest not in ('cantiere','magazzino') then raise exception 'Controlla numero, data e destinazione'; end if;
 if v_order is not null and not exists(select 1 from orders where id=v_order and company_id=j.company_id and deleted_at is null) then raise exception 'Commessa non disponibile' using errcode='42501'; end if;
 if v_dest='cantiere' and v_order is null then raise exception 'Per la consegna in cantiere scegli la commessa'; end if;
 if v_supplier is not null and not exists(select 1 from suppliers where id=v_supplier and company_id=j.company_id) then raise exception 'Fornitore non valido' using errcode='42501'; end if;
 if v_oda is not null and not exists(select 1 from purchase_orders where id=v_oda and company_id=j.company_id and supplier_id is not distinct from v_supplier and (order_id is null or order_id=v_order) and status in ('inviato','confermato','parziale','ricevuto')) then raise exception 'L’OdA deve essere emesso e appartenere al fornitore e alla commessa scelti'; end if;
 if not p_altra_versione and exists(select 1 from ddt_ricezione where company_id=j.company_id and supplier_id is not distinct from v_supplier and upper(regexp_replace(numero_ddt,'[[:space:]./_-]','','g'))=upper(regexp_replace(v_numero,'[[:space:]./_-]','','g')) and data_ricezione=v_data) then raise exception 'Stesso numero, data e fornitore già presenti: confronta le versioni prima di registrare'; end if;
 v_wh:=case when v_dest='magazzino' then nullif(p_dati->>'warehouse_id','')::uuid else null end;
 if v_dest='magazzino' and not exists(select 1 from warehouses where id=v_wh and company_id=j.company_id) then raise exception 'Scegli il magazzino di arrivo'; end if;
 if jsonb_typeof(p_dati->'righe') is distinct from 'array' or jsonb_array_length(p_dati->'righe')>500 then raise exception 'Righe del documento non valide'; end if;
 f:=j.files->0;
 insert into ddt_ricezione(company_id,created_by,order_id,supplier_id,purchase_order_id,numero_ddt,data_ricezione,destinazione,warehouse_id,stato,quantita_ricevuta,note,source,ai_lettura,ai_confidenza,ddt_file_url,ddt_file_name,ddt_file_mime,ddt_file_bucket)
 values(j.company_id,auth.uid(),v_order,v_supplier,v_oda,v_numero,v_data,v_dest,v_wh,'ricevuto',0,nullif(p_dati->>'note',''),case j.source when 'desktop' then 'manual' else j.source end,j.result,least(1,greatest(0,public.num_da_json(j.result->>'confidence'))),f->>'path',f->>'name',f->>'mime',coalesce(f->>'bucket','ddt-documenti')) returning id into v_id;
 for r in select * from jsonb_array_elements(p_dati->'righe') loop
  n:=n+1;
  if nullif(btrim(r->>'descrizione'),'') is null or coalesce((r->>'quantita')::numeric,0)<0 or coalesce((r->>'prezzo_unitario')::numeric,0)<0 then raise exception 'Controlla descrizioni, quantità e prezzi'; end if;
  if nullif(r->>'purchase_order_item_id','') is not null and not exists(select 1 from purchase_order_items where id=(r->>'purchase_order_item_id')::uuid and purchase_order_id=v_oda and company_id=j.company_id) then raise exception 'La riga non appartiene all’OdA scelto' using errcode='42501'; end if;
  insert into ddt_righe(ddt_ricezione_id,company_id,posizione,descrizione,codice_articolo,quantita,unita_misura,prezzo_unitario,importo,iva_percentuale,origine,ai_originale,purchase_order_item_id,abbinamento)
  values(v_id,j.company_id,n,left(r->>'descrizione',4000),nullif(r->>'codice_articolo',''),nullif(r->>'quantita','')::numeric,nullif(r->>'unita_misura',''),nullif(r->>'prezzo_unitario','')::numeric,nullif(r->>'importo','')::numeric,nullif(r->>'iva_percentuale','')::numeric,case when r->>'origine'='manuale' then 'manuale' else 'ai' end,r->'ai_originale',nullif(r->>'purchase_order_item_id','')::uuid,case when nullif(r->>'purchase_order_item_id','') is not null then 'manuale' else null end);
 end loop;
 update ddt_ricezione set quantita_ricevuta=(select coalesce(sum(quantita),0) from ddt_righe where ddt_ricezione_id=v_id) where id=v_id;
 update ddt_document_jobs set ddt_id=v_id,status='registered',updated_at=now() where id=p_id;
 return v_id;
end $$;
revoke all on function public.ddt_documento_registra(uuid,jsonb,boolean) from public,anon;
grant execute on function public.ddt_documento_registra(uuid,jsonb,boolean) to authenticated;

-- Il cron riprende anche il lavoro rimasto in lease dopo un arresto del processore.
-- La funzione Edge autentica il segreto interno, senza conservare JWT degli utenti.
select cron.schedule('ddt-documenti-recovery','* * * * *',$cron$
 select public.silvio_invoke_edge('ddt-documenti-processa','{}'::jsonb)
 where exists(select 1 from public.ddt_document_jobs where (attempts<5 and retry_at<=now() and status='queued') or (status='processing' and lease_until<now()));
$cron$);
