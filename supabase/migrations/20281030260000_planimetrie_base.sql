-- Planimetrie, fase 1: archivio delle piante con le versioni (30/10/2026).
--
-- STATO: PRONTA, NON APPLICATA. L'applicazione la decide il founder.
-- Attenzione: un file in supabase/migrations/ va in produzione al primo push su
-- main (controllo «Supabase Preview»). Prima di unire il ramo a main:
--   1. applicarla con apply_migration (nome: planimetrie_base);
--   2. riallineare la versione a 20281030260000 (vedi CLAUDE.md);
--   3. controllare v_funzioni_aperte_ad_anon (nessuna riga nuova) e
--      admin_backup_tabelle_scoperte() (vuota).
--
-- Cosa crea (piano: docs/superpowers/specs/2026-10-30-planimetrie-design.md, scelta 8;
-- contratto del documento: docs/planimetrie/modello.md):
-- - planimetrie            una pianta per riga, con i collegamenti (commessa,
--                          preventivo, computo, sopralluogo, contatto) e la versione corrente;
-- - planimetrie_versioni   il documento JSON di ogni salvataggio, mai modificato:
--                          il computo ricorda la versione da cui ha preso le misure;
-- - planimetrie_file       sorgenti caricate (PDF, foto, DXF) ed esportazioni, nel
--                          contenitore privato «planimetrie», sotto <azienda>/<pianta>/;
-- - computo_voci_misure    tre colonne per dire da quale pianta, versione e quantità
--                          viene una riga di misura;
-- - planimetria_crea / planimetria_salva_versione: le due scritture che devono essere
--   atomiche (numero di versione e versione corrente insieme). SECURITY INVOKER: valgono
--   le stesse regole di accesso delle tabelle.
--
-- Accesso: tutta l'azienda (le planimetrie sono per tutte le aziende), come le righe di
-- misura del computo: niente clienti esterni, niente utenti bloccati, niente scritture
-- per chi è in sola lettura. Nessun accesso ad anon.
--
-- Idempotente: si può rieseguire.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ─── planimetrie ─────────────────────────────────────────────────────────────
create table if not exists public.planimetrie (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies(id) on delete cascade,
  titolo              text not null check (length(btrim(titolo)) between 1 and 200),
  descrizione         text check (descrizione is null or length(descrizione) <= 2000),
  stato               text not null default 'bozza' check (stato in ('bozza', 'in_uso', 'archiviata')),
  order_id            uuid references public.orders(id) on delete set null,
  quote_id            uuid references public.quotes(id) on delete set null,
  computo_upload_id   uuid references public.computo_uploads(id) on delete set null,
  survey_id           uuid references public.surveys(id) on delete set null,
  contact_id          uuid references public.marketing_contacts(id) on delete set null,
  -- 0 solo nell'istante fra la creazione e il primo salvataggio (planimetria_crea li fa insieme)
  versione_corrente   integer not null default 0 check (versione_corrente >= 0),
  created_by          uuid default auth.uid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);

comment on table public.planimetrie is
  'Piante degli immobili (modulo Planimetrie). Il disegno sta in planimetrie_versioni; qui titolo, collegamenti e versione corrente.';
comment on column public.planimetrie.versione_corrente is
  'Numero dell''ultima versione salvata (planimetrie_versioni.numero). La cambia solo planimetria_salva_versione.';

create index if not exists planimetrie_company_idx on public.planimetrie (company_id, updated_at desc) where deleted_at is null;
create index if not exists planimetrie_order_idx on public.planimetrie (order_id) where order_id is not null;
create index if not exists planimetrie_quote_idx on public.planimetrie (quote_id) where quote_id is not null;
create index if not exists planimetrie_computo_idx on public.planimetrie (computo_upload_id) where computo_upload_id is not null;
create index if not exists planimetrie_survey_idx on public.planimetrie (survey_id) where survey_id is not null;
create index if not exists planimetrie_contact_idx on public.planimetrie (contact_id) where contact_id is not null;
create index if not exists planimetrie_created_by_idx on public.planimetrie (created_by);

-- ─── planimetrie_versioni ────────────────────────────────────────────────────
create table if not exists public.planimetrie_versioni (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies(id) on delete cascade,
  planimetria_id    uuid not null references public.planimetrie(id) on delete cascade,
  numero            integer not null check (numero > 0),
  schema_versione   integer not null check (schema_versione > 0),
  documento         jsonb not null
                    check (jsonb_typeof(documento) = 'object'
                           and jsonb_typeof(documento -> 'livelli') = 'array'
                           and pg_column_size(documento) <= 5242880),
  -- Copia delle quantità calcolate al salvataggio (shared/planimetrie/quantita.ts):
  -- si rileggono senza ricalcolare. La verità resta il documento.
  quantita          jsonb check (quantita is null or jsonb_typeof(quantita) = 'object'),
  origine           text not null default 'manuale'
                    check (origine in ('manuale', 'ai_pdf', 'ai_foto', 'ai_schizzo', 'ai_testo', 'sopralluogo', 'importazione')),
  nota              text check (nota is null or length(nota) <= 500),
  created_by        uuid default auth.uid(),
  created_at        timestamptz not null default now(),
  constraint planimetrie_versioni_numero_unico unique (planimetria_id, numero)
);

comment on table public.planimetrie_versioni is
  'Ogni salvataggio di una pianta: documento JSON (contratto in docs/planimetrie/modello.md) e quantità calcolate. Non si modifica: si aggiunge.';

create index if not exists planimetrie_versioni_company_idx on public.planimetrie_versioni (company_id);
create index if not exists planimetrie_versioni_created_by_idx on public.planimetrie_versioni (created_by);

-- ─── planimetrie_file ────────────────────────────────────────────────────────
create table if not exists public.planimetrie_file (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies(id) on delete cascade,
  planimetria_id    uuid not null references public.planimetrie(id) on delete cascade,
  -- La versione da cui nasce un'esportazione; null per le sorgenti.
  versione          integer check (versione is null or versione > 0),
  ruolo             text not null check (ruolo in ('sorgente', 'esportazione', 'anteprima')),
  formato           text not null check (formato in ('pdf', 'png', 'jpg', 'webp', 'heic', 'svg', 'dxf', 'dwg', 'glb', 'gltf', 'obj')),
  file_name         text not null check (length(file_name) between 1 and 200),
  mime_type         text,
  size_bytes        bigint check (size_bytes is null or size_bytes between 1 and 52428800),
  storage_path      text not null unique,
  created_by        uuid default auth.uid(),
  created_at        timestamptz not null default now(),
  constraint planimetrie_file_percorso
    check (storage_path like company_id::text || '/' || planimetria_id::text || '/%' and storage_path not like '%..%')
);

comment on table public.planimetrie_file is
  'File di una pianta nel contenitore «planimetrie»: sorgenti (PDF, foto, DXF da ricalcare) ed esportazioni (PDF, DXF, PNG, glTF, OBJ).';

create index if not exists planimetrie_file_planimetria_idx on public.planimetrie_file (planimetria_id, created_at desc);
create index if not exists planimetrie_file_company_idx on public.planimetrie_file (company_id);
create index if not exists planimetrie_file_created_by_idx on public.planimetrie_file (created_by);

-- ─── Coerenza: tutto della stessa azienda ───────────────────────────────────
create or replace function public.planimetrie_collegamenti_stessa_azienda()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.order_id is not null and not exists (select 1 from public.orders o where o.id = new.order_id and o.company_id = new.company_id))
     or (new.quote_id is not null and not exists (select 1 from public.quotes q where q.id = new.quote_id and q.company_id = new.company_id))
     or (new.computo_upload_id is not null and not exists (select 1 from public.computo_uploads c where c.id = new.computo_upload_id and c.company_id = new.company_id))
     or (new.survey_id is not null and not exists (select 1 from public.surveys s where s.id = new.survey_id and s.company_id = new.company_id))
     or (new.contact_id is not null and not exists (select 1 from public.marketing_contacts m where m.id = new.contact_id and m.company_id = new.company_id)) then
    raise exception using errcode = '42501', message = 'Il collegamento non è di questa azienda.';
  end if;
  return new;
end $$;
revoke all on function public.planimetrie_collegamenti_stessa_azienda() from public, anon, authenticated;

drop trigger if exists planimetrie_collegamenti_stessa_azienda on public.planimetrie;
create trigger planimetrie_collegamenti_stessa_azienda
  before insert or update of company_id, order_id, quote_id, computo_upload_id, survey_id, contact_id on public.planimetrie
  for each row execute function public.planimetrie_collegamenti_stessa_azienda();

-- La versione corrente deve esistere; l'azienda di una pianta non cambia.
create or replace function public.planimetrie_versione_corrente_esiste()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.company_id <> old.company_id then
    raise exception using errcode = '42501', message = 'Una pianta non può cambiare azienda.';
  end if;
  if new.versione_corrente <> old.versione_corrente
     and not exists (select 1 from public.planimetrie_versioni v where v.planimetria_id = new.id and v.numero = new.versione_corrente) then
    raise exception using errcode = '23514', message = 'La versione indicata della pianta non esiste.';
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function public.planimetrie_versione_corrente_esiste() from public, anon, authenticated;

drop trigger if exists planimetrie_versione_corrente_esiste on public.planimetrie;
create trigger planimetrie_versione_corrente_esiste
  before update on public.planimetrie
  for each row execute function public.planimetrie_versione_corrente_esiste();

-- Versioni e file: della stessa azienda della pianta.
create or replace function public.planimetrie_figlio_stessa_azienda()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.planimetrie p where p.id = new.planimetria_id and p.company_id = new.company_id) then
    raise exception using errcode = '42501', message = 'La pianta non è di questa azienda.';
  end if;
  return new;
end $$;
revoke all on function public.planimetrie_figlio_stessa_azienda() from public, anon, authenticated;

drop trigger if exists planimetrie_versioni_stessa_azienda on public.planimetrie_versioni;
create trigger planimetrie_versioni_stessa_azienda
  before insert or update of company_id, planimetria_id on public.planimetrie_versioni
  for each row execute function public.planimetrie_figlio_stessa_azienda();

drop trigger if exists planimetrie_file_stessa_azienda on public.planimetrie_file;
create trigger planimetrie_file_stessa_azienda
  before insert or update of company_id, planimetria_id on public.planimetrie_file
  for each row execute function public.planimetrie_figlio_stessa_azienda();

-- ─── Permessi e regole di accesso ───────────────────────────────────────────
alter table public.planimetrie enable row level security;
alter table public.planimetrie_versioni enable row level security;
alter table public.planimetrie_file enable row level security;

revoke all on public.planimetrie from public, anon;
revoke all on public.planimetrie_versioni from public, anon;
revoke all on public.planimetrie_file from public, anon;
grant select, insert, update, delete on public.planimetrie to authenticated;
-- Le versioni non si modificano e non si cancellano (se ne vanno con la pianta).
revoke update, delete on public.planimetrie_versioni from authenticated;
grant select, insert on public.planimetrie_versioni to authenticated;
grant select, insert, delete on public.planimetrie_file to authenticated;
grant all on public.planimetrie to service_role;
grant all on public.planimetrie_versioni to service_role;
grant all on public.planimetrie_file to service_role;

-- planimetrie
drop policy if exists planimetrie_legge on public.planimetrie;
create policy planimetrie_legge on public.planimetrie for select to authenticated
  using (company_id in (select p.company_id from public.profiles p where p.id = (select auth.uid()))
         and not (select public.utente_e_cliente_esterno()));
drop policy if exists planimetrie_crea on public.planimetrie;
create policy planimetrie_crea on public.planimetrie for insert to authenticated
  with check (company_id in (select p.company_id from public.profiles p where p.id = (select auth.uid()))
              and not (select public.utente_e_cliente_esterno())
              and not public.utente_sola_lettura(company_id)
              and created_by = (select auth.uid()));
drop policy if exists planimetrie_modifica on public.planimetrie;
create policy planimetrie_modifica on public.planimetrie for update to authenticated
  using (company_id in (select p.company_id from public.profiles p where p.id = (select auth.uid()))
         and not (select public.utente_e_cliente_esterno())
         and not public.utente_sola_lettura(company_id))
  with check (company_id in (select p.company_id from public.profiles p where p.id = (select auth.uid())));
drop policy if exists planimetrie_toglie on public.planimetrie;
create policy planimetrie_toglie on public.planimetrie for delete to authenticated
  using (company_id in (select p.company_id from public.profiles p where p.id = (select auth.uid()))
         and not (select public.utente_e_cliente_esterno())
         and not public.utente_sola_lettura(company_id));
drop policy if exists blocco_utente_bloccato on public.planimetrie;
create policy blocco_utente_bloccato on public.planimetrie as restrictive for all to authenticated
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));

-- planimetrie_versioni
drop policy if exists planimetrie_versioni_legge on public.planimetrie_versioni;
create policy planimetrie_versioni_legge on public.planimetrie_versioni for select to authenticated
  using (company_id in (select p.company_id from public.profiles p where p.id = (select auth.uid()))
         and not (select public.utente_e_cliente_esterno()));
drop policy if exists planimetrie_versioni_aggiunge on public.planimetrie_versioni;
create policy planimetrie_versioni_aggiunge on public.planimetrie_versioni for insert to authenticated
  with check (company_id in (select p.company_id from public.profiles p where p.id = (select auth.uid()))
              and not (select public.utente_e_cliente_esterno())
              and not public.utente_sola_lettura(company_id)
              and created_by = (select auth.uid()));
drop policy if exists blocco_utente_bloccato on public.planimetrie_versioni;
create policy blocco_utente_bloccato on public.planimetrie_versioni as restrictive for all to authenticated
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));

-- planimetrie_file
drop policy if exists planimetrie_file_legge on public.planimetrie_file;
create policy planimetrie_file_legge on public.planimetrie_file for select to authenticated
  using (company_id in (select p.company_id from public.profiles p where p.id = (select auth.uid()))
         and not (select public.utente_e_cliente_esterno()));
drop policy if exists planimetrie_file_aggiunge on public.planimetrie_file;
create policy planimetrie_file_aggiunge on public.planimetrie_file for insert to authenticated
  with check (company_id in (select p.company_id from public.profiles p where p.id = (select auth.uid()))
              and not (select public.utente_e_cliente_esterno())
              and not public.utente_sola_lettura(company_id)
              and created_by = (select auth.uid()));
drop policy if exists planimetrie_file_toglie on public.planimetrie_file;
create policy planimetrie_file_toglie on public.planimetrie_file for delete to authenticated
  using (company_id in (select p.company_id from public.profiles p where p.id = (select auth.uid()))
         and not (select public.utente_e_cliente_esterno())
         and not public.utente_sola_lettura(company_id));
drop policy if exists blocco_utente_bloccato on public.planimetrie_file;
create policy blocco_utente_bloccato on public.planimetrie_file as restrictive for all to authenticated
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));

-- ─── Scritture atomiche ──────────────────────────────────────────────────────
-- Crea la pianta e la sua versione 1 insieme. Restituisce l'id della pianta.
create or replace function public.planimetria_crea(
  p_company_id         uuid,
  p_titolo             text,
  p_documento          jsonb,
  p_quantita           jsonb default null,
  p_origine            text default 'manuale',
  p_nota               text default null,
  p_order_id           uuid default null,
  p_quote_id           uuid default null,
  p_computo_upload_id  uuid default null,
  p_survey_id          uuid default null,
  p_contact_id         uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.planimetrie (company_id, titolo, order_id, quote_id, computo_upload_id, survey_id, contact_id, versione_corrente)
  values (p_company_id, p_titolo, p_order_id, p_quote_id, p_computo_upload_id, p_survey_id, p_contact_id, 1)
  returning id into v_id;

  insert into public.planimetrie_versioni (company_id, planimetria_id, numero, schema_versione, documento, quantita, origine, nota)
  values (p_company_id, v_id, 1, coalesce((p_documento ->> 'schema')::integer, 0), p_documento, p_quantita, coalesce(p_origine, 'manuale'), p_nota);

  return v_id;
end $$;

comment on function public.planimetria_crea(uuid, text, jsonb, jsonb, text, text, uuid, uuid, uuid, uuid, uuid) is
  'Crea una pianta con la versione 1. Valgono le regole di accesso delle tabelle (SECURITY INVOKER).';
revoke all on function public.planimetria_crea(uuid, text, jsonb, jsonb, text, text, uuid, uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.planimetria_crea(uuid, text, jsonb, jsonb, text, text, uuid, uuid, uuid, uuid, uuid) to authenticated, service_role;

-- Salva una nuova versione. Con p_versione_attesa (la versione che l'editor aveva
-- aperto) rifiuta il salvataggio se nel frattempo qualcun altro ne ha salvata una:
-- errore 40001, il client lo traduce in «la pianta è stata salvata da un altro».
create or replace function public.planimetria_salva_versione(
  p_planimetria_id    uuid,
  p_documento         jsonb,
  p_quantita          jsonb default null,
  p_origine           text default 'manuale',
  p_nota              text default null,
  p_versione_attesa   integer default null
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_company uuid;
  v_corrente integer;
begin
  select company_id, versione_corrente into v_company, v_corrente
    from public.planimetrie
   where id = p_planimetria_id and deleted_at is null
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Pianta non trovata.';
  end if;
  if p_versione_attesa is not null and p_versione_attesa <> v_corrente then
    raise exception using errcode = '40001', message = 'La pianta è stata salvata da qualcun altro nel frattempo.';
  end if;

  insert into public.planimetrie_versioni (company_id, planimetria_id, numero, schema_versione, documento, quantita, origine, nota)
  values (v_company, p_planimetria_id, v_corrente + 1, coalesce((p_documento ->> 'schema')::integer, 0), p_documento, p_quantita, coalesce(p_origine, 'manuale'), p_nota);

  update public.planimetrie set versione_corrente = v_corrente + 1 where id = p_planimetria_id;
  return v_corrente + 1;
end $$;

comment on function public.planimetria_salva_versione(uuid, jsonb, jsonb, text, text, integer) is
  'Aggiunge una versione alla pianta e la rende corrente, in un colpo solo. SECURITY INVOKER.';
revoke all on function public.planimetria_salva_versione(uuid, jsonb, jsonb, text, text, integer) from public, anon;
grant execute on function public.planimetria_salva_versione(uuid, jsonb, jsonb, text, text, integer) to authenticated, service_role;

-- ─── Collegamento al computo ────────────────────────────────────────────────
-- Una riga di misura può venire dalla pianta: quale, da quale versione, quali quantità
-- (chiavi di shared/planimetrie/quantita.ts, es. 'fatto:locale:<id>.pavimento_mq').
-- Nessun ON DELETE: una pianta usata dal computo non si cancella (si archivia).
alter table public.computo_voci_misure add column if not exists planimetria_id uuid references public.planimetrie(id);
alter table public.computo_voci_misure add column if not exists planimetria_versione integer;
alter table public.computo_voci_misure add column if not exists planimetria_chiavi text[];

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'computo_voci_misure_planimetria_coerente') then
    alter table public.computo_voci_misure add constraint computo_voci_misure_planimetria_coerente
      check (planimetria_id is not null
             or (planimetria_versione is null and planimetria_chiavi is null)) not valid;
  end if;
end $$;

comment on column public.computo_voci_misure.planimetria_id is 'Pianta da cui viene la misura (modulo Planimetrie).';
comment on column public.computo_voci_misure.planimetria_versione is 'Versione della pianta usata: se ce n''è una più nuova il computo propone l''aggiornamento.';
comment on column public.computo_voci_misure.planimetria_chiavi is 'Chiavi delle quantità sommate in questa riga (docs/planimetrie/modello.md).';

create index if not exists computo_voci_misure_planimetria_idx on public.computo_voci_misure (planimetria_id) where planimetria_id is not null;

create or replace function public.computo_misure_planimetria_stessa_azienda()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.planimetria_id is not null
     and not exists (select 1 from public.planimetrie p where p.id = new.planimetria_id and p.company_id = new.company_id) then
    raise exception using errcode = '42501', message = 'La pianta non è di questa azienda.';
  end if;
  return new;
end $$;
revoke all on function public.computo_misure_planimetria_stessa_azienda() from public, anon, authenticated;

drop trigger if exists computo_misure_planimetria_stessa_azienda on public.computo_voci_misure;
create trigger computo_misure_planimetria_stessa_azienda
  before insert or update of planimetria_id, company_id on public.computo_voci_misure
  for each row execute function public.computo_misure_planimetria_stessa_azienda();

-- ─── Contenitore dei file ────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('planimetrie', 'planimetrie', false, 52428800, array[
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif', 'image/svg+xml',
  'application/dxf', 'image/vnd.dxf', 'image/x-dxf', 'application/acad', 'image/vnd.dwg', 'image/x-dwg',
  'model/gltf-binary', 'model/gltf+json', 'model/obj', 'text/plain', 'application/octet-stream'
])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Percorso: <azienda>/<pianta>/<file>. Stesse regole delle tabelle.
drop policy if exists planimetrie_file_storage_legge on storage.objects;
create policy planimetrie_file_storage_legge on storage.objects for select to authenticated
  using (bucket_id = 'planimetrie'
         and not (select public.utente_bloccato())
         and not (select public.utente_e_cliente_esterno())
         and (storage.foldername(name))[1] in (select p.company_id::text from public.profiles p where p.id = (select auth.uid())));

drop policy if exists planimetrie_file_storage_carica on storage.objects;
create policy planimetrie_file_storage_carica on storage.objects for insert to authenticated
  with check (bucket_id = 'planimetrie'
              and not (select public.utente_bloccato())
              and not (select public.utente_e_cliente_esterno())
              and (storage.foldername(name))[1] in (select p.company_id::text from public.profiles p where p.id = (select auth.uid()))
              and not public.utente_sola_lettura((select p.company_id from public.profiles p where p.id = (select auth.uid()))));

drop policy if exists planimetrie_file_storage_toglie on storage.objects;
create policy planimetrie_file_storage_toglie on storage.objects for delete to authenticated
  using (bucket_id = 'planimetrie'
         and not (select public.utente_bloccato())
         and not (select public.utente_e_cliente_esterno())
         and (storage.foldername(name))[1] in (select p.company_id::text from public.profiles p where p.id = (select auth.uid()))
         and not public.utente_sola_lettura((select p.company_id from public.profiles p where p.id = (select auth.uid()))));
