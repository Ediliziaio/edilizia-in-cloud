-- Richieste Solar su iniziativa dell'operatore: prenotazione atomica prima della chiamata.
-- Niente chiavi nel database pubblico e niente dati dimostrativi nella cache.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
create or replace function public.fv_solar_accesso(p_progetto uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select auth.uid() is not null
 and not public.utente_bloccato() and not public.utente_e_cliente_esterno()
 and exists(select 1 from public.fv_progetti p where p.id=p_progetto and p.deleted_at is null
   and p.stato::text in ('bozza','configurato')
   and public.check_staff_visibility(auth.uid(),p.created_by)
   and (public.has_role(auth.uid(),'super_admin'::public.app_role)
        or p.company_id=any(public.aziende_con_permesso('can_edit_preventivi'))))
$$;
revoke all on function public.fv_solar_accesso(uuid) from public,anon;
grant execute on function public.fv_solar_accesso(uuid) to authenticated,service_role;

create or replace function public.fv_solar_prenota_richiesta(p_azienda uuid,p_endpoint text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v_id uuid; v_mese text:=to_char(now() at time zone 'UTC','YYYY-MM'); v_limite integer;
begin
 if p_endpoint not in ('buildingInsights','dataLayers') or p_azienda is null then raise exception 'Richiesta non valida';end if;
 perform pg_advisory_xact_lock(hashtextextended('fv-solar-azienda:'||p_azienda::text,0));
 perform pg_advisory_xact_lock(hashtextextended('fv-solar:'||v_mese||':'||p_endpoint,0));
 v_limite:=case when p_endpoint='dataLayers' then 1000 else 9500 end;
 if (select coalesce(sum(call_count),0) from public.fv_solar_api_usage where mese_anno=v_mese and endpoint=p_endpoint and source in ('api','error'))>=v_limite then return null;end if;
 if (select count(*) from public.fv_solar_api_usage where company_id=p_azienda and source in ('api','error') and created_at>now()-interval '1 minute')>=20 then return null;end if;
 insert into public.fv_solar_api_usage(company_id,endpoint,source,call_count,cost_estimate_eur,mese_anno)values(p_azienda,p_endpoint,'api',1,null,v_mese)returning id into v_id;
 return v_id;
end;$$;
revoke all on function public.fv_solar_prenota_richiesta(uuid,text) from public,anon,authenticated;
grant execute on function public.fv_solar_prenota_richiesta(uuid,text) to service_role;
-- La cache del provider scade entro 30 giorni; i documenti emessi hanno una copia fissa propria.
do $$begin
 if exists(select 1 from pg_extension where extname='pg_cron')then
  if exists(select 1 from cron.job where jobname='fv-solar-cache-scadenza')then perform cron.unschedule('fv-solar-cache-scadenza');end if;
  perform cron.schedule('fv-solar-cache-scadenza','23 3 * * *',$job$delete from public.fv_solar_api_cache where expires_at<now() or created_at<now()-interval '30 days'$job$);
 end if;
end;$$;
commit;
