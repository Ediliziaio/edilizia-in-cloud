-- L'archivio delle condizioni contrattuali (07/11/2026).
--
-- Oggi lo stesso testo contrattuale sta in cinque posti: i modelli dei preventivi, la libreria delle clausole
-- di firma, i modelli delle varianti, l'archivio dei moduli di vendita e la configurazione dei documenti
-- operativi. Cambiare una clausola vuol dire cambiarla in dieci punti, e nessuno sa quale versione è finita
-- su un documento già mandato al cliente.
--
-- Qui la casa unica. Tre tabelle:
--   · condizioni_clausole          — i mattoni: una clausola riusabile (titolo + testo), per categoria.
--   · condizioni_modelli           — i muri: un insieme ordinato di clausole, per AMBITO, con predefinito e versione.
--   · condizioni_modelli_versioni  — la fotografia di ogni versione: un documento può puntarci e non cambia più.
--
-- Gli ambiti sono gli otto documenti che escono con la firma dell'impresa sopra (mappati il 07/11/2026):
--   preventivo   — preventivi e computi metrici, al cliente
--   appalto      — contratto col committente e commessa generale
--   commessa     — lavori extra e varianti
--   subappalto   — contratto col subappaltatore
--   acquisto     — ordini d'acquisto e richieste d'offerta, ai fornitori
--   fattura      — le clausole della fattura (oggi scritte nel codice, uguali per tutti)
--   manutenzione — contratti di manutenzione a canone
--   lavoro       — contratti con i dipendenti
-- Fuori restano i documenti di cantiere (rapportini, trasporti, lavori in economia): lì il testo è una
-- nota, non una clausola, e il modello PDF che hanno già basta. Fuori anche i POS, che hanno il loro
-- archivio con le stesse proprietà e regole di sicurezza a parte.
-- Nessun testo viene spostato qui da questa migrazione: l'archivio nasce vuoto e il travaso dei testi
-- esistenti è un passo a parte, così nessun documento già emesso si muove.
--
-- Additiva e idempotente.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ── I mattoni ────────────────────────────────────────────────────────────────
create table if not exists public.condizioni_clausole (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  categoria text,
  titolo text not null,
  testo text not null,
  -- Clausola vessatoria (art. 1341 c.2 c.c.): il cliente la approva a parte.
  vessatoria boolean not null default false,
  attiva boolean not null default true,
  ordine integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint condizioni_clausole_titolo_valido check (length(btrim(titolo)) between 1 and 200),
  constraint condizioni_clausole_testo_valido check (length(testo) between 1 and 20000)
);
create index if not exists condizioni_clausole_azienda on public.condizioni_clausole (company_id, attiva, ordine);

-- ── I muri ───────────────────────────────────────────────────────────────────
create table if not exists public.condizioni_modelli (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  nome text not null,
  ambito text not null,
  predefinito boolean not null default false,
  attivo boolean not null default true,
  versione integer not null default 1,
  -- [{ "clausola_id": uuid|null, "titolo": text, "testo": text, "vessatoria": bool }]
  -- Il testo è copiato dentro: una clausola cambiata nella libreria non riscrive i modelli da sola.
  clausole jsonb not null default '[]'::jsonb,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint condizioni_modelli_nome_valido check (length(btrim(nome)) between 1 and 200),
  constraint condizioni_modelli_ambito_valido
    check (ambito in ('preventivo', 'appalto', 'commessa', 'subappalto', 'acquisto', 'fattura', 'manutenzione', 'lavoro')),
  constraint condizioni_modelli_versione_valida check (versione >= 1),
  constraint condizioni_modelli_clausole_valide
    check (jsonb_typeof(clausole) = 'array' and octet_length(clausole::text) <= 400000)
);
create index if not exists condizioni_modelli_azienda on public.condizioni_modelli (company_id, ambito, attivo);
-- Un solo modello predefinito per ambito: è quello che il sistema pesca da solo.
create unique index if not exists condizioni_modelli_un_predefinito
  on public.condizioni_modelli (company_id, ambito) where predefinito and attivo;

-- ── Le fotografie ────────────────────────────────────────────────────────────
create table if not exists public.condizioni_modelli_versioni (
  modello_id uuid not null references public.condizioni_modelli(id) on delete cascade,
  versione integer not null,
  nome text not null,
  clausole jsonb not null,
  creata_il timestamptz not null default now(),
  creata_da uuid default auth.uid(),
  primary key (modello_id, versione)
);

-- Ogni salvataggio di un modello alza la versione e ne conserva la fotografia: un documento che punta a
-- (modello, versione) legge sempre lo stesso testo, anche se il modello cambia domani.
create or replace function public.tg_condizioni_modello_versione()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (new.clausole is distinct from old.clausole or new.nome is distinct from old.nome) then
    new.versione := old.versione + 1;
    new.updated_at := now();
    new.updated_by := coalesce((select auth.uid()), new.updated_by);
  end if;
  return new;
end;
$$;
revoke all on function public.tg_condizioni_modello_versione() from public, anon, authenticated;
drop trigger if exists condizioni_modello_versione on public.condizioni_modelli;
create trigger condizioni_modello_versione before update on public.condizioni_modelli
  for each row execute function public.tg_condizioni_modello_versione();

create or replace function public.tg_condizioni_modello_fotografia()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.condizioni_modelli_versioni (modello_id, versione, nome, clausole)
  values (new.id, new.versione, new.nome, new.clausole)
  on conflict (modello_id, versione) do update set nome = excluded.nome, clausole = excluded.clausole;
  return null;
end;
$$;
revoke all on function public.tg_condizioni_modello_fotografia() from public, anon, authenticated;
drop trigger if exists condizioni_modello_fotografia on public.condizioni_modelli;
create trigger condizioni_modello_fotografia after insert or update on public.condizioni_modelli
  for each row execute function public.tg_condizioni_modello_fotografia();

-- ── Chi vede e chi scrive ────────────────────────────────────────────────────
alter table public.condizioni_clausole enable row level security;
alter table public.condizioni_modelli enable row level security;
alter table public.condizioni_modelli_versioni enable row level security;
revoke all on table public.condizioni_clausole from public, anon;
revoke all on table public.condizioni_modelli from public, anon;
revoke all on table public.condizioni_modelli_versioni from public, anon;
grant select, insert, update, delete on table public.condizioni_clausole to authenticated;
grant select, insert, update, delete on table public.condizioni_modelli to authenticated;
grant select on table public.condizioni_modelli_versioni to authenticated;

drop policy if exists condizioni_clausole_lettura on public.condizioni_clausole;
create policy condizioni_clausole_lettura on public.condizioni_clausole for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_condizioni', company_id));
drop policy if exists condizioni_clausole_scrittura on public.condizioni_clausole;
create policy condizioni_clausole_scrittura on public.condizioni_clausole for all to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_manage_condizioni', company_id))
  with check (public.has_permission_for_company((select auth.uid()), 'can_manage_condizioni', company_id));

drop policy if exists condizioni_modelli_lettura on public.condizioni_modelli;
create policy condizioni_modelli_lettura on public.condizioni_modelli for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_condizioni', company_id));
drop policy if exists condizioni_modelli_scrittura on public.condizioni_modelli;
create policy condizioni_modelli_scrittura on public.condizioni_modelli for all to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_manage_condizioni', company_id))
  with check (public.has_permission_for_company((select auth.uid()), 'can_manage_condizioni', company_id));

drop policy if exists condizioni_versioni_lettura on public.condizioni_modelli_versioni;
create policy condizioni_versioni_lettura on public.condizioni_modelli_versioni for select to authenticated
  using (exists (select 1 from public.condizioni_modelli m
                  where m.id = modello_id
                    and public.has_permission_for_company((select auth.uid()), 'can_view_condizioni', m.company_id)));
