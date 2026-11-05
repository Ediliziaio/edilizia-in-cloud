-- Assegnare squadre, persone e ditte a più fasi in una volta sola. Prima: cinque clic per ogni squadra su
-- ogni fase, una persona su una fase per salvataggio. Una chiamata sola, tutto o niente; chi è già assegnato
-- resta com'è. Scrive nelle tabelle di sempre: accessi, area campo e WhatsApp seguono dai loro trigger.
-- Persone e ditte erano riservate agli amministratori dalle policy, anche se chi può modificare le commesse
-- vedeva il pulsante e riceveva un rifiuto: qui vale il permesso di modificare le commesse. Idempotente.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.assegna_alle_fasi(
  p_order_id uuid,
  p_fasi uuid[],
  p_squadre uuid[] default '{}',
  p_persone uuid[] default '{}',
  p_ditte uuid[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
  v_fase uuid;
  v_id uuid;
  v_squadre int := 0;
  v_persone int := 0;
  v_ditte int := 0;
  v_gia int := 0;
begin
  select company_id into v_company from public.orders where id = p_order_id and deleted_at is null;
  if v_uid is null or v_company is null or public.utente_bloccato() or public.utente_e_cliente_esterno() then
    raise exception using errcode = '42501', message = 'Non puoi modificare chi lavora su questa commessa.';
  end if;
  if cardinality(p_squadre) > 0
     and not (public.has_permission_for_company(v_uid, 'can_edit_orders', v_company)
              or public.has_permission_for_company(v_uid, 'can_edit_operai', v_company)) then
    raise exception using errcode = '42501', message = 'Non puoi assegnare squadre su questa commessa.';
  end if;
  if (cardinality(p_persone) > 0 or cardinality(p_ditte) > 0)
     and not public.has_permission_for_company(v_uid, 'can_edit_orders', v_company) then
    raise exception using errcode = '42501', message = 'Non puoi assegnare persone o ditte su questa commessa.';
  end if;
  if coalesce(cardinality(p_fasi), 0) = 0 then
    raise exception using errcode = '22023', message = 'Scegli almeno una fase.';
  end if;
  if cardinality(p_fasi) > 500 or cardinality(p_squadre) + cardinality(p_persone) + cardinality(p_ditte) > 100 then
    raise exception using errcode = '22023', message = 'Troppe scelte insieme: dividile in più passaggi.';
  end if;
  if exists (select 1 from unnest(p_fasi) f(id)
              where not exists (select 1 from public.order_work_phases p where p.id = f.id and p.order_id = p_order_id)) then
    raise exception using errcode = '22023', message = 'Una delle fasi non è di questa commessa.';
  end if;
  if exists (select 1 from unnest(p_persone) x(id)
              where not exists (select 1 from public.employees e where e.id = x.id and e.company_id = v_company and e.is_active)) then
    raise exception using errcode = '22023', message = 'Una delle persone non è attiva in questa azienda.';
  end if;
  if exists (select 1 from unnest(p_ditte) x(id)
              where not exists (select 1 from public.external_teams t where t.id = x.id and t.company_id = v_company and t.is_active and t.kind is distinct from 'interna')) then
    raise exception using errcode = '22023', message = 'Una delle ditte non è attiva in questa azienda.';
  end if;

  foreach v_fase in array p_fasi loop
    foreach v_id in array p_squadre loop
      if exists (select 1 from public.squadre_commesse s where s.squadra_id = v_id and s.order_id = p_order_id and s.phase_id = v_fase) then
        v_gia := v_gia + 1;
      else
        perform public.manodopera_squadra_su_commessa(p_order_id, v_id, null, null, false, v_fase);
        v_squadre := v_squadre + 1;
      end if;
    end loop;
    foreach v_id in array p_persone loop
      if exists (select 1 from public.order_employees o where o.order_id = p_order_id and o.employee_id = v_id and o.phase_id = v_fase) then
        v_gia := v_gia + 1;
      else
        insert into public.order_employees (order_id, employee_id, phase_id, total_cost, cost_preventivo, hours_worked, hourly_rate)
        values (p_order_id, v_id, v_fase, 0, 0, 0, 0);
        v_persone := v_persone + 1;
      end if;
    end loop;
    foreach v_id in array p_ditte loop
      if exists (select 1 from public.order_external_teams o where o.order_id = p_order_id and o.external_team_id = v_id and o.phase_id = v_fase) then
        v_gia := v_gia + 1;
      else
        -- 'preventivo': con una ditta sola sulla fase, il previsto viene dalle voci.
        insert into public.order_external_teams (order_id, external_team_id, phase_id, total_cost, cost_preventivo, costo_origine)
        values (p_order_id, v_id, v_fase, 0, 0, 'preventivo');
        v_ditte := v_ditte + 1;
      end if;
    end loop;
  end loop;

  if v_ditte > 0 then
    perform public.ditte_ricalcola_previsto(p_fasi);
  end if;

  return jsonb_build_object('squadre', v_squadre, 'persone', v_persone, 'ditte', v_ditte, 'gia_assegnate', v_gia);
end;
$$;

revoke all on function public.assegna_alle_fasi(uuid, uuid[], uuid[], uuid[], uuid[]) from public, anon;
grant execute on function public.assegna_alle_fasi(uuid, uuid[], uuid[], uuid[], uuid[]) to authenticated, service_role;
