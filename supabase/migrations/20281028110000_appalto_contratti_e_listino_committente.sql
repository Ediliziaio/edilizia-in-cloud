-- ════════════════════════════════════════════════════════════════════════════
-- Modulo Appaltatori — Fase 1: il contratto col committente e il suo listino
-- ════════════════════════════════════════════════════════════════════════════
-- Un'azienda che lavora in appalto ha pochi committenti e con ognuno un accordo:
-- condizioni di pagamento e un listino suo ("la giornata uomo 180, il trasporto
-- 60 a viaggio, la posa 22 al mq"). Finora quell'accordo viveva nella testa del
-- titolare: `orders.order_type='appaltatore_lavoro'` esiste dal 28/12/2026 ma
-- porta un solo importo, e `listini_cliente` tiene un numero solo (lo sconto
-- globale su un preventivo al privato).
--
--   appalto_contratti   l'accordo con un committente: validita', giorni di
--                       pagamento, ritenuta, maggiorazioni, come si fattura,
--                       se comprende la fornitura, le condizioni concordate.
--                       Piu' di uno per committente: si rinnova ogni anno e le
--                       commesse vecchie devono restare coi prezzi vecchi.
--   appalto_tariffe     il listino di quel contratto: una riga = una cosa che a
--                       quel committente si puo' fatturare, con unita' di misura
--                       e prezzo. `tariffa_id` collega la tariffa interna da cui
--                       esce il COSTO: prezzo e costo sono due numeri diversi e
--                       restano separati.
--
-- Chi vede cosa: il contratto lo legge chi vede i clienti; il listino lo legge
-- solo chi vede anche gli importi delle commesse (can_view_order_amounts), cosi'
-- il capocantiere e l'operaio non leggono i prezzi del committente nemmeno
-- interrogando il database. Niente anon, niente clienti del portale.
--
-- NON create qui: l'override di tariffa per cantiere (arriva con il rendiconto,
-- che e' l'unica pagina che lo leggerebbe) e le colonne di `orders`. Una tabella
-- senza interfaccia e' una promessa su carta: `listino_override_cliente`, nata
-- per il portale manutenzione, e' vuota da allora.
--
-- Nessuna riga scritta. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ── 1. Il contratto ─────────────────────────────────────────────────────────

create table if not exists public.appalto_contratti (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  committente_id uuid not null references public.profiles(id) on delete cascade,
  nome text not null check (length(btrim(nome)) > 0),
  valido_dal date not null default current_date,
  valido_al date,
  giorni_pagamento integer not null default 30 check (giorni_pagamento >= 0 and giorni_pagamento <= 365),
  ritenuta_pct numeric(6,3) not null default 0 check (ritenuta_pct >= 0 and ritenuta_pct <= 100),
  maggiorazione_straordinario_pct numeric(6,3) not null default 0 check (maggiorazione_straordinario_pct >= 0 and maggiorazione_straordinario_pct <= 200),
  maggiorazione_festivo_pct numeric(6,3) not null default 0 check (maggiorazione_festivo_pct >= 0 and maggiorazione_festivo_pct <= 200),
  modo_fatturazione text not null default 'per_commessa'
    check (modo_fatturazione in ('per_commessa', 'mensile_cumulativa')),
  include_fornitura boolean not null default false,
  riferimento_committente text,
  condizioni text,
  note text,
  attivo boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valido_al is null or valido_al >= valido_dal)
);
comment on table public.appalto_contratti is
  'Accordo con un committente (profilo customer_type=appaltatore): condizioni di pagamento, maggiorazioni, modo di fatturazione, e il contenitore del suo listino (appalto_tariffe).';
comment on column public.appalto_contratti.modo_fatturazione is
  '"per_commessa" = un rendiconto per commessa; "mensile_cumulativa" = un rendiconto al mese che raccoglie tutte le commesse di quel committente.';
comment on column public.appalto_contratti.include_fornitura is
  'true se gli appalti di questo contratto comprendono anche la fornitura di materiale, non solo la manodopera.';

create index if not exists appalto_contratti_committente_idx
  on public.appalto_contratti(company_id, committente_id, valido_dal desc);

-- ── 2. Il listino del contratto ─────────────────────────────────────────────

create table if not exists public.appalto_tariffe (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  contratto_id uuid not null references public.appalto_contratti(id) on delete cascade,
  tipo text not null check (tipo in ('manodopera', 'trasporto', 'lavorazione', 'nolo', 'materiale', 'forfait')),
  codice text,
  descrizione text not null check (length(btrim(descrizione)) > 0),
  unita_misura text not null default 'ora'
    check (unita_misura in ('ora', 'giornata', 'uomo_giorno', 'viaggio', 'km', 'mq', 'ml', 'mc', 'kg', 'cad', 'corpo')),
  prezzo_unitario numeric(14,4) not null default 0 check (prezzo_unitario >= 0),
  maggiorazione_straordinario_pct numeric(6,3) check (maggiorazione_straordinario_pct >= 0 and maggiorazione_straordinario_pct <= 200),
  maggiorazione_festivo_pct numeric(6,3) check (maggiorazione_festivo_pct >= 0 and maggiorazione_festivo_pct <= 200),
  tariffa_id uuid references public.tariffe_aziendali(id) on delete set null,
  qualifica text,
  valido_dal date,
  valido_al date,
  note text,
  ordine integer not null default 0,
  attivo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valido_al is null or valido_dal is null or valido_al >= valido_dal)
);
comment on table public.appalto_tariffe is
  'Listino concordato con un committente: una riga = una cosa fatturabile a quel committente, con unita'' di misura e prezzo. Il prezzo non si sovrascrive mai su un rendiconto emesso: all''uso la riga di rendiconto ne fa lo snapshot.';
comment on column public.appalto_tariffe.tariffa_id is
  'Tariffa aziendale (public.tariffe_aziendali, colonna costo_interno) da cui esce il COSTO per il margine. Non deriva il prezzo: il prezzo e'' quello concordato col committente.';
comment on column public.appalto_tariffe.maggiorazione_straordinario_pct is
  'NULL = si usa la maggiorazione del contratto.';

create index if not exists appalto_tariffe_contratto_idx
  on public.appalto_tariffe(company_id, contratto_id, ordine);
create unique index if not exists appalto_tariffe_codice_unico
  on public.appalto_tariffe(contratto_id, codice)
  where codice is not null;

-- ── 3. Le guardie di coerenza ───────────────────────────────────────────────
-- Un contratto d'appalto sta in piedi solo se il committente e' un committente
-- di QUESTA azienda. Il controllo non sta in un CHECK (guarda un'altra tabella)
-- e non sta nel frontend (si aggira): sta in un trigger.

create or replace function public.appalto_contratto_committente_valido()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare v_tipo text;
begin
  select p.customer_type into v_tipo
    from public.profiles p
   where p.id = new.committente_id and p.company_id = new.company_id;
  if not found then
    raise exception 'Il committente non appartiene a questa azienda' using errcode = '23514';
  end if;
  if v_tipo is distinct from 'appaltatore' then
    raise exception 'Il contratto d''appalto richiede un contatto di tipo Committente' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$fn$;
revoke all on function public.appalto_contratto_committente_valido() from public, anon, authenticated;

drop trigger if exists trg_appalto_contratto_committente on public.appalto_contratti;
create trigger trg_appalto_contratto_committente
  before insert or update of committente_id, company_id on public.appalto_contratti
  for each row execute function public.appalto_contratto_committente_valido();

-- Una tariffa appartiene all'azienda del suo contratto: company_id non si
-- sceglie, si deduce. Senza questo una tariffa potrebbe nascere con il
-- company_id di chi scrive e il contratto di un'altra azienda.
create or replace function public.appalto_tariffa_azienda_dal_contratto()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare v_company uuid;
begin
  select c.company_id into v_company
    from public.appalto_contratti c where c.id = new.contratto_id;
  if not found then
    raise exception 'Contratto d''appalto inesistente' using errcode = '23514';
  end if;
  new.company_id := v_company;
  new.updated_at := now();
  return new;
end;
$fn$;
revoke all on function public.appalto_tariffa_azienda_dal_contratto() from public, anon, authenticated;

drop trigger if exists trg_appalto_tariffa_azienda on public.appalto_tariffe;
create trigger trg_appalto_tariffa_azienda
  before insert or update of contratto_id, company_id on public.appalto_tariffe
  for each row execute function public.appalto_tariffa_azienda_dal_contratto();

-- updated_at anche sulle modifiche che non toccano le colonne dei trigger sopra.
create or replace function public.appalto_tocca_updated_at()
returns trigger language plpgsql set search_path = '' as $fn$
begin new.updated_at := now(); return new; end;
$fn$;
revoke all on function public.appalto_tocca_updated_at() from public, anon, authenticated;

drop trigger if exists trg_appalto_contratti_updated on public.appalto_contratti;
create trigger trg_appalto_contratti_updated before update on public.appalto_contratti
  for each row execute function public.appalto_tocca_updated_at();
drop trigger if exists trg_appalto_tariffe_updated on public.appalto_tariffe;
create trigger trg_appalto_tariffe_updated before update on public.appalto_tariffe
  for each row execute function public.appalto_tocca_updated_at();

-- ── 4. Accessi ──────────────────────────────────────────────────────────────

alter table public.appalto_contratti enable row level security;
alter table public.appalto_tariffe enable row level security;

revoke all on public.appalto_contratti from public, anon, authenticated;
revoke all on public.appalto_tariffe from public, anon, authenticated;
grant select, insert, update, delete on public.appalto_contratti to authenticated;
grant select, insert, update, delete on public.appalto_tariffe to authenticated;
grant all on public.appalto_contratti to service_role;
grant all on public.appalto_tariffe to service_role;

-- Il contratto: lo legge chi vede i clienti, lo scrive chi li modifica.
drop policy if exists appalto_contratti_lettura on public.appalto_contratti;
create policy appalto_contratti_lettura on public.appalto_contratti for select to authenticated using (
  not (select public.utente_bloccato())
  and not (select public.utente_e_cliente_esterno())
  and public.has_permission_for_company((select auth.uid()), 'can_view_customers', company_id)
);

drop policy if exists appalto_contratti_scrittura on public.appalto_contratti;
create policy appalto_contratti_scrittura on public.appalto_contratti for insert to authenticated with check (
  not (select public.utente_bloccato())
  and not (select public.utente_e_cliente_esterno())
  and not public.utente_sola_lettura(company_id)
  and public.has_permission_for_company((select auth.uid()), 'can_edit_customers', company_id)
);

drop policy if exists appalto_contratti_modifica on public.appalto_contratti;
create policy appalto_contratti_modifica on public.appalto_contratti for update to authenticated
using (
  not (select public.utente_bloccato())
  and not (select public.utente_e_cliente_esterno())
  and not public.utente_sola_lettura(company_id)
  and public.has_permission_for_company((select auth.uid()), 'can_edit_customers', company_id)
)
with check (
  not public.utente_sola_lettura(company_id)
  and public.has_permission_for_company((select auth.uid()), 'can_edit_customers', company_id)
);

drop policy if exists appalto_contratti_cancella on public.appalto_contratti;
create policy appalto_contratti_cancella on public.appalto_contratti for delete to authenticated using (
  not (select public.utente_bloccato())
  and not (select public.utente_e_cliente_esterno())
  and not public.utente_sola_lettura(company_id)
  and public.has_permission_for_company((select auth.uid()), 'can_edit_customers', company_id)
);

-- Il listino sono prezzi: serve anche il permesso sugli importi delle commesse.
-- Cosi' il capocantiere che vede i clienti non legge quanto incassa l'azienda.
drop policy if exists appalto_tariffe_lettura on public.appalto_tariffe;
create policy appalto_tariffe_lettura on public.appalto_tariffe for select to authenticated using (
  not (select public.utente_bloccato())
  and not (select public.utente_e_cliente_esterno())
  and public.has_permission_for_company((select auth.uid()), 'can_view_customers', company_id)
  and public.has_permission_for_company((select auth.uid()), 'can_view_order_amounts', company_id)
);

drop policy if exists appalto_tariffe_scrittura on public.appalto_tariffe;
create policy appalto_tariffe_scrittura on public.appalto_tariffe for insert to authenticated with check (
  not (select public.utente_bloccato())
  and not (select public.utente_e_cliente_esterno())
  and not public.utente_sola_lettura(company_id)
  and public.has_permission_for_company((select auth.uid()), 'can_edit_customers', company_id)
  and public.has_permission_for_company((select auth.uid()), 'can_view_order_amounts', company_id)
);

drop policy if exists appalto_tariffe_modifica on public.appalto_tariffe;
create policy appalto_tariffe_modifica on public.appalto_tariffe for update to authenticated
using (
  not (select public.utente_bloccato())
  and not (select public.utente_e_cliente_esterno())
  and not public.utente_sola_lettura(company_id)
  and public.has_permission_for_company((select auth.uid()), 'can_edit_customers', company_id)
  and public.has_permission_for_company((select auth.uid()), 'can_view_order_amounts', company_id)
)
with check (
  not public.utente_sola_lettura(company_id)
  and public.has_permission_for_company((select auth.uid()), 'can_edit_customers', company_id)
  and public.has_permission_for_company((select auth.uid()), 'can_view_order_amounts', company_id)
);

drop policy if exists appalto_tariffe_cancella on public.appalto_tariffe;
create policy appalto_tariffe_cancella on public.appalto_tariffe for delete to authenticated using (
  not (select public.utente_bloccato())
  and not (select public.utente_e_cliente_esterno())
  and not public.utente_sola_lettura(company_id)
  and public.has_permission_for_company((select auth.uid()), 'can_edit_customers', company_id)
  and public.has_permission_for_company((select auth.uid()), 'can_view_order_amounts', company_id)
);

-- I super admin passano dalle policy di piattaforma gia' in uso altrove.
drop policy if exists appalto_contratti_super_admin on public.appalto_contratti;
create policy appalto_contratti_super_admin on public.appalto_contratti for all to authenticated
  using (public.has_role((select auth.uid()), 'super_admin'::public.app_role));
drop policy if exists appalto_tariffe_super_admin on public.appalto_tariffe;
create policy appalto_tariffe_super_admin on public.appalto_tariffe for all to authenticated
  using (public.has_role((select auth.uid()), 'super_admin'::public.app_role));
