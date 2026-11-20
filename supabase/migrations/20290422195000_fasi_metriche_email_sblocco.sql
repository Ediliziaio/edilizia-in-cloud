-- Correzioni autorizzate il 20 novembre 2026; migrazione applicata e registro allineato prima del push.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.riordina_fasi_commessa(p_order_id uuid, p_fasi uuid[], p_ordine_atteso uuid[])
returns integer language plpgsql security definer set search_path to 'public' set lock_timeout to '3s' as $$
declare
  v_azienda uuid; v_assegnato uuid; v_attuali uuid[]; v_n integer;
begin
  if auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno() then
    raise exception 'Non hai il permesso di riordinare le fasi.' using errcode='42501';
  end if;
  select company_id,assigned_to into v_azienda,v_assegnato from public.orders
   where id=p_order_id and deleted_at is null for update;
  if not found then raise exception 'Commessa non disponibile.' using errcode='42501'; end if;
  perform public.assert_company_access(v_azienda);
  if public.has_permission_for_company(auth.uid(),'can_view_orders',v_azienda) is not true
     or public.has_permission_for_company(auth.uid(),'can_edit_orders',v_azienda) is not true
     or public.check_staff_visibility(auth.uid(),v_assegnato) is not true then
    raise exception 'Non hai il permesso di riordinare le fasi.' using errcode='42501';
  end if;
  if p_fasi is null or p_ordine_atteso is null or coalesce(array_ndims(p_fasi),1)<>1
     or coalesce(array_ndims(p_ordine_atteso),1)<>1 or cardinality(p_fasi)>5000
     or array_position(p_fasi,null) is not null
     or cardinality(p_fasi)<>(select count(distinct id) from unnest(p_fasi) id) then
    raise exception 'Elenco delle fasi non valido.' using errcode='22023';
  end if;
  -- Il lock del padre serializza i riordini e impedisce nuovi inserimenti via FK.
  perform id from public.order_work_phases where order_id=p_order_id order by id for update;
  select coalesce(array_agg(id order by position,id),'{}'::uuid[]) into v_attuali
    from public.order_work_phases where order_id=p_order_id and company_id=v_azienda;
  if cardinality(v_attuali)<>cardinality(p_fasi) or not v_attuali @> p_fasi then
    raise exception 'Le fasi sono cambiate: ricaricale prima di riordinarle.' using errcode='PT409';
  end if;
  if v_attuali=p_fasi then return 0; end if; -- ripetizione dopo una risposta persa
  if v_attuali is distinct from p_ordine_atteso then
    raise exception 'Un altro utente ha riordinato le fasi: ricaricale prima di salvare.' using errcode='PT409';
  end if;
  update public.order_work_phases p set position=(f.pos-1)::integer
    from unnest(p_fasi) with ordinality f(id,pos)
   where p.id=f.id and p.order_id=p_order_id and p.company_id=v_azienda
     and p.position is distinct from (f.pos-1)::integer;
  get diagnostics v_n=row_count;
  return v_n;
end $$;
revoke all on function public.riordina_fasi_commessa(uuid,uuid[],uuid[]) from public,anon;
grant execute on function public.riordina_fasi_commessa(uuid,uuid[],uuid[]) to authenticated;

create or replace function public.admin_metriche_funzioni_24h()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v_result jsonb;
begin
  if auth.uid() is null or (not coalesce(public.is_super_admin(auth.uid()),false)
     and not coalesce(public.is_platform_staff(auth.uid()),false)) then
    raise exception 'Accesso riservato allo staff di piattaforma.' using errcode='42501';
  end if;
  with righe as materialized (
    select coalesce(function_name,'unknown') as nome,status_code,latency_ms
      from public.system_health_metrics
     where metric_type='edge_function_call' and recorded_at>=now()-interval '24 hours'
  ), funzioni as (
    select nome,count(*) as chiamate,count(*) filter(where status_code>=400) as errori,
      coalesce(round(avg(latency_ms)),0) as latenza
    from righe group by nome order by latenza desc,nome limit 15
  )
  select jsonb_build_object(
    'totalCalls',count(*),'totalErrors',count(*) filter(where status_code>=400),
    'totalPaymentBlocks',count(*) filter(where status_code=402),
    'avgLatency',coalesce(round(avg(latency_ms)),0),
    'byFunction',coalesce((select jsonb_agg(jsonb_build_object('name',nome,'calls',chiamate,
      'errors',errori,'avgLatency',latenza) order by latenza desc,nome) from funzioni),'[]'::jsonb)
  ) into v_result from righe;
  return v_result;
end $$;
revoke all on function public.admin_metriche_funzioni_24h() from public,anon;
grant execute on function public.admin_metriche_funzioni_24h() to authenticated;

-- Solo lettura: pre-filtro del dispatcher, senza addebiti, rinnovi o contesto JWT fittizio.
-- La edge continua a fare i controlli autorevoli checkPaymentMethod/precallCheck prima del provider.
-- Parità con check_ai_credits_available: task email_opportunita, 3000 token stimati = 0.009 USD.
create or replace function public.email_opportunita_puo_elaborare(p_company_id uuid)
returns boolean language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_metodo text; v_stato text; v_saldo numeric; v_libero numeric; v_bloccato boolean;
  v_rate numeric; v_min numeric; v_markup numeric;
begin
  select lower(coalesce(c.payment_method,'none')),lower(coalesce(c.status,'')),coalesce(a.balance_eur,0),
    case when a.free_period_start=date_trunc('month',now())::date then coalesce(a.free_balance_eur,0)
         else coalesce(s.monthly_free_ai_eur,0) end,coalesce(a.calls_blocked,false)
    into v_metodo,v_stato,v_saldo,v_libero,v_bloccato
  from public.companies c left join public.ai_credits a on a.company_id=c.id
    left join public.subscription_plans s on s.id=c.subscription_plan_id where c.id=p_company_id;
  if not found then return false; end if;
  if p_company_id not in ('778a2c76-1253-49f2-a5e8-283363ac3e29'::uuid,'d2000000-0000-4000-a000-000000000002'::uuid)
     and v_metodo not in ('comped','complimentary','comp','manual_free','gift','gifted','gratis','omaggio') then
    if v_stato in ('suspended','cancelled','canceled','expired') or v_metodo not in ('stripe','bank_transfer','sepa_debit','other') then return false; end if;
  end if;
  if v_bloccato then return false; end if;
  select coalesce(nullif(value,'')::numeric,0.92) into v_rate from public.platform_settings where key='usd_eur_rate';
  select coalesce(nullif(value,'')::numeric,0.05) into v_min from public.platform_settings where key='ai_min_balance_eur_to_call';
  select markup_multiplier into v_markup from public.ai_pricing_markup
    where task_kind='email_opportunita' and model_pattern is null and enabled=true;
  if v_markup is null then
    select markup_multiplier into v_markup from public.ai_pricing_markup where task_kind='default' and model_pattern is null and enabled=true;
  end if;
  return v_saldo+v_libero>=greatest(coalesce(v_min,0.05),0.009*coalesce(v_rate,0.92)*coalesce(v_markup,3));
end $$;
revoke all on function public.email_opportunita_puo_elaborare(uuid) from public,anon,authenticated;
grant execute on function public.email_opportunita_puo_elaborare(uuid) to service_role;

create or replace function public.silvio_email_dispatch_opportunita(p_cron_secret text,p_limit integer default 10)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare rec record; v_n integer:=0; v_email uuid;
begin
  if nullif(btrim(p_cron_secret),'') is null then raise exception 'Credenziale interna mancante.' using errcode='22023'; end if;
  for rec in
    with candidati as materialized (
      select e.id,e.company_id,e.received_at from public.email_inbox e
      left join public.email_opportunita_tentativi t on t.email_id=e.id
      where (e.categoria::text in ('preventivo','opportunita') or e.ai_category in ('preventivo','opportunita'))
        and coalesce(e.is_trashed,false)=false
        and not exists(select 1 from public.email_opportunita_bozza b where b.email_id=e.id)
        and (t.email_id is null or (t.errori_consecutivi<6 and (t.ultimo_esito='credito' or t.prossimo_tentativo<=now())))
    ), pronte as materialized (
      select company_id from (select distinct company_id from candidati) a
       where public.email_opportunita_puo_elaborare(a.company_id)
    )
    select c.id from candidati c join pronte p on p.company_id=c.company_id
    order by c.received_at desc,c.id limit greatest(1,least(coalesce(p_limit,10),25))
  loop
    -- Lo sblocco del credito riprende al prossimo giro, senza aspettare il vecchio rinvio.
    -- La presa in carico resta atomica: un solo dispatcher invia la stessa email.
    v_email:=null;
    insert into public.email_opportunita_tentativi as t (email_id,ultimo_esito,prossimo_tentativo)
    values(rec.id,'in_coda',now()+interval '10 minutes')
    on conflict(email_id) do update set ultimo_esito='in_coda',prossimo_tentativo=excluded.prossimo_tentativo,updated_at=now()
    where t.errori_consecutivi<6 and (t.ultimo_esito='credito' or t.prossimo_tentativo<=now())
    returning email_id into v_email;
    if v_email is null then continue; end if;
    perform net.http_post(
      url:='https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/email-ai-opportunita',
      headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',p_cron_secret),
      body:=jsonb_build_object('email_id',rec.id),timeout_milliseconds:=15000);
    v_n:=v_n+1;
  end loop;
  return jsonb_build_object('dispatched',v_n);
end $$;
revoke all on function public.silvio_email_dispatch_opportunita(text,integer) from public,anon,authenticated;
grant execute on function public.silvio_email_dispatch_opportunita(text,integer) to service_role;
