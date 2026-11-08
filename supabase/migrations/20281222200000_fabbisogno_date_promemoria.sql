-- Fabbisogno: entro quando ordinare, e il promemoria all'ufficio acquisti.
--
-- Quinto passo del piano docs/piano-fabbisogno-acquisti-da-progetto.md. La
-- riconciliazione (20281222150000) diceva cosa manca; non diceva entro quando.
--
--   * order_items.data_fabbisogno: quando serve il materiale in cantiere, se
--     diversa dall'inizio della sua fase (facoltativa, si scrive a mano).
--   * Entro quando ordinare = (data_fabbisogno, altrimenti inizio della fase)
--     meno i giorni di consegna del fornitore (suppliers.lead_time_days, già
--     esistente) o, se non ci sono, quelli predefiniti dell'azienda
--     (company_acquisti_impostazioni, 7 se non scritti).
--   * Le tre funzioni della riconciliazione restituiscono anche fornitore,
--     data in cui serve, giorni di consegna ed «entro quando»; quella
--     dell'ufficio acquisti ordina per «entro quando».
--   * materiali_promemoria_acquisti(): una notifica al giorno per azienda a chi
--     fa gli acquisti, se ci sono materiali in ritardo o da ordinare entro 7
--     giorni (solo fasi validate, come il cruscotto). Si spegne nelle
--     impostazioni. Gira in pg_cron alle 06:30 UTC: è SQL puro, non chiama
--     edge function e non passa dalla coda di pg_net.

set local lock_timeout = '3s';

alter table public.order_items add column if not exists data_fabbisogno date;
comment on column public.order_items.data_fabbisogno is
  'Quando serve il materiale in cantiere, se diversa dall''inizio della fase. Da qui (o dall''inizio della fase) meno i giorni di consegna si ricava entro quando ordinarlo.';

-- Il tipo restituito cambia: le tre funzioni si tolgono e si rifanno.
drop function if exists public.materiali_riconciliazione_azienda(uuid, boolean, integer, integer);
drop function if exists public.materiali_riconciliazione(uuid);
drop function if exists public._materiali_riconciliazione_righe(uuid, uuid);

create function public._materiali_riconciliazione_righe(p_company uuid, p_order uuid default null)
 returns table(
   order_item_id uuid, order_id uuid, commessa text, phase_id uuid, fase text, inizio_fase date,
   fase_validata boolean, name text, unita_misura text, supplier_id uuid, supplier_rfq_item_id uuid,
   status text, previsto numeric, in_bozza numeric, ordinato numeric, ricevuto numeric, coperto numeric,
   residuo numeric, eccedenza numeric, unita_diversa boolean, stato text,
   fornitore text, data_serve date, giorni_consegna integer, ordina_entro date)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with righe as (
    select oi.id, oi.order_id, o.order_code, oi.phase_id, oi.name, oi.unita_misura, oi.supplier_id,
           oi.supplier_rfq_item_id, oi.status, coalesce(oi.quantity, 0) as previsto, oi.data_fabbisogno,
           coalesce(nullif(lower(btrim(oi.unita_misura)), ''), 'pz') as unita_riga
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
     where o.company_id = p_company
       and o.deleted_at is null
       and oi.natura_riga = 'materiale'
       and (p_order is null or oi.order_id = p_order)
  ),
  copertura as (
    select poi.order_item_id,
           coalesce(sum(poi.quantity) filter (where po.status = 'bozza'), 0) as in_bozza,
           coalesce(sum(poi.quantity) filter (where po.status in ('inviato', 'confermato', 'parziale', 'ricevuto')), 0) as ordinato,
           coalesce(sum(poi.quantity_received) filter (where po.status in ('inviato', 'confermato', 'parziale', 'ricevuto')), 0) as ricevuto,
           coalesce(sum(poi.quantity), 0) as coperto,
           count(*) filter (where po.status in ('inviato', 'confermato', 'parziale', 'ricevuto')) as righe_emesse,
           count(*) filter (where po.status = 'bozza') as righe_bozza,
           coalesce(bool_and(po.status = 'ricevuto' or (poi.quantity > 0 and coalesce(poi.quantity_received, 0) >= poi.quantity))
                      filter (where po.status in ('inviato', 'confermato', 'parziale', 'ricevuto')), false) as emesse_arrivate,
           array_remove(array_agg(distinct nullif(lower(btrim(poi.unit_of_measure)), '')), null) as unita_ordine
      from public.purchase_order_items poi
      join public.purchase_orders po on po.id = poi.purchase_order_id
     where po.status <> 'annullato'
       and poi.order_item_id in (select id from righe)
     group by poi.order_item_id
  ),
  conti as (
    select r.*, w.name as fase, w.start_date as inizio_fase, (v.stato = 'validata') as fase_validata,
           round(coalesce(c.in_bozza, 0), 6) as in_bozza,
           round(coalesce(c.ordinato, 0), 6) as ordinato,
           round(coalesce(c.ricevuto, 0), 6) as ricevuto,
           round(coalesce(c.coperto, 0), 6) as coperto,
           coalesce(c.righe_emesse, 0) as righe_emesse,
           coalesce(c.righe_bozza, 0) as righe_bozza,
           coalesce(c.emesse_arrivate, false) as emesse_arrivate,
           exists (select 1 from unnest(coalesce(c.unita_ordine, '{}')) u where u <> r.unita_riga) as unita_grezza,
           s.name as fornitore,
           coalesce(r.data_fabbisogno, w.start_date) as data_serve,
           coalesce(nullif(s.lead_time_days, 0), imp.giorni_consegna_predefiniti, 7) as giorni_consegna
      from righe r
      left join copertura c on c.order_item_id = r.id
      left join public.order_work_phases w on w.id = r.phase_id
      left join public.materiali_fasi_validazione v on v.phase_id = r.phase_id
      left join public.suppliers s on s.id = r.supplier_id
      left join public.company_acquisti_impostazioni imp on imp.company_id = p_company
  )
  select k.id, k.order_id, k.order_code, k.phase_id, k.fase, k.inizio_fase, coalesce(k.fase_validata, false),
         k.name, k.unita_misura, k.supplier_id, k.supplier_rfq_item_id, k.status,
         k.previsto, k.in_bozza, k.ordinato, k.ricevuto, k.coperto,
         case when k.previsto > 0 then greatest(0, round(k.previsto - k.coperto, 6)) else 0 end,
         case when k.previsto > 0 and k.coperto > k.previsto then round(k.coperto - k.previsto, 6) else 0 end,
         k.unita_grezza and (nullif(btrim(k.unita_misura), '') is not null or k.previsto - k.coperto > 0),
         case
           when k.status = 'installato' then 'installato'
           when (k.unita_grezza and k.righe_emesse > 0 and k.emesse_arrivate)
             or (not k.unita_grezza and k.previsto > 0 and k.ricevuto >= k.previsto)
             or k.status in ('in_magazzino', 'disponibile') then 'consegnato'
           when k.righe_emesse > 0 or k.status in ('ordinato', 'in_arrivo', 'in_produzione', 'in_lavorazione') then 'ordinato'
           when k.righe_bozza > 0 then 'in_bozza_oda'
           when k.supplier_rfq_item_id is not null then 'in_offerta'
           else 'da_ordinare'
         end,
         k.fornitore, k.data_serve, k.giorni_consegna,
         case when k.data_serve is not null then k.data_serve - k.giorni_consegna end
    from conti k;
$function$;

revoke all on function public._materiali_riconciliazione_righe(uuid, uuid) from public, anon, authenticated;
grant execute on function public._materiali_riconciliazione_righe(uuid, uuid) to service_role;

comment on function public._materiali_riconciliazione_righe(uuid, uuid) is
  'Previsto/ordinato/ricevuto/residuo/eccedenza e stato di ogni materiale (regole di planMaterial e statoMateriale), con fornitore, data in cui serve, giorni di consegna ed entro quando ordinare. Senza controlli di accesso: solo service role.';

create function public.materiali_riconciliazione(p_order uuid)
 returns table(
   order_item_id uuid, order_id uuid, commessa text, phase_id uuid, fase text, inizio_fase date,
   fase_validata boolean, name text, unita_misura text, supplier_id uuid, supplier_rfq_item_id uuid,
   status text, previsto numeric, in_bozza numeric, ordinato numeric, ricevuto numeric, coperto numeric,
   residuo numeric, eccedenza numeric, unita_diversa boolean, stato text,
   fornitore text, data_serve date, giorni_consegna integer, ordina_entro date)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  o record;
begin
  if uid is null or p_order is null then
    return;
  end if;
  if public.utente_bloccato() or public.utente_e_cliente_esterno() then
    return;
  end if;
  select x.id, x.company_id, x.assigned_to, x.destination_warehouse_id into o
    from public.orders x where x.id = p_order and x.deleted_at is null;
  if o.id is null then
    return;
  end if;
  if o.company_id is distinct from public.get_effective_company_id()
     and not public.has_role(uid, 'super_admin'::public.app_role) then
    return;
  end if;
  if not (public.materiali_puo('can_manage_purchasing', o.company_id)
          or public.materiali_puo('can_view_orders', o.company_id)) then
    return;
  end if;
  if not public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id) then
    return;
  end if;
  return query
    select * from public._materiali_riconciliazione_righe(o.company_id, p_order) r
     order by r.ordina_entro nulls last, r.fase, r.name;
end;
$function$;

revoke all on function public.materiali_riconciliazione(uuid) from public, anon;
grant execute on function public.materiali_riconciliazione(uuid) to authenticated, service_role;

create function public.materiali_riconciliazione_azienda(
  p_company uuid, p_solo_aperti boolean default true, p_limite integer default 200, p_da integer default 0)
 returns table(
   order_item_id uuid, order_id uuid, commessa text, phase_id uuid, fase text, inizio_fase date,
   fase_validata boolean, name text, unita_misura text, supplier_id uuid, supplier_rfq_item_id uuid,
   status text, previsto numeric, in_bozza numeric, ordinato numeric, ricevuto numeric, coperto numeric,
   residuo numeric, eccedenza numeric, unita_diversa boolean, stato text,
   fornitore text, data_serve date, giorni_consegna integer, ordina_entro date)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
begin
  if uid is null or p_company is null then
    return;
  end if;
  if public.utente_bloccato() or public.utente_e_cliente_esterno() then
    return;
  end if;
  if p_company is distinct from public.get_effective_company_id()
     and not public.has_role(uid, 'super_admin'::public.app_role) then
    return;
  end if;
  if not (public.materiali_puo('can_manage_purchasing', p_company)
          or public.materiali_puo('can_view_orders', p_company)) then
    return;
  end if;
  return query
    select r.*
      from public._materiali_riconciliazione_righe(p_company, null) r
      join public.orders o on o.id = r.order_id
     where r.fase_validata
       and public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id)
       and (not coalesce(p_solo_aperti, true)
            or (r.residuo > 0 and r.stato not in ('consegnato', 'installato'))
            or r.eccedenza > 0
            or r.unita_diversa)
     order by r.ordina_entro nulls last, r.commessa, r.fase, r.name, r.order_item_id
     limit least(greatest(coalesce(p_limite, 200), 1), 500)
    offset greatest(coalesce(p_da, 0), 0);
end;
$function$;

revoke all on function public.materiali_riconciliazione_azienda(uuid, boolean, integer, integer) from public, anon;
grant execute on function public.materiali_riconciliazione_azienda(uuid, boolean, integer, integer) to authenticated, service_role;

-- ─── Il promemoria del mattino ──────────────────────────────────────────────

create or replace function public.materiali_promemoria_acquisti()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  az record;
  ritardo integer;
  settimana integer;
  inviate integer := 0;
  oggi date := (now() at time zone 'Europe/Rome')::date;
  titolo text;
begin
  for az in
    select distinct v.company_id
      from public.materiali_fasi_validazione v
     where v.stato = 'validata'
       and not exists (select 1 from public.company_acquisti_impostazioni s where s.company_id = v.company_id and not s.promemoria_attivo)
  loop
    select count(*) filter (where r.ordina_entro < oggi),
           count(*) filter (where r.ordina_entro between oggi and oggi + 7)
      into ritardo, settimana
      from public._materiali_riconciliazione_righe(az.company_id, null) r
     where r.fase_validata and r.residuo > 0 and r.stato in ('da_ordinare', 'in_offerta');
    continue when coalesce(ritardo, 0) + coalesce(settimana, 0) = 0;
    titolo := 'Materiali da ordinare';
    -- Uno al giorno per azienda.
    continue when exists (select 1 from public.notifications n
                           where n.company_id = az.company_id and n.title = titolo
                             and (n.created_at at time zone 'Europe/Rome')::date = oggi);
    inviate := inviate + public.materiali_notifica_permesso(az.company_id, 'can_manage_purchasing', titolo,
      concat_ws(' · ',
        case when ritardo > 0 then format('%s in ritardo', ritardo) end,
        case when settimana > 0 then format('%s da ordinare entro 7 giorni', settimana) end),
      '/azienda/fabbisogno-materiali', null);
  end loop;
  return inviate;
end;
$function$;

revoke all on function public.materiali_promemoria_acquisti() from public, anon, authenticated;
grant execute on function public.materiali_promemoria_acquisti() to service_role;

do $cron$
begin
  if exists (select 1 from cron.job where jobname = 'materiali-promemoria-acquisti') then
    perform cron.unschedule('materiali-promemoria-acquisti');
  end if;
  perform cron.schedule('materiali-promemoria-acquisti', '30 6 * * *', 'select public.materiali_promemoria_acquisti();');
end
$cron$;
