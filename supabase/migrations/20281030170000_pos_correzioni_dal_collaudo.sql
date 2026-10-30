-- POS: correzioni dal collaudo del 30/10/2026 (analisi del lavoro del 26-28/10).
--
-- 1) Nessun POS con versione_prodotti = 1 (quelli del client attuale) si poteva approvare: pos_prodotti_verifica
--    (SECURITY INVOKER, chiamata da service_role dalla funzione genera-pos) blocca le righe di
--    sicurezza_prodotti_impieghi con SELECT ... FOR SHARE, e PostgreSQL per il blocco di riga chiede UPDATE su
--    almeno una colonna: a service_role mancava (42501). Stesso rimedio già usato per sicurezza_profili_requisiti.
--    Le prove delle fixture giravano come postgres e non l'hanno visto.
-- 2) «Salva modello» falliva per ogni POS creato col client attuale: il vincolo ammetteva solo le chiavi
--    lavorazioni e versione_modello, mentre genera-pos scrive anche i marcatori di versione.
-- 3) pos_psc_verifica confrontava titolo, nome file e revisione col valore grezzo del fascicolo, mentre il POS
--    li salva senza spazi di testa e di coda: un PSC con «Rev. 02 » restava non approvabile per sempre.
-- 4) Gli allegati del POS arrivano dal client dentro il JSON del contenuto: genera-pos li scarica con la chiave di
--    servizio. Un percorso con %2e%2e, ? o # usciva dalla cartella del POS. Il trigger accetta solo percorsi
--    <azienda>/pos/<pos>/<nome semplice>, e solo per quelli nuovi o cambiati (i vecchi non si toccano).
set local lock_timeout='3s';
set local statement_timeout='60s';

grant update (id) on public.sicurezza_prodotti_impieghi to service_role;

alter table public.pos_modelli_aziendali drop constraint if exists pos_modelli_aziendali_contenuto_check;
alter table public.pos_modelli_aziendali add constraint pos_modelli_aziendali_contenuto_check check (
  jsonb_typeof(contenuto)='object'
  and contenuto ? 'lavorazioni'
  and (contenuto - 'lavorazioni' - 'versione_modello' - 'versione_requisiti_addetti' - 'versione_tecnica' - 'versione_fonti_tecniche' - 'versione_mezzi' - 'versione_documenti_mezzi')='{}'::jsonb
  and coalesce(contenuto->'versione_modello','1'::jsonb)='1'::jsonb
  and coalesce(contenuto->'versione_requisiti_addetti','1'::jsonb)='1'::jsonb
  and coalesce(contenuto->'versione_tecnica','1'::jsonb)='1'::jsonb
  and coalesce(contenuto->'versione_fonti_tecniche','1'::jsonb)='1'::jsonb
  and coalesce(contenuto->'versione_mezzi','1'::jsonb)='1'::jsonb
  and coalesce(contenuto->'versione_documenti_mezzi','1'::jsonb)='1'::jsonb
  and jsonb_typeof(contenuto->'lavorazioni')='array'
  and jsonb_array_length(contenuto->'lavorazioni')>0);

create or replace function public.pos_psc_verifica(_company uuid,_ordine uuid,_contenuto jsonb,_autore uuid)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare r jsonb;d jsonb;bucket text;obj storage.objects;begin
 if _contenuto->'versione_psc' is distinct from '1'::jsonb then return null;end if;
 if _autore is null or not coalesce(public.pos_puo_emettere(_autore,_company),false) or not exists(select 1 from public.orders where id=_ordine and company_id=_company and deleted_at is null) then raise exception 'Riferimento PSC non accessibile' using errcode='42501';end if;
 if _contenuto->'procedure_psc'->'psc_presente' is distinct from 'true'::jsonb then return null;end if;
 r:=_contenuto->'procedure_psc'->'documento';
 if jsonb_typeof(r) is distinct from 'object' or (r-array['archivio','id','company_id','order_id','titolo','file_name','file_path','data_documento','revisione','sha256'])<>'{}'::jsonb or r->>'company_id' is distinct from _company::text or r->>'order_id' is distinct from _ordine::text or coalesce(r->>'id','')!~'^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' or coalesce(r->>'sha256','')!~'^[a-f0-9]{64}$' or length(trim(coalesce(r->>'revisione','')))=0 then raise exception 'Collega originale PSC e revisione di questa commessa';end if;
 if r->>'archivio'='sicurezza_documenti' then
  select to_jsonb(x) into d from public.sicurezza_documenti x where id=(r->>'id')::uuid and company_id=_company and order_id=_ordine and tipo='psc' and subappaltatore_id is null for share;
  bucket:='sicurezza-documenti';
 elsif r->>'archivio'='sicurezza_fascicolo' then
  select to_jsonb(x) into d from public.sicurezza_fascicolo x where id=(r->>'id')::uuid and company_id=_company and order_id=_ordine and tipo='psc' and subappaltatore_id is null and stato<>'non_applicabile' for share;
  bucket:='fascicoli-cantiere';
 else raise exception 'Archivio PSC non supportato';end if;
 if d is null or btrim(r->>'titolo') is distinct from btrim(d->>'titolo') or btrim(r->>'file_name') is distinct from btrim(coalesce(d->>'file_name','')) or r->>'file_path' is distinct from d->>'file_path' or r->>'data_documento' is distinct from coalesce(case when bucket='sicurezza-documenti' then d->>'data_documento' else d->>'data_rilascio' end,'') or (length(btrim(coalesce(d->>'revisione','')))>0 and btrim(r->>'revisione') is distinct from btrim(d->>'revisione')) then raise exception 'La fonte PSC è cambiata o non appartiene alla commessa: riesamina il riferimento' using errcode='40001';end if;
 if left(r->>'file_path',length(_company::text)+1)<>_company::text||'/' or r->>'file_path'~'[\\%?#]' or exists(select 1 from unnest(string_to_array(r->>'file_path','/'))p where p in('','.','..')) then raise exception 'Percorso PSC non valido';end if;
 select * into obj from storage.objects where bucket_id=bucket and name=r->>'file_path' for share;
 if not found or coalesce((obj.metadata->>'size')::bigint,0) not between 1 and 20971520 then raise exception 'Originale PSC assente, vuoto o superiore a 20 MB';end if;
 return r;
end$$;
revoke all on function public.pos_psc_verifica(uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.pos_psc_verifica(uuid,uuid,jsonb,uuid) to service_role;

create or replace function public.pos_allegati_percorsi_guardia() returns trigger language plpgsql security invoker set search_path=public as $$
declare a jsonb;p text;vecchi text[];prefisso text;
begin
 if coalesce(new.document_type,'pos')<>'pos' or jsonb_typeof(new.contenuto->'allegati') is distinct from 'array' then return new;end if;
 prefisso:=new.company_id::text||'/pos/'||new.id::text||'/';
 vecchi:=case when tg_op='UPDATE' and jsonb_typeof(old.contenuto->'allegati')='array' then array(select x->>'file_path' from jsonb_array_elements(old.contenuto->'allegati') x) else '{}'::text[] end;
 for a in select value from jsonb_array_elements(new.contenuto->'allegati') loop
  p:=a->>'file_path';
  if p is null or p='' or p=any(vecchi) then continue;end if;
  if left(p,length(prefisso))<>prefisso or substr(p,length(prefisso)+1)!~'^[A-Za-z0-9][A-Za-z0-9._-]*$' then
   raise exception 'Percorso dell’allegato non valido: carica di nuovo il file dal POS' using errcode='22023';
  end if;
 end loop;
 return new;
end$$;
revoke all on function public.pos_allegati_percorsi_guardia() from public,anon,authenticated;
drop trigger if exists pos_allegati_percorsi_guardia on public.pos_documents;
create trigger pos_allegati_percorsi_guardia before insert or update of contenuto on public.pos_documents for each row execute function public.pos_allegati_percorsi_guardia();
notify pgrst,'reload schema';
