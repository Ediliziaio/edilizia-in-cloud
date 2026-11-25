-- Azioni del superadmin sulle aziende, lato server (25/11/2026).
--
-- Sospendere/riattivare un'azienda, prorogarne la prova e regalarle un piano si
-- facevano dal browser (useCompanyDetail, CompanySubscriptionTab): un UPDATE su
-- companies protetto solo dalle regole sulle righe, e i registri
-- (subscription_logs, admin_audit_log) scritti a parte dal client, «best effort».
-- Qui diventano tre funzioni che fanno tutto in una transazione, con il
-- controllo del permesso dentro: le usano la pagina e l'assistente AI collegato
-- all'area superadmin (platform-mcp, attraverso mcp_superadmin_chiama).
--
-- In più mcp_superadmin_chiama: il ponte con cui il server MCP, che lavora col
-- service role, esegue le funzioni admin_* «come» il superadmin che ha dato il
-- consenso (auth.uid() = lui), invece di ricopiarne la logica. Solo service role.
--
-- Idempotente.

-- ── 1. Stato dell'azienda ───────────────────────────────────────────────────
create or replace function public.admin_azienda_cambia_stato(p_company_id uuid, p_stato text, p_note text default null)
returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v_uid uuid := auth.uid(); v_prima text; v_nome text;
begin
  if not public.admin_ha_uno_di(array['can_manage_companies']) or not public.admin_azienda_consentita(p_company_id) then
    raise exception 'Permesso negato: non puoi gestire questa azienda' using errcode = '42501';
  end if;
  if p_stato is null or p_stato not in ('trial', 'active', 'suspended', 'expired', 'free') then
    raise exception 'Stato non valido: usa active, suspended, trial, expired o free';
  end if;
  select status, name into v_prima, v_nome from public.companies
   where id = p_company_id and deleted_at is null for update;
  if not found then raise exception 'Azienda non trovata'; end if;
  if v_prima = p_stato then
    return jsonb_build_object('ok', true, 'azienda', v_nome, 'stato', p_stato, 'cambiato', false);
  end if;

  update public.companies set status = p_stato where id = p_company_id;
  insert into public.subscription_logs (company_id, event_type, old_status, new_status, notes, performed_by)
  values (p_company_id,
          case p_stato when 'active' then 'activated' when 'suspended' then 'suspended' else 'status_change' end,
          v_prima, p_stato, nullif(btrim(p_note), ''), v_uid);
  insert into public.admin_audit_log (user_id, action, target_type, target_id, details)
  values (v_uid,
          case p_stato when 'suspended' then 'suspend_company' when 'active' then 'reactivate_company' else 'status_change' end,
          'company', p_company_id::text,
          jsonb_build_object('company_name', v_nome, 'old_status', v_prima, 'new_status', p_stato, 'notes', nullif(btrim(p_note), '')));
  return jsonb_build_object('ok', true, 'azienda', v_nome, 'stato_prima', v_prima, 'stato', p_stato, 'cambiato', true);
end $$;

revoke all on function public.admin_azienda_cambia_stato(uuid, text, text) from public, anon;
grant execute on function public.admin_azienda_cambia_stato(uuid, text, text) to authenticated;

-- ── 2. Proroga della prova ──────────────────────────────────────────────────
-- Base = il più tardi fra oggi e la scadenza attuale: prorogare una prova scaduta
-- da tempo non deve dare una scadenza ancora nel passato.
create or replace function public.admin_azienda_proroga_prova(p_company_id uuid, p_giorni integer)
returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v_uid uuid := auth.uid(); v_prima text; v_nome text; v_fine timestamptz; v_nuova timestamptz;
begin
  if not public.admin_ha_uno_di(array['can_manage_companies']) or not public.admin_azienda_consentita(p_company_id) then
    raise exception 'Permesso negato: non puoi gestire questa azienda' using errcode = '42501';
  end if;
  if p_giorni is null or p_giorni < 1 or p_giorni > 365 then
    raise exception 'Giorni di proroga fra 1 e 365';
  end if;
  select status, name, trial_ends_at into v_prima, v_nome, v_fine from public.companies
   where id = p_company_id and deleted_at is null for update;
  if not found then raise exception 'Azienda non trovata'; end if;

  v_nuova := greatest(coalesce(v_fine, now()), now()) + make_interval(days => p_giorni);
  update public.companies set trial_ends_at = v_nuova, status = 'trial' where id = p_company_id;
  insert into public.subscription_logs (company_id, event_type, old_status, new_status, notes, performed_by)
  values (p_company_id, 'trial_extended', v_prima, 'trial', format('Trial esteso di %s giorni', p_giorni), v_uid);
  insert into public.admin_audit_log (user_id, action, target_type, target_id, details)
  values (v_uid, 'extend_trial', 'company', p_company_id::text,
          jsonb_build_object('company_name', v_nome, 'days', p_giorni, 'new_end', v_nuova));
  return jsonb_build_object('ok', true, 'azienda', v_nome, 'prova_fino_al', v_nuova, 'giorni', p_giorni);
end $$;

revoke all on function public.admin_azienda_proroga_prova(uuid, integer) from public, anon;
grant execute on function public.admin_azienda_proroga_prova(uuid, integer) to authenticated;

-- ── 3. Piano regalato ───────────────────────────────────────────────────────
-- Piano assegnato, pagamento «comped» (fuori dal MRR), azienda attiva, motivo e
-- scadenza nelle note. Niente Stripe: un'azienda regalata non ha abbonamento.
create or replace function public.admin_regala_piano(p_company_id uuid, p_plan_id uuid, p_motivo text, p_scadenza date default null)
returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v_uid uuid := auth.uid(); v_nome text; v_piano_prima uuid; v_piano text; v_email text; v_note text;
begin
  if not public.admin_ha_uno_di(array['can_manage_companies']) or not public.admin_azienda_consentita(p_company_id) then
    raise exception 'Permesso negato: non puoi gestire questa azienda' using errcode = '42501';
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then raise exception 'Motivo obbligatorio'; end if;
  select name into v_piano from public.subscription_plans where id = p_plan_id and is_active;
  if not found then raise exception 'Piano non trovato o non attivo'; end if;
  select name, subscription_plan_id into v_nome, v_piano_prima from public.companies
   where id = p_company_id and deleted_at is null for update;
  if not found then raise exception 'Azienda non trovata'; end if;
  select email into v_email from auth.users where id = v_uid;

  v_note := concat_ws(E'\n',
    'Regalato il ' || to_char(now() at time zone 'Europe/Rome', 'DD/MM/YYYY HH24:MI'),
    'Piano: ' || v_piano,
    'Motivo: ' || btrim(p_motivo),
    case when p_scadenza is not null then 'Scadenza regalo: ' || to_char(p_scadenza, 'DD/MM/YYYY') end,
    case when v_email is not null then 'Operatore: ' || v_email end);

  update public.companies
     set subscription_plan_id = p_plan_id, payment_method = 'comped', payment_notes = v_note, status = 'active'
   where id = p_company_id;
  insert into public.subscription_logs (company_id, event_type, plan_id, previous_plan_id, new_status, performed_by, notes)
  values (p_company_id, 'plan_changed', p_plan_id, v_piano_prima, 'active', v_uid,
          'Piano regalato (comped). Motivo: ' || btrim(p_motivo)
            || coalesce(' · Scadenza: ' || p_scadenza::text, ''));
  insert into public.admin_audit_log (user_id, action, target_type, target_id, details)
  values (v_uid, 'gift_plan', 'company', p_company_id::text,
          jsonb_build_object('company_name', v_nome, 'plan', v_piano, 'reason', btrim(p_motivo), 'expires', p_scadenza));
  return jsonb_build_object('ok', true, 'azienda', v_nome, 'piano', v_piano, 'scadenza', p_scadenza);
end $$;

revoke all on function public.admin_regala_piano(uuid, uuid, text, date) from public, anon;
grant execute on function public.admin_regala_piano(uuid, uuid, text, date) to authenticated;

-- ── 4. Il ponte per il server MCP ───────────────────────────────────────────
-- Esegue una delle funzioni admin_* elencate qui sotto con auth.uid() = p_actor,
-- dentro la transazione della chiamata. L'elenco è chiuso: niente nomi dal client.
create or replace function public.mcp_superadmin_chiama(p_actor uuid, p_cosa text, p_param jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v jsonb; p jsonb := coalesce(p_param, '{}'::jsonb);
  -- Le impostazioni della richiesta si rimettono com'erano: chiamante_anonimo()
  -- legge request.jwt.claims come JSON, e una stringa vuota lo farebbe fallire.
  v_claims text := coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}');
  v_sub text := coalesce(current_setting('request.jwt.claim.sub', true), '');
begin
  if p_actor is null or not public.has_role(p_actor, 'super_admin'::public.app_role) then
    raise exception 'Solo il super admin' using errcode = '42501';
  end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_actor, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_actor::text, true);

  case p_cosa
    when 'home_soldi' then v := public.admin_home_soldi();
    when 'home_aziende' then v := public.admin_home_aziende();
    when 'home_outreach' then v := public.admin_home_outreach();
    when 'salute' then v := public.admin_platform_health();
    when 'errori' then
      select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb) into v
        from public.admin_errori_raggruppati(coalesce((p->>'ore')::int, 48), null, coalesce((p->>'limite')::int, 30)) e;
    when 'audit' then
      select coalesce(jsonb_agg(jsonb_build_object(
          'quando', a.avvenuto_il, 'chi', a.attore_email, 'ruolo', a.attore_ruolo, 'azienda', a.azienda_nome,
          'azione', a.azione, 'oggetto', a.oggetto_tipo, 'campi', a.campi_modificati, 'note', a.note,
          'impersonando', a.in_impersonation)), '[]'::jsonb) into v
        from public.admin_audit_search(
          (p->>'dal')::timestamptz, (p->>'al')::timestamptz, (p->>'company_id')::uuid, null,
          nullif(p->>'cerca', ''), false, least(coalesce((p->>'limite')::int, 30), 100), 0) a;
    when 'cambia_stato' then
      v := public.admin_azienda_cambia_stato((p->>'company_id')::uuid, p->>'stato', p->>'note');
    when 'proroga_prova' then
      v := public.admin_azienda_proroga_prova((p->>'company_id')::uuid, (p->>'giorni')::int);
    when 'regala_piano' then
      v := public.admin_regala_piano((p->>'company_id')::uuid, (p->>'plan_id')::uuid, p->>'motivo', (p->>'scadenza')::date);
    else
      raise exception 'Operazione non prevista: %', p_cosa;
  end case;

  perform set_config('request.jwt.claims', v_claims, true);
  perform set_config('request.jwt.claim.sub', v_sub, true);
  return v;
end $$;

revoke all on function public.mcp_superadmin_chiama(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.mcp_superadmin_chiama(uuid, text, jsonb) to service_role;
