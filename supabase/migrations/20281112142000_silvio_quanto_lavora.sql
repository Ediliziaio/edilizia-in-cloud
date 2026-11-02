-- ════════════════════════════════════════════════════════════════════════════
-- Silvio e la commessa, fase 5 (lotto 5.4): la scheda «Quanto lavora Silvio».
-- Vedi docs/piano-silvio-commessa-ai.md, sezione 4 («Misura») e fase 5.
-- ════════════════════════════════════════════════════════════════════════════
-- `silvio_quanto_lavora(azienda, dal, al, pagina, per_pagina)` conta, nel periodo:
--   · le commesse create e completate con Silvio (`commessa_bozze` eseguite);
--   · il punteggio di completezza di oggi di quelle commesse (media), con l'espressione di
--     sqlPunteggio() (shared/silvio-commessa/completezza.ts), copiata qui: il test
--     silvioCommessaQuantoLavora controlla che sia identica;
--   · le voci che Silvio ha scritto (righe nate e colonne riempite, dal registro
--     dell'annullamento): la base della stima del tempo risparmiato, che fa il client con
--     una regola scritta;
--   · le correzioni (`silvio_correzioni`): proposte tenute così e cambiate;
--   · il costo AI addebitato delle letture e della chat del popup (`ai_call_ledger`,
--     task silvio_commessa_*);
--   · le proposte del piano di volo per stato.
-- E l'elenco delle commesse, a pagine (al massimo 50 righe per pagina), col totale.
--
-- Solo numeri veri: dove non c'è niente torna zero, e la scheda lo dice. Le commesse si
-- contano solo se chi guarda le vede (can_see_order). SECURITY DEFINER coi controlli dentro:
-- sessione, azienda in cui si lavora, can_edit_orders (come «Da completare»). Solo lettura.
--
-- Idempotente. Richiede 20281112090000, 20281112100000 (e 20281112141000 per il piano di volo,
-- letto solo se c'è). NON applicata: si applica col push della fase 5, poi si riallinea.
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- Il punteggio di completezza di una commessa (0–100), come lo conta il popup.
create or replace function public._silvio_punteggio(p_order uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (round(100.0 * ((case when (nullif(btrim(o.order_code::text), '') is not null) then 1 else 0 end)
 + (case when (nullif(btrim(o.tipo_lavoro::text), '') is not null) then 1 else 0 end)
 + (case when (nullif(btrim(o.description::text), '') is not null) then 1 else 0 end)
 + (case when (nullif(btrim(o.work_description::text), '') is not null) then 1 else 0 end)
 + (case when (nullif(btrim(o.sede_id::text), '') is not null) then 1 else 0 end)
 + (case when (nullif(btrim(o.customer_id::text), '') is not null) then 2 else 0 end)
 + (case when (nullif(btrim(o.client_name::text), '') is not null or nullif(btrim(o.client_company::text), '') is not null) then 1 else 0 end)
 + (case when (nullif(btrim(o.client_phone::text), '') is not null or nullif(btrim(o.client_email::text), '') is not null) then 1 else 0 end)
 + (case when (nullif(btrim(o.client_address::text), '') is not null) then 1 else 0 end)
 + (case when (nullif(btrim(o.indirizzo_lavori::text), '') is not null or nullif(btrim(o.work_address::text), '') is not null) then 2 else 0 end)
 + (case when (nullif(btrim(o.work_lat::text), '') is not null) then 1 else 0 end)
 + (case when (coalesce(o.total_amount, 0) > 0) then 3 else 0 end)
 + (case when (nullif(btrim(o.vat_rate::text), '') is not null) then 1 else 0 end)
 + (case when (exists (select 1 from public.order_items x where x.order_id = o.id)) then 1 else 0 end)
 + (case when (nullif(btrim(o.payment_type::text), '') is not null) then 1 else 0 end)
 + (case when (exists (select 1 from public.order_installments x where x.order_id = o.id)) then 3 else 0 end)
 + (case when (exists (select 1 from public.order_work_phases x where x.order_id = o.id)) then 3 else 0 end)
 + (case when (exists (select 1 from public.order_work_phases x where x.order_id = o.id and x.start_date is not null)) then 2 else 0 end)
 + (case when (nullif(btrim(o.work_start_date::text), '') is not null) then 2 else 0 end)
 + (case when (nullif(btrim(o.work_end_date::text), '') is not null) then 1 else 0 end)
 + (case when (nullif(btrim(o.expected_date::text), '') is not null) then 1 else 0 end)
 + (case when (nullif(btrim(o.assigned_to::text), '') is not null) then 2 else 0 end)
 + (case when (nullif(btrim(o.capomastro_user_id::text), '') is not null) then 1 else 0 end)
 + (case when (exists (select 1 from public.order_employees x where x.order_id = o.id) or exists (select 1 from public.order_phase_assignments x where x.order_id = o.id) or exists (select 1 from public.squadre_commesse x where x.order_id = o.id)) then 2 else 0 end)
 + (case when (exists (select 1 from public.company_costs x where x.order_id = o.id)) then 1 else 0 end)
 + (case when (exists (select 1 from public.adempimenti_sicurezza x where x.order_id = o.id)) then 1 else 0 end)
 + (case when (exists (select 1 from public.scadenze x where x.order_id = o.id)) then 1 else 0 end)
 + (case when (nullif(btrim(o.next_action::text), '') is not null) then 1 else 0 end)
 + (case when (exists (select 1 from public.internal_chat_channels x where x.order_id = o.id)) then 1 else 0 end)
 + (case when (exists (select 1 from public.tasks x where x.order_id = o.id)) then 1 else 0 end)) / 42))::integer
    from public.orders o
   where o.id = p_order
$$;
revoke all on function public._silvio_punteggio(uuid) from public, anon, authenticated;

create or replace function public.silvio_quanto_lavora(
  p_company_id uuid,
  p_dal date default null,
  p_al date default null,
  p_pagina integer default 1,
  p_per_pagina integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_al date := coalesce(p_al, (now() at time zone 'Europe/Rome')::date);
  v_dal date := coalesce(p_dal, v_al - 89);
  v_per integer := least(greatest(coalesce(p_per_pagina, 20), 1), 50);
  v_pagina integer := greatest(coalesce(p_pagina, 1), 1);
  v_da timestamptz;
  v_a timestamptz;
  v_totali jsonb;
  v_correzioni jsonb;
  v_costo numeric := 0;
  v_volo jsonb := '{}'::jsonb;
  v_righe jsonb;
  v_totale integer;
  v_lavoro jsonb;
begin
  if v_uid is null then
    raise exception 'Sessione scaduta. Accedi di nuovo.' using errcode = '42501';
  end if;
  if p_company_id is distinct from public.get_effective_company_id()
     or public.has_permission_for_company(v_uid, 'can_edit_orders', p_company_id) is not true then
    raise exception 'Non hai il permesso di vedere il lavoro di Silvio su queste commesse.' using errcode = '42501';
  end if;
  if v_dal > v_al then
    raise exception 'Il periodo va dal più vecchio al più recente.' using errcode = '22023';
  end if;
  -- Il periodo in giorni di Roma.
  v_da := (v_dal::timestamp at time zone 'Europe/Rome');
  v_a := ((v_al + 1)::timestamp at time zone 'Europe/Rome');

  -- Le commesse che Silvio ha scritto nel periodo, una volta sola: tutto il resto si conta da qui.
  select coalesce(jsonb_agg(jsonb_build_object(
           'bozza_id', b.id, 'order_id', o.id, 'modo', b.modo, 'eseguita_il', b.eseguita_il,
           'codice', o.order_code, 'titolo', o.description,
           'voci', (select count(*) filter (where s.azione = 'creata')
                           + coalesce(sum((select count(*) from jsonb_object_keys(coalesce(s.colonne, '{}'::jsonb)))) filter (where s.azione = 'aggiornata'), 0)
                      from public.commessa_bozze_scritture s where s.bozza_id = b.id),
           'punteggio', public._silvio_punteggio(o.id))), '[]'::jsonb)
    into v_lavoro
    from public.commessa_bozze b
    join public.orders o on o.id = b.order_id and o.company_id = b.company_id and o.deleted_at is null
   where b.company_id = p_company_id
     and b.stato in ('creata', 'completata')
     and b.eseguita_il >= v_da and b.eseguita_il < v_a
     and public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id);

  select jsonb_build_object(
           'commesse_create', count(*) filter (where modo = 'crea'),
           'commesse_completate', count(*) filter (where modo = 'completa'),
           'punteggio_medio', round(avg(punteggio))::integer,
           'voci_scritte', coalesce(sum(voci), 0))
    into v_totali
    from jsonb_to_recordset(v_lavoro) as l(modo text, voci integer, punteggio integer);

  select jsonb_build_object(
           'totale', count(*),
           'tenute_cosi', count(*) filter (where c.tenuto_cosi),
           'cambiate', count(*) filter (where not c.tenuto_cosi),
           'per_area', coalesce((select jsonb_object_agg(area, n) from (
              select c2.area, count(*) n from public.silvio_correzioni c2
               where c2.company_id = p_company_id and c2.created_at >= v_da and c2.created_at < v_a and not c2.tenuto_cosi
               group by c2.area) q), '{}'::jsonb))
    into v_correzioni
    from public.silvio_correzioni c
   where c.company_id = p_company_id and c.created_at >= v_da and c.created_at < v_a;

  select coalesce(sum(l.cost_billed_eur), 0) into v_costo
    from public.ai_call_ledger l
   where l.company_id = p_company_id and l.created_at >= v_da and l.created_at < v_a
     and l.status = 'success' and l.task_key in ('silvio_commessa_lettura', 'silvio_commessa_chat');

  if to_regclass('public.silvio_piano_volo') is not null then
    execute 'select coalesce(jsonb_object_agg(stato, n), ''{}''::jsonb) from (
               select stato, count(*) n from public.silvio_piano_volo
                where company_id = $1 and giorno between $2 and $3 group by stato) q'
      into v_volo using p_company_id, v_dal, v_al;
  end if;

  v_totale := jsonb_array_length(v_lavoro);
  select coalesce(jsonb_agg(jsonb_build_object(
           'order_id', l.order_id, 'codice', l.codice, 'titolo', l.titolo, 'modo', l.modo,
           'eseguita_il', l.eseguita_il, 'voci', l.voci, 'punteggio', l.punteggio,
           'correzioni', (select count(*) from public.silvio_correzioni c
                           where c.company_id = p_company_id and (c.bozza_id = l.bozza_id or c.order_id = l.order_id) and not c.tenuto_cosi))
           order by l.eseguita_il desc), '[]'::jsonb)
    into v_righe
    from (select * from jsonb_to_recordset(v_lavoro)
            as r(bozza_id uuid, order_id uuid, modo text, eseguita_il timestamptz, codice text, titolo text, voci integer, punteggio integer)
           order by r.eseguita_il desc offset (v_pagina - 1) * v_per limit v_per) l;

  return jsonb_build_object(
    'dal', v_dal, 'al', v_al, 'pagina', v_pagina, 'per_pagina', v_per, 'totale_righe', v_totale,
    'totali', v_totali, 'correzioni', v_correzioni, 'costo_ai_eur', round(v_costo, 2),
    'piano_volo', v_volo, 'commesse', v_righe);
end
$$;
revoke all on function public.silvio_quanto_lavora(uuid, date, date, integer, integer) from public, anon;
grant execute on function public.silvio_quanto_lavora(uuid, date, date, integer, integer) to authenticated;
