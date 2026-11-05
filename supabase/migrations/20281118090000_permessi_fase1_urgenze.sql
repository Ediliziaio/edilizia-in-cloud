-- Permessi, fase 1: quattro aperture verificate il 03/11/2026 impersonando utenti della demo.
--
-- 1. documenti-smart: bastava essere loggati per leggere, caricare e cancellare i file di
--    QUALSIASI azienda. Ora vale l'azienda scritta nel percorso: <azienda>/... (import
--    documenti, PDF toolkit) oppure captures/<azienda>/... (preventivo da foto).
-- 2. fattura_pagamento_stato: vista senza security_invoker, quindi importi e incassi di tutte
--    le aziende leggibili da chiunque fosse loggato.
-- 3. Controllo di gestione: le funzioni guardavano solo l'azienda, non il ruolo. Margini e
--    rating erano leggibili da clienti, operai e subappaltatori. Ora serve lo stesso permesso
--    che apre la pagina (usePermissions: canViewControlloGestione) o i report finanziari.
--    Le chiamate senza utente (cron, service role) restano libere: l'azienda la scelgono loro.

-- ── 1. documenti-smart ──────────────────────────────────────────────────────
create or replace function public.percorso_documenti_smart_mio(p_nome text)
returns boolean language plpgsql stable security definer set search_path = public, storage as $$
declare
  v_parti text[] := storage.foldername(p_nome);
  v_azienda text := case when v_parti[1] = 'captures' then v_parti[2] else v_parti[1] end;
begin
  if v_azienda is null or v_azienda !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.user_can_access_company(v_azienda::uuid) and not public.utente_e_cliente_esterno();
end $$;
revoke all on function public.percorso_documenti_smart_mio(text) from public, anon;
grant execute on function public.percorso_documenti_smart_mio(text) to authenticated, service_role;

drop policy if exists documenti_smart_read on storage.objects;
drop policy if exists documenti_smart_upload on storage.objects;
drop policy if exists documenti_smart_delete on storage.objects;
create policy documenti_smart_read on storage.objects for select to authenticated
  using (bucket_id = 'documenti-smart' and public.percorso_documenti_smart_mio(name));
create policy documenti_smart_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'documenti-smart' and public.percorso_documenti_smart_mio(name));
create policy documenti_smart_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documenti-smart' and public.percorso_documenti_smart_mio(name));

-- ── 2. Vista delle fatture ──────────────────────────────────────────────────
alter view public.fattura_pagamento_stato set (security_invoker = true);

-- ── 3. Controllo di gestione ────────────────────────────────────────────────
create or replace function public._cg_assert_lettura(p_company_id uuid)
returns void language plpgsql stable security definer set search_path = public as $$
declare
  v_azienda uuid := coalesce(p_company_id, public.get_my_company_id());
  v_uid uuid := auth.uid();
begin
  if coalesce(auth.role(), '') <> 'authenticated' then return; end if;
  if v_azienda is not null and (
       public.has_permission_for_company(v_uid, 'can_view_controllo_gestione', v_azienda)
    or public.has_permission_for_company(v_uid, 'can_view_cruscotto', v_azienda)
    or public.has_permission_for_company(v_uid, 'can_view_billing', v_azienda)
    or public.has_permission_for_company(v_uid, 'can_view_costs', v_azienda)
    or public.has_permission_for_company(v_uid, 'can_view_financial_reports', v_azienda)
    or public.can_accountant_access_company(v_azienda, null)
  ) then
    return;
  end if;
  raise exception 'Accesso negato: serve il permesso Controllo di gestione' using errcode = '42501';
end $$;
revoke all on function public._cg_assert_lettura(uuid) from public, anon, authenticated;

create or replace function public._cg_assert_enabled(p_company_id uuid)
returns void language plpgsql stable security definer set search_path = public as $$
BEGIN
  IF NOT public.is_cg_enabled(p_company_id) THEN
    RAISE EXCEPTION 'Modulo Controllo di Gestione non attivo per questa company. Contatta l''account manager per attivare l''add-on.'
      USING ERRCODE = 'P0001';
  END IF;
  PERFORM public._cg_assert_lettura(p_company_id);
END;
$$;

-- Le funzioni base hanno p_company_id e si possono chiamare direttamente: il controllo va
-- dentro ciascuna, come prima riga. Le _safe passano da _cg_assert_enabled.
do $mig$
declare
  f record;
  v_def text;
  v_nuova text;
begin
  for f in
    select p.oid, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and (p.proname like 'cg\_get\_%' or p.proname like 'cg\_simul%')
       and p.proname not like '%\_safe'
       and pg_get_function_identity_arguments(p.oid) like 'p_company_id uuid%'
       and p.prosrc not like '%_cg_assert_lettura%'
  loop
    v_def := pg_get_functiondef(f.oid);
    v_nuova := regexp_replace(v_def, E'\\n\\s*BEGIN\\s*\\n', E'\nBEGIN\n  PERFORM public._cg_assert_lettura(p_company_id);\n', 'i');
    if v_nuova = v_def then
      raise exception 'Funzione % senza BEGIN riconoscibile', f.proname;
    end if;
    execute v_nuova;
  end loop;
end $mig$;
