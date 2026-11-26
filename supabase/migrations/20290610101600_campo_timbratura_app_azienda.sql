-- Chi timbra dall'app: azienda e persona (26/11/2026, richiesta del founder).
--
-- Fino a oggi c'era solo l'interruttore della persona (hr_profili.timbra_dall_app). Ora anche l'azienda:
-- «In questa azienda si timbra dall'app» (campo_avvisi_azienda.timbratura_app, acceso di default: niente
-- cambia per chi oggi timbra). Una sola regola, letta dall'app con campo_timbro_dall_app():
--   timbra = azienda accesa E persona accesa (la scheda del personale; senza scheda vale l'azienda).
-- Quando è falso l'app non mostra la timbratura (Home, barra in basso, pagina del cantiere, fine giornata)
-- e dice chi segna le ore. Le timbrature già fatte restano dove sono.

alter table public.campo_avvisi_azienda add column if not exists timbratura_app boolean not null default true;

create or replace function public.campo_timbro_dall_app()
returns jsonb
language sql
stable security definer
set search_path to ''
as $$
  with io as (select auth.uid() as uid, public.get_my_company_id() as azienda)
  select jsonb_build_object(
    'azienda', coalesce((select a.timbratura_app from public.campo_avvisi_azienda a, io where a.company_id = io.azienda), true),
    'persona', coalesce((select hp.timbra_dall_app from public.hr_profili hp, io
                          where hp.user_id = io.uid and hp.company_id = io.azienda order by hp.attivo desc limit 1), true))
  from io where io.uid is not null;
$$;

revoke all on function public.campo_timbro_dall_app() from public, anon;
grant execute on function public.campo_timbro_dall_app() to authenticated;

create or replace function public.campo_avvisi_azienda_leggi(p_company_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null
     or not (public.campo_e_ufficio(p_company_id)
             or public.has_permission_for_company(auth.uid(), 'can_view_settings_orders', p_company_id)) then
    raise exception using errcode = '42501', message = 'Non puoi vedere queste impostazioni.';
  end if;
  return jsonb_build_object(
    'avviso_domani', coalesce((select a.avviso_domani from public.campo_avvisi_azienda a where a.company_id = p_company_id), false),
    'sub_vede_pagamenti', coalesce((select a.sub_vede_pagamenti from public.campo_avvisi_azienda a where a.company_id = p_company_id), true),
    'timbratura_app', coalesce((select a.timbratura_app from public.campo_avvisi_azienda a where a.company_id = p_company_id), true));
end;
$function$;

create or replace function public.campo_avvisi_azienda_salva_timbratura(p_company_id uuid, p_attivo boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_settings_orders', p_company_id) then
    raise exception using errcode = '42501', message = 'Non puoi cambiare queste impostazioni.';
  end if;
  insert into public.campo_avvisi_azienda (company_id, timbratura_app, aggiornato_da, aggiornato_il)
  values (p_company_id, coalesce(p_attivo, true), auth.uid(), now())
  on conflict (company_id) do update
    set timbratura_app = excluded.timbratura_app, aggiornato_da = excluded.aggiornato_da, aggiornato_il = now();
  return jsonb_build_object('timbratura_app', coalesce(p_attivo, true));
end;
$function$;

revoke all on function public.campo_avvisi_azienda_salva_timbratura(uuid, boolean) from public, anon;
grant execute on function public.campo_avvisi_azienda_salva_timbratura(uuid, boolean) to authenticated;
