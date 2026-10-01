-- Il materiale prelevato dalla scorta deve incidere sulla commessa una volta sola.
--
-- Ogni percorso che scrive warehouse_movements (uscita ufficio, prelievo dal
-- campo, modifica articoli commessa) passa da questo trigger: il costo unitario
-- viene fotografato quando nasce il movimento. Non si usa il costo corrente in
-- seguito, perché un aggiornamento del listino non deve riscrivere la storia.
--
-- Nella marginalità:
--   * gli ODA collegati alla commessa restano "acquisti impegnati";
--   * gli scarichi dalla scorta diventano "materiali da magazzino";
--   * se un movimento è collegato a un order_item già coperto da un ODA contato,
--     viene escluso dal ramo magazzino (lo stesso euro non pesa due volte);
--   * un carico con order_id è un reso/ripristino e riduce il consumo netto.

create or replace function public.warehouse_movement_snapshot_unit_cost()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.unit_cost is null then
    select ws.unit_cost
     into new.unit_cost
      from public.warehouse_stock ws
     where ws.id = new.stock_item_id
       -- Alcuni percorsi legacy valorizzano company_id con un secondo trigger
       -- BEFORE INSERT. Lo stock_item_id resta comunque univoco: non perdiamo
       -- il costo se questo trigger viene eseguito per primo.
       and (new.company_id is null or ws.company_id = new.company_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_warehouse_movement_snapshot_unit_cost on public.warehouse_movements;
create trigger trg_warehouse_movement_snapshot_unit_cost
  before insert on public.warehouse_movements
  for each row execute function public.warehouse_movement_snapshot_unit_cost();

-- Storico: non esiste un costo alla data del vecchio movimento. Il costo
-- corrente è il fallback più prudente e resta marcato come zero se sconosciuto.
update public.warehouse_movements wm
   set unit_cost = ws.unit_cost
  from public.warehouse_stock ws
 where wm.stock_item_id = ws.id
   and wm.company_id = ws.company_id
   and wm.unit_cost is null
   and wm.movement_type in ('carico', 'scarico');

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
    + coalesce(cc.costo_diretto, 0::numeric) as consuntivo,
  o.total_amount + coalesce(odv.variazioni_approvate, 0::numeric) - (
    coalesce(po.costo_acquisti, 0::numeric)
    + coalesce(wh.costo_materiali_magazzino, 0::numeric)
    + coalesce(err.costo_errori, 0::numeric)
    + coalesce(lab.costo_manodopera, 0::numeric)
    + coalesce(comm.costo_provvigioni, 0::numeric)
    + coalesce(cc.costo_diretto, 0::numeric)
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
      )
    ) / (o.total_amount + coalesce(odv.variazioni_approvate, 0::numeric)) * 100::numeric, 1)
    else 0::numeric
  end as margine_perc,
  coalesce(lab.costo_manodopera, 0::numeric) as costo_manodopera,
  coalesce(comm.costo_provvigioni, 0::numeric) as costo_provvigioni,
  coalesce(cc.costo_diretto, 0::numeric) as costo_diretto,
  -- Le colonne nuove sono APPEND in coda: CREATE OR REPLACE VIEW richiede che
  -- nomi e ordine delle colonne già pubblicate restino invariati.
  coalesce(wh.costo_materiali_magazzino, 0::numeric) as costo_materiali_magazzino,
  coalesce(wh.movimenti_magazzino_senza_costo, 0::bigint) as movimenti_magazzino_senza_costo,
  coalesce(o.percentuale_avanzamento, 0::numeric) as percentuale_avanzamento
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
) cc on cc.order_id = o.id;

comment on view public.v_ordine_marginalita is
  'Marginalità per commessa: preventivo+variazioni meno ODA, consumo netto da magazzino non già coperto dallo stesso ODA, errori, manodopera, provvigioni e costi diretti. Espone anche gli scarichi senza costo per segnalare dati incompleti.';

-- La vista è letta direttamente dal client: deve applicare le policy RLS delle
-- tabelle sottostanti con i permessi dell'utente che la interroga.
alter view public.v_ordine_marginalita set (security_invoker = true);

grant select on public.v_ordine_marginalita to authenticated;
