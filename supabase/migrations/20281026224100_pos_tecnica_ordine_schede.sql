-- File ricostruito il 27/10/2026 dal registro del database (supabase_migrations.schema_migrations).
-- La migrazione era già applicata in produzione con questa versione, ma il file non era mai stato salvato nel repository:
-- il controllo «Supabase Preview» segnalava «Remote migration versions not found in local migrations directory».
-- Sotto c'è l'SQL esattamente come applicato.

-- Preserve the explicit work-card order while revoking reviews in a new revision.
set local lock_timeout='3s';
set local statement_timeout='60s';
-- No source data backfill: historical simplified documents retain their format.
create or replace function public.pos_tecnica_guardia() returns trigger language plpgsql security invoker set search_path=public as $$
declare l jsonb;t jsonb;r jsonb;k text;v_rows jsonb;begin
 if coalesce(new.document_type,'pos')<>'pos' then return new;end if;
 if tg_op='UPDATE' and old.contenuto->'versione_tecnica'='1'::jsonb and new.contenuto->'versione_tecnica' is distinct from '1'::jsonb then raise exception 'Questo POS richiede le schede tecniche aggiornate: ricarica l’editor' using errcode='40001';end if;
 if new.contenuto ? 'versione_tecnica' and new.contenuto->'versione_tecnica' is distinct from '1'::jsonb then raise exception 'Versione delle schede tecniche non supportata';end if;
 if new.contenuto->'versione_tecnica' is distinct from '1'::jsonb then
  if exists(select 1 from jsonb_array_elements(case when jsonb_typeof(new.contenuto->'lavorazioni')='array' then new.contenuto->'lavorazioni' else '[]'::jsonb end) x where jsonb_typeof(x->'tecnica')='object') then raise exception 'Attiva le schede tecniche prima di conservare i dettagli';end if;
  return new;
 end if;
 -- Every new revision needs a new technical review, including the older direct revision path.
 if tg_op='UPDATE' and old.status='approvato' and new.status='bozza' then
  select coalesce(jsonb_agg(case when jsonb_typeof(x->'tecnica')='object' then jsonb_set(x,'{tecnica,riesaminata}','false'::jsonb,true) else x end order by ord),'[]'::jsonb) into v_rows from jsonb_array_elements(case when jsonb_typeof(new.contenuto->'lavorazioni')='array' then new.contenuto->'lavorazioni' else '[]'::jsonb end) with ordinality as elementi(x,ord);
  new.contenuto:=jsonb_set(new.contenuto,'{lavorazioni}',v_rows,true);
 end if;
 if new.status<>'approvato' or (tg_op='UPDATE' and old.status='approvato') then return new;end if;
 if jsonb_typeof(new.contenuto->'lavorazioni') is distinct from 'array' or jsonb_array_length(new.contenuto->'lavorazioni')=0 then raise exception 'Descrivi le lavorazioni e il dettaglio tecnico prima di approvare';end if;
 for l in select * from jsonb_array_elements(new.contenuto->'lavorazioni') loop
  t:=l->'tecnica';
  if jsonb_typeof(t) is distinct from 'object' or t->'riesaminata' is distinct from 'true'::jsonb then raise exception 'Dettaglio tecnico della lavorazione da riesaminare';end if;
  foreach k in array array['area','interferenze','condizioni_avvio','sospensione','emergenze','prima','durante','dopo'] loop
   if jsonb_typeof(t->k) is distinct from 'string' or length(trim(t->>k))=0 then raise exception 'Dettaglio tecnico: completa %',k;end if;
  end loop;
  if jsonb_typeof(t->'rischi') is distinct from 'array' or jsonb_array_length(t->'rischi') not between 1 and 50 then raise exception 'Descrivi da 1 a 50 rischi specifici per lavorazione';end if;
  for r in select * from jsonb_array_elements(t->'rischi') loop
   foreach k in array array['id','pericolo','esposti','situazione','valutazione_iniziale','misure_collettive','misure_organizzative','dpi','valutazione_residua','riferimento'] loop
    if jsonb_typeof(r->k) is distinct from 'string' or length(trim(r->>k))=0 then raise exception 'Rischio specifico: completa %',k;end if;
   end loop;
  end loop;
  if (select count(distinct x->>'id') from jsonb_array_elements(t->'rischi')x)<>jsonb_array_length(t->'rischi') then raise exception 'Identificativi dei rischi duplicati';end if;
  if jsonb_typeof(t->'attrezzature') is distinct from 'array' or jsonb_array_length(t->'attrezzature')>50 then raise exception 'Elenco attrezzature non valido';end if;
  if coalesce(t->>'attrezzature_previste','') not in ('si','no') then raise exception 'Valuta le attrezzature previste';end if;
  if t->>'attrezzature_previste'='no' and (jsonb_typeof(t->'motivo_senza_attrezzature') is distinct from 'string' or length(trim(coalesce(t->>'motivo_senza_attrezzature','')))=0 or jsonb_array_length(t->'attrezzature')>0) then raise exception 'Motiva l’assenza delle attrezzature e risolvi le schede presenti';end if;
  if t->>'attrezzature_previste'='si' and jsonb_array_length(t->'attrezzature')=0 then raise exception 'Identifica almeno un’attrezzatura effettiva';end if;
  for r in select * from jsonb_array_elements(t->'attrezzature') loop
   foreach k in array array['id','nome','identificativo','impiego','controlli_preuso','manuale_riferimento','formazione_addestramento'] loop
    if jsonb_typeof(r->k) is distinct from 'string' or length(trim(r->>k))=0 then raise exception 'Attrezzatura effettiva: completa %',k;end if;
   end loop;
  end loop;
  if (select count(distinct x->>'id') from jsonb_array_elements(t->'attrezzature')x)<>jsonb_array_length(t->'attrezzature') then raise exception 'Identificativi delle attrezzature duplicati';end if;
 end loop;
 return new;
end$$;
revoke all on function public.pos_tecnica_guardia() from public,anon,authenticated;
drop trigger if exists pos_tecnica_guardia on public.pos_documents;
create trigger pos_tecnica_guardia before insert or update of contenuto,status on public.pos_documents for each row execute function public.pos_tecnica_guardia();
notify pgrst,'reload schema';
