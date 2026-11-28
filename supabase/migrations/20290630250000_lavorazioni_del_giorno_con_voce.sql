-- Le lavorazioni del giorno dicono anche quale voce del computo sono
-- ─────────────────────────────────────────────────────────────────
-- 28/11/2026, scrivendo l'interfaccia del lotto 4.
--
-- `appalto_rendiconto_righe.voce_computo_id` punta a una voce di `order_work_phase_voci`, ma la
-- tendina che l'utente vede elenca **lavorazioni**, non voci: una lavorazione ha una sola voce di
-- computo (vincolo unico su `subphase_id`, scoperto il 28/11), quindi scegliere la lavorazione
-- basta — purché la griglia sappia dire quale voce è.
--
-- `rendiconto_lavorazioni_del_giorno` restituisce quindi anche `voce_computo_id`. Il tipo di
-- ritorno cambia, e `CREATE OR REPLACE FUNCTION` non lo permette: la funzione si butta e si rifà.
-- Nessuno la usa ancora in produzione (è nata oggi).
-- Idempotente.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

drop function if exists public.rendiconto_lavorazioni_del_giorno(uuid, text, uuid);

create or replace function public.rendiconto_lavorazioni_del_giorno(
  p_order uuid,
  p_origine text default 'rendiconto',
  p_documento uuid default null
)
returns table (
  fase_id uuid,
  fase text,
  sottofase_id uuid,
  lavorazione text,
  modo text,
  unita text,
  quantita_contratto numeric,
  quantita_fatta numeric,
  percentuale integer,
  a_movimenti boolean,
  quantita_del_giorno numeric,
  percentuale_del_giorno numeric,
  voce_computo_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare v_uid uuid := (select auth.uid()); v_company uuid;
begin
  select o.company_id into v_company from public.orders o where o.id = p_order and o.deleted_at is null;
  if v_uid is null or v_company is null then
    return;
  end if;
  if not (public.user_assigned_to_order(p_order)
          or exists (select 1 from public.order_employees oe
                       join public.employees e on e.id = oe.employee_id
                      where oe.order_id = p_order and e.user_id = v_uid)
          or public.has_permission_for_company(v_uid, 'can_view_orders', v_company)) then
    return;
  end if;

  return query
    select f.id, f.name, s.id, s.name,
           coalesce(s.modo_avanzamento,
                    case when coalesce(s.quantita_contratto, public.sottofase_quantita_totale(s.id)) > 0
                         then 'quantita' else 'percentuale' end) as modo,
           coalesce(s.unita_contratto, (select max(v.unita) from public.order_work_phase_voci v where v.subphase_id = s.id)),
           coalesce(s.quantita_contratto, public.sottofase_quantita_totale(s.id)),
           s.quantita_fatta,
           s.percentuale,
           coalesce(s.a_movimenti, false),
           m.quantita,
           m.percentuale,
           (select v.id from public.order_work_phase_voci v where v.subphase_id = s.id limit 1)
      from public.order_work_phases f
      join public.order_work_subphases s on s.phase_id = f.id
      left join public.avanzamento_movimenti m
             on m.sottofase_id = s.id
            and m.origine = p_origine
            and p_documento is not null
            and m.documento_id = p_documento
     where f.order_id = p_order
     order by f.position nulls last, f.created_at, s.position nulls last, s.name;
end;
$function$;

revoke all on function public.rendiconto_lavorazioni_del_giorno(uuid, text, uuid) from public, anon;
grant execute on function public.rendiconto_lavorazioni_del_giorno(uuid, text, uuid) to authenticated;

comment on function public.rendiconto_lavorazioni_del_giorno(uuid, text, uuid) is
  'Le lavorazioni della commessa per la griglia «Avanzamento del giorno» e per la scelta «voce del computo o extra»: quantità e unità di contratto, quanto è fatto, quanto dichiara questo documento, la voce del computo. Nessun importo.';
