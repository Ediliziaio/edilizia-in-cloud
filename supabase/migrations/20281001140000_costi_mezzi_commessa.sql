-- Costi di mobilita e mezzi attribuiti alla commessa.
--
-- Due numeri diversi, tenuti intenzionalmente separati:
--   1. il rimborso chilometrico approvato/rimborsato e un costo diretto reale;
--   2. assicurazione, bollo, rate e manutenzioni del mezzo producono invece una
--      stima gestionale per i giorni in cui il mezzo e stato sul cantiere.
--
-- La stima dei mezzi NON entra nel consuntivo ufficiale: potrebbe duplicare
-- costi gia registrati in company_costs. Viene esposta in una vista dedicata.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create index if not exists idx_rimborsi_km_order_stato
  on public.hr_rimborsi_km(order_id, stato)
  where order_id is not null;

-- Chi puo leggere costi o margini deve vedere il totale dei rimborsi attribuiti
-- alla commessa, non soltanto i propri. La policy resta limitata all'azienda.
drop policy if exists hrk_select_costi_commessa on public.hr_rimborsi_km;
create policy hrk_select_costi_commessa
  on public.hr_rimborsi_km
  for select
  to authenticated
  using (
    public.has_permission_for_company((select auth.uid()), 'can_view_costs', company_id)
    or public.has_permission_for_company((select auth.uid()), 'can_view_margins', company_id)
  );

create or replace view public.v_ordine_marginalita as
select
  o.id,
  o.company_id,
  o.order_code,
  o.description,
  o.total_amount as preventivo_contratto,
  coalesce(odv.variazioni_approvate, 0::numeric) as variazioni_approvate,
  o.total_amount + coalesce(odv.variazioni_approvate, 0::numeric) as preventivo_totale,
  o.work_start_date,
  o.work_end_date,
  o.created_at,
  coalesce((c.first_name || ' '::text) || c.last_name, ''::text) as cliente_nome,
  coalesce(po.costo_acquisti, 0::numeric) as costo_acquisti,
  coalesce(err.costo_errori, 0::numeric) as costo_errori,
  coalesce(po.costo_acquisti, 0::numeric)
    + coalesce(wh.costo_materiali_magazzino, 0::numeric)
    + coalesce(err.costo_errori, 0::numeric)
    + coalesce(lab.costo_manodopera, 0::numeric)
    + coalesce(comm.costo_provvigioni, 0::numeric)
    + coalesce(cc.costo_diretto, 0::numeric)
    + coalesce(km.costo_rimborsi_km, 0::numeric) as consuntivo,
  o.total_amount + coalesce(odv.variazioni_approvate, 0::numeric) - (
    coalesce(po.costo_acquisti, 0::numeric)
    + coalesce(wh.costo_materiali_magazzino, 0::numeric)
    + coalesce(err.costo_errori, 0::numeric)
    + coalesce(lab.costo_manodopera, 0::numeric)
    + coalesce(comm.costo_provvigioni, 0::numeric)
    + coalesce(cc.costo_diretto, 0::numeric)
    + coalesce(km.costo_rimborsi_km, 0::numeric)
  ) as margine,
  case
    when (o.total_amount + coalesce(odv.variazioni_approvate, 0::numeric)) > 0::numeric then round((
      o.total_amount + coalesce(odv.variazioni_approvate, 0::numeric) - (
        coalesce(po.costo_acquisti, 0::numeric)
        + coalesce(wh.costo_materiali_magazzino, 0::numeric)
        + coalesce(err.costo_errori, 0::numeric)
        + coalesce(lab.costo_manodopera, 0::numeric)
        + coalesce(comm.costo_provvigioni, 0::numeric)
        + coalesce(cc.costo_diretto, 0::numeric)
        + coalesce(km.costo_rimborsi_km, 0::numeric)
      )
    ) / (o.total_amount + coalesce(odv.variazioni_approvate, 0::numeric)) * 100::numeric, 1)
    else 0::numeric
  end as margine_perc,
  coalesce(lab.costo_manodopera, 0::numeric) as costo_manodopera,
  coalesce(comm.costo_provvigioni, 0::numeric) as costo_provvigioni,
  coalesce(cc.costo_diretto, 0::numeric) as costo_diretto,
  coalesce(wh.costo_materiali_magazzino, 0::numeric) as costo_materiali_magazzino,
  coalesce(wh.movimenti_magazzino_senza_costo, 0::bigint) as movimenti_magazzino_senza_costo,
  coalesce(o.percentuale_avanzamento, 0::numeric) as percentuale_avanzamento,
  -- Colonne nuove sempre in coda: CREATE OR REPLACE VIEW non consente di
  -- cambiare ordine o nome delle colonne gia pubblicate.
  coalesce(km.costo_rimborsi_km, 0::numeric) as costo_rimborsi_km,
  coalesce(km.rimborsi_km_da_approvare, 0::numeric) as rimborsi_km_da_approvare,
  coalesce(km.numero_rimborsi_da_approvare, 0::bigint) as numero_rimborsi_km_da_approvare
from public.orders o
left join public.profiles c on c.id = o.customer_id
left join (
  select ov.order_id, sum(ov.impatto_economico) as variazioni_approvate
    from public.ordini_variazione ov
   where ov.status = 'approvato'::text and ov.order_id is not null
   group by ov.order_id
) odv on odv.order_id = o.id
left join (
  select po.order_id, sum(po.subtotal) as costo_acquisti
    from public.purchase_orders po
   where po.order_id is not null
     and po.status = any (array['inviato'::text, 'confermato'::text, 'parziale'::text, 'ricevuto'::text])
   group by po.order_id
) po on po.order_id = o.id
left join (
  select
    wm.order_id,
    greatest(sum(
      case wm.movement_type
        when 'scarico' then wm.quantity * coalesce(wm.unit_cost, 0::numeric)
        when 'carico' then -wm.quantity * coalesce(wm.unit_cost, 0::numeric)
        else 0::numeric
      end
    ), 0::numeric) as costo_materiali_magazzino,
    count(*) filter (
      where wm.movement_type = 'scarico'
        and coalesce(wm.unit_cost, 0::numeric) <= 0::numeric
    ) as movimenti_magazzino_senza_costo
  from public.warehouse_movements wm
  where wm.order_id is not null
    and wm.movement_type in ('carico', 'scarico')
    and not (
      wm.order_item_id is not null
      and exists (
        select 1
          from public.purchase_order_items poi
          join public.purchase_orders po2 on po2.id = poi.purchase_order_id
         where poi.order_item_id = wm.order_item_id
           and po2.order_id = wm.order_id
           and po2.status = any (array['inviato'::text, 'confermato'::text, 'parziale'::text, 'ricevuto'::text])
      )
    )
  group by wm.order_id
) wh on wh.order_id = o.id
left join (
  select oe.order_id, sum(oe.amount) as costo_errori
    from public.order_errors oe
   group by oe.order_id
) err on err.order_id = o.id
left join (
  select x.order_id, sum(x.total_cost) as costo_manodopera
    from (
      select order_employees.order_id, order_employees.total_cost from public.order_employees
      union all
      select order_external_teams.order_id, order_external_teams.total_cost from public.order_external_teams
    ) x
   where x.order_id is not null
   group by x.order_id
) lab on lab.order_id = o.id
left join (
  select osp.order_id,
    sum(greatest(greatest(osp.commission_amount, 0::numeric) - greatest(osp.deduction_amount, 0::numeric), 0::numeric)) as costo_provvigioni
    from public.order_salespeople osp
   where osp.order_id is not null
   group by osp.order_id
) comm on comm.order_id = o.id
left join (
  select cc.order_id, sum(cc.amount) as costo_diretto
    from public.company_costs cc
   where cc.order_id is not null
     and cc.purchase_order_id is null
   group by cc.order_id
) cc on cc.order_id = o.id
left join (
  select
    r.order_id,
    sum(r.importo) filter (where r.stato in ('approvato', 'rimborsato')) as costo_rimborsi_km,
    sum(r.importo) filter (where r.stato in ('da_confermare', 'da_rimborsare')) as rimborsi_km_da_approvare,
    count(*) filter (where r.stato in ('da_confermare', 'da_rimborsare')) as numero_rimborsi_da_approvare
  from public.hr_rimborsi_km r
  where r.order_id is not null
    and r.stato <> 'annullato'
  group by r.order_id
) km on km.order_id = o.id;

comment on view public.v_ordine_marginalita is
  'Marginalita per commessa: preventivo e variazioni meno acquisti, materiali da magazzino, errori, manodopera, provvigioni, costi diretti e rimborsi km approvati. I rimborsi in attesa restano esposti ma non riducono il margine.';

alter view public.v_ordine_marginalita set (security_invoker = true);
grant select on public.v_ordine_marginalita to authenticated;

-- Stima gestionale del costo dei mezzi per commessa. Replica la stessa formula
-- della scheda mezzo: ultimo importo di assicurazione e bollo, rate annuali e
-- manutenzioni degli ultimi 365 giorni, ripartiti sui giorni di assegnazione.
create or replace view public.v_ordine_costi_mezzi_stimati
with (security_invoker = true)
as
with parametri as (
  select (now() at time zone 'Europe/Rome')::date as oggi
),
documenti_ultimi as (
  select distinct on (d.mezzo_id, d.categoria)
    d.mezzo_id,
    d.categoria,
    coalesce(d.importo, 0::numeric) as importo
  from public.mezzi_documenti d
  where d.categoria in ('assicurazione', 'bollo')
    and d.importo is not null
  order by d.mezzo_id, d.categoria, d.data_scadenza desc nulls last, d.created_at desc
),
costi_documenti as (
  select d.mezzo_id, sum(d.importo) as costo_documenti_annuo
  from documenti_ultimi d
  group by d.mezzo_id
),
costi_manutenzione as (
  select mm.mezzo_id, sum(coalesce(mm.costo, 0::numeric)) as costo_manutenzione_annuo
  from public.mezzi_manutenzioni mm
  cross join parametri p
  where mm.data >= p.oggi - 365
  group by mm.mezzo_id
),
costi_annui as (
  select
    m.id as mezzo_id,
    coalesce(cd.costo_documenti_annuo, 0::numeric)
      + coalesce(m.rata_mensile, 0::numeric) * 12::numeric
      + coalesce(cm.costo_manutenzione_annuo, 0::numeric) as costo_annuo
  from public.mezzi m
  left join costi_documenti cd on cd.mezzo_id = m.id
  left join costi_manutenzione cm on cm.mezzo_id = m.id
  where m.deleted_at is null
),
periodi as (
  select
    ma.order_id,
    ma.mezzo_id,
    greatest(
      0,
      least(coalesce((ma.al at time zone 'Europe/Rome')::date, p.oggi), p.oggi)
        - (ma.dal at time zone 'Europe/Rome')::date
        + 1
    )::numeric as giorni
  from public.mezzi_assegnazioni ma
  join public.mezzi m on m.id = ma.mezzo_id and m.deleted_at is null
  cross join parametri p
  where ma.order_id is not null
),
per_ordine as (
  select
    pe.order_id,
    count(distinct pe.mezzo_id)::bigint as mezzi_usati,
    sum(pe.giorni)::bigint as giorni_mezzo,
    count(distinct pe.mezzo_id) filter (where coalesce(ca.costo_annuo, 0::numeric) <= 0::numeric)::bigint as mezzi_senza_costo,
    round(sum(pe.giorni * coalesce(ca.costo_annuo, 0::numeric) / 365::numeric), 2) as costo_mezzi_stimato
  from periodi pe
  left join costi_annui ca on ca.mezzo_id = pe.mezzo_id
  group by pe.order_id
)
select
  o.id as order_id,
  o.company_id,
  coalesce(po.costo_mezzi_stimato, 0::numeric) as costo_mezzi_stimato,
  coalesce(po.mezzi_usati, 0::bigint) as mezzi_usati,
  coalesce(po.giorni_mezzo, 0::bigint) as giorni_mezzo,
  coalesce(po.mezzi_senza_costo, 0::bigint) as mezzi_senza_costo,
  public.has_permission_for_company((select auth.uid()), 'can_view_mezzi', o.company_id) as dati_mezzi_visibili
from public.orders o
left join per_ordine po on po.order_id = o.id;

comment on view public.v_ordine_costi_mezzi_stimati is
  'Stima gestionale dei mezzi assegnati alla commessa. Non entra nel consuntivo ufficiale e non va sommata a costi mezzo gia registrati manualmente.';

revoke all on public.v_ordine_costi_mezzi_stimati from anon;
grant select on public.v_ordine_costi_mezzi_stimati to authenticated;
