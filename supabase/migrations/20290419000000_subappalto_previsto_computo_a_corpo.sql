-- Il prezzo a corpo inserito nel computo contrattuale concorre al previsto della fase.
-- Le voci misurate continuano a entrare tramite gli affidamenti, una sola volta.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.affidamenti_allinea_ditta(p_order uuid, p_fase uuid, p_subappaltatore uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_azienda uuid;
  v_squadra uuid;
  v_assegnazione uuid;
  v_iva numeric;
  v_netto numeric;
  v_n int;
  v_corpo numeric;
begin
  select o.company_id into v_azienda
    from public.orders o
    join public.order_work_phases f on f.order_id = o.id and f.id = p_fase
   where o.id = p_order;
  if not found then return; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_order::text || p_fase::text || p_subappaltatore::text, 0));

  select count(*), coalesce(sum(round(a.quantita * coalesce(a.prezzo_unitario, 0), 2)), 0)
    into v_n, v_netto
    from public.subappalto_affidamenti a
    join public.order_work_phase_voci v on v.id = a.voce_id
   where a.order_id = p_order and v.phase_id = p_fase and a.subappaltatore_id = p_subappaltatore;

  select coalesce(sum(round((riga->>'prezzo')::numeric, 2)), 0)
    into v_corpo
    from public.contratti_subappalto c
    join public.subappaltatori_sicurezza s on s.id = c.subappaltatore_id and s.company_id = c.company_id
    cross join lateral jsonb_array_elements(case when jsonb_typeof(c.elenco_lavori) = 'array' then c.elenco_lavori else '[]'::jsonb end) riga
   where c.order_id = p_order and c.company_id = v_azienda
     and s.campo_subappaltatore_id = p_subappaltatore and c.stato is distinct from 'risolto'
     and riga->'allinea_costo_previsto' = 'true'::jsonb
     and riga->>'fase_id' = p_fase::text and nullif(riga->>'affidamento_id', '') is null
     and riga->>'unita' = 'a corpo' and riga->'quantita' = '1'::jsonb
     and case when jsonb_typeof(riga->'prezzo') = 'number' then (riga->>'prezzo')::numeric > 0 else false end;

  select e.id, coalesce(e.vat_rate, 0) into v_squadra, v_iva
    from public.external_teams e
   where e.company_id = v_azienda and e.subappaltatore_id = p_subappaltatore
   order by e.is_active desc nulls last, e.created_at
   limit 1;

  if v_n = 0 and v_corpo = 0 then
    delete from public.order_external_teams
     where order_id = p_order and phase_id = p_fase and external_team_id = v_squadra
       and costo_origine = 'contratto' and notes = 'Dagli affidamenti';
    update public.order_external_teams
       set costo_origine = 'manuale',
           cost_preventivo = coalesce(cost_preventivo_manuale, cost_preventivo),
           cost_preventivo_manuale = null
     where order_id = p_order and phase_id = p_fase and external_team_id = v_squadra and costo_origine = 'contratto';
    return;
  end if;

  if v_squadra is null then
    insert into public.external_teams (company_id, name, kind, is_active, subappaltatore_id, vat_rate)
    select v_azienda, s.ragione_sociale, 'esterna', true, s.id, 0
      from public.subappaltatori s where s.id = p_subappaltatore and s.company_id = v_azienda
    returning id, 0 into v_squadra, v_iva;
    if not found then return; end if;
  end if;

  v_netto := v_netto + v_corpo;
  select a.id into v_assegnazione
    from public.order_external_teams a
   where a.order_id = p_order and a.phase_id = p_fase and a.external_team_id = v_squadra
   order by a.created_at, a.id
   limit 1;

  if v_assegnazione is null then
    insert into public.order_external_teams (order_id, external_team_id, phase_id, total_cost, cost_preventivo, costo_origine, vat_rate, is_paid, notes)
    values (p_order, v_squadra, p_fase, 0, round(v_netto * (1 + v_iva / 100), 2), 'contratto', v_iva, false, 'Dagli affidamenti');
  else
    -- Una ditta può avere più assegnazioni sulla stessa fase. Il totale si espone una volta sola.
    update public.order_external_teams
       set cost_preventivo_manuale = case when costo_origine is distinct from 'contratto' then cost_preventivo else cost_preventivo_manuale end,
           cost_preventivo = case when id = v_assegnazione then round(v_netto * (1 + coalesce(vat_rate, v_iva) / 100), 2) else 0 end,
           costo_origine = 'contratto'
     where order_id = p_order and phase_id = p_fase and external_team_id = v_squadra;
  end if;
end;
$$;

revoke all on function public.affidamenti_allinea_ditta(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function private.contratto_allinea_lavori_a_corpo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prima jsonb := '[]'::jsonb;
  v_dopo jsonb := '[]'::jsonb;
  v_prima_commessa uuid;
  v_dopo_commessa uuid;
  v_prima_scheda uuid;
  v_dopo_scheda uuid;
  interessata record;
begin
  if tg_op <> 'INSERT' and jsonb_typeof(old.elenco_lavori) = 'array' then
    v_prima := old.elenco_lavori;
    v_prima_commessa := old.order_id;
    v_prima_scheda := old.subappaltatore_id;
  end if;
  if tg_op <> 'DELETE' and jsonb_typeof(new.elenco_lavori) = 'array' then
    v_dopo := new.elenco_lavori;
    v_dopo_commessa := new.order_id;
    v_dopo_scheda := new.subappaltatore_id;
  end if;

  for interessata in
    select distinct f.order_id, f.id as fase_id, s.campo_subappaltatore_id as ditta_id
      from (values (v_prima_commessa, v_prima_scheda, v_prima), (v_dopo_commessa, v_dopo_scheda, v_dopo))
           as c(commessa, scheda, elenco)
      join public.subappaltatori_sicurezza s on s.id = c.scheda
      join public.orders o on o.id = c.commessa and o.company_id = s.company_id
      cross join lateral jsonb_array_elements(c.elenco) riga
      join public.order_work_phases f on f.id::text = riga->>'fase_id' and f.order_id = c.commessa
     where riga->'allinea_costo_previsto' = 'true'::jsonb and s.campo_subappaltatore_id is not null
     order by f.order_id, f.id, s.campo_subappaltatore_id
  loop
    perform public.affidamenti_allinea_ditta(interessata.order_id, interessata.fase_id, interessata.ditta_id);
  end loop;
  return null;
end;
$$;

revoke all on function private.contratto_allinea_lavori_a_corpo() from public, anon, authenticated;

drop trigger if exists contratto_previsto_lavori_a_corpo on public.contratti_subappalto;
create trigger contratto_previsto_lavori_a_corpo
after insert or update of elenco_lavori, stato, order_id, subappaltatore_id or delete on public.contratti_subappalto
for each row execute function private.contratto_allinea_lavori_a_corpo();
