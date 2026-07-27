-- Scenario a tempo per i tenant-vetrina (Demo Azienda 2)
--
-- PROBLEMA: una demo popolata "a mano" invecchia. A luglio è viva, a settembre
-- mostra tre mesi di silenzio: zero commesse nuove, zero fatture, zero incassi.
-- Chi la guarda non vede un gestionale, vede un archivio.
--
-- SOLUZIONE: il copione è scritto in anticipo (demo_scenario_eventi, una riga per
-- fatto futuro) e una funzione lo esegue quando la data arriva. Non genera nulla a
-- caso: il 14 ottobre succede quello che c'è scritto per il 14 ottobre.
--
-- Perché "eventi già scritti" e non un generatore casuale al volo:
--   1. il piano è ispezionabile prima che accada (si può correggere o cancellare);
--   2. è idempotente — applicato_at impedisce il doppio consumo;
--   3. è recuperabile — se il cron resta fermo due settimane, la corsa successiva
--      riallinea l'intero periodo scoperto invece di lasciare un buco.
--
-- COPERTURA: 635 eventi dal 30/07/2026 al 18/09/2027 — 36 commesse complete
-- (acconto, due avanzamenti, chiusura, saldo), 9 delle quali con il saldo mai
-- incassato perché la demo deve avere sempre uno scaduto da mostrare.
--
-- Il piano si estende OLTRE i 12 mesi (fino a settembre 2027) di proposito: la
-- coda serve a chiudere le commesse aperte a luglio. Tagliare gli eventi a una
-- data secca lascia cantieri che si aprono e non si chiudono mai — errore fatto
-- nella prima stesura a 6 mesi e corretto con un controllo di integrità che
-- verifica, per ogni commessa, la presenza dell'intera catena.
--
-- APPLICATA IN PRODUZIONE il 27/07/2026 via execute_sql (il repo NON è allineato
-- al DB: 362 migration non applicate, mai usare `supabase db push`).
-- Questo file è documentazione dello schema reale, non uno script da rieseguire.

-- ─── Il copione ──────────────────────────────────────────────────────────────
create table if not exists public.demo_scenario_eventi (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  data_evento   date not null,
  tipo          text not null check (tipo in ('lead','commessa','avanzamento','chiusura','fattura','incasso','movimento')),
  payload       jsonb not null default '{}'::jsonb,
  applicato_at  timestamptz,
  esito         text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_demo_scenario_da_applicare
  on public.demo_scenario_eventi (company_id, data_evento) where applicato_at is null;

alter table public.demo_scenario_eventi enable row level security;
drop policy if exists demo_scenario_super_admin on public.demo_scenario_eventi;
create policy demo_scenario_super_admin on public.demo_scenario_eventi
  for all to authenticated
  using (public.is_super_admin(auth.uid()))
  with check (public.is_super_admin(auth.uid()));

comment on table public.demo_scenario_eventi is
  'Copione a tempo per i tenant-vetrina: ogni riga è un fatto già scritto (nuovo lead, commessa, fattura, incasso, movimento) che demo_scenario_applica() esegue quando la data arriva. Serve a non far invecchiare la demo.';

-- ─── L'esecutore ─────────────────────────────────────────────────────────────
-- Corpo completo in produzione. Vincoli di progetto da rispettare se lo si tocca:
--
--  * WHITELIST INTERNA (c_vetrine): la funzione scrive dati finti, quindi rifiuta
--    qualunque company_id che non sia un tenant-vetrina. Non basta chiamarla bene.
--  * session_replication_role = replica: i trigger applicativi (automazioni,
--    notifiche, sync calendari, code di invio) non devono partire per dati di scena.
--  * Ogni evento è in un blocco EXCEPTION separato: un fallimento marca quella riga
--    e non ferma le altre. L'esito finito in `esito` distingue ok / saltato / errore.
--  * Colonne GENERATED da non valorizzare mai: scadenze.direction,
--    bank_transactions.counterparty_name/counterparty_iban (usare creditor_name /
--    debtor_name). Entrambe scoperte solo in collaudo, non a schema.
--  * orders.description è NOT NULL senza default.
--  * I saldi si ricalcolano UNA volta a fine ciclo: in replica mode i trigger di
--    bank_accounts non girano.
--
-- Aggancio fattura → incasso: invoices.external_id = 'DEMO2-<order_code>-<quota>'.
-- È la sola chiave che lega due eventi distanti nel tempo senza dipendere dagli id.
--
-- create function public.demo_scenario_applica(p_company_id uuid, p_fino_a date default current_date)
--   returns table(applicati int, falliti int, saltati int) ...

revoke all on function public.demo_scenario_applica(uuid, date) from public, anon, authenticated;

-- ─── La sveglia ──────────────────────────────────────────────────────────────
-- select cron.schedule('demo-scenario-vetrina-daily', '15 4 * * *',
--   $$select public.demo_scenario_applica('d2000000-0000-4000-a000-000000000002'::uuid, current_date)$$);
--
-- Cadenza giornaliera e non oraria: gli eventi hanno granularità di giorno, e una
-- corsa notturna basta perché al primo accesso del mattino la demo sia allineata.
