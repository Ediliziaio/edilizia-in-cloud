-- Bolle dal telefono: «solo la foto», l'operaio che manda in magazzino, la conferma senza
-- magazzini (12/11/2026).
--
-- Florin: «la funzione senza AI dell'operaio va messa nelle impostazioni, perché per ora carica
-- solo la foto senza AI e poi l'ufficio fa l'AI… sistema per operaio e magazzino e conferma dal
-- telefono senza magazzino, non deve creare problemi».
--
-- 1. company_acquisti_impostazioni.bolle_telefono_lettura: 'ai_subito' (predefinito, com'era) o
--    'solo_foto'. Con 'solo_foto' la bolla di chi NON è ufficio nasce in `da_leggere`: nessuna
--    lettura AI finché l'ufficio non preme «Leggi con l'AI» (ddt_documento_ritenta la mette in
--    `queued`) o la compila a mano (ddt_documento_registra accetta `da_leggere`). Il cron
--    ddt-documenti-recovery e ddt_documento_prendi guardano solo `queued`/`processing`, quindi
--    non la prendono: non serve toccarli. Si scrive con acquisti_bolle_telefono_salva.
-- 2. ddt_document_jobs.destinazione / warehouse_id. ddt_documento_accoda ha due parametri in più,
--    con default (la firma a sei resta chiamabile; la vecchia funzione si toglie per non avere
--    due firme ambigue). Con la destinazione esplicita 'magazzino' anche l'operaio manda senza
--    commessa; per 'cantiere' la commessa resta obbligatoria e deve essere un suo cantiere.
--    Senza destinazione (client vecchi) vale la regola di prima: commessa nulla = magazzino, e
--    solo l'ufficio può mandarla.
-- 3. ddt_documento_registra: la destinazione del lavoro è il predefinito. In magazzino, senza
--    magazzino scelto: se l'azienda ne ha uno solo (attivo) si usa quello, se ne ha più d'uno il
--    predefinito, se non ne ha la bolla nasce con warehouse_id nullo e il carico resta in sospeso,
--    come già fanno i percorsi createDDT. Nessun errore.
-- 4. RLS ddt_ricezione: ddt_ricezione_scoped_access fa leggere a chi non è amministratore solo le
--    bolle dei SUOI magazzini (warehouse_id = any(get_my_warehouse_ids())): una bolla magazzino
--    con warehouse_id nullo, registrata da un magazziniere o da un operaio col permesso, spariva
--    a chi l'aveva appena registrata (il carico al salvataggio non la trovava). Una policy di sola
--    lettura, mirata alle bolle «magazzino senza magazzino», le fa leggere all'autore e a chi può
--    muovere il magazzino. Non cambia scrittura né le altre righe.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ─── 1. L'impostazione ─────────────────────────────────────────────────────────
alter table public.company_acquisti_impostazioni
  add column if not exists bolle_telefono_lettura text not null default 'ai_subito'
    constraint company_acquisti_impostazioni_bolle_telefono_lettura_check
    check (bolle_telefono_lettura in ('ai_subito', 'solo_foto'));

comment on column public.company_acquisti_impostazioni.bolle_telefono_lettura is
  'Bolle dal telefono di chi non è ufficio: ai_subito = le legge l''AI appena arrivano; solo_foto = restano «da leggere» finché l''ufficio non avvia l''AI o le compila a mano.';

create or replace function public.acquisti_bolle_telefono_salva(p_company uuid, p_modo text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if auth.uid() is null or not public.user_can_access_company(p_company)
     or not (public.has_permission_for_company(auth.uid(), 'can_edit_settings_orders', p_company)
             or public.has_role(auth.uid(), 'super_admin'::public.app_role)
             or exists (select 1 from public.user_roles ur join public.profiles p on p.id = ur.user_id
                         where ur.user_id = auth.uid() and ur.role = 'company_admin'::public.app_role and p.company_id = p_company)) then
    raise exception 'Le impostazioni degli acquisti le cambia l''amministratore o chi modifica la configurazione ordini' using errcode = '42501';
  end if;
  if p_modo is null or p_modo not in ('ai_subito', 'solo_foto') then
    raise exception 'Modo di lettura non valido' using errcode = '22023';
  end if;
  insert into public.company_acquisti_impostazioni as s (company_id, bolle_telefono_lettura, updated_at, updated_by)
  values (p_company, p_modo, now(), auth.uid())
  on conflict (company_id) do update
    set bolle_telefono_lettura = excluded.bolle_telefono_lettura,
        updated_at = now(), updated_by = auth.uid();
end;
$function$;
revoke all on function public.acquisti_bolle_telefono_salva(uuid, text) from public, anon;
grant execute on function public.acquisti_bolle_telefono_salva(uuid, text) to authenticated;

-- ─── 2. Stato «da leggere», destinazione e magazzino del lavoro ────────────────
alter table public.ddt_document_jobs drop constraint if exists ddt_document_jobs_status_check;
alter table public.ddt_document_jobs add constraint ddt_document_jobs_status_check
  check (status in ('queued', 'processing', 'review', 'registered', 'error', 'split', 'da_leggere'));

alter table public.ddt_document_jobs
  add column if not exists destinazione text
    constraint ddt_document_jobs_destinazione_check check (destinazione is null or destinazione in ('cantiere', 'magazzino')),
  add column if not exists warehouse_id uuid references public.warehouses(id) on delete set null;

comment on column public.ddt_document_jobs.destinazione is
  'Dove va la merce, scelto da chi carica. Nullo per i lavori nati prima del 12/11/2026 o da WhatsApp: vale «cantiere» se c''è la commessa, altrimenti «magazzino».';

drop function if exists public.ddt_documento_accoda(uuid, uuid, uuid, jsonb, text, text);

create or replace function public.ddt_documento_accoda(
  p_id uuid, p_company uuid, p_order uuid, p_files jsonb, p_hash text,
  p_source text default 'desktop'::text,
  p_destinazione text default null,
  p_warehouse uuid default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare j public.ddt_document_jobs%rowtype; f jsonb; percorso text; prefisso text;
 v_ufficio boolean; v_dest text; v_wh uuid; v_stato text;
begin
 if auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno() or not coalesce(public.user_can_access_company(p_company),false) then raise exception 'Non puoi acquisire documenti di questa azienda' using errcode='42501'; end if;
 if p_source not in ('desktop','campo') or p_id is null or p_hash !~ '^[0-9a-f]{64}$' or p_hash is null then raise exception 'Documento non valido' using errcode='22023'; end if;
 if p_destinazione is not null and p_destinazione not in ('cantiere','magazzino') then raise exception 'Destinazione non valida' using errcode='22023'; end if;
 if p_order is not null and not exists(select 1 from orders where id=p_order and company_id=p_company and deleted_at is null) then raise exception 'Commessa non disponibile' using errcode='42501'; end if;
 v_ufficio := coalesce(public.campo_e_ufficio(p_company) or public.e_super_admin_dentro(p_company),false);
 v_dest := coalesce(p_destinazione, case when p_order is null then 'magazzino' else 'cantiere' end);
 if not v_ufficio then
  -- In cantiere (o da un client che non dice la destinazione) serve un cantiere suo.
  if (v_dest='cantiere' or p_destinazione is null) and p_order is null then raise exception 'Puoi caricare solo sui tuoi cantieri: scegli il cantiere' using errcode='42501'; end if;
  if p_order is not null and not coalesce(public.campo_lavoro_su_commessa(p_order),false) then raise exception 'Puoi caricare solo sui tuoi cantieri' using errcode='42501'; end if;
 end if;
 v_wh := case when v_dest='magazzino' then p_warehouse else null end;
 if v_wh is not null and not exists(select 1 from warehouses where id=v_wh and company_id=p_company) then raise exception 'Magazzino non disponibile' using errcode='42501'; end if;
 -- «Solo la foto»: chi non è ufficio manda il documento, l'AI la avvia l'ufficio.
 v_stato := case when not v_ufficio and coalesce((select s.bolle_telefono_lettura from company_acquisti_impostazioni s where s.company_id=p_company),'ai_subito')='solo_foto' then 'da_leggere' else 'queued' end;
 if p_files is null or jsonb_typeof(p_files)<>'array' or jsonb_array_length(p_files) not between 1 and 12 then raise exception 'Scegli da una a dodici pagine dello stesso documento' using errcode='22023'; end if;
 if exists(select 1 from jsonb_array_elements(p_files) x where coalesce((x->>'size')::bigint,0)<=0 or coalesce(x->>'mime','') not in ('application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif','image/bmp')) then raise exception 'Formato o dimensione non validi'; end if;
 if (select coalesce(sum((x->>'size')::bigint),0) from jsonb_array_elements(p_files) x)>18874368 then raise exception 'Il documento supera 18 MB'; end if;
 prefisso:=p_company::text||'/'||auth.uid()::text||'/'||p_id::text||'/';
 for f in select * from jsonb_array_elements(p_files) loop
  if f ? 'bucket' and f->>'bucket'<>'ddt-documenti' then raise exception 'Deposito documento non valido' using errcode='42501'; end if;
  foreach percorso in array array[f->>'path',coalesce(f->>'prepared_path',f->>'path')] loop
   if percorso is null or left(percorso,length(prefisso))<>prefisso or percorso ~ '[%?#\\]' or percorso ~ '(^|/)\.\.?(/|$)' or percorso ~ '[[:cntrl:]]' then raise exception 'Percorso documento non valido' using errcode='42501'; end if;
   if not exists(select 1 from storage.objects where bucket_id='ddt-documenti' and name=percorso) then raise exception 'Il caricamento non è completo: ritenta senza scattare di nuovo'; end if;
  end loop;
 end loop;
 select * into j from ddt_document_jobs where id=p_id;
 if found then
  if j.company_id<>p_company or j.created_by is distinct from auth.uid() or j.file_hash<>p_hash then raise exception 'Identità documento già usata' using errcode='42501'; end if;
  if j.status='error' and j.ddt_id is null then
   update ddt_document_jobs set status=v_stato,attempts=0,retry_at=now(),last_error=null,lease_id=null,lease_until=null,updated_at=now() where id=j.id returning * into j;
  end if;
  return jsonb_build_object('id',j.id,'status',j.status,'duplicate',true);
 end if;
 insert into ddt_document_jobs(id,company_id,created_by,order_id,source,file_hash,files,status,destinazione,warehouse_id)
 values(p_id,p_company,auth.uid(),p_order,p_source,p_hash,p_files,v_stato,v_dest,v_wh) on conflict(company_id,file_hash) do nothing returning * into j;
 if not found then
  select * into j from ddt_document_jobs where company_id=p_company and file_hash=p_hash;
  if j.created_by is distinct from auth.uid() and not v_ufficio then return jsonb_build_object('duplicate',true,'id',null,'status','already_present'); end if;
  if j.status='error' and j.ddt_id is null then
   update ddt_document_jobs set status=v_stato,attempts=0,retry_at=now(),last_error=null,lease_id=null,lease_until=null,updated_at=now() where id=j.id returning * into j;
  end if;
  return jsonb_build_object('id',j.id,'status',j.status,'duplicate',true);
 end if;
 return jsonb_build_object('id',j.id,'status',j.status,'duplicate',false);
end $function$;
revoke all on function public.ddt_documento_accoda(uuid,uuid,uuid,jsonb,text,text,text,uuid) from public, anon;
grant execute on function public.ddt_documento_accoda(uuid,uuid,uuid,jsonb,text,text,text,uuid) to authenticated;

-- «Leggi con l'AI» su un documento «da leggere»: lo avvia l'ufficio (chi può registrarlo).
-- La rilettura di un errore resta com'era: l'autore o l'ufficio.
create or replace function public.ddt_documento_ritenta(p_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare j public.ddt_document_jobs%rowtype;
begin
 select * into j from ddt_document_jobs where id=p_id for update;
 if not found or auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno() or not coalesce(public.user_can_access_company(j.company_id),false) or not coalesce(j.created_by=auth.uid() or public.campo_e_ufficio(j.company_id) or public.e_super_admin_dentro(j.company_id),false) then raise exception 'Documento non disponibile' using errcode='42501'; end if;
 if j.status='da_leggere' then
  if j.ddt_id is not null then raise exception 'Questo documento è già registrato'; end if;
  if not coalesce(public.campo_e_ufficio(j.company_id) or public.e_super_admin_dentro(j.company_id)
     or public.has_permission_for_company(auth.uid(),'can_edit_orders',j.company_id)
     or public.has_permission_for_company(auth.uid(),'can_manage_purchasing',j.company_id)
     or public.has_permission_for_company(auth.uid(),'can_edit_warehouse',j.company_id),false) then
   raise exception 'La lettura con l''AI la avvia l''ufficio' using errcode='42501';
  end if;
 elsif j.status<>'error' then raise exception 'Puoi riprovare soltanto una lettura non riuscita'; end if;
 update ddt_document_jobs set status='queued',attempts=0,retry_at=now(),last_error=null,lease_id=null,lease_until=null,updated_at=now() where id=p_id;
end $function$;
revoke all on function public.ddt_documento_ritenta(uuid) from public, anon;
grant execute on function public.ddt_documento_ritenta(uuid) to authenticated;

-- Un PDF di più bolle mai letto si divide anche da «da leggere».
create or replace function public.ddt_documento_diviso(p_id uuid, p_figli uuid[])
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare j public.ddt_document_jobs%rowtype;
begin
 select * into j from ddt_document_jobs where id=p_id for update;
 if not found or auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno() or not coalesce(public.user_can_access_company(j.company_id),false) or not coalesce(j.created_by=auth.uid() or public.campo_e_ufficio(j.company_id) or public.e_super_admin_dentro(j.company_id),false) then raise exception 'Documento non disponibile' using errcode='42501'; end if;
 if j.ddt_id is not null or j.status not in ('review','error','split','da_leggere') then raise exception 'Questo documento non può essere diviso adesso'; end if;
 if p_figli is null or cardinality(p_figli) not between 1 and 300 or p_id=any(p_figli) or (select count(*) from ddt_document_jobs where id=any(p_figli) and company_id=j.company_id)<>cardinality(p_figli) then raise exception 'Prima salva tutte le bolle estratte da questo PDF'; end if;
 update ddt_document_jobs set status='split',split_ids=p_figli,updated_at=now() where id=p_id;
end $function$;
revoke all on function public.ddt_documento_diviso(uuid, uuid[]) from public, anon;
grant execute on function public.ddt_documento_diviso(uuid, uuid[]) to authenticated;

-- ─── 3. Registrazione: destinazione del lavoro, magazzino automatico o in sospeso ─
create or replace function public.ddt_documento_registra(p_id uuid, p_dati jsonb, p_altra_versione boolean default false)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare j public.ddt_document_jobs%rowtype; v_id uuid; v_order uuid; v_supplier uuid; v_oda uuid; v_numero text; v_data date; v_dest text; v_wh uuid; r jsonb; n int:=0; f jsonb; v_attivi int;
begin
 select * into j from ddt_document_jobs where id=p_id for update;
 if not found or auth.uid() is null or public.utente_bloccato() or not coalesce(public.user_can_access_company(j.company_id),false)
 or not coalesce(public.has_permission_for_company(auth.uid(),'can_edit_orders',j.company_id) or public.has_permission_for_company(auth.uid(),'can_manage_purchasing',j.company_id) or public.has_permission_for_company(auth.uid(),'can_edit_warehouse',j.company_id) or public.e_super_admin_dentro(j.company_id),false) then raise exception 'Non puoi registrare questo documento' using errcode='42501'; end if;
 if j.ddt_id is not null then return j.ddt_id; end if;
 -- «da leggere»: l'ufficio la compila a mano senza passare dall'AI.
 if j.status not in ('review','error','da_leggere') then raise exception 'Aspetta la lettura del documento'; end if;
 v_order:=nullif(p_dati->>'order_id','')::uuid;v_supplier:=nullif(p_dati->>'supplier_id','')::uuid;v_oda:=nullif(p_dati->>'purchase_order_id','')::uuid;
 v_dest:=coalesce(nullif(p_dati->>'destinazione',''),j.destinazione,case when j.order_id is null then 'magazzino' else 'cantiere' end);
 v_numero:=btrim(p_dati->>'numero_ddt');v_data:=nullif(p_dati->>'data_ricezione','')::date;
 if coalesce(v_numero,'')='' or length(v_numero)>100 or v_data is null or v_dest not in ('cantiere','magazzino') then raise exception 'Controlla numero, data e destinazione'; end if;
 if v_order is not null and not exists(select 1 from orders where id=v_order and company_id=j.company_id and deleted_at is null) then raise exception 'Commessa non disponibile' using errcode='42501'; end if;
 if v_dest='cantiere' and v_order is null then raise exception 'Per la consegna in cantiere scegli la commessa'; end if;
 if v_supplier is not null and not exists(select 1 from suppliers where id=v_supplier and company_id=j.company_id) then raise exception 'Fornitore non valido' using errcode='42501'; end if;
 if v_oda is not null and not exists(select 1 from purchase_orders where id=v_oda and company_id=j.company_id and supplier_id is not distinct from v_supplier and (order_id is null or order_id=v_order) and status in ('inviato','confermato','parziale','ricevuto')) then raise exception 'L’OdA deve essere emesso e appartenere al fornitore e alla commessa scelti'; end if;
 if not p_altra_versione and exists(select 1 from ddt_ricezione where company_id=j.company_id and supplier_id is not distinct from v_supplier and upper(regexp_replace(numero_ddt,'[[:space:]./_-]','','g'))=upper(regexp_replace(v_numero,'[[:space:]./_-]','','g')) and data_ricezione=v_data) then raise exception 'Stesso numero, data e fornitore già presenti: confronta le versioni prima di registrare'; end if;
 if v_dest='magazzino' then
  v_wh:=coalesce(nullif(p_dati->>'warehouse_id','')::uuid,j.warehouse_id);
  if v_wh is not null and not exists(select 1 from warehouses where id=v_wh and company_id=j.company_id) then raise exception 'Magazzino non disponibile' using errcode='42501'; end if;
  if v_wh is null then
   -- Un magazzino solo: quello. Più d'uno: il predefinito, se c'è. Nessuno: carico in sospeso.
   select count(*) into v_attivi from warehouses where company_id=j.company_id and coalesce(is_active,true);
   if v_attivi=1 then
    select id into v_wh from warehouses where company_id=j.company_id and coalesce(is_active,true);
   elsif v_attivi>1 then
    select id into v_wh from warehouses where company_id=j.company_id and coalesce(is_active,true) and is_default order by position nulls last, created_at limit 1;
   end if;
  end if;
 else
  v_wh:=null;
 end if;
 if jsonb_typeof(p_dati->'righe') is distinct from 'array' or jsonb_array_length(p_dati->'righe')>500 then raise exception 'Righe del documento non valide'; end if;
 f:=j.files->0;
 insert into ddt_ricezione(company_id,created_by,order_id,supplier_id,purchase_order_id,numero_ddt,data_ricezione,destinazione,warehouse_id,stato,quantita_ricevuta,note,source,ai_lettura,ai_confidenza,ddt_file_url,ddt_file_name,ddt_file_mime,ddt_file_bucket,corriere,targa_mezzo,autista_nome,trasporto_a_cura_di,porto,ai_avvisi,ricezione_esplicita)
 values(j.company_id,auth.uid(),v_order,v_supplier,v_oda,v_numero,v_data,v_dest,v_wh,'ricevuto',0,nullif(p_dati->>'note',''),case j.source when 'desktop' then 'manual' else j.source end,j.result,case when j.result is null then null else least(1,greatest(0,public.num_da_json(j.result->>'confidence'))) end,f->>'path',f->>'name',f->>'mime',coalesce(f->>'bucket','ddt-documenti'),nullif(p_dati->>'corriere',''),nullif(p_dati->>'targa_mezzo',''),nullif(p_dati->>'autista_nome',''),case when p_dati->>'trasporto_a_cura_di' in ('fornitore','noi','terzi') then p_dati->>'trasporto_a_cura_di' end,case when p_dati->>'porto' in ('franco','assegnato') then p_dati->>'porto' end,array(select jsonb_array_elements_text(case when jsonb_typeof(j.result->'warnings')='array' then j.result->'warnings' else '[]'::jsonb end)),true) returning id into v_id;
 for r in select * from jsonb_array_elements(p_dati->'righe') loop
  n:=n+1;
  if nullif(btrim(r->>'descrizione'),'') is null or coalesce((r->>'quantita')::numeric,0)<0 or coalesce((r->>'prezzo_unitario')::numeric,0)<0 then raise exception 'Controlla descrizioni, quantità e prezzi'; end if;
  if nullif(r->>'purchase_order_item_id','') is not null and not exists(select 1 from purchase_order_items where id=(r->>'purchase_order_item_id')::uuid and purchase_order_id=v_oda and company_id=j.company_id) then raise exception 'La riga non appartiene all’OdA scelto' using errcode='42501'; end if;
  insert into ddt_righe(ddt_ricezione_id,company_id,posizione,descrizione,codice_articolo,quantita,unita_misura,prezzo_unitario,importo,iva_percentuale,origine,ai_originale,purchase_order_item_id,abbinamento)
  values(v_id,j.company_id,n,left(r->>'descrizione',4000),nullif(r->>'codice_articolo',''),nullif(r->>'quantita','')::numeric,nullif(r->>'unita_misura',''),nullif(r->>'prezzo_unitario','')::numeric,nullif(r->>'importo','')::numeric,nullif(r->>'iva_percentuale','')::numeric,case when r->>'origine'='manuale' then 'manuale' else 'ai' end,r->'ai_originale',nullif(r->>'purchase_order_item_id','')::uuid,case when nullif(r->>'purchase_order_item_id','') is not null then 'manuale' else null end);
 end loop;
 update ddt_ricezione set quantita_ricevuta=(select coalesce(sum(quantita),0) from ddt_righe where ddt_ricezione_id=v_id) where id=v_id;
 update ddt_document_jobs set ddt_id=v_id,order_id=v_order,destinazione=v_dest,warehouse_id=v_wh,status='registered',updated_at=now() where id=p_id;
 return v_id;
end $function$;
revoke all on function public.ddt_documento_registra(uuid,jsonb,boolean) from public, anon;
grant execute on function public.ddt_documento_registra(uuid,jsonb,boolean) to authenticated;

