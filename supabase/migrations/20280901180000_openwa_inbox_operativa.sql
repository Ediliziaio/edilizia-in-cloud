-- WhatsApp Locale: rendere l'inbox e le campagne usabili tutti i giorni.
--
-- Problemi risolti qui:
--  1. l'inbox caricava gli ULTIMI 1000 messaggi e raggruppava nel browser:
--     oltre quella soglia le conversazioni vecchie sparivano del tutto, e la
--     ricerca vedeva solo cio' che era gia' in memoria. Ora i thread arrivano
--     aggregati dal DB, con paginazione, e la ricerca guarda dentro ai testi;
--  2. nessun modo di CHIUDERE una conversazione: la lista cresceva all'infinito;
--  3. nessun modo di ASSEGNARLA: in due si rispondeva sopra all'altro;
--  4. nessuna nota interna: per annotare "richiamare lunedi" bisognava
--     mandarlo al cliente;
--  5. nessuna risposta pronta: le stesse cinque frasi riscritte a mano;
--  6. campagne non programmabili: o partivano subito, o mai.

-- ── 1. Stato della conversazione ─────────────────────────────────────────────
-- I "thread" non esistevano come entita': erano solo messaggi raggruppati per
-- wa_chat_id. Qui nasce il loro stato, con la chat come chiave naturale.
create table if not exists public.openwa_conversazioni (
  wa_chat_id   text primary key,
  stato        text not null default 'aperta' check (stato in ('aperta', 'chiusa')),
  assegnato_a  uuid references auth.users(id) on delete set null,
  chiusa_at    timestamptz,
  chiusa_da    uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.openwa_conversazioni is
  'WhatsApp Locale: stato per chat (aperta/chiusa, assegnatario). La chat resta identificata dal wa_chat_id dei messaggi.';

create index if not exists openwa_conversazioni_stato_idx on public.openwa_conversazioni (stato);
create index if not exists openwa_conversazioni_assegnato_idx on public.openwa_conversazioni (assegnato_a) where assegnato_a is not null;

-- ── 2. Note interne ──────────────────────────────────────────────────────────
create table if not exists public.openwa_note (
  id          uuid primary key default gen_random_uuid(),
  wa_chat_id  text not null,
  testo       text not null,
  autore      uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
comment on table public.openwa_note is
  'WhatsApp Locale: annotazioni interne su una chat. NON vengono mai inviate al contatto.';
create index if not exists openwa_note_chat_idx on public.openwa_note (wa_chat_id, created_at desc);

-- ── 3. Risposte pronte ───────────────────────────────────────────────────────
create table if not exists public.openwa_risposte_rapide (
  id          uuid primary key default gen_random_uuid(),
  titolo      text not null,
  testo       text not null,
  creata_da   uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.openwa_risposte_rapide is
  'WhatsApp Locale: frasi pronte per l''inbox. Supportano le stesse variabili delle campagne.';

-- ── 4. Campagne programmabili ────────────────────────────────────────────────
alter table public.openwa_campagne add column if not exists parte_il timestamptz;
comment on column public.openwa_campagne.parte_il is
  'Se valorizzata, il dispatcher ignora la campagna finche'' non e'' passato questo momento.';

-- ── 5. Ricerca dentro ai messaggi ────────────────────────────────────────────
create extension if not exists pg_trgm;
create index if not exists openwa_messages_body_trgm
  on public.openwa_messages using gin (body gin_trgm_ops);
create index if not exists openwa_messages_chat_created_idx
  on public.openwa_messages (wa_chat_id, created_at desc);

-- ── 6. RLS: come le altre tabelle del canale, solo super admin + service ─────
alter table public.openwa_conversazioni enable row level security;
alter table public.openwa_note enable row level security;
alter table public.openwa_risposte_rapide enable row level security;

drop policy if exists openwa_conversazioni_super on public.openwa_conversazioni;
create policy openwa_conversazioni_super on public.openwa_conversazioni
  for all using (public.is_super_admin(auth.uid())) with check (public.is_super_admin(auth.uid()));

drop policy if exists openwa_note_super on public.openwa_note;
create policy openwa_note_super on public.openwa_note
  for all using (public.is_super_admin(auth.uid())) with check (public.is_super_admin(auth.uid()));

drop policy if exists openwa_risposte_super on public.openwa_risposte_rapide;
create policy openwa_risposte_super on public.openwa_risposte_rapide
  for all using (public.is_super_admin(auth.uid())) with check (public.is_super_admin(auth.uid()));
