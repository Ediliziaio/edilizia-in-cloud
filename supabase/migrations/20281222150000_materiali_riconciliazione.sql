-- Riconciliazione dei materiali calcolata nel database.
--
-- Previsto, in bozza d'ordine, ordinato, ricevuto, residuo ed eccedenza di
-- ogni materiale si calcolavano solo nel browser (planMaterial in
-- src/lib/orders/materialProcurement.ts, statoMateriale in
-- src/lib/distinta/statoMateriale.ts): né un cruscotto né un promemoria
-- potevano leggerli. Secondo passo del piano
-- docs/piano-fabbisogno-acquisti-da-progetto.md.
--
-- Le regole sono quelle di planMaterial e statoMateriale, una per una:
--   * gli ordini annullati non contano;
--   * in bozza = righe di ODA in bozza; ordinato e ricevuto = righe di ODA
--     emessi (inviato, confermato, parziale, ricevuto); coperto = bozza + emessi;
--   * residuo = previsto − coperto, mai sotto zero; eccedenza = coperto − previsto
--     quando l'ordinato supera il previsto;
--   * unità diversa: una riga d'ordine in un'unità diversa da quella del
--     materiale (minuscole, vuota = pz, senza tradurre: è la stessa regola
--     della pagina). Le quantità allora non si confrontano: residuo ed
--     eccedenza restano quelli aritmetici, ma il flag dice di non fidarsi;
--   * stato, dalla più avanzata: installato, consegnato, ordinato, in bozza
--     d'ordine, in offerta, da ordinare (vedi statoMateriale).
--
-- Tre funzioni:
--   * _materiali_riconciliazione_righe(azienda, commessa) — il calcolo, senza
--     controlli: solo service role (cruscotti lato server, promemoria).
--   * materiali_riconciliazione(commessa) — una commessa, per chi la vede.
--   * materiali_riconciliazione_azienda(azienda, solo_aperti, limite, da) —
--     l'ufficio acquisti: solo fasi validate, a pagine, prima chi inizia prima.

-- ─── Il calcolo ─────────────────────────────────────────────────────────────

create or replace function public._materiali_riconciliazione_righe(p_company uuid, p_order uuid default null)
 returns table(
   order_item_id uuid, order_id uuid, commessa text, phase_id uuid, fase text, inizio_fase date,
   fase_validata boolean, name text, unita_misura text, supplier_id uuid, supplier_rfq_item_id uuid,
   status text, previsto numeric, in_bozza numeric, ordinato numeric, ricevuto numeric, coperto numeric,
   residuo numeric, eccedenza numeric, unita_diversa boolean, stato text)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with righe as (
    select oi.id, oi.order_id, o.order_code, oi.phase_id, oi.name, oi.unita_misura, oi.supplier_id,
           oi.supplier_rfq_item_id, oi.status, coalesce(oi.quantity, 0) as previsto,
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
           exists (select 1 from unnest(coalesce(c.unita_ordine, '{}')) u where u <> r.unita_riga) as unita_grezza
      from righe r
      left join copertura c on c.order_item_id = r.id
      left join public.order_work_phases w on w.id = r.phase_id
      left join public.materiali_fasi_validazione v on v.phase_id = r.phase_id
  )
  select k.id, k.order_id, k.order_code, k.phase_id, k.fase, k.inizio_fase, coalesce(k.fase_validata, false),
         k.name, k.unita_misura, k.supplier_id, k.supplier_rfq_item_id, k.status,
         k.previsto, k.in_bozza, k.ordinato, k.ricevuto, k.coperto,
         case when k.previsto > 0 then greatest(0, round(k.previsto - k.coperto, 6)) else 0 end,
         case when k.previsto > 0 and k.coperto > k.previsto then round(k.coperto - k.previsto, 6) else 0 end,
         -- Come planMaterial: un articolo senza unità già tutto coperto non ha
         -- residuo da confrontare, quindi «1 a corpo» su «1» non è un'incongruenza.
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
         end
    from conti k;
$function$;

revoke all on function public._materiali_riconciliazione_righe(uuid, uuid) from public, anon, authenticated;
grant execute on function public._materiali_riconciliazione_righe(uuid, uuid) to service_role;

comment on function public._materiali_riconciliazione_righe(uuid, uuid) is
  'Previsto/ordinato/ricevuto/residuo/eccedenza e stato di ogni materiale (regole di planMaterial e statoMateriale). Senza controlli di accesso: solo service role.';

-- ─── Una commessa ───────────────────────────────────────────────────────────

create or replace function public.materiali_riconciliazione(p_order uuid)
 returns table(
   order_item_id uuid, order_id uuid, commessa text, phase_id uuid, fase text, inizio_fase date,
   fase_validata boolean, name text, unita_misura text, supplier_id uuid, supplier_rfq_item_id uuid,
   status text, previsto numeric, in_bozza numeric, ordinato numeric, ricevuto numeric, coperto numeric,
   residuo numeric, eccedenza numeric, unita_diversa boolean, stato text)
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
     order by r.inizio_fase nulls last, r.fase, r.name;
end;
$function$;

revoke all on function public.materiali_riconciliazione(uuid) from public, anon;
grant execute on function public.materiali_riconciliazione(uuid) to authenticated, service_role;

-- ─── L'ufficio acquisti: tutte le commesse, a pagine ────────────────────────

create or replace function public.materiali_riconciliazione_azienda(
  p_company uuid, p_solo_aperti boolean default true, p_limite integer default 200, p_da integer default 0)
 returns table(
   order_item_id uuid, order_id uuid, commessa text, phase_id uuid, fase text, inizio_fase date,
   fase_validata boolean, name text, unita_misura text, supplier_id uuid, supplier_rfq_item_id uuid,
   status text, previsto numeric, in_bozza numeric, ordinato numeric, ricevuto numeric, coperto numeric,
   residuo numeric, eccedenza numeric, unita_diversa boolean, stato text)
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
       -- Aperto: manca ancora qualcosa da ordinare, oppure c'è un'incongruenza
       -- (ordinato più del previsto, unità diverse), anche se è già arrivato.
       and (not coalesce(p_solo_aperti, true)
            or (r.residuo > 0 and r.stato not in ('consegnato', 'installato'))
            or r.eccedenza > 0
            or r.unita_diversa)
     order by r.inizio_fase nulls last, r.commessa, r.fase, r.name, r.order_item_id
     limit least(greatest(coalesce(p_limite, 200), 1), 500)
    offset greatest(coalesce(p_da, 0), 0);
end;
$function$;

revoke all on function public.materiali_riconciliazione_azienda(uuid, boolean, integer, integer) from public, anon;
grant execute on function public.materiali_riconciliazione_azienda(uuid, boolean, integer, integer) to authenticated, service_role;
