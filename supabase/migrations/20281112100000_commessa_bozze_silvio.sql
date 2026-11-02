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
-- Revisione dell'1/11/2026 (S1, S2, S11, docs/silvio-commessa-revisione-20261101.md):
--   · ogni riga di Silvio ha la sua `istantanea` a fine transazione, e l'annullamento la
--     confronta colonna per colonna: prima si guardava `updated_at`, che `contratti_subappalto`,
--     `order_employees`, `order_external_teams` e altre non hanno (un contratto firmato, le
--     ore del rapportino, una ditta segnata pagata sparivano con «Annulla»);
--   · si rifiuta se una riga QUALUNQUE punta a una riga di Silvio senza essere sua, chiavi a
--     più colonne comprese, anche nelle tabelle senza `created_at` (le spese di un mezzo, le
--     etichette di un'attività): prima quelle andavano via in cascata;
--   · le figlie di una riga nata nella stessa transazione si registrano tutte (sono nuove per
--     forza), anche senza `created_at`;
--   · il messaggio dice cosa è stato toccato e cosa fare;
--   · gli eventi delle automazioni non ancora elaborati sulle righe tolte spariscono con loro.
--
-- Revisione del 2/11/2026 (D1, D2, D3, D6, D9, D11, D12, docs/silvio-commessa-revisione-20261102.md):
--   · l'annullamento non si rifiuta per quello che scrivono le macchine (`_silvio_colonna_di_macchina`,
--     `_silvio_tabelle_di_macchina`, con le prove scritte accanto): resta il rifiuto per il lavoro vero;
--   · il preventivo d'origine torna allo stato di prima, e si può riusare;
--   · la giacenza scaricata da una riga con `stock_item_id` torna in magazzino;
--   · «Completa» scrive l'importo quando la commessa ha 0, il valore predefinito;
--   · cancellare una commessa completata da Silvio non si ferma sul vincolo della bozza;
--   · «Crea» ripetuto dopo una risposta persa restituisce la commessa già nata.
--
-- Idempotente. Nessun dato esistente viene toccato. Richiede 20281112090000.
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
  -- Quale stato finale per quale modo. Non guarda `order_id` (D6): la chiave è ON DELETE SET NULL,
  -- e cancellare una commessa completata da Silvio finiva contro il vincolo. Che una bozza
  -- «completa» nasca con la sua commessa lo dicono la policy d'inserimento e la RPC.
  constraint commessa_bozze_stato_del_modo check (stato = 'bozza' or (modo = 'crea') = (stato = 'creata')),
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

-- Una correzione legata a una bozza si scrive solo sulla propria bozza, della stessa azienda
-- (revisione 1/11, S9): la policy di 20281112090000 non poteva guardarla, perché la tabella
-- delle bozze nasce qui.
drop policy if exists silvio_correzioni_scrittura on public.silvio_correzioni;
create policy silvio_correzioni_scrittura on public.silvio_correzioni for insert to authenticated
  with check (
    public.has_permission_for_company((select auth.uid()), 'can_edit_orders', company_id)
    and user_id = (select auth.uid())
    and (order_id is null or exists (
      select 1 from public.orders o where o.id = silvio_correzioni.order_id and o.company_id = silvio_correzioni.company_id))
    and (bozza_id is null or exists (
      select 1 from public.commessa_bozze b
       where b.id = silvio_correzioni.bozza_id and b.company_id = silvio_correzioni.company_id
         and b.created_by = (select auth.uid())))
  );

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

-- La riga com'era alla fine della transazione di Silvio (`_silvio_imprimi`): l'annullamento
-- la confronta con quella di adesso.
alter table public.commessa_bozze_scritture add column if not exists istantanea jsonb;

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
-- Serve solo alle RPC di Silvio (revisione 1/11, S10).
revoke all on function public._silvio_colonne_scrivibili() from public, anon, authenticated;

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
  -- Fase 5 (20281112140000): quello che il titolare ha vietato a Silvio esce dalla
  -- scrittura qui, per tutte le RPC. Chiamata per nome: questa migrazione vale anche senza.
  if b.scrittura is not null and to_regprocedure('public._silvio_scrittura_permessa(uuid, jsonb)') is not null then
    execute 'select public._silvio_scrittura_permessa($1, $2)' into b.scrittura using b.company_id, b.scrittura;
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
    -- Solo staff (D11): i clienti sono profili anche loro. I ruoli sono STAFF_ROLES di
    -- src/hooks/useCompanyStaffUsers.ts; il test silvioCommessaSecondaRevisione li confronta.
    if v ? k and not exists (
         select 1 from public.profiles p join public.user_roles r on r.user_id = p.id
          where p.id = (v->>k)::uuid and p.company_id = p_company
            and r.role::text in ('super_admin', 'company_admin', 'company_staff', 'employee', 'worker', 'subcontractor', 'salesperson', 'call_center')) then
      raise exception 'La persona indicata come % non è dello staff di questa azienda.',
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

-- Quello che scrivono le macchine su una riga di Silvio non è lavoro di nessuno, e non deve
-- fermare l'annullamento (D1). L'elenco viene dai cataloghi e dal codice, il 2/11/2026, e
-- resta stretto apposta: ogni voce ha chi la scrive.
--   updated_at, version       → update_updated_at_column e versione_riga, a ogni UPDATE
--   orders.work_geocoded_at   → la funzione geocodifica-cantieri (cron campo-geocodifica-cantieri)
--   orders.distanza_sede_*    → salva_distanza_cantiere (chiunque apra la commessa) e azzera_distanza_cantiere
--   order_work_subphases.ritardo_avvisato_il → il controllo dei ritardi
-- orders.work_lat e work_lng si guardano a parte: il cron riempie solo quelle vuote, quindi una
-- coordinata che Silvio aveva lasciato vuota è sua, una che aveva scritto e che cambia è di una persona.
-- NON ci sono percentuale_avanzamento, deposit_*, balance_*: li ricalcolano i trigger, ma solo
-- quando una persona tocca fasi o rate (e allora la riga di Silvio cambiata c'è, e si dice quella).
create or replace function public._silvio_colonna_di_macchina(p_tabella text, p_colonna text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_colonna in ('updated_at', 'version')
      or (p_tabella = 'orders' and p_colonna in ('work_geocoded_at', 'distanza_sede_km', 'distanza_sede_minuti', 'distanza_sede_il'))
      or (p_tabella = 'order_work_subphases' and p_colonna = 'ritardo_avvisato_il')
$$;
revoke all on function public._silvio_colonna_di_macchina(text, text) from public, anon, authenticated;

-- Le tabelle che puntano alla commessa e che scrivono solo le macchine: non sono lavoro aggiunto.
-- Vanno via con la commessa (in cascata) o restano col puntatore vuoto (SET NULL); nessuna ha
-- ON DELETE NO ACTION. Fuori restano quelle con lavoro vero, anche se generate da un cron
-- (customer_weekly_reports è partito verso il cliente, giornale_lavori si legge in cantiere).
--   ordine_margine_stato         → tg_ordine_margine / ordine_margine_valuta
--   commessa_campo_sync          → commessa_campo_segnala_modifica
--   google_calendar_order_events → google-calendar-sync
--   wa_operational_reminder_log  → whatsapp-operational-reminders, bot-routine-dispatch
--   email_inbox                  → email-ai-l4-draft, l'abbinamento della posta alla commessa
--   fatture_ricevute             → ai-fattura-classify, order_id_suggerito è una proposta
--   whatsapp_sessions            → il cantiere corrente della sessione del bot, un segnalibro
create or replace function public._silvio_tabelle_di_macchina()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['ordine_margine_stato', 'commessa_campo_sync', 'google_calendar_order_events',
               'wa_operational_reminder_log', 'email_inbox', 'fatture_ricevute', 'whatsapp_sessions']::text[]
$$;
revoke all on function public._silvio_tabelle_di_macchina() from public, anon, authenticated;

-- Tutte le chiavi esterne fra tabelle di public, a una o più colonne. `unione` è la
-- condizione che lega la figlia `t` alla madre `m`; `con_id` dice se la figlia ha un `id`
-- uuid (solo allora una sua riga si registra). Le tabelle di Silvio stesso non contano:
-- cadono con la bozza o con la commessa.
create or replace function public._silvio_chiavi()
returns table (figlia text, madre text, unione text, con_id boolean, nascita text)
language sql
stable
set search_path = ''
as $$
  select figlia.relname::text, madre.relname::text,
         (select string_agg(format('t.%I = m.%I', fa.attname, ma.attname), ' and ' order by k.ord)
            from unnest(c.conkey, c.confkey) with ordinality k(fk, pk, ord)
            join pg_attribute fa on fa.attrelid = c.conrelid and fa.attnum = k.fk
            join pg_attribute ma on ma.attrelid = c.confrelid and ma.attnum = k.pk),
         exists (select 1 from pg_attribute x where x.attrelid = figlia.oid and x.attname = 'id'
                   and x.atttypid = 'uuid'::regtype and not x.attisdropped),
         public._silvio_colonna_nascita(figlia.oid)
    from pg_constraint c
    join pg_class figlia on figlia.oid = c.conrelid
    join pg_namespace nf on nf.oid = figlia.relnamespace and nf.nspname = 'public'
    join pg_class madre on madre.oid = c.confrelid
    join pg_namespace nm on nm.oid = madre.relnamespace and nm.nspname = 'public'
   where c.contype = 'f'
     and figlia.relkind in ('r', 'p')
     and figlia.relname not in ('commessa_bozze', 'commessa_bozze_scritture', 'silvio_correzioni', 'silvio_piano_volo')
$$;
revoke all on function public._silvio_chiavi() from public, anon, authenticated;

-- Le chiavi verso le tabelle che hanno righe nate da Silvio in questa bozza, e verso `orders`.
create or replace function public._silvio_chiavi_figlie(p_bozza uuid)
returns table (figlia text, madre text, unione text, con_id boolean, nascita text)
language sql
stable
set search_path = ''
as $$
  select k.* from public._silvio_chiavi() k
   where k.madre = 'orders'
      or k.madre in (select s.tabella from public.commessa_bozze_scritture s where s.bozza_id = p_bozza and s.azione = 'creata')
$$;
revoke all on function public._silvio_chiavi_figlie(uuid) from public, anon, authenticated;

-- Com'è adesso una riga di Silvio: la riga, più le sue figlie che non hanno un `id` e
-- quindi non si possono registrare una per una (il costo di un mezzo prenotato, per
-- esempio): per quelle conta l'insieme. Null se la riga non c'è più.
create or replace function public._silvio_stato_riga(p_tabella text, p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
  k record;
  v_figlie jsonb;
begin
  execute format('select to_jsonb(t) from public.%I t where t.id = $1', p_tabella) into v using p_id;
  if v is null then return null; end if;
  for k in select * from public._silvio_chiavi() c
            where c.madre = p_tabella and not c.con_id and not (c.figlia = any (public._silvio_tabelle_di_macchina()))
            order by c.figlia loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t) - ''updated_at'' order by to_jsonb(t)::text), ''[]''::jsonb)
                      from public.%I t join public.%I m on %s where m.id = $1', k.figlia, p_tabella, k.unione)
      into v_figlie using p_id;
    v := v || jsonb_build_object('__figlie:' || k.figlia, v_figlie);
  end loop;
  return v;
end
$$;
revoke all on function public._silvio_stato_riga(text, uuid) from public, anon, authenticated;

-- Registra le righe nate in questa transazione che puntano alla commessa, e poi quelle che
-- puntano a loro, fino a quattro livelli: fasi → sottofasi → voci. Trova le tabelle dalle
-- chiavi esterne, così una tabella nuova (o un trigger nuovo che crea righe) non sfugge
-- all'annullamento. Una riga è nuova se `created_at = now()`, o se la sua madre è una riga
-- di Silvio nata in questa stessa transazione (allora è nuova per forza, anche in una
-- tabella senza `created_at`). Le righe che la commessa aveva già non si toccano mai.
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
    for v_fk in select * from public._silvio_chiavi_figlie(p_bozza) k where k.con_id loop
      execute format(
        'insert into public.commessa_bozze_scritture (bozza_id, company_id, tabella, riga_id, azione)
         select distinct $1, $2, %1$L, t.id, ''creata''
           from public.%1$I t join public.%2$I m on %3$s
          where (%4$s
                 or exists (select 1 from public.commessa_bozze_scritture s
                             where s.bozza_id = $1 and s.tabella = %2$L and s.riga_id = m.id
                               and s.azione = ''creata'' and s.scritta_il = now()))
            and (m.id in (select $3 where %2$L = ''orders'')
                 or m.id in (select s.riga_id from public.commessa_bozze_scritture s
                              where s.bozza_id = $1 and s.tabella = %2$L and s.azione = ''creata''))
            and not exists (select 1 from public.commessa_bozze_scritture s
                             where s.bozza_id = $1 and s.tabella = %1$L and s.riga_id = t.id)',
        v_fk.figlia, v_fk.madre, v_fk.unione,
        case when v_fk.nascita is null then 'false' else format('t.%I = now()', v_fk.nascita) end)
      using p_bozza, p_company, p_order;
      get diagnostics v_n = row_count;
      v_nuove := v_nuove + v_n;
    end loop;
    v_tot := v_tot + v_nuove;
    v_giro := v_giro + 1;
    exit when v_nuove = 0 or v_giro >= 5;
  end loop;
  return v_tot;
end
$$;
revoke all on function public._silvio_registra_nuove(uuid, uuid, uuid) from public, anon, authenticated;

-- L'istantanea delle righe di Silvio, alla fine della transazione che le ha scritte. Solo
-- quelle che non l'hanno ancora: in «allega», più tardi, le righe di prima tengono la loro,
-- e quello che la persona ha cambiato nel frattempo resta visibile all'annullamento.
create or replace function public._silvio_imprimi(p_bozza uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.commessa_bozze_scritture s
     set istantanea = public._silvio_stato_riga(s.tabella, s.riga_id)
   where s.bozza_id = p_bozza and s.azione = 'creata' and s.istantanea is null
$$;
revoke all on function public._silvio_imprimi(uuid) from public, anon, authenticated;

-- Come si chiama, per una persona, la riga di Silvio che qualcuno ha cambiato.
create or replace function public._silvio_cosa_e_cambiato(p_tabella text, p_riga jsonb, p_colonna text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_nome text;
begin
  if p_colonna like '\_\_figlie:%' then
    return format('dopo Silvio si è aggiunto o cambiato lavoro, %s', public._silvio_lavoro_aggiunto(substr(p_colonna, 10)));
  end if;
  case p_tabella
    when 'contratti_subappalto' then
      select coalesce(nullif(btrim(ss.ragione_sociale), ''), 'una ditta') into v_nome
        from public.subappaltatori_sicurezza ss where ss.id = nullif(p_riga->>'subappaltatore_id', '')::uuid;
      return format('Il contratto di %s è stato %s', coalesce(v_nome, 'una ditta'),
                    case when p_colonna in ('firmato_il', 'firmato_da', 'firma_richiesta_id')
                           or (p_colonna = 'stato' and p_riga->>'stato' <> 'bozza') then 'firmato o avviato'
                         else format('modificato («%s»)', p_colonna) end);
    when 'order_employees' then
      select nullif(btrim(concat_ws(' ', e.first_name, e.last_name)), '') into v_nome
        from public.employees e where e.id = nullif(p_riga->>'employee_id', '')::uuid;
      return case when p_colonna in ('hours_worked', 'total_cost')
                  then format('Sono state scritte ore per %s', coalesce(v_nome, 'una persona della squadra'))
                  else format('%s nella squadra è stato modificato («%s»)', coalesce(v_nome, 'Una persona'), p_colonna) end;
    when 'order_external_teams' then
      select nullif(btrim(t.name), '') into v_nome from public.external_teams t where t.id = nullif(p_riga->>'external_team_id', '')::uuid;
      return case when p_colonna = 'is_paid' then format('La ditta %s è stata segnata pagata', coalesce(v_nome, 'assegnata'))
                  else format('La ditta %s è stata modificata («%s»)', coalesce(v_nome, 'assegnata'), p_colonna) end;
    when 'mezzi_piani_cantiere' then
      select nullif(btrim(m.nome), '') into v_nome from public.mezzi m where m.id = nullif(p_riga->>'mezzo_id', '')::uuid;
      return format('La prenotazione del mezzo %s è stata cambiata («%s»)', coalesce(v_nome, ''), p_colonna);
    when 'purchase_orders' then
      return format('L''ordine al fornitore %s è stato modificato («%s»)', coalesce(p_riga->>'oda_number', ''), p_colonna);
    when 'tasks' then
      return format('L''attività «%s» è stata cambiata («%s»)', left(coalesce(p_riga->>'title', ''), 80), p_colonna);
    when 'order_work_phases' then
      return format('La fase «%s» è stata cambiata («%s»)', left(coalesce(p_riga->>'name', ''), 80), p_colonna);
    when 'orders' then
      return format('La commessa %s è stata modificata dopo Silvio («%s»)', coalesce(p_riga->>'order_code', ''), p_colonna);
    else
      return format('Una riga di «%s» creata da Silvio è stata cambiata («%s»)', replace(p_tabella, '_', ' '), p_colonna);
  end case;
end
$$;
revoke all on function public._silvio_cosa_e_cambiato(text, jsonb, text) from public, anon, authenticated;

-- Come si chiama, per una persona, il lavoro aggiunto sopra una riga di Silvio.
create or replace function public._silvio_lavoro_aggiunto(p_tabella text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_tabella
    when 'mezzi_piani_spese' then 'una spesa del mezzo'
    when 'mezzi_piani_costi' then 'un costo del mezzo'
    when 'task_tag_assignments' then 'un''etichetta su un''attività'
    when 'order_attachments' then 'un documento'
    when 'invoices' then 'una fattura'
    when 'invoice_items' then 'una riga di fattura'
    when 'sal' then 'un SAL'
    when 'order_costs' then 'un costo'
    when 'expenses' then 'una spesa'
    when 'rapportini' then 'un rapportino'
    when 'campo_rapportini' then 'un rapportino'
    when 'order_variations' then 'una variante'
    when 'sicurezza_fascicolo' then 'un documento del fascicolo di sicurezza'
    when 'sicurezza_incarichi' then 'un incarico di sicurezza'
    when 'subappaltatori_operai' then 'un operaio della ditta'
    when 'lp_libretto_modifiche' then 'una modifica al libretto delle misure'
    when 'lp_sal_voci' then 'una voce di SAL'
    when 'commesse_generali' then 'un collegamento a una commessa generale'
    when 'order_variation_workspaces' then 'una variante in preparazione'
    when 'generale_subappalto_ordini' then 'un subappalto della commessa generale'
    else format('righe in «%s»', replace(p_tabella, '_', ' '))
  end
$$;
revoke all on function public._silvio_lavoro_aggiunto(text) from public, anon, authenticated;

-- `commessa_pianifica_fasi` (20281105140000, già applicata), con una differenza sola: compilando
-- inizio e fine lavori non scrive mai una fine prima dell'inizio. Una commessa con l'inizio al
-- 01/06, scritto da altri, riceveva la fine al 03/03 dalle date di una fase (quarta revisione, 3).
create or replace function public.commessa_pianifica_fasi(
  p_order_id uuid,
  p_piano jsonb,
  p_sovrascrivi boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_azienda uuid := public.get_order_company_id(p_order_id);
  v_voce jsonb;
  v_nome text;
  v_inizio date;
  v_fine date;
  v_fase record;
  v_base integer;
  v_datate integer := 0;
  v_aggiunte integer := 0;
  v_saltate integer := 0;
  v_min date;
  v_max date;
begin
  if auth.uid() is null or v_azienda is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_azienda) then
    raise exception 'Non hai il permesso di pianificare questa commessa.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_piano) is distinct from 'array' or jsonb_array_length(p_piano) = 0 then
    raise exception 'Il cronoprogramma non ha fasi da pianificare.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_piano) > 60 then
    raise exception 'Troppe fasi in una volta: al massimo 60.' using errcode = '22023';
  end if;

  select coalesce(max(position) + 1, 0) into v_base from public.order_work_phases where order_id = p_order_id;

  for v_voce in select value from jsonb_array_elements(p_piano) loop
    v_nome := left(btrim(coalesce(v_voce->>'nome', '')), 160);
    continue when v_nome = '';
    begin
      v_inizio := (v_voce->>'inizio')::date;
      v_fine := (v_voce->>'fine')::date;
    exception when others then
      raise exception 'Date non valide per la fase «%».', v_nome using errcode = '22023';
    end;
    if v_inizio is null or v_fine is null or v_fine < v_inizio then
      raise exception 'Date non valide per la fase «%».', v_nome using errcode = '22023';
    end if;
    v_min := least(coalesce(v_min, v_inizio), v_inizio);
    v_max := greatest(coalesce(v_max, v_fine), v_fine);

    select id, start_date, end_date into v_fase
      from public.order_work_phases
     where order_id = p_order_id
       and lower(regexp_replace(btrim(name), '\s+', ' ', 'g')) = lower(regexp_replace(v_nome, '\s+', ' ', 'g'))
     order by position
     limit 1;

    if v_fase.id is null then
      insert into public.order_work_phases (company_id, order_id, name, position, start_date, end_date, notes)
      values (v_azienda, p_order_id, v_nome, v_base + v_aggiunte, v_inizio, v_fine, 'Dal cronoprogramma del preventivo');
      v_aggiunte := v_aggiunte + 1;
    elsif p_sovrascrivi or (v_fase.start_date is null and v_fase.end_date is null) then
      update public.order_work_phases set start_date = v_inizio, end_date = v_fine, updated_at = now()
       where id = v_fase.id;
      v_datate := v_datate + 1;
    else
      v_saltate := v_saltate + 1;
    end if;
  end loop;

  update public.orders
     set work_start_date = coalesce(work_start_date, case when work_end_date is null or v_min <= work_end_date then v_min end),
         work_end_date = coalesce(work_end_date, case when coalesce(work_start_date, v_min) <= v_max then v_max end)
   where id = p_order_id and company_id = v_azienda;

  return jsonb_build_object('datate', v_datate, 'aggiunte', v_aggiunte, 'saltate', v_saltate,
                            'inizio', v_min, 'fine', v_max);
end
$fn$;

revoke all on function public.commessa_pianifica_fasi(uuid, jsonb, boolean) from public, anon;
grant execute on function public.commessa_pianifica_fasi(uuid, jsonb, boolean) to authenticated;

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
  v_risorse jsonb;
  v_inizio date;
  v_fine date;
  c jsonb;
begin
  select * into o from public.orders where id = p_order and company_id = p_bozza.company_id for update;
  v_prima := to_jsonb(o);

  -- Colonne: solo quelle vuote (null o testo vuoto). Uno 0 scritto è un valore e resta, tranne
  -- l'importo (D3): `total_amount` ha default 0 e la creazione lo mette anche quando nessuno l'ha
  -- scritto, quindi lì 0 vuol dire «manca». Chi non vede gli importi non arriva qui con un importo:
  -- lo toglie `_silvio_scrittura_permessa`.
  v_colonne := public._silvio_colonne(p_bozza.company_id, s->'ordine');
  for k in select jsonb_object_keys(v_colonne) loop
    if v_prima->k is null or jsonb_typeof(v_prima->k) = 'null' or v_prima->>k = ''
       or (k = 'total_amount' and (v_prima->>k)::numeric = 0) then
      v_vuote := v_vuote || jsonb_build_object(k, v_colonne->k);
    end if;
  end loop;
  -- Mai una fine prima dell'inizio (quarta revisione, 3): se l'altra data l'ha scritta qualcuno
  -- mentre la bozza aspettava e non torna, quella di Silvio resta fuori.
  v_inizio := coalesce(nullif(v_vuote->>'work_start_date', '')::date, o.work_start_date);
  v_fine := coalesce(nullif(v_vuote->>'work_end_date', '')::date, o.work_end_date);
  if v_fine < v_inizio then
    v_vuote := v_vuote - (case when v_vuote ? 'work_end_date' then 'work_end_date' else 'work_start_date' end);
  end if;
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
               -- Una fase senza date né sottofasi ma con la durata: la durata va su una
               -- sottofase col nome della fase (revisione 1/11), se no si perde.
               'sottofasi', coalesce((select jsonb_agg(jsonb_build_object('nome', x->>'nome', 'giorni', x->'giorni'))
                                        from jsonb_array_elements(coalesce(f->'sottofasi', '[]'::jsonb)) x
                                       where btrim(coalesce(x->>'nome', '')) <> ''),
                                     case when nullif(f->>'giorni', '') is not null
                                          then jsonb_build_array(jsonb_build_object('nome', f->>'nome', 'giorni', f->'giorni')) end,
                                     '[]'::jsonb)))
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
  -- inizio e fine lavori se mancano. Solo alle fasi che ci sono (quarta revisione, 3):
  -- `commessa_pianifica_fasi` ricrea quelle che non trova, e una bozza ripresa può parlare
  -- di una fase che un altro ha cancellato.
  select coalesce(jsonb_agg(d.voce order by d.ord), '[]'::jsonb) into v_date
    from jsonb_array_elements(v_date) with ordinality d(voce, ord)
   where exists (select 1 from public.order_work_phases f
                  where f.order_id = p_order
                    and lower(regexp_replace(btrim(f.name), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(d.voce->>'nome'), '\s+', ' ', 'g')));
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

  -- Fase 4: squadra, ditte, mezzi, ordini e contratti in bozza, promemoria
  -- (20281112130000). Dopo le fasi, che ritrova per nome. Chiamata per nome: questa
  -- migrazione vale anche senza quella.
  if to_regprocedure('public._silvio_aggiungi_risorse(public.commessa_bozze, uuid)') is not null then
    execute 'select public._silvio_aggiungi_risorse($1, $2)' into v_risorse using p_bozza, p_order;
  end if;

  -- Le colonne della commessa riempite qui (anche dai trigger e da pianifica_fasi).
  select to_jsonb(x) into v_dopo from public.orders x where x.id = p_order;
  for k in select jsonb_object_keys(v_dopo) loop
    continue when public._silvio_colonna_di_macchina('orders', k);
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
                            'rate', v_rate, 'contratto', v_contratto)
         || case when v_risorse is null then '{}'::jsonb else jsonb_build_object('risorse', v_risorse) end;
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

-- «Crea con Silvio» acceso per l'azienda (revisione 1/11, E2): prima lo guardava solo il
-- browser. Demo Azienda 2 sempre, come nel client (useCreaConSilvioAttivo).
create or replace function public._silvio_acceso(p_company uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_company = 'd2000000-0000-4000-a000-000000000002'::uuid then return true; end if;
  return coalesce((select f.is_enabled from public.resolve_company_feature(p_company, 'silvio_crea_commessa') f limit 1), false);
exception when others then
  return false;
end
$$;
revoke all on function public._silvio_acceso(uuid) from public, anon, authenticated;

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
  v_quote_stato text;
begin
  -- La risposta di prima si è persa (D9): la commessa c'è già, si restituisce quella, così il
  -- popup riprende da dove era (gli allegati) invece di fermarsi su «bozza già usata».
  if b.stato = 'creata' and b.order_id is not null then
    select jsonb_build_object('order_id', o.id, 'customer_id', o.customer_id, 'gia_creata', true,
                              'righe_registrate', (select count(*) from public.commessa_bozze_scritture s where s.bozza_id = b.id))
      into v_aggiunte
      from public.orders o where o.id = b.order_id and o.company_id = b.company_id and o.deleted_at is null;
    if v_aggiunte is not null then return v_aggiunte; end if;
  end if;
  perform public._silvio_pronta(b);
  if not public._silvio_acceso(b.company_id) then
    raise exception '«Crea con Silvio» non è attivo per questa azienda.' using errcode = '42501';
  end if;
  if b.modo <> 'crea' then
    raise exception 'Questa bozza completa una commessa che c''è già: usa «Completa».' using errcode = '22023';
  end if;
  s := b.scrittura;
  v_colonne := public._silvio_colonne(b.company_id, s->'ordine');
  v_quote := nullif(s->>'preventivo_id', '')::uuid;
  if v_quote is not null then
    select q.status into v_quote_stato from public.quotes q where q.id = v_quote and q.company_id = b.company_id;
    if not found then
      raise exception 'Il preventivo d''origine non è di questa azienda.' using errcode = '42501';
    end if;
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
  -- Il preventivo invece resta (D2): la creazione lo segna «convertita», e l'annullamento lo
  -- deve rimettere com'era. Solo lo stato: `version` la tiene il suo trigger.
  if v_quote is not null then
    insert into public.commessa_bozze_scritture (bozza_id, company_id, tabella, riga_id, azione, colonne)
    select b.id, b.company_id, 'quotes', v_quote, 'aggiornata',
           jsonb_build_object('status', jsonb_build_object('prima', v_quote_stato, 'dopo', q.status))
      from public.quotes q where q.id = v_quote and q.status is distinct from v_quote_stato;
  end if;
  v_registrate := public._silvio_registra_nuove(b.id, b.company_id, v_order);
  perform public._silvio_imprimi(b.id);

  return jsonb_build_object('order_id', v_order, 'customer_id', v_cliente, 'righe_registrate', v_registrate + 1,
                            'tolte_permessi', coalesce(s->'tolte_permessi', '[]'::jsonb),
                            'tolte_autonomia', coalesce(s->'tolte_autonomia', '[]'::jsonb))
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
  -- Come «Crea» (D9): se la risposta di prima si è persa, non è un errore.
  if b.stato = 'completata' and b.order_id is not null then
    return jsonb_build_object('order_id', b.order_id, 'gia_completata', true,
                              'righe_registrate', (select count(*) from public.commessa_bozze_scritture s where s.bozza_id = b.id));
  end if;
  perform public._silvio_pronta(b);
  if not public._silvio_acceso(b.company_id) then
    raise exception '«Crea con Silvio» non è attivo per questa azienda.' using errcode = '42501';
  end if;
  if b.modo <> 'completa' then
    raise exception 'Questa bozza crea una commessa nuova: usa «Crea».' using errcode = '22023';
  end if;
  -- ON DELETE SET NULL: la commessa da completare è stata cancellata (D6).
  if b.order_id is null then
    raise exception 'La commessa di questa bozza non c''è più.' using errcode = '22023';
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
  perform public._silvio_imprimi(b.id);
  return jsonb_build_object('order_id', o.id, 'righe_registrate', v_registrate,
                            'tolte_permessi', coalesce(b.scrittura->'tolte_permessi', '[]'::jsonb),
                            'tolte_autonomia', coalesce(b.scrittura->'tolte_autonomia', '[]'::jsonb)) || v_aggiunte;
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
  perform public._silvio_imprimi(b.id);
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

  -- 1. Una riga di Silvio cambiata dopo: si confronta con la sua istantanea, colonna per
  --    colonna (`updated_at` da solo non dice niente, e molte tabelle non ce l'hanno). Una
  --    riga che la persona ha già tolto non conta. Nel dubbio (riga senza istantanea) si rifiuta.
  --    Prima le righe più in fondo (ore, contratti, ditte), la commessa per ultima: il
  --    messaggio dice il lavoro vero, non il riflesso che ha lasciato sulla commessa.
  for r in select s.tabella, s.riga_id, s.istantanea from public.commessa_bozze_scritture s
            where s.bozza_id = b.id and s.azione = 'creata' order by s.tabella = 'orders', s.id desc loop
    v_attuale := public._silvio_stato_riga(r.tabella, r.riga_id);
    continue when v_attuale is null;
    continue when r.tabella = any (public._silvio_tabelle_di_macchina());
    if r.istantanea is null then
      raise exception 'Non si può annullare: non so com''erano le righe di Silvio in «%». Annulla a mano o tieni la commessa.',
        replace(r.tabella, '_', ' ') using errcode = '55000';
    end if;
    select k into v_colonna
      from jsonb_object_keys(v_attuale || r.istantanea) k
     where not public._silvio_colonna_di_macchina(r.tabella, k)
       and not (r.tabella = 'orders' and k in ('work_lat', 'work_lng') and r.istantanea->>k is null)
       and (v_attuale->k) is distinct from (r.istantanea->k)
     order by k like '\_\_figlie:%', k limit 1;
    if v_colonna is not null then
      raise exception 'Non si può annullare: %. Annulla a mano o tieni la commessa.',
        public._silvio_cosa_e_cambiato(r.tabella, v_attuale, v_colonna) using errcode = '55000';
    end if;
  end loop;

  -- 2. Una riga che punta a una riga di Silvio senza essere sua (rapportino, fattura, costo,
  --    allegato, spesa del mezzo, etichetta…), in qualunque tabella, a una o più colonne:
  --    cancellando la madre andrebbe via in cascata, o fermerebbe tutto con un errore grezzo.
  --    Su una commessa che Silvio ha solo completato, quelle che puntano alla commessa sono
  --    di chi ci lavora, e non contano.
  --    Le figlie senza `id` stanno nell'istantanea della madre: le ha già guardate il punto 1.
  for v_fk in select * from public._silvio_chiavi_figlie(b.id) k
               where k.con_id and not (k.figlia = any (public._silvio_tabelle_di_macchina()))
                 and k.madre in (select s.tabella from public.commessa_bozze_scritture s
                                  where s.bozza_id = b.id and s.azione = 'creata') loop
    execute format(
      'select exists (select 1 from public.%1$I t join public.%2$I m on %3$s
                       where m.id in (select s.riga_id from public.commessa_bozze_scritture s
                                       where s.bozza_id = $1 and s.tabella = %2$L and s.azione = ''creata'')
                         and %4$s)',
      v_fk.figlia, v_fk.madre, v_fk.unione,
      format('not exists (select 1 from public.commessa_bozze_scritture s where s.bozza_id = $1 and s.tabella = %L and s.riga_id = t.id)', v_fk.figlia))
      into v_trovata using b.id;
    if v_trovata then
      raise exception 'Non si può annullare: dopo Silvio si è aggiunto lavoro, % (%). Annulla a mano o tieni la commessa.',
        public._silvio_lavoro_aggiunto(v_fk.figlia), replace(v_fk.figlia, '_', ' ') using errcode = '55000';
    end if;
  end loop;

  -- 3. Una colonna riempita da Silvio che non ha più il suo valore.
  for r in select s.id, s.tabella, s.riga_id, s.colonne from public.commessa_bozze_scritture s
            where s.bozza_id = b.id and s.azione = 'aggiornata' loop
    execute format('select to_jsonb(t) from public.%I t where t.id = $1', r.tabella) into v_attuale using r.riga_id;
    for v_colonna in select jsonb_object_keys(r.colonne) loop
      if v_attuale is not null and (v_attuale->v_colonna) is distinct from (r.colonne->v_colonna->'dopo') then
        raise exception 'Non si può annullare: «%» è stato cambiato dopo Silvio. Annulla a mano o tieni la commessa.', v_colonna using errcode = '55000';
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

  -- La giacenza (D12): una riga con `stock_item_id` scarica il magazzino nella creazione
  -- (magazzino_movimento_riga), e cancellare riga e movimento non la rimetteva. Si rimette quello
  -- che dicono i movimenti di Silvio, che subito sotto spariscono: nel registro di magazzino
  -- non resta né lo scarico né un carico.
  for r in select m.stock_item_id, sum(case m.movement_type when 'scarico' then m.quantity else -m.quantity end) as quanto
             from public.warehouse_movements m
            where m.company_id = b.company_id and m.movement_type in ('scarico', 'carico') and m.stock_item_id is not null
              and m.id in (select s.riga_id from public.commessa_bozze_scritture s
                            where s.bozza_id = b.id and s.tabella = 'warehouse_movements' and s.azione = 'creata')
            group by m.stock_item_id loop
    update public.warehouse_stock set quantity = quantity + r.quanto, updated_at = now()
     where id = r.stock_item_id and company_id = b.company_id;
  end loop;

  -- Le righe di Silvio, dall'ultima alla prima: i figli prima dei padri. La commessa
  -- nata da Silvio è la prima registrata, quindi l'ultima a sparire.
  for r in select s.tabella, s.riga_id from public.commessa_bozze_scritture s
            where s.bozza_id = b.id and s.azione = 'creata' order by s.id desc loop
    execute format('delete from public.%I where id = $1', r.tabella) using r.riga_id;
    get diagnostics v_n = row_count;
    v_tolte := v_tolte + v_n;
  end loop;

  -- Gli eventi delle automazioni non ancora elaborati sulle righe tolte (l'attività creata,
  -- la commessa nata): elaborati dopo, farebbero partire un'automazione su qualcosa che non
  -- c'è più (revisione 1/11, S11). Quelli già elaborati restano: sono la storia.
  delete from public.automation_trigger_events e
   where e.company_id = b.company_id and e.processed is not true
     and (e.entity_id in (select s.riga_id::text from public.commessa_bozze_scritture s
                           where s.bozza_id = b.id and s.azione = 'creata')
          -- Il preventivo (D2): gli eventi di «convertita» e del ritorno a com'era.
          or (e.created_at >= b.eseguita_il
              and e.entity_id in (select s.riga_id::text from public.commessa_bozze_scritture s
                                   where s.bozza_id = b.id and s.tabella = 'quotes')));

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
