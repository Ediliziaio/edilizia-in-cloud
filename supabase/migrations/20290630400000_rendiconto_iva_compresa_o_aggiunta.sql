-- L'IVA del rendiconto: «+ IVA» o «IVA compresa», scelto una volta per commessa
-- ─────────────────────────────────────────────────────────────────────────────
-- 28/11/2026, chiesto dal titolare: «il discorso IVA: fai la scelta se IVA compresa o + IVA, è
-- importante».
--
-- Fino a oggi il rendiconto diceva sempre «Totale IVA esclusa»: i prezzi arrivano dai listini, che
-- sono IVA esclusa, e l'IVA la metteva la fattura. Ma non tutti i listini sono fatti così — col
-- privato si tratta a prezzo finito, IVA compresa — e il committente che legge un totale senza
-- sapere quale dei due è, fa il conto sbagliato.
--
-- La scelta sta sulla **commessa**, non sul singolo giorno: il rendiconto del giorno e quello del
-- periodo devono dire la stessa cosa, e una scelta per documento si disallineerebbe al primo
-- giorno distratto. Tre casi:
--   * `iva_pct` nullo        → come prima: importi IVA esclusa, l'IVA la mette la fattura;
--   * `iva_pct` + non compresa → i prezzi sono netti: il documento mostra imponibile, IVA e totale;
--   * `iva_pct` + compresa     → i prezzi la comprendono: il totale è la somma delle righe, e
--                                imponibile e IVA si ricavano all'indietro.
-- L'inversione contabile vince su tutto (il campo `appalto_contratti.regime_iva` che la fattura
-- dal SAL già rispetta): lì l'IVA non si applica, e il documento stampa la clausola.
-- Idempotente.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

create table if not exists public.commessa_rendiconto_iva (
  order_id uuid primary key references public.orders(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  iva_pct numeric(5,2),
  iva_compresa boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.commessa_rendiconto_iva drop constraint if exists commessa_rendiconto_iva_pct_check;
alter table public.commessa_rendiconto_iva
  add constraint commessa_rendiconto_iva_pct_check
  check (iva_pct is null or (iva_pct >= 0 and iva_pct < 100));

comment on table public.commessa_rendiconto_iva is
  'Come il rendiconto al committente tratta l''IVA su questa commessa: nulla (IVA esclusa), aggiunta, o già compresa nei prezzi. Si scrive con rendiconto_iva_imposta().';

alter table public.commessa_rendiconto_iva enable row level security;

drop policy if exists cri_lettura on public.commessa_rendiconto_iva;
create policy cri_lettura on public.commessa_rendiconto_iva for select to authenticated
  using (
    not (select public.utente_e_cliente_esterno())
    and not (select public.utente_bloccato())
    and public.puo_vedere_commessa(order_id)
    and public.has_permission_for_company((select auth.uid()), 'can_view_order_amounts', company_id)
  );

-- Si scrive solo dalla funzione qui sotto.
revoke all on public.commessa_rendiconto_iva from anon;
revoke insert, update, delete on public.commessa_rendiconto_iva from authenticated;
grant select on public.commessa_rendiconto_iva to authenticated;

-- Come sta l'IVA su questa commessa: la scelta, e se il contratto è in inversione contabile.
create or replace function public.rendiconto_iva_commessa(p_order uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  o record;
  v_scelta record;
  v_inversione boolean := false;
begin
  if (select auth.uid()) is null or public.utente_bloccato() or public.utente_e_cliente_esterno()
     or not public.puo_vedere_commessa(p_order) then
    raise exception 'Non hai il permesso di vedere questa commessa' using errcode = '42501';
  end if;
  select x.id, x.company_id, x.appalto_contratto_id into o
    from public.orders x where x.id = p_order and x.deleted_at is null;
  if not found then raise exception 'Commessa inesistente' using errcode = '23514'; end if;

  if o.appalto_contratto_id is not null then
    select (c.regime_iva = 'reverse_charge') into v_inversione
      from public.appalto_contratti c where c.id = o.appalto_contratto_id;
  end if;

  select i.iva_pct, i.iva_compresa into v_scelta
    from public.commessa_rendiconto_iva i where i.order_id = p_order;

  return jsonb_build_object(
    'iva_pct', v_scelta.iva_pct,
    'iva_compresa', coalesce(v_scelta.iva_compresa, false),
    'inversione', coalesce(v_inversione, false)
  );
end;
$function$;

revoke all on function public.rendiconto_iva_commessa(uuid) from public, anon;
grant execute on function public.rendiconto_iva_commessa(uuid) to authenticated, service_role;

-- La scelta la fa chi può scrivere i rendiconti di questa commessa: stessa porta del salvataggio.
create or replace function public.rendiconto_iva_imposta(p_order uuid, p_pct numeric, p_compresa boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_company uuid;
  v_pct numeric(5,2) := case when p_pct is null then null else round(p_pct::numeric, 2) end;
begin
  v_company := private.rendiconto_giornaliero_puo_scrivere(p_order);
  if v_pct is not null and (v_pct < 0 or v_pct >= 100) then
    raise exception 'Aliquota IVA non valida' using errcode = '22023';
  end if;
  -- Senza aliquota non ha senso dire «compresa»: si torna a «IVA esclusa».
  insert into public.commessa_rendiconto_iva as i (order_id, company_id, iva_pct, iva_compresa, updated_by)
  values (p_order, v_company, v_pct, v_pct is not null and coalesce(p_compresa, false), (select auth.uid()))
  on conflict (order_id) do update
    set iva_pct = excluded.iva_pct,
        iva_compresa = excluded.iva_compresa,
        updated_at = now(),
        updated_by = excluded.updated_by;
  return public.rendiconto_iva_commessa(p_order);
end;
$function$;

revoke all on function public.rendiconto_iva_imposta(uuid, numeric, boolean) from public, anon;
grant execute on function public.rendiconto_iva_imposta(uuid, numeric, boolean) to authenticated, service_role;
