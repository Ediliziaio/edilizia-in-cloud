-- 20290330170000_generale_prerequisiti.sql
--
-- «Per lavorare ti manca…» sulla commessa generale (15/11/2026). Il flusso si fermava solo
-- quando ci si arrivava: senza operai né ditte il rapportino non si salva, senza clienti
-- un'unità non si prenota, senza l'anagrafica fiscale dell'azienda una fattura non si emette.
-- URBAN VISION aveva tutti e tre i vuoti. Questa funzione dice cosa c'è, una volta sola, per
-- l'azienda della generale; la pagina mostra solo ciò che manca.

create or replace function public.generale_prerequisiti(p_generale_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_azienda uuid := public.get_order_company_id(p_generale_id);
begin
  if auth.uid() is null or v_azienda is null or not public.puo_vedere_commessa(p_generale_id) then
    raise exception 'Non hai il permesso di vedere questa commessa.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'dipendenti', (select count(*) from public.employees e where e.company_id = v_azienda and coalesce(e.is_active, true)),
    'ditte', (select count(*) from public.subappaltatori s where s.company_id = v_azienda and coalesce(s.is_active, true)),
    'mezzi', (select count(*) from public.mezzi m where m.company_id = v_azienda),
    'clienti', (select count(*) from public.profiles p where p.company_id = v_azienda and p.deleted_at is null and public.profilo_solo_cliente(p.id)),
    'dati_fiscali', exists (select 1 from public.anagrafica_azienda a where a.company_id = v_azienda
                             and nullif(btrim(coalesce(a.partita_iva, a.codice_fiscale, '')), '') is not null)
  );
end;
$$;

comment on function public.generale_prerequisiti(uuid) is
  'Cosa serve per lavorare su una commessa generale: operai, ditte, mezzi, clienti, dati fiscali dell''azienda. 20290330170000.';

revoke all on function public.generale_prerequisiti(uuid) from public, anon;
grant execute on function public.generale_prerequisiti(uuid) to authenticated, service_role;
