-- ════════════════════════════════════════════════════════════════════════════
-- Il rendiconto al committente: il documento, la numerazione, il congelamento
-- ════════════════════════════════════════════════════════════════════════════
-- Fase 5 del Modulo Appaltatori. Le righe di rendiconto diventano un documento
-- periodico per il committente, nei DUE modi deciso il 28/10: per commessa, o
-- mensile cumulativo su tutte le sue commesse. Per questo il legame forte e'
-- committente + periodo, e `order_id` resta vuoto nel caso cumulativo.
--
--   appalto_sal        il documento: periodo, numero, totale, ritenuta, netto,
--                      stato (bozza → inviato → approvato → fatturato).
--   appalto_sal_crea   lo compone in un colpo solo: prende le righe confermate
--                      del periodo, assegna il numero sotto advisory lock e
--                      porta le righe a «in_sal» nella stessa transazione.
--
-- IL CONGELAMENTO. Una riga entrata in un rendiconto che non e' piu' in bozza
-- non si modifica e non si cancella: e' quello che rende il documento una prova
-- e non un appunto. Si libera solo annullando un rendiconto ancora in bozza, e
-- allora le righe tornano «confermata». Stessa regola di `lp_sal` per i lavori
-- pubblici, dove ha gia' funzionato.
--
-- Altre due regole che non sono dettagli:
--  - il NUMERO e' progressivo per COMMITTENTE, perche' e' il documento che vede
--    lui; sotto advisory lock, cosi' due persone che compongono nello stesso
--    momento non prendono lo stesso numero;
--  - righe di CONTRATTI DIVERSI non si mescolano in un documento solo: contratti
--    diversi vogliono dire ritenuta e condizioni di pagamento diverse.
--
-- L'INSERIMENTO non e' concesso dal browser: un rendiconto scritto a mano non
-- avrebbe le righe agganciate ne' un numero senza buchi. Passa solo da
-- `appalto_sal_crea`.
--
-- NB: `appalto_sal_crea` e `appalto_sal_stato` sono state corrette subito dopo
-- (20281028151000 e 20281028152000). Qui resta la versione applicata: la storia
-- dice come e' andata.
--
-- Nessuna riga scritta. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create table if not exists public.appalto_sal (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  committente_id uuid not null references public.profiles(id) on delete restrict,
  contratto_id uuid not null references public.appalto_contratti(id) on delete restrict,
  order_id uuid references public.orders(id) on delete restrict,
  periodo_dal date not null,
  periodo_al date not null,
  numero integer not null,
  stato text not null default 'bozza' check (stato in ('bozza', 'inviato', 'approvato', 'fatturato')),
  totale numeric(14,2) not null default 0,
  ritenuta_pct numeric(6,3) not null default 0,
  ritenuta numeric(14,2) not null default 0,
  netto numeric(14,2) not null default 0,
  righe_contate integer not null default 0,
  note text,
  pdf_path text,
  inviato_at timestamptz,
  approvato_da uuid,
  approvato_at timestamptz,
  documento_fiscale_id uuid references public.documenti_fiscali(id) on delete set null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (periodo_al >= periodo_dal),
  unique (committente_id, numero)
);
comment on table public.appalto_sal is
  'Il rendiconto periodico a un committente: le righe confermate di un periodo, il totale, la ritenuta e il netto. Con `order_id` pieno riguarda una commessa sola; vuoto, raccoglie tutte le commesse di quel committente nel periodo (si decide sul contratto, `modo_fatturazione`).';
comment on column public.appalto_sal.numero is
  'Progressivo per COMMITTENTE: e'' il documento che vede lui, e deve avere una numerazione sua.';

create index if not exists appalto_sal_committente_idx
  on public.appalto_sal(company_id, committente_id, periodo_al desc);
create index if not exists appalto_sal_order_idx
  on public.appalto_sal(order_id) where order_id is not null;

alter table public.appalto_rendiconto_righe
  add column if not exists sal_id uuid references public.appalto_sal(id) on delete set null;

alter table public.appalto_rendiconto_righe drop constraint if exists appalto_rendiconto_righe_stato_check;
alter table public.appalto_rendiconto_righe
  add constraint appalto_rendiconto_righe_stato_check
  check (stato in ('bozza', 'confermata', 'in_sal', 'fatturata'));

create index if not exists appalto_rendiconto_sal_idx
  on public.appalto_rendiconto_righe(sal_id) where sal_id is not null;

-- ── Il congelamento ─────────────────────────────────────────────────────────

create or replace function public.appalto_riga_congelata()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare v_sal record; v_id uuid;
begin
  v_id := coalesce(old.sal_id, case when tg_op = 'UPDATE' then new.sal_id end);
  if v_id is null then
    return coalesce(new, old);
  end if;
  select numero, stato into v_sal from public.appalto_sal where id = v_id;
  if found and v_sal.stato <> 'bozza' then
    raise exception 'La riga e'' nel rendiconto n. % (%): si libera solo annullando un rendiconto ancora in bozza',
      v_sal.numero, v_sal.stato using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$fn$;
revoke all on function public.appalto_riga_congelata() from public, anon, authenticated;

drop trigger if exists trg_appalto_riga_congelata on public.appalto_rendiconto_righe;
create trigger trg_appalto_riga_congelata
  before update or delete on public.appalto_rendiconto_righe
  for each row execute function public.appalto_riga_congelata();

-- ── Gli stati del documento (vedi 20281028152000) ───────────────────────────

create or replace function public.appalto_sal_stato()
returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  new.updated_at := now();
  if new.stato is distinct from old.stato then
    if old.stato = 'fatturato' then
      raise exception 'Un rendiconto fatturato non cambia piu'' stato' using errcode = '42501';
    end if;
    if old.stato = 'approvato' and new.stato in ('bozza', 'inviato') then
      raise exception 'Un rendiconto approvato non torna indietro: e'' la prova di quello che hai fatturato' using errcode = '42501';
    end if;
    if new.stato = 'inviato' and new.inviato_at is null then
      new.inviato_at := now();
    end if;
    if new.stato = 'approvato' then
      new.approvato_da := auth.uid();
      new.approvato_at := now();
    end if;
    if new.stato = 'fatturato' then
      update public.appalto_rendiconto_righe set stato = 'fatturata' where sal_id = new.id;
    end if;
  end if;
  return new;
end;
$fn$;
revoke all on function public.appalto_sal_stato() from public, anon, authenticated;

drop trigger if exists trg_appalto_sal_stato on public.appalto_sal;
create trigger trg_appalto_sal_stato before update on public.appalto_sal
  for each row execute function public.appalto_sal_stato();

-- Si annulla solo una bozza, e annullandola le righe tornano libere.
create or replace function public.appalto_sal_annulla()
returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  if old.stato <> 'bozza' then
    raise exception 'Si annulla solo un rendiconto in bozza: questo e'' %', old.stato using errcode = '42501';
  end if;
  update public.appalto_rendiconto_righe
     set stato = 'confermata', sal_id = null
   where sal_id = old.id;
  return old;
end;
$fn$;
revoke all on function public.appalto_sal_annulla() from public, anon, authenticated;

drop trigger if exists trg_appalto_sal_annulla on public.appalto_sal;
create trigger trg_appalto_sal_annulla before delete on public.appalto_sal
  for each row execute function public.appalto_sal_annulla();

-- ── Comporre il rendiconto (vedi 20281028151000) ────────────────────────────

create or replace function public.appalto_sal_crea(
  p_committente_id uuid,
  p_dal date,
  p_al date,
  p_order_id uuid default null,
  p_note text default null
) returns uuid language plpgsql security definer set search_path = '' as $fn$
declare
  v_company uuid; v_contratti uuid[]; v_contratto uuid;
  v_numero integer; v_sal uuid; v_tot numeric(14,2); v_n integer; v_rit numeric(6,3);
begin
  if p_al < p_dal then
    raise exception 'Il periodo finisce prima di cominciare' using errcode = '22023';
  end if;
  select p.company_id into v_company from public.profiles p
   where p.id = p_committente_id and p.customer_type = 'appaltatore';
  if v_company is null then
    raise exception 'Committente inesistente' using errcode = '23514';
  end if;
  if auth.uid() is null
     or public.utente_bloccato()
     or public.utente_e_cliente_esterno()
     or public.utente_sola_lettura(v_company)
     or not public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_company)
     or not public.has_permission_for_company(auth.uid(), 'can_view_order_amounts', v_company) then
    raise exception 'Non puoi comporre il rendiconto di questo committente' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_committente_id::text, 0));

  create temporary table _righe_sal on commit drop as
  select rr.id, rr.importo, o.appalto_contratto_id
    from public.appalto_rendiconto_righe rr
    join public.orders o on o.id = rr.order_id and o.deleted_at is null
   where rr.stato = 'confermata'
     and rr.sal_id is null
     and rr.data between p_dal and p_al
     and o.company_id = v_company
     and o.order_type = 'appaltatore_lavoro'
     and o.customer_id = p_committente_id
     and (p_order_id is null or rr.order_id = p_order_id)
     and public.puo_modificare_commessa(o.id);

  select count(*), coalesce(sum(importo), 0) into v_n, v_tot from _righe_sal;
  if v_n = 0 then
    raise exception 'Nessuna riga confermata da rendicontare in questo periodo' using errcode = '22023';
  end if;

  select array_agg(distinct appalto_contratto_id) into v_contratti from _righe_sal;
  if array_length(v_contratti, 1) > 1 or v_contratti[1] is null then
    raise exception 'Le righe del periodo appartengono a contratti diversi (o a commesse senza contratto): va fatto un rendiconto per contratto'
      using errcode = '22023';
  end if;
  v_contratto := v_contratti[1];
  select ritenuta_pct into v_rit from public.appalto_contratti where id = v_contratto;

  select coalesce(max(numero), 0) + 1 into v_numero
    from public.appalto_sal where committente_id = p_committente_id;

  insert into public.appalto_sal (
    company_id, committente_id, contratto_id, order_id,
    periodo_dal, periodo_al, numero, stato,
    totale, ritenuta_pct, ritenuta, netto, righe_contate, note
  ) values (
    v_company, p_committente_id, v_contratto, p_order_id,
    p_dal, p_al, v_numero, 'bozza',
    v_tot, coalesce(v_rit, 0), round(v_tot * coalesce(v_rit, 0) / 100.0, 2),
    v_tot - round(v_tot * coalesce(v_rit, 0) / 100.0, 2), v_n, p_note
  ) returning id into v_sal;

  update public.appalto_rendiconto_righe
     set stato = 'in_sal', sal_id = v_sal
   where id in (select id from _righe_sal);

  return v_sal;
end;
$fn$;
revoke all on function public.appalto_sal_crea(uuid, date, date, uuid, text) from public, anon;
grant execute on function public.appalto_sal_crea(uuid, date, date, uuid, text) to authenticated, service_role;

comment on function public.appalto_sal_crea(uuid, date, date, uuid, text) is
  'Compone un rendiconto al committente prendendo le righe confermate del periodo (tutte le sue commesse, o una sola con p_order_id). Numero progressivo per committente sotto lock, righe portate a «in_sal» nella stessa transazione.';

-- ── Accessi ─────────────────────────────────────────────────────────────────

alter table public.appalto_sal enable row level security;
revoke all on public.appalto_sal from public, anon, authenticated;
grant select, update, delete on public.appalto_sal to authenticated;
grant all on public.appalto_sal to service_role;
-- Niente INSERT dal browser: passa solo da appalto_sal_crea.

drop policy if exists sal_lettura on public.appalto_sal;
create policy sal_lettura on public.appalto_sal for select to authenticated using (
  not (select public.utente_bloccato())
  and not (select public.utente_e_cliente_esterno())
  and public.has_permission_for_company((select auth.uid()), 'can_view_customers', company_id)
  and public.has_permission_for_company((select auth.uid()), 'can_view_order_amounts', company_id)
);

drop policy if exists sal_modifica on public.appalto_sal;
create policy sal_modifica on public.appalto_sal for update to authenticated
using (
  not (select public.utente_bloccato())
  and not (select public.utente_e_cliente_esterno())
  and not public.utente_sola_lettura(company_id)
  and public.has_permission_for_company((select auth.uid()), 'can_edit_orders', company_id)
  and public.has_permission_for_company((select auth.uid()), 'can_view_order_amounts', company_id)
)
with check (
  not public.utente_sola_lettura(company_id)
  and public.has_permission_for_company((select auth.uid()), 'can_edit_orders', company_id)
);

drop policy if exists sal_annulla on public.appalto_sal;
create policy sal_annulla on public.appalto_sal for delete to authenticated using (
  not (select public.utente_bloccato())
  and not (select public.utente_e_cliente_esterno())
  and not public.utente_sola_lettura(company_id)
  and public.has_permission_for_company((select auth.uid()), 'can_edit_orders', company_id)
  and public.has_permission_for_company((select auth.uid()), 'can_view_order_amounts', company_id)
);

drop policy if exists sal_super_admin on public.appalto_sal;
create policy sal_super_admin on public.appalto_sal for all to authenticated
  using (public.has_role((select auth.uid()), 'super_admin'::public.app_role));
