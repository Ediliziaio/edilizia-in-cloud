-- Il SAL sa quanto si è fatto NEL PERIODO, non solo a oggi
-- ────────────────────────────────────────────────────────
-- 28/11/2026, lotto 5 del modello (docs/modello-avanzamento-rendiconto-sal-20261128.md §3.3).
--
-- Il verbale SAL è cumulativo: ogni voce porta la percentuale «a oggi» e il confronto col SAL
-- precedente si fa per differenza. Finché l'avanzamento era un numero scritto a mano non si poteva
-- fare altro. Adesso che c'è il registro dei movimenti, il periodo si può misurare per davvero:
--
--   * **a oggi** = la somma dei movimenti fino alla data del SAL;
--   * **del periodo** = la somma dei movimenti fra il giorno dopo il SAL precedente e questo.
--
-- `public.sal_quantita_del_periodo(commessa, dal, al)` restituisce, per lavorazione, i due numeri,
-- quanti giorni li hanno dichiarati e da dove vengono (rendiconti, rapportini, ufficio). Nessun
-- importo: la griglia del SAL mostra la colonna anche a chi non ha il permesso Costi, e gli importi
-- continuano ad arrivare dalle viste protette come prima.
--
-- `dal` può essere nullo (primo SAL: si conta tutto fino ad `al`). I movimenti di apertura — il
-- saldo che ha portato dentro il pregresso — portano la data in cui la lavorazione era stata
-- spuntata, quindi cadono nel periodo giusto da sé; quelli senza data cadono nel primo periodo, ed
-- è giusto: il pregresso è lavoro di prima.
-- Idempotente.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

create or replace function public.sal_quantita_del_periodo(
  p_order uuid,
  p_dal date default null,
  p_al date default null
)
returns table (
  sottofase_id uuid,
  fase_id uuid,
  modo text,
  unita text,
  quantita_contratto numeric,
  quantita_a_oggi numeric,
  quantita_del_periodo numeric,
  percentuale_a_oggi integer,
  giorni_del_periodo integer,
  origini text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare v_uid uuid := (select auth.uid()); v_company uuid; v_al date := coalesce(p_al, current_date);
begin
  select o.company_id into v_company from public.orders o where o.id = p_order and o.deleted_at is null;
  if v_uid is null or v_company is null then
    return;
  end if;
  if not (public.user_assigned_to_order(p_order)
          or public.has_permission_for_company(v_uid, 'can_view_orders', v_company)) then
    return;
  end if;

  return query
    with lav as (
      select s.id, s.phase_id,
             coalesce(s.modo_avanzamento, 'quantita') as modo,
             coalesce(s.unita_contratto, (select max(v.unita) from public.order_work_phase_voci v where v.subphase_id = s.id)) as unita,
             coalesce(s.quantita_contratto, public.sottofase_quantita_totale(s.id)) as base
        from public.order_work_subphases s
        join public.order_work_phases f on f.id = s.phase_id
       where f.order_id = p_order and coalesce(s.a_movimenti, false)
    ), mov as (
      select m.sottofase_id,
             sum(m.quantita) filter (where m.data <= v_al) as q_oggi,
             sum(m.quantita) filter (where m.data <= v_al and (p_dal is null or m.data >= p_dal)) as q_periodo,
             max(m.percentuale) filter (where m.data <= v_al) as pct_oggi,
             count(distinct m.data) filter (where m.data <= v_al and (p_dal is null or m.data >= p_dal)) as giorni,
             array_agg(distinct m.origine) filter (where m.data <= v_al and (p_dal is null or m.data >= p_dal)) as origini
        from public.avanzamento_movimenti m
        join lav on lav.id = m.sottofase_id
       group by m.sottofase_id
    )
    select l.id, l.phase_id, l.modo, l.unita, l.base,
           case when l.modo = 'quantita'
                then least(round(coalesce(mv.q_oggi, 0), 3), coalesce(l.base, round(coalesce(mv.q_oggi, 0), 3))) end,
           case when l.modo = 'quantita' then round(coalesce(mv.q_periodo, 0), 3) end,
           case when l.modo = 'quantita' then
                  case when coalesce(mv.q_oggi, 0) <= 0 then 0
                       when l.base is null or l.base <= 0 then 0
                       when mv.q_oggi >= l.base then 100
                       else greatest(1, least(99, round(100 * mv.q_oggi / l.base)))::integer end
                else coalesce(round(mv.pct_oggi), 0)::integer end,
           coalesce(mv.giorni, 0)::integer,
           coalesce(mv.origini, array[]::text[])
      from lav l left join mov mv on mv.sottofase_id = l.id;
end;
$function$;

revoke all on function public.sal_quantita_del_periodo(uuid, date, date) from public, anon;
grant execute on function public.sal_quantita_del_periodo(uuid, date, date) to authenticated;

comment on function public.sal_quantita_del_periodo(uuid, date, date) is
  'Per il verbale SAL: quanto dicono i movimenti a oggi e nel periodo, lavorazione per lavorazione, senza importi. dal nullo = dal principio.';
