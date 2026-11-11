-- Una bolla andata in errore si rilegge, non ripresenta l'errore vecchio (11/11/2026).
--
-- Bonarrigo, 11/11/2026: 7 bolle caricate la mattina erano finite in «error» perché la lettura AI
-- chiedeva la carta (payment_method = none). Sbloccata l'azienda, hanno ricaricato lo stesso PDF:
-- ddt_documento_accoda lo riconosceva dal file_hash come già presente e restituiva lo stato «error»
-- di prima, senza rileggerlo. La finestra mostrava ancora «Lettura non riuscita… puoi riprovare».
--
-- 1. ddt_documento_accoda: se il documento già presente è in errore e non è diventato un DDT, lo
--    rimette in coda (come ddt_documento_ritenta) e risponde «queued»: il client avvia la lettura.
-- 2. Quando un'azienda passa da bloccata a sbloccata (carta registrata, regalata, abbonamento
--    rinnovato), le sue bolle in errore degli ultimi 30 giorni ripartono da sole: il cron
--    ddt-documenti-recovery le prende entro un minuto.
-- 3. Le 7 bolle di Bonarrigo (sbloccata l'11/11 prima di questa regola) ripartono adesso.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.ddt_documento_accoda(p_id uuid, p_company uuid, p_order uuid, p_files jsonb, p_hash text, p_source text default 'desktop'::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
   update ddt_document_jobs set status='queued',attempts=0,retry_at=now(),last_error=null,lease_id=null,lease_until=null,updated_at=now() where id=j.id returning * into j;
  end if;
  return jsonb_build_object('id',j.id,'status',j.status,'duplicate',true);
 end if;
 insert into ddt_document_jobs(id,company_id,created_by,order_id,source,file_hash,files)
 values(p_id,p_company,auth.uid(),p_order,p_source,p_hash,p_files) on conflict(company_id,file_hash) do nothing returning * into j;
 if not found then
  select * into j from ddt_document_jobs where company_id=p_company and file_hash=p_hash;
  if j.created_by is distinct from auth.uid() and not coalesce(public.campo_e_ufficio(p_company) or public.e_super_admin_dentro(p_company),false) then return jsonb_build_object('duplicate',true,'id',null,'status','already_present'); end if;
  -- La stessa bolla ricaricata dopo un errore si rilegge (11/11/2026).
  if j.status='error' and j.ddt_id is null then
   update ddt_document_jobs set status='queued',attempts=0,retry_at=now(),last_error=null,lease_id=null,lease_until=null,updated_at=now() where id=j.id returning * into j;
  end if;
  return jsonb_build_object('id',j.id,'status',j.status,'duplicate',true);
 end if;
 return jsonb_build_object('id',j.id,'status',j.status,'duplicate',false);
end $function$;

-- Azienda sbloccata: le bolle in errore ripartono.
create or replace function public.tg_ddt_documenti_ripartono_se_sbloccata()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  regalati constant text[] := array['comped','complimentary','comp','manual_free','gift','gifted','gratis','omaggio'];
  validi constant text[] := array['stripe','bank_transfer','sepa_debit','other','comped'];
  bloccati constant text[] := array['suspended','cancelled','canceled','expired'];
  prima_ok boolean;
  ora_ok boolean;
begin
  prima_ok := lower(coalesce(old.payment_method,'none')) = any(regalati)
           or (lower(coalesce(old.payment_method,'none')) = any(validi) and not lower(coalesce(old.status,'')) = any(bloccati));
  ora_ok := lower(coalesce(new.payment_method,'none')) = any(regalati)
           or (lower(coalesce(new.payment_method,'none')) = any(validi) and not lower(coalesce(new.status,'')) = any(bloccati));
  if ora_ok and not prima_ok then
    update public.ddt_document_jobs
       set status='queued', attempts=0, retry_at=now(), last_error=null, lease_id=null, lease_until=null, updated_at=now()
     where company_id = new.id and status = 'error' and ddt_id is null and created_at > now() - interval '30 days';
  end if;
  return new;
end;
$function$;
revoke all on function public.tg_ddt_documenti_ripartono_se_sbloccata() from public, anon, authenticated;

drop trigger if exists trg_ddt_documenti_ripartono_se_sbloccata on public.companies;
create trigger trg_ddt_documenti_ripartono_se_sbloccata
  after update of payment_method, status on public.companies
  for each row execute function public.tg_ddt_documenti_ripartono_se_sbloccata();

-- Bonarrigo: sbloccata l'11/11/2026 prima di questa regola. Le sue 7 bolle di quel giorno ripartono.
update public.ddt_document_jobs
   set status='queued', attempts=0, retry_at=now(), last_error=null, lease_id=null, lease_until=null, updated_at=now()
 where company_id = '69363cd7-edf7-4f51-9e90-21070094ed3b' and status = 'error' and ddt_id is null;
