-- ════════════════════════════════════════════════════════════════════════════
-- Ruoli aggiuntivi per tutti: anche l'amministratore può essere Venditore,
-- Call Center, Operaio/Tecnico — e un cambio di ruolo non li cancella più
-- ════════════════════════════════════════════════════════════════════════════
--
-- PERCHÉ (21/09/2026)
-- Florin: «un amministratore può essere venditore, call center o altro, idem
-- per gli altri». Fino a oggi:
--   · la scheda offriva «Anche Venditore / Anche Call Center» solo a Utente,
--     Operaio e Subappaltatore: all'amministratore niente (Elena di Ener è
--     Amministratrice + Call Center solo perché lo si è fatto a mano);
--   · «Operaio / Tecnico» come ruolo aggiuntivo non esisteva;
--   · cambiare il ruolo principale cancellava TUTTI i ruoli: chi era Venditore
--     e anche Call Center, passato ad Amministratore, perdeva il call center.
--
-- COME SI LEGGONO I RUOLI (invariato, è quello che fa la scheda utente):
-- i ruoli sono un insieme in user_roles; il «principale» è il più alto in
-- questa classifica — Amministratore, Venditore, Call Center, Utente,
-- Operaio, Subappaltatore — e gli altri fra Venditore, Call Center e Operaio
-- sono «anche …». Il login usa già le due aree: chi ha un ruolo da ufficio
-- entra nel gestionale, e se è anche Operaio può passare all'Area Campo.
--
-- REGOLE NUOVE
--   · ruoli aggiuntivi: Venditore, Call Center, Operaio/Tecnico, per qualunque
--     ruolo principale tranne Subappaltatore (azienda esterna: resta com'è);
--   · il cambio del ruolo principale tiene gli aggiuntivi. Passare a
--     Subappaltatore li toglie;
--   · chi smette di essere Venditore esce anche dall'elenco dei venditori
--     (salespeople.is_active = false), come già faceva la spunta;
--   · la riga dei permessi creata da un cambio di ruolo non obbliga più a
--     cambiare password chi è già entrato almeno una volta.
--
-- Nessun dato cambia applicando questa migrazione: sostituisce due funzioni e
-- ne aggiunge una di servizio.

-- ── Il ruolo principale, letto come lo legge la scheda utente ──────────────
create or replace function public.ruolo_principale_utente(p_user_id uuid, p_company_id uuid)
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(
    -- Prima l'accesso per quell'azienda (utenti multi-azienda), …
    (select m.access_role
       from public.multi_company_access m
      where m.user_id = p_user_id and m.company_id = p_company_id
      limit 1),
    -- … poi i ruoli dell'utente, dal più alto.
    (select case
              when bool_or(r.role = 'company_admin') then 'company_admin'
              when bool_or(r.role = 'salesperson') then 'salesperson'
              when bool_or(r.role = 'call_center') then 'call_center'
              when bool_or(r.role = 'company_staff') then 'company_staff'
              when bool_or(r.role in ('employee', 'worker')) then 'employee'
              when bool_or(r.role = 'subcontractor') then 'subcontractor'
            end
       from public.user_roles r
      where r.user_id = p_user_id)
  );
$$;

comment on function public.ruolo_principale_utente(uuid, uuid) is
  'Ruolo principale di un utente in un''azienda, con la stessa classifica della scheda utente. Di servizio per cambia_ruolo_utente e imposta_ruolo_aggiuntivo.';

revoke all on function public.ruolo_principale_utente(uuid, uuid) from public, anon, authenticated;


-- ── Cambio del ruolo principale ─────────────────────────────────────────────
create or replace function public.cambia_ruolo_utente(
  p_user_id uuid,
  p_company_id uuid,
  p_ruolo text,
  p_impersonato boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chi uuid := auth.uid();
  v_super boolean;
  v_azienda_profilo uuid;
  v_nome text;
  v_cognome text;
  v_email text;
  v_multi_id uuid;
  v_via_multi boolean;
  v_prima text;
  v_titolare uuid;
  v_altri_admin integer;
  v_nome_completo text;
  v_tenuti text[] := '{}';
  v_nuovi text[];
begin
  if v_chi is null then
    raise exception 'Serve l''accesso per cambiare un ruolo.' using errcode = '42501';
  end if;
  if p_user_id is null or p_company_id is null then
    raise exception 'Utente o azienda mancanti.' using errcode = '22023';
  end if;
  if p_ruolo is null or p_ruolo not in ('company_admin', 'company_staff', 'salesperson', 'call_center', 'employee', 'subcontractor') then
    raise exception 'Ruolo non valido: %', coalesce(p_ruolo, '(vuoto)') using errcode = '22023';
  end if;

  if not public.can_manage_company_people(p_company_id) then
    raise exception 'Solo un amministratore dell''azienda può cambiare i ruoli.' using errcode = '42501';
  end if;
  v_super := public.has_role(v_chi, 'super_admin'::public.app_role);

  -- Un cambio alla volta sullo stesso utente: due clic ravvicinati non si
  -- intrecciano a metà.
  perform pg_advisory_xact_lock(hashtextextended('cambia_ruolo_utente:' || p_user_id::text, 0));

  select p.company_id, p.first_name, p.last_name, p.email
    into v_azienda_profilo, v_nome, v_cognome, v_email
    from public.profiles p
   where p.id = p_user_id;
  if not found then
    raise exception 'Utente non trovato.' using errcode = 'P0002';
  end if;

  select m.id into v_multi_id
    from public.multi_company_access m
   where m.user_id = p_user_id and m.company_id = p_company_id;

  v_via_multi := v_azienda_profilo is distinct from p_company_id;
  if v_via_multi and v_multi_id is null then
    raise exception 'Questo utente non fa parte di questa azienda.' using errcode = '42501';
  end if;

  v_prima := public.ruolo_principale_utente(p_user_id, p_company_id);

  if v_prima is not distinct from p_ruolo then
    return jsonb_build_object('ok', true, 'invariato', true, 'ruolo', p_ruolo);
  end if;

  -- Regole per chi smette di essere amministratore.
  if v_prima = 'company_admin' and p_ruolo <> 'company_admin' then
    if p_user_id = v_chi then
      raise exception 'Non puoi toglierti da solo il ruolo di Amministratore: chiedi a un altro amministratore.'
        using errcode = '42501';
    end if;

    -- Il titolare non si declassa, nemmeno dal super admin: prima si indica un
    -- altro titolare. Gli altri amministratori li cambia solo il titolare; il
    -- super admin sì, come nel trigger proteggi_titolare_azienda.
    select c.titolare_user_id into v_titolare from public.companies c where c.id = p_company_id;
    if v_titolare = p_user_id then
      raise exception 'Questo è il titolare dell''azienda: il suo ruolo di Amministratore non si può togliere. Indica prima un altro titolare.'
        using errcode = '42501';
    end if;
    if not v_super and v_titolare is not null and v_titolare <> v_chi then
      raise exception 'Il ruolo di un Amministratore lo può cambiare solo il titolare dell''azienda.'
        using errcode = '42501';
    end if;

    select count(*) into v_altri_admin
      from (
        select p.id
          from public.profiles p
         where p.company_id = p_company_id
           and p.id <> p_user_id
           and not coalesce(p.is_blocked, false)
           and exists (select 1 from public.user_roles r where r.user_id = p.id and r.role = 'company_admin')
        union
        select m.user_id
          from public.multi_company_access m
         where m.company_id = p_company_id
           and m.user_id <> p_user_id
           and m.access_role = 'company_admin'
           and m.status = 'active'
           and (m.expires_at is null or m.expires_at > now())
      ) altri;
    if v_altri_admin = 0 then
      raise exception 'È l''ultimo amministratore dell''azienda: nomina prima un altro amministratore.'
        using errcode = '42501';
    end if;
  end if;

  if v_via_multi then
    -- Utente di un'altra azienda con accesso qui: cambia solo quell'accesso,
    -- i suoi ruoli nell'azienda principale restano com'erano.
    update public.multi_company_access
       set access_role = p_ruolo, updated_at = now()
     where id = v_multi_id;
  else
    -- I ruoli aggiuntivi restano: quelli fra Venditore, Call Center e Operaio
    -- che non erano il principale e non lo diventano ora. Il Subappaltatore è
    -- un'azienda esterna e non ne porta.
    if p_ruolo <> 'subcontractor' then
      select coalesce(array_agg(distinct x), '{}') into v_tenuti
        from (
          select case when r.role::text = 'worker' then 'employee' else r.role::text end as x
            from public.user_roles r
           where r.user_id = p_user_id
             and r.role::text in ('salesperson', 'call_center', 'employee', 'worker')
        ) ruoli
       where x is distinct from v_prima and x <> p_ruolo;
    end if;

    -- Venditore e call center portano con sé anche company_staff, come sempre.
    v_nuovi := (case when p_ruolo in ('salesperson', 'call_center')
                     then array[p_ruolo, 'company_staff']
                     else array[p_ruolo] end) || v_tenuti;

    delete from public.user_roles r
     where r.user_id = p_user_id
       and r.role::text in ('company_admin', 'company_staff', 'salesperson', 'call_center', 'employee', 'worker', 'subcontractor')
       and not (r.role::text = any (v_nuovi));

    insert into public.user_roles (user_id, role)
    select p_user_id, x::public.app_role
      from unnest(v_nuovi) as x
    on conflict (user_id, role) do nothing;

    if v_multi_id is not null then
      update public.multi_company_access
         set access_role = p_ruolo, updated_at = now()
       where id = v_multi_id;
    end if;

    -- Chi non è più Venditore esce dall'elenco dei venditori (lo storico resta).
    if not ('salesperson' = any (v_nuovi)) then
      update public.salespeople
         set is_active = false, updated_at = now()
       where user_id = p_user_id and company_id = p_company_id and is_active;
    end if;
  end if;

  -- Chi non è amministratore lavora con i permessi della sua riga. Una riga
  -- nuova chiede di cambiare password solo a chi non è mai entrato.
  if p_ruolo <> 'company_admin' then
    insert into public.staff_permissions (user_id, company_id, must_change_password)
    values (p_user_id, p_company_id,
            not exists (select 1 from auth.users u where u.id = p_user_id and u.last_sign_in_at is not null))
    on conflict (user_id, company_id) do nothing;
  end if;

  if p_ruolo = 'salesperson' then
    update public.salespeople
       set is_active = true, updated_at = now()
     where user_id = p_user_id and company_id = p_company_id;
    if not found then
      insert into public.salespeople (user_id, company_id, first_name, last_name, email, is_active)
      values (p_user_id, p_company_id, coalesce(v_nome, ''), coalesce(v_cognome, ''), v_email, true);
    end if;
  end if;

  if p_ruolo = 'subcontractor'
     and not exists (select 1 from public.subappaltatori s where s.user_id = p_user_id and s.company_id = p_company_id) then
    v_nome_completo := coalesce(nullif(trim(coalesce(v_nome, '') || ' ' || coalesce(v_cognome, '')), ''), v_email, 'Utente');
    insert into public.subappaltatori (user_id, company_id, ragione_sociale, responsabile, email, user_email, is_active)
    values (p_user_id, p_company_id, v_nome_completo, v_nome_completo, v_email, v_email, true);
  end if;

  insert into public.user_audit_log (company_id, actor_id, target_user_id, action, details, is_impersonated)
  values (p_company_id, v_chi, p_user_id, 'role_changed',
          jsonb_build_object('from', v_prima, 'to', p_ruolo, 'multiCompanyAccess', v_via_multi,
                             'aggiuntiviTenuti', to_jsonb(v_tenuti)),
          coalesce(p_impersonato, false));

  return jsonb_build_object('ok', true, 'da', v_prima, 'a', p_ruolo, 'aggiuntivi', to_jsonb(v_tenuti));
end;
$$;

comment on function public.cambia_ruolo_utente(uuid, uuid, text, boolean) is
  'Cambia il ruolo principale di un utente in un''azienda, in una transazione, tenendo i ruoli aggiuntivi. Chi: can_manage_company_people. Scheda utente → Ruoli & Autorizzazioni.';

revoke all on function public.cambia_ruolo_utente(uuid, uuid, text, boolean) from public, anon;
grant execute on function public.cambia_ruolo_utente(uuid, uuid, text, boolean) to authenticated;


-- ── Ruoli aggiuntivi: «Anche Venditore», «Anche Call Center», «Anche Operaio» ─
-- I ruoli di user_roles valgono per l'utente, non per un'azienda: per questo
-- un amministratore li cambia solo agli utenti della sua azienda principale.
-- Per chi entra con l'accesso multi-azienda li cambia solo il super admin.
create or replace function public.imposta_ruolo_aggiuntivo(
  p_user_id uuid,
  p_company_id uuid,
  p_ruolo text,
  p_attivo boolean,
  p_impersonato boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chi uuid := auth.uid();
  v_azienda_profilo uuid;
  v_nome text;
  v_cognome text;
  v_email text;
  v_principale text;
begin
  if v_chi is null then
    raise exception 'Serve l''accesso per cambiare un ruolo.' using errcode = '42501';
  end if;
  if p_user_id is null or p_company_id is null or p_attivo is null then
    raise exception 'Utente, azienda o scelta mancanti.' using errcode = '22023';
  end if;
  if p_ruolo is null or p_ruolo not in ('salesperson', 'call_center', 'employee') then
    raise exception 'Ruolo aggiuntivo non valido: %', coalesce(p_ruolo, '(vuoto)') using errcode = '22023';
  end if;
  if not public.can_manage_company_people(p_company_id) then
    raise exception 'Solo un amministratore dell''azienda può cambiare i ruoli.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('cambia_ruolo_utente:' || p_user_id::text, 0));

  select p.company_id, p.first_name, p.last_name, p.email
    into v_azienda_profilo, v_nome, v_cognome, v_email
    from public.profiles p
   where p.id = p_user_id;
  if not found then
    raise exception 'Utente non trovato.' using errcode = 'P0002';
  end if;
  if v_azienda_profilo is distinct from p_company_id
     and not public.has_role(v_chi, 'super_admin'::public.app_role) then
    raise exception 'I ruoli aggiuntivi si cambiano nell''azienda principale dell''utente.' using errcode = '42501';
  end if;

  v_principale := public.ruolo_principale_utente(p_user_id, p_company_id);
  if v_principale = 'subcontractor' then
    raise exception 'Un subappaltatore non ha ruoli aggiuntivi: se lavora anche per l''azienda, cambia prima il suo ruolo.'
      using errcode = '22023';
  end if;
  if v_principale = p_ruolo then
    if p_attivo then
      return jsonb_build_object('ok', true, 'invariato', true, 'ruolo', p_ruolo, 'attivo', true);
    end if;
    raise exception 'È il suo ruolo principale: per toglierlo scegli un altro ruolo in «Ruolo utente».'
      using errcode = '22023';
  end if;

  if p_attivo then
    insert into public.user_roles (user_id, role)
    values (p_user_id, p_ruolo::public.app_role)
    on conflict (user_id, role) do nothing;

    -- Chi non è amministratore lavora con i permessi della sua riga: se non ce
    -- l'ha (es. un operaio che diventa anche venditore) la si crea vuota. Una
    -- riga nuova chiede di cambiare password solo a chi non è mai entrato.
    if v_principale is distinct from 'company_admin' then
      insert into public.staff_permissions (user_id, company_id, must_change_password)
      values (p_user_id, p_company_id,
              not exists (select 1 from auth.users u where u.id = p_user_id and u.last_sign_in_at is not null))
      on conflict (user_id, company_id) do nothing;
    end if;

    if p_ruolo = 'salesperson' then
      update public.salespeople
         set is_active = true, updated_at = now()
       where user_id = p_user_id and company_id = p_company_id;
      if not found then
        insert into public.salespeople (user_id, company_id, first_name, last_name, email, is_active)
        values (p_user_id, p_company_id, coalesce(v_nome, ''), coalesce(v_cognome, ''), v_email, true);
      end if;
    end if;
  else
    delete from public.user_roles r
     where r.user_id = p_user_id
       and r.role::text in (p_ruolo, case when p_ruolo = 'employee' then 'worker' end);

    if p_ruolo = 'salesperson' then
      update public.salespeople
         set is_active = false, updated_at = now()
       where user_id = p_user_id and company_id = p_company_id;
    end if;
  end if;

  insert into public.user_audit_log (company_id, actor_id, target_user_id, action, details, is_impersonated)
  values (p_company_id, v_chi, p_user_id, 'additional_role_changed',
          jsonb_build_object('role', p_ruolo, 'active', p_attivo),
          coalesce(p_impersonato, false));

  return jsonb_build_object('ok', true, 'ruolo', p_ruolo, 'attivo', p_attivo);
end;
$$;

comment on function public.imposta_ruolo_aggiuntivo(uuid, uuid, text, boolean, boolean) is
  'Aggiunge o toglie Venditore / Call Center / Operaio come ruolo aggiuntivo, per qualunque ruolo principale tranne Subappaltatore. Chi: can_manage_company_people.';

revoke all on function public.imposta_ruolo_aggiuntivo(uuid, uuid, text, boolean, boolean) from public, anon;
grant execute on function public.imposta_ruolo_aggiuntivo(uuid, uuid, text, boolean, boolean) to authenticated;
