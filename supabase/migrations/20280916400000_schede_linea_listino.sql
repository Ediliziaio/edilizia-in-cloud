-- La scheda di una linea del listino: foto del profilo, descrizione, dati
-- tecnici e scheda del produttore di «PVC Salamander 76», scritti una volta
-- sola per tutti i prodotti della linea.
--
-- La linea non è una tabella: è un valore dell'asse «Linea» ripetuto su ogni
-- prodotto (Renova: 23 volte) oppure una categoria dentro la tipologia. La
-- scheda si ritrova per tipologia e nome normalizzato (chiave), la stessa
-- regola con cui il listino unisce le linee: «PVC» delle tapparelle e «PVC»
-- dei cassonetti restano due schede. Tipologia nulla = prodotti senza
-- macrocategoria.
--
-- La leggono il listino, il preventivatore serramenti (scelta della linea) e
-- il PDF del preventivo (pagina «Il sistema scelto»).

create table if not exists public.listino_schede_linea (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  macrocategoria_id uuid references public.listino_macrocategorie(id) on delete cascade,
  chiave text not null check (chiave ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
  nome text not null check (length(btrim(nome)) > 0),
  descrizione text check (descrizione is null or length(descrizione) <= 2000),
  immagine_url text,
  profondita_mm integer check (profondita_mm is null or profondita_mm between 1 and 1000),
  camere smallint check (camere is null or camere between 1 and 20),
  guarnizioni smallint check (guarnizioni is null or guarnizioni between 1 and 10),
  uw numeric(4,2) check (uw is null or (uw > 0 and uw < 10)),
  scheda_tecnica_url text,
  scheda_tecnica_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listino_schede_linea_una_per_linea unique nulls not distinct (company_id, macrocategoria_id, chiave)
);

comment on table public.listino_schede_linea is
  'Scheda di una linea del listino (foto, descrizione, dati tecnici, scheda del produttore), una per tipologia e nome di linea. Letta da listino, preventivatore serramenti e PDF del preventivo.';
comment on column public.listino_schede_linea.chiave is
  'Nome della linea normalizzato come chiaveTesto() in src/lib/listino/areeStandard.ts: minuscole, senza accenti, parole unite da underscore.';
comment on column public.listino_schede_linea.uw is
  'Trasmittanza Uw (W/m²K) migliore dichiarata dal produttore: nel PDF «fino a».';

create index if not exists listino_schede_linea_macrocategoria_idx
  on public.listino_schede_linea (macrocategoria_id)
  where macrocategoria_id is not null;

drop trigger if exists trg_listino_schede_linea_updated_at on public.listino_schede_linea;
create trigger trg_listino_schede_linea_updated_at
  before update on public.listino_schede_linea
  for each row execute function public.update_updated_at_column();

alter table public.listino_schede_linea enable row level security;

drop policy if exists lsl_azienda on public.listino_schede_linea;
create policy lsl_azienda on public.listino_schede_linea
  for all
  using (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno()))
  with check (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno()));

drop policy if exists lsl_super_admin on public.listino_schede_linea;
create policy lsl_super_admin on public.listino_schede_linea
  for all
  using ((select public.has_role((select auth.uid()), 'super_admin'::public.app_role)))
  with check ((select public.has_role((select auth.uid()), 'super_admin'::public.app_role)));

drop policy if exists blocco_utente_bloccato on public.listino_schede_linea;
create policy blocco_utente_bloccato on public.listino_schede_linea
  as restrictive
  for all
  to authenticated
  using (not (select public.utente_bloccato()))
  with check (not (select public.utente_bloccato()));

revoke all on public.listino_schede_linea from anon;
grant select, insert, update, delete on public.listino_schede_linea to authenticated;
