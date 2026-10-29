-- ════════════════════════════════════════════════════════════════════════════
-- I numeri dell'appalto: quale committente conviene, e quanto ti deve
-- ════════════════════════════════════════════════════════════════════════════
-- Fase 6 del Modulo Appaltatori (28/10/2026).
--
-- La domanda che oggi non ha risposta in nessuna pagina e' «quale committente mi
-- conviene davvero». Un committente che ti passa molto lavoro a margine basso
-- riempie il calendario e non l'utile, e la cosa non si vede da nessuna parte:
-- si vede solo il rendicontato, che e' il numero che illude.
--
-- Tre regole, e nessuna e' un dettaglio:
--
--  1. **Il margine e' NULL quando il costo non si sa.** Mai zero, mai pari
--     all'incasso. `righe_senza_costo` dice su quante righe il numero manca.
--  2. **La percentuale di margine si calcola sul ricavo delle righe di cui il
--     costo si conosce** (`rendicontato_con_costo`), non sul rendicontato
--     intero. Dividere per il totale faceva uscire 28,9% dove il margine vero
--     era 30,6%: due righe di nolo senza costo stavano al denominatore e non al
--     numeratore. Trovato sui numeri veri di Demo Azienda 2, non ragionando.
--  3. **Le bozze si contano a parte.** Una riga che nessuno ha ancora guardato
--     non e' un soldo.
--
-- Chi vede che cosa:
--  - senza `can_view_order_amounts` la funzione non risponde affatto;
--  - senza `can_view_costs` il costo esce NULL, e senza `can_view_margins` il
--    margine esce NULL: sono DUE permessi distinti (un commerciale puo'' avere
--    l''uno e non l''altro), e gli importi verso il committente sono una terza
--    cosa ancora;
--  - un utente limitato alle commesse assegnate vede solo quelle
--    (`puo_vedere_commessa`).
--
-- Nessuna riga scritta. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- Il tipo di ritorno e' cambiato in corsa (`rendicontato_con_costo` e' nata
-- dalla correzione al punto 2): una colonna in piu' nel tipo di ritorno vuole
-- il DROP, non basta il CREATE OR REPLACE.
drop function if exists public.appalto_conti_committente(date, date);
drop function if exists public.appalto_margine_mensile(uuid, integer);

-- ── Un quadro per committente ───────────────────────────────────────────────

create or replace function public.appalto_conti_committente(
  p_dal date default null,
  p_al date default null
)
returns table (
  committente_id uuid, nome text, cantieri integer, righe integer,
  rendicontato numeric, in_bozza numeric, costo numeric, margine numeric,
  margine_pct numeric, rendicontato_con_costo numeric, righe_senza_costo integer,
  rendiconti integer, chiuso_in_rendiconti numeric, da_rendicontare numeric,
  ritenuta_trattenuta numeric, fatturato numeric, incassato numeric,
  da_incassare numeric
)
language plpgsql stable security definer set search_path = '' as $fn$
-- I nomi delle colonne di ritorno (nome, righe, costo, margine…) sono anche
-- nomi di colonna nelle tabelle: senza questa direttiva Postgres non sa a quale
-- dei due ci si riferisce e si ferma con «column reference is ambiguous».
#variable_conflict use_column
declare
  v_company uuid := public.get_my_company_id();
  v_costi boolean;
  v_margini boolean;
  v_dal date := coalesce(p_dal, '1900-01-01'::date);
  v_al date := coalesce(p_al, '2999-12-31'::date);
begin
  if v_company is null
     or auth.uid() is null
     or public.utente_bloccato()
     or public.utente_e_cliente_esterno()
     or not public.has_permission_for_company(auth.uid(), 'can_view_order_amounts', v_company) then
    raise exception 'Non puoi vedere i numeri dell''appalto di questa azienda' using errcode = '42501';
  end if;
  v_costi := public.has_permission_for_company(auth.uid(), 'can_view_costs', v_company);
  v_margini := public.has_permission_for_company(auth.uid(), 'can_view_margins', v_company);

  return query
  with commesse as (
    select o.id, o.customer_id
      from public.orders o
     where o.company_id = v_company
       and o.order_type = 'appaltatore_lavoro'
       and o.deleted_at is null
       and public.puo_vedere_commessa(o.id)
  ),
  righe_periodo as (
    select c.customer_id, r.order_id, r.id, r.stato, r.importo, r.costo_interno, r.margine
      from public.appalto_rendiconto_righe r
      join commesse c on c.id = r.order_id
     where r.data between v_dal and v_al
  ),
  per_righe as (
    select rp.customer_id,
           count(distinct rp.order_id)::integer as n_cantieri,
           count(*) filter (where rp.stato <> 'bozza')::integer as n_righe,
           coalesce(sum(rp.importo) filter (where rp.stato <> 'bozza'), 0) as tot_rendicontato,
           coalesce(sum(rp.importo) filter (where rp.stato = 'bozza'), 0) as tot_bozza,
           sum(rp.costo_interno) filter (where rp.stato <> 'bozza' and rp.costo_interno is not null) as tot_costo,
           sum(rp.margine) filter (where rp.stato <> 'bozza' and rp.margine is not null) as tot_margine,
           -- Il denominatore onesto della percentuale: vedi il punto 2 in testa.
           sum(rp.importo) filter (where rp.stato <> 'bozza' and rp.costo_interno is not null) as tot_ricavo_noto,
           count(*) filter (where rp.stato <> 'bozza' and rp.costo_interno is null)::integer as n_senza_costo,
           -- Confermato ma non ancora dentro un rendiconto: lavoro fatto che il
           -- committente non ha nemmeno visto.
           coalesce(sum(rp.importo) filter (where rp.stato = 'confermata'), 0) as tot_da_rendicontare
      from righe_periodo rp
     group by rp.customer_id
  ),
  per_sal as (
    select s.committente_id as cid,
           count(*)::integer as n_rendiconti,
           coalesce(sum(s.totale), 0) as tot_chiuso,
           coalesce(sum(s.ritenuta), 0) as tot_ritenuta
      from public.appalto_sal s
     where s.company_id = v_company
       and s.periodo_al between v_dal and v_al
       and (s.order_id is null or exists (select 1 from commesse c where c.id = s.order_id))
     group by s.committente_id
  ),
  per_fatture as (
    select s.committente_id as cid,
           coalesce(sum(d.totale_da_pagare), 0) as tot_fatturato,
           coalesce(sum(d.importo_pagato), 0) as tot_incassato
      from public.appalto_sal s
      join public.documenti_fiscali d on d.id = s.documento_fiscale_id
     where s.company_id = v_company
       and s.periodo_al between v_dal and v_al
       and d.deleted_at is null
       and d.stato not in ('bozza', 'annullata')
     group by s.committente_id
  ),
  committenti as (
    select customer_id as id from per_righe
    union select cid from per_sal
  )
  select
    k.id,
    coalesce(nullif(btrim(p.business_name), ''),
             nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''),
             'Committente')::text,
    coalesce(pr.n_cantieri, 0),
    coalesce(pr.n_righe, 0),
    coalesce(pr.tot_rendicontato, 0),
    coalesce(pr.tot_bozza, 0),
    case when v_costi then pr.tot_costo end,
    case when v_margini then pr.tot_margine end,
    case when v_margini and pr.tot_margine is not null and coalesce(pr.tot_ricavo_noto, 0) > 0
         then round(pr.tot_margine * 100 / pr.tot_ricavo_noto, 1) end,
    case when v_margini then coalesce(pr.tot_ricavo_noto, 0) end,
    coalesce(pr.n_senza_costo, 0),
    coalesce(ps.n_rendiconti, 0),
    coalesce(ps.tot_chiuso, 0),
    coalesce(pr.tot_da_rendicontare, 0),
    coalesce(ps.tot_ritenuta, 0),
    coalesce(pf.tot_fatturato, 0),
    coalesce(pf.tot_incassato, 0),
    coalesce(pf.tot_fatturato, 0) - coalesce(pf.tot_incassato, 0)
  from committenti k
  join public.profiles p on p.id = k.id
  left join per_righe pr on pr.customer_id = k.id
  left join per_sal ps on ps.cid = k.id
  left join per_fatture pf on pf.cid = k.id
  order by coalesce(pr.tot_rendicontato, 0) desc;
end;
$fn$;
revoke all on function public.appalto_conti_committente(date, date) from public, anon;
grant execute on function public.appalto_conti_committente(date, date) to authenticated, service_role;
comment on function public.appalto_conti_committente(date, date) is
  'Un quadro per committente: rendicontato, margine (NULL se il costo non si sa) con la percentuale calcolata sul solo ricavo di cui si conosce il costo, quanto resta da rendicontare, ritenuta trattenuta, fatturato e incassato. Il costo vuole «can_view_costs», il margine «can_view_margins»: sono due permessi distinti.';

-- ── Il margine nel tempo ────────────────────────────────────────────────────
-- Il dato che manca di piu': un committente che peggiora mese per mese non si
-- vede da un totale, si vede da una riga per mese.

create or replace function public.appalto_margine_mensile(
  p_committente_id uuid default null,
  p_mesi integer default 12
)
returns table (
  mese date, committente_id uuid, nome text, rendicontato numeric,
  costo numeric, margine numeric, margine_pct numeric,
  rendicontato_con_costo numeric, righe_senza_costo integer
)
language plpgsql stable security definer set search_path = '' as $fn$
#variable_conflict use_column
declare
  v_company uuid := public.get_my_company_id();
  v_costi boolean;
  v_margini boolean;
  v_mesi integer := least(greatest(coalesce(p_mesi, 12), 1), 60);
  v_dal date;
begin
  if v_company is null
     or auth.uid() is null
     or public.utente_bloccato()
     or public.utente_e_cliente_esterno()
     or not public.has_permission_for_company(auth.uid(), 'can_view_order_amounts', v_company) then
    raise exception 'Non puoi vedere i numeri dell''appalto di questa azienda' using errcode = '42501';
  end if;
  v_costi := public.has_permission_for_company(auth.uid(), 'can_view_costs', v_company);
  v_margini := public.has_permission_for_company(auth.uid(), 'can_view_margins', v_company);
  v_dal := (date_trunc('month', current_date) - make_interval(months => v_mesi - 1))::date;

  return query
  select
    date_trunc('month', r.data)::date,
    o.customer_id,
    coalesce(nullif(btrim(p.business_name), ''),
             nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''),
             'Committente')::text,
    coalesce(sum(r.importo), 0),
    case when v_costi then sum(r.costo_interno) end,
    case when v_margini then sum(r.margine) end,
    case when v_margini and sum(r.margine) is not null
              and coalesce(sum(r.importo) filter (where r.costo_interno is not null), 0) > 0
         then round(sum(r.margine) * 100
                    / sum(r.importo) filter (where r.costo_interno is not null), 1) end,
    case when v_margini then coalesce(sum(r.importo) filter (where r.costo_interno is not null), 0) end,
    count(*) filter (where r.costo_interno is null)::integer
  from public.appalto_rendiconto_righe r
  join public.orders o on o.id = r.order_id and o.deleted_at is null
  join public.profiles p on p.id = o.customer_id
  where o.company_id = v_company
    and o.order_type = 'appaltatore_lavoro'
    and r.stato <> 'bozza'
    and r.data >= v_dal
    and (p_committente_id is null or o.customer_id = p_committente_id)
    and public.puo_vedere_commessa(o.id)
  group by 1, 2, 3
  order by 1 desc, 4 desc;
end;
$fn$;
revoke all on function public.appalto_margine_mensile(uuid, integer) from public, anon;
grant execute on function public.appalto_margine_mensile(uuid, integer) to authenticated, service_role;
comment on function public.appalto_margine_mensile(uuid, integer) is
  'Rendicontato e margine mese per mese, per committente: un committente che peggiora non si vede da un totale. Le bozze restano fuori; senza «can_view_costs» costo e margine escono NULL.';
