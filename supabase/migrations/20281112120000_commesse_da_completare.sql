-- «Da completare» (31/10/2026, fase 2, lotto 2.3): le commesse aperte con il punteggio di
-- completezza e cosa manca, per l'elenco «Da completare» e per «Completa al 34 %» sulla
-- pagina della commessa. Vedi docs/piano-silvio-commessa-ai.md, Fase 2.
--
-- Il punteggio e l'elenco di cosa manca sono le espressioni di sqlPunteggio() e sqlMancano()
-- (shared/silvio-commessa/completezza.ts), copiate qui: il test silvioCommessaDaCompletare
-- controlla che siano identiche, così il database e il popup contano allo stesso modo.
-- Una sola query: una riga di orders e una decina di exists per commessa, sull'indice
-- order_id. Mai più di 200 righe: niente tetto di PostgREST.
--
-- Ordine per urgenza: prima le commesse con una data (inizio lavori, altrimenti consegna
-- prevista), dalla più vicina a oggi, prima o dopo che sia; poi quelle senza data; a parità,
-- l'importo più alto (solo per chi vede gli importi), poi la più recente.
--
-- SECURITY DEFINER per non passare dalle policy di dieci tabelle per riga, quindi i controlli
-- li fa lei: sessione, azienda in cui si lavora, can_edit_orders, e per ogni commessa
-- can_see_order (chi vede solo le assegnate vede solo quelle). L'importo torna solo con
-- can_view_order_amounts. Solo lettura: niente lock.
--
-- Richiede: nulla oltre lo schema attuale. NON applicata: si applica col push della fase 2,
-- poi si riallinea la versione (CLAUDE.md).

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- La completezza guarda le scadenze di ogni commessa (`exists … where x.order_id = o.id`):
-- senza indice era una lettura intera di `scadenze` per commessa (revisione 1/11, S7).
-- Seimila righe: l'indice si fa in un attimo.
create index if not exists scadenze_order_id_idx on public.scadenze (order_id) where order_id is not null;

create or replace function public.commesse_da_completare(
  p_company_id uuid,
  p_order_id uuid default null,
  p_limite integer default 50
)
returns table (
  order_id uuid,
  order_code text,
  titolo text,
  cliente text,
  inizio date,
  consegna date,
  importo numeric,
  punteggio integer,
  mancano text[],
  totale bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_importi boolean;
begin
  if v_uid is null then
    raise exception 'Sessione scaduta. Accedi di nuovo.' using errcode = '42501';
  end if;
  if p_company_id is distinct from public.get_effective_company_id()
     or public.has_permission_for_company(v_uid, 'can_edit_orders', p_company_id) is not true then
    raise exception 'Non hai il permesso di modificare le commesse di questa azienda.' using errcode = '42501';
  end if;
  v_importi := public.has_permission_for_company(v_uid, 'can_view_order_amounts', p_company_id) is true;

  return query
  with aperte as (
    select o.*
      from public.orders o
     where o.company_id = p_company_id
       and o.deleted_at is null
       and coalesce(o.status, '') not in ('completato', 'annullato')
       and (p_order_id is null or o.id = p_order_id)
       and public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id)
  ), conti as (
    select
      o.id,
      o.order_code,
      o.description,
      coalesce(nullif(btrim(o.client_name), ''), nullif(btrim(o.client_company), ''),
               (select nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), '') from public.profiles p where p.id = o.customer_id)) as cliente,
      o.work_start_date,
      o.expected_date,
      o.total_amount,
      o.created_at,
      round(100.0 * ((case when (nullif(btrim(o.order_code::text), '') is not null) then 1 else 0 end)
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
       + (case when (exists (select 1 from public.tasks x where x.order_id = o.id)) then 1 else 0 end)) / 42)::integer as punteggio,
      array_remove(array[
       case when not (coalesce(o.total_amount, 0) > 0) then 'economia.total_amount' end,
       case when not (exists (select 1 from public.order_installments x where x.order_id = o.id)) then 'pagamenti.rate' end,
       case when not (exists (select 1 from public.order_work_phases x where x.order_id = o.id)) then 'fasi.order_work_phases' end,
       case when not (nullif(btrim(o.customer_id::text), '') is not null) then 'cliente.customer_id' end,
       case when not (nullif(btrim(o.indirizzo_lavori::text), '') is not null or nullif(btrim(o.work_address::text), '') is not null) then 'cantiere.indirizzo' end,
       case when not (exists (select 1 from public.order_work_phases x where x.order_id = o.id and x.start_date is not null)) then 'fasi.date_fasi' end,
       case when not (nullif(btrim(o.work_start_date::text), '') is not null) then 'fasi.work_start_date' end,
       case when not (nullif(btrim(o.assigned_to::text), '') is not null) then 'persone.assigned_to' end,
       case when not (exists (select 1 from public.order_employees x where x.order_id = o.id) or exists (select 1 from public.order_phase_assignments x where x.order_id = o.id) or exists (select 1 from public.squadre_commesse x where x.order_id = o.id)) then 'persone.squadra' end,
       case when not (nullif(btrim(o.order_code::text), '') is not null) then 'identita.order_code' end,
       case when not (nullif(btrim(o.tipo_lavoro::text), '') is not null) then 'identita.tipo_lavoro' end,
       case when not (nullif(btrim(o.description::text), '') is not null) then 'identita.description' end,
       case when not (nullif(btrim(o.work_description::text), '') is not null) then 'identita.work_description' end,
       case when not (nullif(btrim(o.sede_id::text), '') is not null) then 'identita.sede_id' end,
       case when not (nullif(btrim(o.client_name::text), '') is not null or nullif(btrim(o.client_company::text), '') is not null) then 'cliente.nome' end,
       case when not (nullif(btrim(o.client_phone::text), '') is not null or nullif(btrim(o.client_email::text), '') is not null) then 'cliente.contatto' end,
       case when not (nullif(btrim(o.client_address::text), '') is not null) then 'cliente.client_address' end,
       case when not (nullif(btrim(o.work_lat::text), '') is not null) then 'cantiere.coordinate' end,
       case when not (nullif(btrim(o.vat_rate::text), '') is not null) then 'economia.vat_rate' end,
       case when not (exists (select 1 from public.order_items x where x.order_id = o.id)) then 'economia.order_items' end,
       case when not (nullif(btrim(o.payment_type::text), '') is not null) then 'pagamenti.payment_type' end,
       case when not (nullif(btrim(o.work_end_date::text), '') is not null) then 'fasi.work_end_date' end,
       case when not (nullif(btrim(o.expected_date::text), '') is not null) then 'fasi.expected_date' end,
       case when not (nullif(btrim(o.capomastro_user_id::text), '') is not null) then 'persone.capomastro' end,
       case when not (exists (select 1 from public.company_costs x where x.order_id = o.id)) then 'costi.previsti' end,
       case when not (exists (select 1 from public.adempimenti_sicurezza x where x.order_id = o.id)) then 'sicurezza.adempimenti' end,
       case when not (exists (select 1 from public.scadenze x where x.order_id = o.id)) then 'sal_scadenze.scadenze' end,
       case when not (nullif(btrim(o.next_action::text), '') is not null) then 'comunicazione.next_action' end,
       case when not (exists (select 1 from public.internal_chat_channels x where x.order_id = o.id)) then 'comunicazione.canale_interno' end,
       case when not (exists (select 1 from public.tasks x where x.order_id = o.id)) then 'comunicazione.tasks' end
      ]::text[], null) as mancano
    from aperte o
  )
  select c.id, c.order_code, c.description, c.cliente, c.work_start_date, c.expected_date,
         case when v_importi then c.total_amount end,
         c.punteggio, c.mancano, count(*) over ()
    from conti c
   where p_order_id is not null or c.punteggio < 100
   order by coalesce(c.work_start_date, c.expected_date) is null,
            -- Oggi in Italia, non in UTC: fra mezzanotte e le due current_date è ancora ieri.
            abs(coalesce(c.work_start_date, c.expected_date) - (now() at time zone 'Europe/Rome')::date),
            case when v_importi then c.total_amount end desc nulls last,
            c.created_at desc
   limit least(greatest(coalesce(p_limite, 50), 1), 200);
end
$$;

revoke all on function public.commesse_da_completare(uuid, uuid, integer) from public, anon;
grant execute on function public.commesse_da_completare(uuid, uuid, integer) to authenticated, service_role;
