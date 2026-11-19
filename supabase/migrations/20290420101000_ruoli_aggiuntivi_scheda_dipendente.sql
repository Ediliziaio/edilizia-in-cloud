-- Il ruolo Operaio deve avere la scheda operativa usata dalle assegnazioni.
-- Mantiene tutte le verifiche della funzione precedente e non modifica paghe o storico.
set local lock_timeout='3s';
set local statement_timeout='60s';

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
  v_dipendente uuid;
  v_schede integer;
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

    if p_ruolo = 'employee' then
      select e.id into v_dipendente from public.employees e
        where e.company_id=p_company_id and (e.user_id=p_user_id or e.portal_user_id=p_user_id)
        order by e.is_active desc,e.id limit 1 for update;
      if v_dipendente is null and nullif(btrim(v_email),'') is not null then
        select count(*),min(e.id::text)::uuid into v_schede,v_dipendente from public.employees e
          where e.company_id=p_company_id and e.user_id is null and e.portal_user_id is null
            and lower(btrim(e.email))=lower(btrim(v_email));
        if v_schede>1 then
          raise exception 'Ci sono più schede dipendente con questa email. Collega prima quella corretta dalla scheda Dipendenti.' using errcode='22023';
        end if;
      end if;
      if v_dipendente is not null then
        if exists(select 1 from public.employees where id=v_dipendente and not is_active) then
          raise exception 'La scheda dipendente è disattivata. Riattivala da Dipendenti prima di aggiungere il ruolo Operaio.' using errcode='22023';
        end if;
        update public.employees set user_id=p_user_id where id=v_dipendente and user_id is null;
      else
        insert into public.employees(company_id,first_name,last_name,email,user_id,role_type,area)
          values(p_company_id,coalesce(v_nome,''),coalesce(v_cognome,''),v_email,p_user_id,'operaio','cantiere');
      end if;
      -- La rimozione del ruolo revoca l'accesso Campo: non termina un rapporto
      -- di lavoro e non cancella stipendi, presenze o assegnazioni storiche.
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

revoke all on function public.imposta_ruolo_aggiuntivo(uuid,uuid,text,boolean,boolean) from public,anon;
grant execute on function public.imposta_ruolo_aggiuntivo(uuid,uuid,text,boolean,boolean) to authenticated;
notify pgrst,'reload schema';
