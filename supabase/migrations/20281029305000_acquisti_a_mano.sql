-- ════════════════════════════════════════════════════════════════════════════
-- La lista della spesa del magazzino passa dal browser al database
-- ════════════════════════════════════════════════════════════════════════════
-- Richiesta di Florin del 29/10/2026 («sì, procedi»: riordino del magazzino e
-- lista Acquisti nel database).
--
-- Nella vista Acquisti del magazzino le voci scritte a mano (cosa comprare,
-- quanto, da chi, acconto e saldo pagati…) si salvavano in localStorage
-- (`warehouse-purchase-list:<azienda>`): restavano nel browser di chi le
-- scriveva. Un collega non le vedeva, su un altro computer sparivano.
--
-- Qui la tabella, una riga per voce, con le stesse colonne del modulo. Chi
-- vede il magazzino legge; chi lo modifica scrive (o l'amministratore). Il
-- commercialista legge, come il resto del magazzino. Le voci già nei browser
-- le porta dentro la pagina stessa alla prima apertura.
--
-- Non tocca Costi né previsionale: i pagamenti scritti qui restano note della
-- lista, come prima.
--
-- Solo struttura e regole d'accesso, niente dati: breve apposta (una CREATE
-- POLICY tiene fermo il login finché la transazione non finisce).
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';
set local statement_timeout = '30s';

create table if not exists public.acquisti_a_mano (
  id                      uuid primary key default gen_random_uuid(),
  company_id              uuid not null references public.companies(id) on delete cascade,
  nome                    text not null check (btrim(nome) <> ''),
  quantita                numeric not null default 1 check (quantita > 0),
  costo_unitario          numeric not null default 0 check (costo_unitario >= 0),
  aliquota_iva            numeric not null default 22 check (aliquota_iva >= 0),
  supplier_id             uuid references public.suppliers(id) on delete set null,
  warehouse_id            uuid references public.warehouses(id) on delete set null,
  metodo_pagamento        text,
  termine_pagamento       text,
  pagamento_previsto_il   date,
  pagato                  boolean not null default false,
  pagato_il               date,
  acconto_pagato          boolean not null default false,
  acconto_previsto_il     date,
  saldo_pagato            boolean not null default false,
  saldo_previsto_il       date,
  stato                   text not null default 'da_ordinare'
                          check (stato in ('da_ordinare', 'ordinato', 'in_arrivo', 'in_magazzino')),
  ordinato_il             date,
  arrivo_il               date,
  priorita                text not null default 'media' check (priorita in ('alta', 'media', 'bassa')),
  entro_il                date,
  note                    text not null default '',
  completato              boolean not null default false,
  created_by              uuid default auth.uid(),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

comment on table public.acquisti_a_mano is
  'Lista della spesa del magazzino scritta a mano (vista Acquisti). Prima stava nel localStorage del browser. Non genera costi.';

create index if not exists acquisti_a_mano_company_idx on public.acquisti_a_mano (company_id, created_at);

drop trigger if exists acquisti_a_mano_updated_at on public.acquisti_a_mano;
create trigger acquisti_a_mano_updated_at
  before update on public.acquisti_a_mano
  for each row execute function public.update_updated_at_column();

alter table public.acquisti_a_mano enable row level security;

revoke all on public.acquisti_a_mano from public, anon;
grant select, insert, update, delete on public.acquisti_a_mano to authenticated;
grant all on public.acquisti_a_mano to service_role;

-- Il trigger d'evento la aggiunge da solo a ogni tabella nuova: stesso nome.
drop policy if exists blocco_utente_bloccato on public.acquisti_a_mano;
create policy blocco_utente_bloccato on public.acquisti_a_mano
  as restrictive for all to authenticated
  using (not (select public.utente_bloccato()))
  with check (not (select public.utente_bloccato()));

drop policy if exists acquisti_a_mano_lettura on public.acquisti_a_mano;
create policy acquisti_a_mano_lettura on public.acquisti_a_mano
  for select to authenticated
  using (
    (company_id = (select public.get_my_company_id())
      and ((select public.has_permission((select auth.uid()), 'can_view_warehouse'))
           or (select public.e_amministratore_di((select public.get_my_company_id())))))
    or public.user_can_read_accountant_company(company_id)
  );

drop policy if exists acquisti_a_mano_scrittura on public.acquisti_a_mano;
create policy acquisti_a_mano_scrittura on public.acquisti_a_mano
  for all to authenticated
  using (
    company_id = (select public.get_my_company_id())
    and ((select public.has_permission((select auth.uid()), 'can_edit_warehouse'))
         or (select public.e_amministratore_di((select public.get_my_company_id()))))
  )
  with check (
    company_id = (select public.get_my_company_id())
    and ((select public.has_permission((select auth.uid()), 'can_edit_warehouse'))
         or (select public.e_amministratore_di((select public.get_my_company_id()))))
  );
