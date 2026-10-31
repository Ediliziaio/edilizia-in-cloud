-- ════════════════════════════════════════════════════════════════════════════
-- Silvio crea la commessa, lotti 1.4 e 2.2: la bozza salvata, la creazione, il
-- completamento e l'annullamento. Vedi docs/piano-silvio-commessa-ai.md, 3.5 e 5.2.
-- ════════════════════════════════════════════════════════════════════════════
-- `commessa_bozze`: il popup salva qui il piano (PianoCommessa) e, accanto, la
-- `scrittura`: la stessa bozza già tradotta in colonne e righe dalla funzione pura
-- `scritturaDalPiano` (shared/silvio-commessa/scrittura.ts). La traduzione sta in un
-- posto solo, provato coi test; le RPC qui sotto la leggono, la controllano (permessi,
-- azienda di ogni id, colonne ammesse) e la scrivono. Il piano serve alle RPC solo per
-- i conflitti: se ce n'è uno aperto non si crea niente.
--
-- Una sola strada di scrittura: la commessa nasce con `create_order_atomic` (o con
-- `crea_commessa_preventivo_atomic` se viene da un preventivo accettato), le fasi e le
-- sottofasi con `aggiungi_fasi_commessa`, le date con `commessa_pianifica_fasi`, le
-- rate di una commessa che non ne ha con `order_rate_sostituisci`. Scrivono qui solo
-- quello che nessuna funzione scrive: le colonne fuori dalla whitelist della creazione
-- (come fa CreateOrder dopo la RPC), le voci previste delle fasi e le condizioni del
-- contratto.
--
-- Le condizioni del contratto (CIG, CUP, ritenuta, anticipo, subappalto…): una riga
-- in `contratti_documents` con le colonne che ci sono già (numero, durata, penale al
-- giorno, garanzia) e l'oggetto intero in `ai_generated_raw.condizioni_silvio`. Niente
-- colonne nuove: oggi nessuna pagina le legge, e il JSON regge finché una non le
-- userà (allora una colonna generata o una migrazione di poche righe).
--
-- Scadenze previsionali: non si scrivono. Il previsionale di cassa legge già le rate
-- (useForecastLedger: order_installments + scadenze); una scadenza per rata le
-- conterebbe due volte.
--
-- L'annullamento: `commessa_bozze_scritture` registra ogni riga che Silvio ha creato
-- (tutte quelle nate nella sua transazione, anche dai trigger: si riconoscono da
-- `created_at = now()`) e ogni colonna che ha riempito, col valore di prima.
-- `commessa_annulla_silvio` toglie solo quelle, e si rifiuta se qualcuno ci ha
-- lavorato sopra: una riga di Silvio modificata dopo, una riga nuova che le punta
-- (rapportino, fattura, costo, allegato…), una colonna che non ha più il valore di
-- Silvio. Il registro non lo scrive nessun client: solo le RPC.
--
-- Idempotente. Nessun dato esistente viene toccato. Richiede 20281106090000.
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ── La bozza ────────────────────────────────────────────────────────────────
create table if not exists public.commessa_bozze (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  -- crea: nasce una commessa nuova · completa: aggiunge a `order_id`, che c'è già.
  modo text not null default 'crea',
  piano jsonb not null default '{}'::jsonb,
  -- La traduzione del piano per le RPC (scritturaDalPiano): la scrive il client col piano.
  scrittura jsonb,
  -- I file caricati: [{ path, nome, mime, dimensione, fonte }] in silvio-uploads.
  fonti jsonb not null default '[]'::jsonb,
  -- La storia delle modifiche, per l'annulla del popup (StoriaModifiche di fondi.ts).
  storia jsonb not null default '[]'::jsonb,
  -- La commessa da completare, o quella nata dalla bozza.
  order_id uuid references public.orders(id) on delete set null,
  stato text not null default 'bozza',
  -- Quando Silvio ha scritto (crea o completa): l'annullamento lo usa come confine.
  eseguita_il timestamptz,
  scade_il timestamptz not null default now() + interval '30 days',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commessa_bozze_modo check (modo in ('crea', 'completa')),
  constraint commessa_bozze_stato check (stato in ('bozza', 'creata', 'completata')),
  constraint commessa_bozze_completa_con_commessa check (modo = 'crea' or order_id is not null or stato = 'bozza'),
  constraint commessa_bozze_scritta_quando check ((stato = 'bozza') = (eseguita_il is null))
);

create index if not exists commessa_bozze_autore_idx on public.commessa_bozze (company_id, created_by, updated_at desc);
create index if not exists commessa_bozze_commessa_idx on public.commessa_bozze (order_id) where order_id is not null;
create index if not exists commessa_bozze_scadenza_idx on public.commessa_bozze (scade_il) where stato = 'bozza';

comment on table public.commessa_bozze is
  'Bozza della commessa che Silvio prepara nel popup: piano, scrittura per le RPC, fonti caricate, storia. Si salva da sola; scade 30 giorni dopo l''ultima modifica. Vedi docs/piano-silvio-commessa-ai.md, 5.2.';

-- Ogni modifica sposta la scadenza: 30 giorni dall'ultima volta che ci si è lavorato.
create or replace function public.commessa_bozze_tocca()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if new.stato = 'bozza' then
    new.scade_il := now() + interval '30 days';
  end if;
  return new;
end
$$;
revoke all on function public.commessa_bozze_tocca() from public, anon, authenticated;

drop trigger if exists commessa_bozze_tocca on public.commessa_bozze;
create trigger commessa_bozze_tocca before update on public.commessa_bozze
  for each row execute function public.commessa_bozze_tocca();

alter table public.commessa_bozze enable row level security;
revoke all on public.commessa_bozze from public, anon, authenticated;
grant select, delete on public.commessa_bozze to authenticated;
-- Stato, eseguita_il, scadenza e (dopo la nascita) order_id li scrivono solo le RPC.
grant insert (company_id, modo, piano, scrittura, fonti, storia, order_id) on public.commessa_bozze to authenticated;
grant update (piano, scrittura, fonti, storia) on public.commessa_bozze to authenticated;
grant all on public.commessa_bozze to service_role;

-- Ognuno vede e tocca le proprie bozze, nell'azienda dove può modificare le commesse.
drop policy if exists commessa_bozze_proprie on public.commessa_bozze;
create policy commessa_bozze_proprie on public.commessa_bozze for select to authenticated
  using (created_by = (select auth.uid())
         and public.has_permission_for_company((select auth.uid()), 'can_edit_orders', company_id));

drop policy if exists commessa_bozze_nuova on public.commessa_bozze;
create policy commessa_bozze_nuova on public.commessa_bozze for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and public.has_permission_for_company((select auth.uid()), 'can_edit_orders', company_id)
    and stato = 'bozza'
    and (modo = 'crea') = (order_id is null)
    and (order_id is null or exists (
      select 1 from public.orders o
       where o.id = commessa_bozze.order_id and o.company_id = commessa_bozze.company_id and o.deleted_at is null))
  );

drop policy if exists commessa_bozze_modifica on public.commessa_bozze;
create policy commessa_bozze_modifica on public.commessa_bozze for update to authenticated
  using (created_by = (select auth.uid()) and stato = 'bozza'
         and public.has_permission_for_company((select auth.uid()), 'can_edit_orders', company_id))
  with check (created_by = (select auth.uid()) and stato = 'bozza');

-- Si butta via una bozza che non ha ancora scritto niente.
drop policy if exists commessa_bozze_elimina on public.commessa_bozze;
create policy commessa_bozze_elimina on public.commessa_bozze for delete to authenticated
  using (created_by = (select auth.uid()) and stato = 'bozza'
         and public.has_permission_for_company((select auth.uid()), 'can_edit_orders', company_id));

-- La chiave esterna che silvio_correzioni (lotto 0.3) aspettava. In cascata: una
-- correzione senza commessa vive solo con la sua bozza.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'silvio_correzioni_bozza_fkey'
                   and conrelid = 'public.silvio_correzioni'::regclass) then
    alter table public.silvio_correzioni
      add constraint silvio_correzioni_bozza_fkey foreign key (bozza_id)
      references public.commessa_bozze(id) on delete cascade;
  end if;
end
$$;

-- ── Il registro di quello che Silvio ha scritto ─────────────────────────────
create table if not exists public.commessa_bozze_scritture (
  id bigint generated always as identity primary key,
  bozza_id uuid not null references public.commessa_bozze(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  tabella text not null,
  riga_id uuid not null,
  -- creata: la riga è nata da Silvio · aggiornata: Silvio ha riempito `colonne`.
  azione text not null,
  -- Per «aggiornata»: { colonna: { prima, dopo } }.
  colonne jsonb,
  scritta_il timestamptz not null default now(),
  constraint commessa_bozze_scritture_azione check (azione in ('creata', 'aggiornata')),
  constraint commessa_bozze_scritture_colonne check ((azione = 'aggiornata') = (colonne is not null))
);

create index if not exists commessa_bozze_scritture_bozza_idx on public.commessa_bozze_scritture (bozza_id, tabella);

comment on table public.commessa_bozze_scritture is
  'Ogni riga creata e ogni colonna riempita da Silvio per una bozza: la base di commessa_annulla_silvio. La scrivono solo le RPC.';

alter table public.commessa_bozze_scritture enable row level security;
revoke all on public.commessa_bozze_scritture from public, anon, authenticated;
grant select on public.commessa_bozze_scritture to authenticated;
grant all on public.commessa_bozze_scritture to service_role;

drop policy if exists commessa_bozze_scritture_proprie on public.commessa_bozze_scritture;
create policy commessa_bozze_scritture_proprie on public.commessa_bozze_scritture for select to authenticated
  using (exists (select 1 from public.commessa_bozze b
                  where b.id = commessa_bozze_scritture.bozza_id and b.created_by = (select auth.uid())));

-- ── Pezzi interni (nessun EXECUTE per i client) ─────────────────────────────

-- Le colonne di `orders` che Silvio può riempire. La stessa lista è
-- COLONNE_SCRIVIBILI in shared/silvio-commessa/scrittura.ts: un test le confronta.
create or replace function public._silvio_colonne_scrivibili()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'order_code', 'description', 'work_description', 'tipo_lavoro', 'internal_notes', 'sede_id',
    'client_name', 'client_company', 'client_phone', 'client_email', 'client_address', 'opportunity_id',
    'indirizzo_lavori', 'work_address', 'work_lat', 'work_lng', 'materials_location',
    'total_amount', 'vat_rate', 'has_building_bonus', 'payment_type',
    'work_start_date', 'work_end_date', 'expected_date',
    'assigned_to', 'capomastro_user_id',
    'next_action', 'next_action_date', 'weekly_report_enabled', 'giornale_auto_enabled',
    'dl_notification_email', 'dl_notification_phone'
  ]::text[]
$$;

-- La bozza da scrivere, bloccata, dopo i controlli comuni: chi chiama, azienda,
-- permesso, scadenza.
create or replace function public._silvio_bozza(p_bozza_id uuid)
returns public.commessa_bozze
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.commessa_bozze;
begin
  if auth.uid() is null then
    raise exception 'Sessione scaduta. Accedi di nuovo.' using errcode = '42501';
  end if;
  select * into b from public.commessa_bozze where id = p_bozza_id for update;
  if not found or b.created_by is distinct from auth.uid()
     or public.has_permission_for_company(auth.uid(), 'can_edit_orders', b.company_id) is not true then
    raise exception 'Bozza non trovata, o non hai il permesso di modificare le commesse di questa azienda.' using errcode = '42501';
  end if;
  return b;
end
$$;
revoke all on function public._silvio_bozza(uuid) from public, anon, authenticated;

-- Il cliente del gestionale per la commessa, come lo trova la pagina Nuova commessa:
-- quello scelto; altrimenti il profilo cliente collegato al contatto CRM del
-- preventivo (profiles.marketing_contact_id); altrimenti un solo cliente con la
-- stessa email, o con lo stesso nome (anche invertito). Null se non c'è o è ambiguo.
create or replace function public._silvio_cliente(p_company uuid, p_cliente jsonb, p_quote uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_ids uuid[];
  v_nome text := lower(regexp_replace(btrim(coalesce(p_cliente->>'nome', '')), '\s+', ' ', 'g'));
  v_email text := lower(btrim(coalesce(p_cliente->>'email', '')));
begin
  v_id := nullif(p_cliente->>'customer_id', '')::uuid;
  if v_id is not null then
    if not exists (select 1 from public.profiles p join public.user_roles r on r.user_id = p.id
                    where p.id = v_id and p.company_id = p_company and r.role::text = 'customer') then
      raise exception 'Il cliente scelto non è un cliente di questa azienda.' using errcode = '42501';
    end if;
    return v_id;
  end if;

  if p_quote is not null then
    select array_agg(p.id) into v_ids
      from public.quotes q
      join public.profiles p on p.marketing_contact_id = q.contact_id and p.company_id = p_company
      join public.user_roles r on r.user_id = p.id and r.role::text = 'customer'
     where q.id = p_quote and q.company_id = p_company and q.contact_id is not null;
    if cardinality(v_ids) = 1 then return v_ids[1]; end if;
  end if;

  if v_email like '%@%' then
    select array_agg(p.id) into v_ids
      from public.profiles p join public.user_roles r on r.user_id = p.id and r.role::text = 'customer'
     where p.company_id = p_company and lower(p.email) = v_email;
    if cardinality(v_ids) = 1 then return v_ids[1]; end if;
  end if;

  if v_nome <> '' then
    select array_agg(p.id) into v_ids
      from public.profiles p join public.user_roles r on r.user_id = p.id and r.role::text = 'customer'
     where p.company_id = p_company
       and v_nome in (
         lower(regexp_replace(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '\s+', ' ', 'g')),
         lower(regexp_replace(btrim(coalesce(p.last_name, '') || ' ' || coalesce(p.first_name, '')), '\s+', ' ', 'g')));
    if cardinality(v_ids) = 1 then return v_ids[1]; end if;
  end if;
  return null;
end
$$;
revoke all on function public._silvio_cliente(uuid, jsonb, uuid) from public, anon, authenticated;

-- Le colonne della scrittura, solo quelle ammesse, con gli id controllati: ogni id
-- deve essere di questa azienda (sede, responsabile, capomastro, opportunità).
create or replace function public._silvio_colonne(p_company uuid, p_ordine jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb := '{}'::jsonb;
  k text;
begin
  for k in select jsonb_object_keys(coalesce(p_ordine, '{}'::jsonb)) loop
    if not (k = any (public._silvio_colonne_scrivibili())) then
      raise exception 'Silvio non può scrivere la colonna «%» della commessa.', k using errcode = '22023';
    end if;
    continue when p_ordine->k is null or jsonb_typeof(p_ordine->k) = 'null' or p_ordine->>k = '';
    v := v || jsonb_build_object(k, p_ordine->k);
  end loop;

  if v ? 'sede_id' and not exists (select 1 from public.sedi s where s.id = (v->>'sede_id')::uuid and s.company_id = p_company) then
    raise exception 'La sede indicata non è di questa azienda.' using errcode = '42501';
  end if;
  for k in select unnest(array['assigned_to', 'capomastro_user_id']) loop
    if v ? k and not exists (select 1 from public.profiles p where p.id = (v->>k)::uuid and p.company_id = p_company) then
      raise exception 'La persona indicata come % non è di questa azienda.',
        case k when 'assigned_to' then 'responsabile' else 'capomastro' end using errcode = '42501';
    end if;
  end loop;
  if v ? 'opportunity_id' and not exists (
       select 1 from public.marketing_opportunities o where o.id = (v->>'opportunity_id')::uuid and o.company_id = p_company) then
    v := v - 'opportunity_id';
  end if;
  return v;
end
$$;
revoke all on function public._silvio_colonne(uuid, jsonb) from public, anon, authenticated;

-- La colonna che dice quando è nata una riga: created_at, o changed_at per gli storici
-- come order_status_history. Null se la tabella non ce l'ha (non si può registrare).
create or replace function public._silvio_colonna_nascita(p_tabella oid)
returns text
language sql
stable
set search_path = ''
as $$
  select a.attname::text from pg_attribute a
   where a.attrelid = p_tabella and not a.attisdropped
     and a.attname in ('created_at', 'changed_at')
     and a.atttypid in ('timestamptz'::regtype, 'timestamp'::regtype)
   order by a.attname = 'created_at' desc
   limit 1
$$;
revoke all on function public._silvio_colonna_nascita(oid) from public, anon, authenticated;

-- Registra le righe nate in questa transazione (created_at = now()) che puntano alla
-- commessa, e poi quelle che puntano a loro, fino a tre livelli: fasi → sottofasi →
-- voci. Trova le tabelle dalle chiavi esterne, così una tabella nuova (o un trigger
-- nuovo che crea righe) non sfugge all'annullamento.
create or replace function public._silvio_registra_nuove(p_bozza uuid, p_company uuid, p_order uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fk record;
  v_tot integer := 0;
  v_giro integer := 0;
  v_nuove integer;
  v_n integer;
begin
  loop
    v_nuove := 0;
    for v_fk in
      select distinct figlia.relname as figlia, a.attname as colonna, madre.relname as madre,
             public._silvio_colonna_nascita(figlia.oid) as nascita
        from pg_constraint c
        join pg_class figlia on figlia.oid = c.conrelid
        join pg_namespace nf on nf.oid = figlia.relnamespace and nf.nspname = 'public'
        join pg_class madre on madre.oid = c.confrelid
        join pg_namespace nm on nm.oid = madre.relnamespace and nm.nspname = 'public'
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
       where c.contype = 'f' and cardinality(c.conkey) = 1
         and figlia.relname <> 'commessa_bozze_scritture' and figlia.relname <> 'commessa_bozze'
         and (madre.relname = 'orders'
              or madre.relname in (select s.tabella from public.commessa_bozze_scritture s where s.bozza_id = p_bozza))
         and exists (select 1 from pg_attribute x where x.attrelid = figlia.oid and x.attname = 'id'
                       and x.atttypid = 'uuid'::regtype and not x.attisdropped)
         and public._silvio_colonna_nascita(figlia.oid) is not null
    loop
      execute format(
        'insert into public.commessa_bozze_scritture (bozza_id, company_id, tabella, riga_id, azione)
         select $1, $2, %L, t.id, ''creata'' from public.%I t
          where t.%I = now()
            and t.%I in (select $3 where %L = ''orders''
                         union all
                         select s.riga_id from public.commessa_bozze_scritture s
                          where s.bozza_id = $1 and s.tabella = %L and s.azione = ''creata'')
            and not exists (select 1 from public.commessa_bozze_scritture s
                             where s.bozza_id = $1 and s.tabella = %L and s.riga_id = t.id)',
        v_fk.figlia, v_fk.figlia, v_fk.nascita, v_fk.colonna, v_fk.madre, v_fk.madre, v_fk.figlia)
      using p_bozza, p_company, p_order;
      get diagnostics v_n = row_count;
      v_nuove := v_nuove + v_n;
    end loop;
    v_tot := v_tot + v_nuove;
    v_giro := v_giro + 1;
    exit when v_nuove = 0 or v_giro >= 4;
  end loop;
  return v_tot;
end
$$;
revoke all on function public._silvio_registra_nuove(uuid, uuid, uuid) from public, anon, authenticated;

-- Il lavoro comune a «crea» e «completa», su una commessa che c'è: colonne vuote,
-- fasi che mancano (con sottofasi, date e voci previste), le date delle fasi che ci
-- sono senza date (`date_fasi`, fase 3), rate se non ce ne sono,
-- condizioni del contratto se non c'è un contratto. Solo aggiunte: un valore già
-- presente non si tocca. Registra le colonne riempite col valore di prima.
create or replace function public._silvio_aggiungi(p_bozza public.commessa_bozze, p_order uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s jsonb := coalesce(p_bozza.scrittura, '{}'::jsonb);
  o public.orders;
  v_colonne jsonb;
  v_vuote jsonb := '{}'::jsonb;
  v_prima jsonb;
  v_dopo jsonb;
  v_diff jsonb := '{}'::jsonb;
  k text;
  v_set text;
  v_fasi jsonb := '[]'::jsonb;
  v_date jsonb := '[]'::jsonb;
  v_fase jsonb;
  v_sotto jsonb;
  v_base integer;
  v_fase_id uuid;
  v_sotto_id uuid;
  v_i integer;
  v_j integer;
  v_q numeric;
  v_costo numeric;
  v_voci integer := 0;
  v_fasi_prima jsonb;
  v_fasi_dopo jsonb;
  v_rate integer := 0;
  v_contratto boolean := false;
  c jsonb;
begin
  select * into o from public.orders where id = p_order and company_id = p_bozza.company_id for update;
  v_prima := to_jsonb(o);

  -- Colonne: solo quelle vuote (null o testo vuoto). Uno 0 scritto è un valore: resta.
  v_colonne := public._silvio_colonne(p_bozza.company_id, s->'ordine');
  for k in select jsonb_object_keys(v_colonne) loop
    if v_prima->k is null or jsonb_typeof(v_prima->k) = 'null' or v_prima->>k = '' then
      v_vuote := v_vuote || jsonb_build_object(k, v_colonne->k);
    end if;
  end loop;
  if v_vuote <> '{}'::jsonb then
    select string_agg(format('%I = r.%I', k2, k2), ', ') into v_set from jsonb_object_keys(v_vuote) k2;
    execute format('update public.orders o set %s from jsonb_populate_record(null::public.orders, $1) r where o.id = $2', v_set)
      using v_vuote, p_order;
  end if;

  -- Fasi che mancano, per nome (come commessa_pianifica_fasi), con le sottofasi.
  select coalesce(jsonb_object_agg(f.id::text, jsonb_build_object('start_date', f.start_date, 'end_date', f.end_date)), '{}'::jsonb)
    into v_fasi_prima from public.order_work_phases f where f.order_id = p_order;
  for v_fase in select value from jsonb_array_elements(coalesce(s->'fasi', '[]'::jsonb)) loop
    continue when btrim(coalesce(v_fase->>'nome', '')) = '';
    if nullif(v_fase->>'inizio', '') is not null and nullif(v_fase->>'fine', '') is not null then
      v_date := v_date || jsonb_build_array(jsonb_build_object('nome', v_fase->>'nome', 'inizio', v_fase->>'inizio', 'fine', v_fase->>'fine'));
    end if;
    continue when exists (
      select 1 from public.order_work_phases f
       where f.order_id = p_order
         and lower(regexp_replace(btrim(f.name), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(v_fase->>'nome'), '\s+', ' ', 'g')));
    v_fasi := v_fasi || jsonb_build_array(v_fase);
  end loop;
  -- «Completa» (fase 3): le date proposte per le fasi che la commessa ha già senza date.
  -- Vanno a commessa_pianifica_fasi come le altre: per nome, solo alle fasi senza date.
  for v_fase in select value from jsonb_array_elements(coalesce(s->'date_fasi', '[]'::jsonb)) loop
    continue when btrim(coalesce(v_fase->>'nome', '')) = ''
               or nullif(v_fase->>'inizio', '') is null or nullif(v_fase->>'fine', '') is null;
    v_date := v_date || jsonb_build_array(jsonb_build_object('nome', v_fase->>'nome', 'inizio', v_fase->>'inizio', 'fine', v_fase->>'fine'));
  end loop;

  if jsonb_array_length(v_fasi) > 0 then
    select coalesce(max(position) + 1, 0) into v_base from public.order_work_phases where order_id = p_order;
    perform public.aggiungi_fasi_commessa(p_order, (
      select jsonb_agg(jsonb_build_object(
               'nome', f->>'nome',
               'sottofasi', coalesce((select jsonb_agg(jsonb_build_object('nome', x->>'nome', 'giorni', x->'giorni'))
                                        from jsonb_array_elements(coalesce(f->'sottofasi', '[]'::jsonb)) x
                                       where btrim(coalesce(x->>'nome', '')) <> ''), '[]'::jsonb)))
        from jsonb_array_elements(v_fasi) f));

    -- Le voci previste: una per sottofase con quantità, venduto o costo. I costi sono
    -- unitari senza IVA (economiaFasi); il costo del piano è il totale della voce.
    v_i := 0;
    for v_fase in select value from jsonb_array_elements(v_fasi) loop
      select id into v_fase_id from public.order_work_phases
       where order_id = p_order and position = v_base + v_i;
      v_i := v_i + 1;
      continue when v_fase_id is null or coalesce(v_fase->>'origine', '') not in ('preventivo', 'computo');
      v_j := 0;
      for v_sotto in select value from jsonb_array_elements(coalesce(v_fase->'sottofasi', '[]'::jsonb))
                      where btrim(coalesce(value->>'nome', '')) <> '' loop
        select id into v_sotto_id from public.order_work_subphases where phase_id = v_fase_id and position = v_j;
        v_j := v_j + 1;
        continue when nullif(v_sotto->>'costo', '') is null and nullif(v_sotto->>'importo', '') is null;
        v_q := greatest(coalesce(nullif(v_sotto->>'quantita', '')::numeric, 1), 0);
        v_costo := greatest(coalesce(nullif(v_sotto->>'costo', '')::numeric, 0), 0);
        insert into public.order_work_phase_voci
          (company_id, order_id, phase_id, subphase_id, position, descrizione, unita, quantita,
           costo_manodopera, costo_materiali, importo, origine, origine_id, origine_codice)
        values
          (p_bozza.company_id, p_order, v_fase_id, v_sotto_id, v_j - 1, left(v_sotto->>'nome', 500),
           nullif(v_sotto->>'unita', ''), v_q, 0,
           case when v_q > 0 then round(v_costo / v_q, 4) else v_costo end,
           nullif(v_sotto->>'importo', '')::numeric, v_fase->>'origine',
           -- La riga d'origine (voce del computo, riga del preventivo) il piano non la porta:
           -- l'origine è la sottofase, unica nella fase come vuole il vincolo.
           coalesce(v_sotto_id, gen_random_uuid()), nullif(v_sotto->>'codice', ''));
        v_voci := v_voci + 1;
      end loop;
    end loop;
  end if;

  -- Le date: solo alle fasi che non ne hanno (sovrascrivi = false); riempie anche
  -- inizio e fine lavori se mancano.
  if jsonb_array_length(v_date) > 0 then
    perform public.commessa_pianifica_fasi(p_order, v_date, false);
  end if;
  for v_fase in
    select jsonb_build_object('id', f.id, 'start_date', f.start_date, 'end_date', f.end_date)
      from public.order_work_phases f
     where f.order_id = p_order and v_fasi_prima ? f.id::text
       and (f.start_date, f.end_date) is distinct from
           ((v_fasi_prima->f.id::text->>'start_date')::date, (v_fasi_prima->f.id::text->>'end_date')::date)
  loop
    insert into public.commessa_bozze_scritture (bozza_id, company_id, tabella, riga_id, azione, colonne)
    values (p_bozza.id, p_bozza.company_id, 'order_work_phases', (v_fase->>'id')::uuid, 'aggiornata',
            jsonb_build_object(
              'start_date', jsonb_build_object('prima', v_fasi_prima->(v_fase->>'id')->'start_date', 'dopo', v_fase->'start_date'),
              'end_date', jsonb_build_object('prima', v_fasi_prima->(v_fase->>'id')->'end_date', 'dopo', v_fase->'end_date')));
  end loop;

  -- Le rate, se la commessa non ne ha (in «crea» le ha già messe la creazione).
  if jsonb_array_length(coalesce(s->'rate', '[]'::jsonb)) > 0
     and not exists (select 1 from public.order_installments where order_id = p_order) then
    v_rate := public.order_rate_sostituisci(p_order, s->'rate');
  end if;

  -- Le condizioni del contratto, se la commessa non ha un contratto.
  c := s->'condizioni';
  if jsonb_typeof(c) = 'object' and c <> '{}'::jsonb
     and not exists (select 1 from public.contratti_documents where order_id = p_order) then
    select * into o from public.orders where id = p_order;
    insert into public.contratti_documents
      (company_id, order_id, numero_contratto, status, committente_nome, oggetto_lavori, ubicazione_cantiere,
       importo_totale_eur, data_inizio_lavori, durata_giorni, penale_ritardo_eur_giorno, garanzia_anni,
       ai_generated_raw, generated_by, created_by)
    values
      (p_bozza.company_id, p_order, nullif(c->>'numero_contratto', ''), 'bozza',
       coalesce(nullif(o.client_company, ''), o.client_name), coalesce(o.work_description, o.description),
       coalesce(o.indirizzo_lavori, o.work_address), nullif(o.total_amount, 0), o.work_start_date,
       nullif(c->>'durata_giorni', '')::integer, nullif(c->>'penale_giorno_eur', '')::numeric,
       nullif(c->>'garanzia_anni', '')::integer,
       jsonb_build_object('condizioni_silvio', c, 'bozza_id', p_bozza.id), 'silvio', auth.uid());
    v_contratto := true;
  end if;

  -- Le colonne della commessa riempite qui (anche dai trigger e da pianifica_fasi).
  select to_jsonb(x) into v_dopo from public.orders x where x.id = p_order;
  for k in select jsonb_object_keys(v_dopo) loop
    continue when k in ('updated_at', 'version');
    if (v_prima->k) is distinct from (v_dopo->k) then
      v_diff := v_diff || jsonb_build_object(k, jsonb_build_object('prima', v_prima->k, 'dopo', v_dopo->k));
    end if;
  end loop;
  if v_diff <> '{}'::jsonb then
    insert into public.commessa_bozze_scritture (bozza_id, company_id, tabella, riga_id, azione, colonne)
    values (p_bozza.id, p_bozza.company_id, 'orders', p_order, 'aggiornata', v_diff);
  end if;

  return jsonb_build_object('colonne', (select count(*) from jsonb_object_keys(v_diff)),
                            'fasi', jsonb_array_length(v_fasi), 'voci', v_voci,
                            'rate', v_rate, 'contratto', v_contratto);
end
$$;
revoke all on function public._silvio_aggiungi(public.commessa_bozze, uuid) from public, anon, authenticated;

-- I controlli prima di scrivere: bozza aperta, non scaduta, scrittura presente,
-- nessun conflitto aperto.
create or replace function public._silvio_pronta(b public.commessa_bozze)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_conflitti integer := coalesce(jsonb_array_length(case when jsonb_typeof(b.piano->'conflitti') = 'array' then b.piano->'conflitti' end), 0);
begin
  if b.stato <> 'bozza' then
    raise exception 'Questa bozza è già stata usata: annulla prima quello che ha fatto Silvio.' using errcode = '22023';
  end if;
  if b.scade_il < now() then
    raise exception 'La bozza è scaduta: ricomincia dalle fonti.' using errcode = '22023';
  end if;
  if jsonb_typeof(b.scrittura) is distinct from 'object' then
    raise exception 'La bozza non è ancora pronta: salvala e riprova.' using errcode = '22023';
  end if;
  if v_conflitti > 0 then
    raise exception '% in conflitto: scegli quale tenere prima di continuare.',
      case when v_conflitti = 1 then 'C''è un valore' else 'Ci sono ' || v_conflitti || ' valori' end
      using errcode = '22023';
  end if;
end
$$;
revoke all on function public._silvio_pronta(public.commessa_bozze) from public, anon, authenticated;

-- ── Crea ────────────────────────────────────────────────────────────────────
create or replace function public.commessa_crea_con_silvio(p_bozza_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  b public.commessa_bozze := public._silvio_bozza(p_bozza_id);
  s jsonb;
  v_colonne jsonb;
  v_quote uuid;
  v_cliente uuid;
  v_dati jsonb;
  v_venditore jsonb;
  v_esito jsonb;
  v_order uuid;
  v_resto jsonb;
  v_set text;
  v_aggiunte jsonb;
  v_registrate integer;
begin
  perform public._silvio_pronta(b);
  if b.modo <> 'crea' then
    raise exception 'Questa bozza completa una commessa che c''è già: usa «Completa».' using errcode = '22023';
  end if;
  s := b.scrittura;
  v_colonne := public._silvio_colonne(b.company_id, s->'ordine');
  v_quote := nullif(s->>'preventivo_id', '')::uuid;
  if v_quote is not null and not exists (select 1 from public.quotes where id = v_quote and company_id = b.company_id) then
    raise exception 'Il preventivo d''origine non è di questa azienda.' using errcode = '42501';
  end if;

  v_cliente := public._silvio_cliente(b.company_id, coalesce(s->'cliente', '{}'::jsonb), v_quote);
  if v_cliente is null then
    raise exception 'Manca il cliente: sceglilo o crealo, poi crea la commessa.' using errcode = '22023';
  end if;

  if nullif(v_colonne->>'order_code', '') is null then
    v_colonne := v_colonne || jsonb_build_object('order_code', public.prossimo_numero_commessa(b.company_id));
  end if;

  -- I campi della creazione (whitelist di create_order_atomic); il resto dopo, come CreateOrder.
  v_dati := jsonb_build_object('company_id', b.company_id, 'customer_id', v_cliente) || (
    select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from jsonb_each(v_colonne)
     where key in ('order_code', 'description', 'total_amount', 'vat_rate', 'payment_type', 'expected_date',
                   'internal_notes', 'work_start_date', 'work_end_date', 'has_building_bonus', 'assigned_to'));

  select jsonb_build_object('salesperson_id', sp.id, 'commission_type', sp.commission_type, 'commission_value', sp.commission_value)
    into v_venditore
    from public.salespeople sp
   where sp.id = nullif(s->>'venditore', '')::uuid and sp.company_id = b.company_id;

  if v_quote is not null then
    v_esito := public.crea_commessa_preventivo_atomic(v_quote, v_dati, coalesce(s->'righe', '[]'::jsonb),
                                                      coalesce(s->'rate', '[]'::jsonb), v_venditore, null);
  else
    v_esito := public.create_order_atomic(v_dati, coalesce(s->'righe', '[]'::jsonb), v_venditore, auth.uid(),
                                          coalesce(s->'rate', '[]'::jsonb));
  end if;
  v_order := (v_esito->>'id')::uuid;
  if v_order is null then
    raise exception 'La commessa non è nata: risposta inattesa dalla creazione.';
  end if;

  -- Le colonne fuori dalla whitelist della creazione, su una commessa appena nata:
  -- quello che la persona ha tenuto nel popup vince anche su quanto il preventivo ha
  -- copiato (importo e IVA compresi, se ha scelto il contratto).
  v_resto := v_colonne - array['order_code', 'description', 'payment_type', 'expected_date', 'internal_notes',
                               'work_start_date', 'work_end_date', 'has_building_bonus', 'assigned_to'];
  if v_quote is null then
    v_resto := v_resto - array['total_amount', 'vat_rate'];
  end if;
  v_resto := v_resto || jsonb_build_object('created_by', auth.uid());
  select string_agg(format('%I = r.%I', k, k), ', ') into v_set from jsonb_object_keys(v_resto) k;
  execute format('update public.orders o set %s from jsonb_populate_record(null::public.orders, $1) r where o.id = $2', v_set)
    using v_resto, v_order;

  update public.commessa_bozze
     set stato = 'creata', order_id = v_order, eseguita_il = now()
   where id = b.id;
  b.order_id := v_order;

  insert into public.commessa_bozze_scritture (bozza_id, company_id, tabella, riga_id, azione)
  values (b.id, b.company_id, 'orders', v_order, 'creata');

  -- Fasi, voci, date, condizioni: la stessa strada del completamento.
  v_aggiunte := public._silvio_aggiungi(b, v_order);
  -- Su una commessa nata qui le colonne «aggiornate» non servono: si toglie tutta.
  delete from public.commessa_bozze_scritture where bozza_id = b.id and azione = 'aggiornata';
  v_registrate := public._silvio_registra_nuove(b.id, b.company_id, v_order);

  return jsonb_build_object('order_id', v_order, 'customer_id', v_cliente, 'righe_registrate', v_registrate + 1)
         || v_aggiunte;
end
$$;

-- ── Completa ────────────────────────────────────────────────────────────────
create or replace function public.commessa_completa_con_silvio(p_bozza_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  b public.commessa_bozze := public._silvio_bozza(p_bozza_id);
  o public.orders;
  v_cliente uuid;
  v_aggiunte jsonb;
  v_registrate integer;
begin
  perform public._silvio_pronta(b);
  if b.modo <> 'completa' or b.order_id is null then
    raise exception 'Questa bozza crea una commessa nuova: usa «Crea».' using errcode = '22023';
  end if;
  select * into o from public.orders where id = b.order_id and company_id = b.company_id and deleted_at is null;
  if not found or public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id) is not true then
    raise exception 'Commessa non trovata o non accessibile.' using errcode = '42501';
  end if;

  update public.commessa_bozze set stato = 'completata', eseguita_il = now() where id = b.id;

  -- Il cliente solo se la commessa non ce l'ha: un'aggiunta come le altre.
  if o.customer_id is null then
    v_cliente := public._silvio_cliente(b.company_id, coalesce(b.scrittura->'cliente', '{}'::jsonb),
                                        nullif(b.scrittura->>'preventivo_id', '')::uuid);
    if v_cliente is not null then
      update public.orders set customer_id = v_cliente where id = o.id;
      -- La differenza la registra _silvio_aggiungi: la prima istantanea è presa dopo,
      -- quindi qui va scritta a parte.
      insert into public.commessa_bozze_scritture (bozza_id, company_id, tabella, riga_id, azione, colonne)
      values (b.id, b.company_id, 'orders', o.id, 'aggiornata',
              jsonb_build_object('customer_id', jsonb_build_object('prima', null, 'dopo', v_cliente)));
    end if;
  end if;

  v_aggiunte := public._silvio_aggiungi(b, o.id);
  v_registrate := public._silvio_registra_nuove(b.id, b.company_id, o.id);
  return jsonb_build_object('order_id', o.id, 'righe_registrate', v_registrate) || v_aggiunte;
end
$$;

-- ── Allegati: le fonti diventano documenti della commessa ───────────────────
-- Il client copia i file da silvio-uploads a order-attachments (percorsoDocumento:
-- orders/<commessa>/…) e li registra qui: entrano nel registro, e l'annullamento li
-- toglie insieme al resto (restituisce i percorsi da cancellare dallo storage).
create or replace function public.commessa_bozza_allega(p_bozza_id uuid, p_allegati jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.commessa_bozze := public._silvio_bozza(p_bozza_id);
  a jsonb;
  v_n integer := 0;
begin
  if b.stato = 'bozza' or b.order_id is null then
    raise exception 'La commessa non è ancora nata: crea prima la commessa.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_allegati) is distinct from 'array' or jsonb_array_length(p_allegati) > 20 then
    raise exception 'Allegati non validi: al massimo 20 per volta.' using errcode = '22023';
  end if;
  for a in select value from jsonb_array_elements(p_allegati) loop
    if coalesce(a->>'path', '') not like 'orders/' || b.order_id || '/%' or a->>'path' like '%..%'
       or btrim(coalesce(a->>'nome', '')) = '' then
      raise exception 'Percorso dell''allegato non valido.' using errcode = '22023';
    end if;
    insert into public.order_attachments (order_id, file_name, file_url, file_type, file_size, uploaded_by, visible_to_customer)
    values (b.order_id, left(a->>'nome', 255), a->>'path', coalesce(nullif(a->>'mime', ''), 'application/octet-stream'),
            greatest(coalesce((a->>'dimensione')::integer, 0), 0), auth.uid(), false);
    v_n := v_n + 1;
  end loop;
  perform public._silvio_registra_nuove(b.id, b.company_id, b.order_id);
  return v_n;
end
$$;

-- ── Annulla ─────────────────────────────────────────────────────────────────
create or replace function public.commessa_annulla_silvio(p_bozza_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  b public.commessa_bozze := public._silvio_bozza(p_bozza_id);
  o public.orders;
  v_creata boolean;
  r record;
  v_fk record;
  v_trovata boolean;
  v_colonna text;
  v_attuale jsonb;
  v_file text[];
  v_set text;
  v_tolte integer := 0;
  v_n integer;
  c jsonb;
begin
  if b.stato = 'bozza' or b.order_id is null then
    raise exception 'Non c''è niente da annullare: Silvio non ha ancora scritto.' using errcode = '22023';
  end if;
  select * into o from public.orders where id = b.order_id and company_id = b.company_id for update;
  if not found or public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id) is not true then
    raise exception 'Commessa non trovata o non accessibile.' using errcode = '42501';
  end if;
  v_creata := b.stato = 'creata';

  -- 1. Una riga di Silvio modificata dopo.
  for r in select s.tabella, min(s.scritta_il) as quando, array_agg(s.riga_id) as ids
             from public.commessa_bozze_scritture s
            where s.bozza_id = b.id and s.azione = 'creata'
              and exists (select 1 from pg_attribute x join pg_class t on t.oid = x.attrelid
                            join pg_namespace n on n.oid = t.relnamespace and n.nspname = 'public'
                           where t.relname = s.tabella and x.attname = 'updated_at' and not x.attisdropped)
            group by s.tabella loop
    execute format('select exists (select 1 from public.%I where id = any ($1) and updated_at > $2)', r.tabella)
      into v_trovata using r.ids, r.quando;
    if v_trovata then
      raise exception 'Non si può annullare: qualcuno ha già modificato % creati da Silvio.', r.tabella using errcode = '55000';
    end if;
  end loop;

  -- 2. Una riga nuova che punta a una riga di Silvio (rapportino, fattura, costo,
  --    allegato…). Su una commessa che Silvio ha solo completato, quelle che puntano
  --    alla commessa sono di chi ci lavora, e non contano.
  for v_fk in
    select distinct figlia.relname as figlia, a.attname as colonna, madre.relname as madre
      from pg_constraint c2
      join pg_class figlia on figlia.oid = c2.conrelid
      join pg_namespace nf on nf.oid = figlia.relnamespace and nf.nspname = 'public'
      join pg_class madre on madre.oid = c2.confrelid
      join pg_namespace nm on nm.oid = madre.relnamespace and nm.nspname = 'public'
      join pg_attribute a on a.attrelid = c2.conrelid and a.attnum = c2.conkey[1]
     where c2.contype = 'f' and cardinality(c2.conkey) = 1
       and figlia.relname not in ('commessa_bozze', 'commessa_bozze_scritture', 'silvio_correzioni')
       and madre.relname in (select s.tabella from public.commessa_bozze_scritture s
                              where s.bozza_id = b.id and s.azione = 'creata')
       and exists (select 1 from pg_attribute x where x.attrelid = figlia.oid and x.attname = 'id'
                     and x.atttypid = 'uuid'::regtype and not x.attisdropped)
       -- Le stesse tabelle che _silvio_registra_nuove sa registrare: per le altre non si
       -- distingue una riga nata con Silvio da una aggiunta dopo.
       and public._silvio_colonna_nascita(figlia.oid) is not null
  loop
    execute format(
      'select exists (select 1 from public.%I t
                       where t.%I in (select s.riga_id from public.commessa_bozze_scritture s
                                       where s.bozza_id = $1 and s.tabella = %L and s.azione = ''creata'')
                         and not exists (select 1 from public.commessa_bozze_scritture s
                                          where s.bozza_id = $1 and s.tabella = %L and s.riga_id = t.id))',
      v_fk.figlia, v_fk.colonna, v_fk.madre, v_fk.figlia)
      into v_trovata using b.id;
    if v_trovata then
      raise exception 'Non si può annullare: qualcuno ci ha già lavorato sopra (%).', v_fk.figlia using errcode = '55000';
    end if;
  end loop;

  -- 3. Una colonna riempita da Silvio che non ha più il suo valore.
  for r in select s.id, s.tabella, s.riga_id, s.colonne from public.commessa_bozze_scritture s
            where s.bozza_id = b.id and s.azione = 'aggiornata' loop
    execute format('select to_jsonb(t) from public.%I t where t.id = $1', r.tabella) into v_attuale using r.riga_id;
    for v_colonna in select jsonb_object_keys(r.colonne) loop
      if v_attuale is not null and (v_attuale->v_colonna) is distinct from (r.colonne->v_colonna->'dopo') then
        raise exception 'Non si può annullare: «%» è stato cambiato dopo Silvio.', v_colonna using errcode = '55000';
      end if;
    end loop;
  end loop;

  -- I file da togliere dallo storage, prima che le righe spariscano.
  select array_agg(x.f) into v_file from (
    select a.file_url as f from public.order_attachments a
     where a.id in (select s.riga_id from public.commessa_bozze_scritture s
                     where s.bozza_id = b.id and s.tabella = 'order_attachments' and s.azione = 'creata')
    union all
    select a.thumb_path from public.order_attachments a
     where a.thumb_path is not null
       and a.id in (select s.riga_id from public.commessa_bozze_scritture s
                     where s.bozza_id = b.id and s.tabella = 'order_attachments' and s.azione = 'creata')) x;

  -- Le colonne tornano com'erano.
  for r in select s.tabella, s.riga_id, s.colonne from public.commessa_bozze_scritture s
            where s.bozza_id = b.id and s.azione = 'aggiornata' order by s.id desc loop
    select string_agg(format('%I = r.%I', k, k), ', ') into v_set from jsonb_object_keys(r.colonne) k;
    select jsonb_object_agg(k, r.colonne->k->'prima') into c from jsonb_object_keys(r.colonne) k;
    execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I, $1) r where t.id = $2',
                   r.tabella, v_set, r.tabella)
      using c, r.riga_id;
  end loop;

  -- Le righe di Silvio, dall'ultima alla prima: i figli prima dei padri. La commessa
  -- nata da Silvio è la prima registrata, quindi l'ultima a sparire.
  for r in select s.tabella, s.riga_id from public.commessa_bozze_scritture s
            where s.bozza_id = b.id and s.azione = 'creata' order by s.id desc loop
    execute format('delete from public.%I where id = $1', r.tabella) using r.riga_id;
    get diagnostics v_n = row_count;
    v_tolte := v_tolte + v_n;
  end loop;

  delete from public.commessa_bozze_scritture where bozza_id = b.id;
  update public.commessa_bozze
     set stato = 'bozza', eseguita_il = null, order_id = case when v_creata then null else order_id end
   where id = b.id;

  return jsonb_build_object('righe_tolte', v_tolte, 'commessa_tolta', v_creata,
                            'file_da_togliere', coalesce(to_jsonb(v_file), '[]'::jsonb));
end
$$;

revoke all on function public.commessa_crea_con_silvio(uuid) from public, anon;
revoke all on function public.commessa_completa_con_silvio(uuid) from public, anon;
revoke all on function public.commessa_bozza_allega(uuid, jsonb) from public, anon;
revoke all on function public.commessa_annulla_silvio(uuid) from public, anon;
grant execute on function public.commessa_crea_con_silvio(uuid) to authenticated;
grant execute on function public.commessa_completa_con_silvio(uuid) to authenticated;
grant execute on function public.commessa_bozza_allega(uuid, jsonb) to authenticated;
grant execute on function public.commessa_annulla_silvio(uuid) to authenticated;
