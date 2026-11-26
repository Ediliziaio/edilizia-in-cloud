-- «Da approvare»: le altre cose in attesa dal cantiere, in un posto solo (26/11/2026, piano campo completo 4.1).
--
-- ufficio_da_approvare copre rapportini, timbrature dimenticate e bolle. Spese, ferie/permessi e ritiri dal
-- magazzino si approvano altrove (Personale › Richieste, Magazzino) e nessuno li vedeva insieme. Questa
-- funzione li conta, ognuno solo per chi lo può approvare davvero (stessi controlli delle funzioni che
-- approvano): spese e ferie l'amministratore, i ritiri chi può modificare il magazzino.

create or replace function public.ufficio_altre_approvazioni()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_company uuid := public.get_my_company_id();
  v_admin boolean;
  v_magazzino boolean;
begin
  if auth.uid() is null or v_company is null or public.utente_bloccato() then
    raise exception 'Non puoi vedere le approvazioni di questa azienda' using errcode = '42501';
  end if;
  v_admin := coalesce(public.e_amministratore_di(v_company), false);
  v_magazzino := coalesce(public.has_permission_for_company(auth.uid(), 'can_edit_warehouse', v_company), false);
  return jsonb_build_object(
    'spese', case when v_admin then
      (select count(*) from public.campo_spese s where s.company_id = v_company and s.stato = 'inviata') else 0 end,
    'ferie', case when v_admin then
      (select count(*) from public.hr_richieste r where r.company_id = v_company and r.stato = 'in_attesa') else 0 end,
    'ritiri', case when v_magazzino then
      (select count(*) from public.prelievi_campo p where p.company_id = v_company and p.stato = 'richiesto') else 0 end
  );
end;
$function$;

revoke all on function public.ufficio_altre_approvazioni() from public, anon;
grant execute on function public.ufficio_altre_approvazioni() to authenticated;
