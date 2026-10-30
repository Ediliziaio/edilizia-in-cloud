-- ════════════════════════════════════════════════════════════════════════════
-- Commesse generali — Fonti: banca, mutuo e altri finanziamenti come fonti piene
-- ════════════════════════════════════════════════════════════════════════════
-- Segue 20281031140000_generale_investitori. Lo scopo del modulo è vedere il
-- rendimento: per questo il debito (mutuo fondiario, finanziamento, fido,
-- prestito soci, leasing) ha tutto quello che ne fa il costo.
--
--   · generale_fonti.tipo         + 'finanziamento' (fido, prestito soci,
--                                   leasing, altro) accanto a 'banca'.
--   · generale_fonti.forma        che cosa è, per chi legge: mutuo_fondiario,
--                                   finanziamento, fido, prestito_soci,
--                                   leasing, altro.
--   · generale_fonti.spese_iniziali  istruttoria, perizia, notaio, imposta
--                                   sostitutiva: entrano nel costo del debito.
--   · generale_fonti.rimborso     piano di rimborso: 'scadenza' (tutto alla
--                                   fine), 'rate' (quote di capitale costanti
--                                   ogni mese da ammortamento_dal alla
--                                   scadenza), 'vendite' (frazionamento o
--                                   accollo sulle unità vendute).
--   · generale_fonti_movimenti.tipo + 'spese' (pagate) e 'accollo' (quota del
--                                   mutuo passata all'acquirente di un'unità:
--                                   il debito scende senza uscita di cassa),
--                                   con unita_id = la commessa dell'unità.
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.generale_fonti add column if not exists forma text;
alter table public.generale_fonti add column if not exists spese_iniziali numeric(14,2) not null default 0;
alter table public.generale_fonti add column if not exists rimborso text not null default 'scadenza';
alter table public.generale_fonti add column if not exists ammortamento_dal date;

alter table public.generale_fonti drop constraint if exists generale_fonti_tipo;
alter table public.generale_fonti add constraint generale_fonti_tipo
  check (tipo in ('propri', 'capitale', 'prestito', 'banca', 'finanziamento'));
alter table public.generale_fonti drop constraint if exists generale_fonti_tasso_tipo;
alter table public.generale_fonti add constraint generale_fonti_tasso_tipo
  check (tasso_pct is null or tipo in ('prestito', 'banca', 'finanziamento'));
alter table public.generale_fonti drop constraint if exists generale_fonti_forma;
alter table public.generale_fonti add constraint generale_fonti_forma
  check (forma is null or forma in ('mutuo_fondiario', 'finanziamento', 'fido', 'prestito_soci', 'leasing', 'altro'));
alter table public.generale_fonti drop constraint if exists generale_fonti_spese;
alter table public.generale_fonti add constraint generale_fonti_spese check (spese_iniziali >= 0);
alter table public.generale_fonti drop constraint if exists generale_fonti_rimborso;
alter table public.generale_fonti add constraint generale_fonti_rimborso check (rimborso in ('scadenza', 'rate', 'vendite'));

comment on column public.generale_fonti.forma is
  'Che cosa è il debito: mutuo_fondiario, finanziamento, fido, prestito_soci, leasing, altro. Solo per banca e finanziamento.';
comment on column public.generale_fonti.spese_iniziali is
  'Spese del finanziamento (istruttoria, perizia, notaio, imposta sostitutiva): entrano nel costo del debito.';
comment on column public.generale_fonti.rimborso is
  'Piano di rimborso: scadenza (tutto alla fine), rate (quote di capitale costanti mensili da ammortamento_dal), vendite (frazionamento o accollo sulle unità vendute).';

alter table public.generale_fonti_movimenti add column if not exists unita_id uuid references public.orders(id) on delete set null;
alter table public.generale_fonti_movimenti drop constraint if exists generale_fonti_movimenti_tipo;
alter table public.generale_fonti_movimenti add constraint generale_fonti_movimenti_tipo
  check (tipo in ('versamento', 'rimborso', 'distribuzione', 'interessi', 'spese', 'accollo'));
create index if not exists generale_fonti_movimenti_unita_idx on public.generale_fonti_movimenti (unita_id) where unita_id is not null;

comment on column public.generale_fonti_movimenti.unita_id is
  'Per un accollo o un rimborso da frazionamento: la commessa dell''unità venduta.';

create or replace function public.generale_fonti_coerente()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_azienda uuid;
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.generale_id is distinct from old.generale_id then
    raise exception 'Una fonte non si sposta da una commessa generale all''altra.' using errcode = '22023';
  end if;
  select g.company_id into v_azienda from public.commesse_generali g where g.order_id = new.generale_id;
  if not found then
    raise exception 'Commessa generale non trovata.' using errcode = 'P0002';
  end if;
  new.company_id := v_azienda;
  new.nome := btrim(new.nome);
  new.email := nullif(btrim(lower(coalesce(new.email, ''))), '');
  if new.tipo not in ('propri', 'capitale') then
    new.quota_utile_pct := null;
  end if;
  if new.tipo not in ('prestito', 'banca', 'finanziamento') then
    new.tasso_pct := null;
    new.scadenza := null;
    new.spese_iniziali := 0;
    new.rimborso := 'scadenza';
    new.ammortamento_dal := null;
  end if;
  if new.tipo not in ('banca', 'finanziamento') then
    new.forma := null;
  end if;
  if new.scadenza is not null and new.data_inizio is not null and new.scadenza < new.data_inizio then
    raise exception 'La scadenza viene prima dell''inizio: controlla le date.' using errcode = '22023';
  end if;
  if new.rimborso = 'rate' and new.scadenza is null then
    raise exception 'Un rimborso a rate ha bisogno della scadenza (l''ultima rata).' using errcode = '22023';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.generale_fonti_movimenti_coerente()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  f record;
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.fonte_id is distinct from old.fonte_id then
    raise exception 'Un movimento non si sposta da una fonte all''altra.' using errcode = '22023';
  end if;
  select x.company_id, x.generale_id, x.tipo into f from public.generale_fonti x where x.id = new.fonte_id;
  if not found then
    raise exception 'Fonte non trovata.' using errcode = 'P0002';
  end if;
  new.company_id := f.company_id;
  new.generale_id := f.generale_id;
  if new.tipo in ('interessi', 'spese') and f.tipo not in ('prestito', 'banca', 'finanziamento') then
    raise exception 'Interessi e spese si pagano a chi presta: a chi sta a capitale si distribuisce l''utile.' using errcode = '22023';
  end if;
  if new.tipo = 'accollo' and f.tipo not in ('banca', 'finanziamento') then
    raise exception 'Si accolla all''acquirente solo un mutuo o un finanziamento.' using errcode = '22023';
  end if;
  if new.tipo = 'distribuzione' and f.tipo not in ('propri', 'capitale') then
    raise exception 'L''utile si distribuisce a chi sta a capitale: a chi presta si pagano gli interessi.' using errcode = '22023';
  end if;
  if new.unita_id is not null and not exists (
       select 1 from public.orders o where o.id = new.unita_id and o.commessa_generale_id = f.generale_id) then
    raise exception 'L''unità indicata non è di questa commessa generale.' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function public.generale_fonti_coerente() from public, anon, authenticated;
revoke all on function public.generale_fonti_movimenti_coerente() from public, anon, authenticated;
