-- Permessi: funzioni e file, dalla seconda verifica (03/11/2026).
--
-- 1. Tra aziende: bot_report_mattino_dati dava a chiunque fosse loggato i dati di qualsiasi azienda,
--    i conteggi utenti tutte le aziende. marginalita_costo_oda() filtrava già per azienda: si chiude
--    solo perché nessuno la chiama dal browser.
-- 2. In azienda: statistiche, clienti e anomalie erano leggibili da operai, subappaltatori e clienti.
-- 3. File: il cliente leggeva DDT e computi, l'operaio tutti gli allegati delle commesse.
-- 4. Profili: il subappaltatore vedeva tutti i clienti dell'azienda; ora vale la regola dell'operaio.

create or replace function public._solo_ufficio()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') = 'authenticated'
     and (public.e_solo_campo() or public.utente_e_cliente_esterno()) then
    raise exception 'Accesso negato: riservato all''ufficio' using errcode = '42501';
  end if;
end $$;
revoke all on function public._solo_ufficio() from public, anon, authenticated;

-- ── 1. Tra aziende ──────────────────────────────────────────────────────────
-- Le usano solo il server o altre funzioni con i privilegi del proprietario.
revoke execute on function public.bot_report_mattino_dati(uuid) from public, anon, authenticated;
revoke execute on function public.diag_list_unpinned_definers() from public, anon, authenticated;
revoke execute on function public.marginalita_costo_oda() from public, anon, authenticated;

do $mig$
declare
  v_def text;
  v_nuova text;
  f record;
begin
  -- I conteggi utenti di tutte le aziende servono solo alla piattaforma.
  v_def := pg_get_functiondef('public.get_company_user_counts_v2()'::regprocedure);
  v_nuova := replace(v_def, 'WHERE m.deleted_at IS NULL',
    'WHERE m.deleted_at IS NULL AND (public.has_role(auth.uid(), ''super_admin''::public.app_role) OR public.admin_ha_uno_di(ARRAY[''can_manage_companies'']))');
  if v_nuova = v_def then raise exception 'get_company_user_counts_v2: testo non riconosciuto'; end if;
  execute v_nuova;

  -- ── 2. In azienda ──────────────────────────────────────────────────────────
  v_def := pg_get_functiondef('public.get_company_customers(uuid)'::regprocedure);
  v_nuova := replace(v_def, 'AND public.can_access_company_people(p_company_id)',
    'AND public.can_access_company_people(p_company_id) AND NOT public.e_solo_campo() AND NOT public.utente_e_cliente_esterno()');
  if v_nuova = v_def then raise exception 'get_company_customers: testo non riconosciuto'; end if;
  execute v_nuova;

  for f in
    select p.oid, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = any (array[
         'scan_customers_issues', 'get_cruscotto_invoice_stats', 'silvio_detect_frodi_anomalie',
         'silvio_tool_fotovoltaico_overview', 'silvio_tool_manutenzione_overview', 'silvio_tool_sdi_overview',
         'silvio_fattura_categorie_summary', 'get_whatsapp_metrics', 'get_customer_stats',
         'spazio_archiviazione', 'silvio_alerts_stats', 'brain_stats', 'silvio_compliance_status_export'
       ])
       and p.prosrc not like '%_solo_ufficio%'
  loop
    v_def := pg_get_functiondef(f.oid);
    v_nuova := regexp_replace(v_def, E'\\n\\s*BEGIN\\s*\\n', E'\nBEGIN\n  PERFORM public._solo_ufficio();\n', 'i');
    if v_nuova = v_def then raise exception 'Funzione % senza BEGIN riconoscibile', f.proname; end if;
    execute v_nuova;
  end loop;
end $mig$;

-- ── 3. File ─────────────────────────────────────────────────────────────────
create or replace function public.file_ordine_di_mia_commessa(p_nome text)
returns boolean language sql stable security definer set search_path = public, storage as $$
  select exists (
      select 1 from public.order_attachments oa
       where oa.file_url = p_nome
         and (public.puo_vedere_commessa(oa.order_id)
              or exists (select 1 from public.order_campo_assignments a where a.order_id = oa.order_id and a.user_id = auth.uid()))
    ) or exists (
      select 1 from public.order_campo_assignments a
       where a.user_id = auth.uid() and a.order_id::text = any (storage.foldername(p_nome))
    )
$$;
revoke all on function public.file_ordine_di_mia_commessa(text) from public, anon;
grant execute on function public.file_ordine_di_mia_commessa(text) to authenticated, service_role;

create or replace function public.azienda_del_percorso(p_nome text)
returns uuid language plpgsql immutable set search_path = public, storage as $$
declare
  v_prima text := (storage.foldername(p_nome))[1];
begin
  if v_prima ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return v_prima::uuid; end if;
  return null;
end $$;
grant execute on function public.azienda_del_percorso(text) to authenticated, service_role;

drop policy if exists permessi_file_uffici on storage.objects;
create policy permessi_file_uffici on storage.objects as restrictive for select to authenticated
  using (
    case bucket_id
      when 'fatture-xml' then public.puo_vedere_finanza(public.azienda_del_percorso(name))
      when 'documenti-fiscali' then not (select public.e_solo_campo()) and not (select public.utente_e_cliente_esterno())
      when 'computi' then not (select public.utente_e_cliente_esterno())
      when 'ddt_attachments' then not (select public.utente_e_cliente_esterno())
      when 'order-attachments' then not (select public.e_solo_campo()) or public.file_ordine_di_mia_commessa(name)
      else true
    end
  );

-- ── 4. Profili ──────────────────────────────────────────────────────────────
drop policy if exists permessi_profili_cantiere on public.profiles;
create policy permessi_profili_cantiere on public.profiles as restrictive for select to authenticated
  using (
    not (select public.e_solo_campo())
    or id = (select auth.uid())
    or not public.profilo_solo_cliente(id)
    or public.cliente_di_una_mia_commessa(id)
  );
