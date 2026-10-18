-- Foto e file del cantiere per commessa (18/10/2026): chi lavora solo in cantiere (ruolo employee o
-- subcontractor, nessun ruolo d'ufficio) vede, carica e corregge foto e file delle commesse su cui lavora:
--   · foto_cantiere: lettura, inserimento, modifica e cancellazione per commessa e per autore;
--   · storage foto-cantiere e campo-rapportini: si guarda anche la cartella della commessa; i clienti
--     leggono le foto dal loro portale;
--   · un ticket dal cantiere resta una segnalazione: la commessa non cambia fase;
--   · has_permission_for_company tiene conto del blocco dell'utente.
-- L'ufficio (company_admin, company_staff, venditori, call center, commercialista) resta com'era.
-- Solo funzioni e policy: nessuna riga scritta.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- Vero per chi entra solo nell'app cantiere. Chi ha anche un ruolo d'ufficio lavora dall'ufficio.
create or replace function public.campo_solo_cantiere()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.user_roles ur
                  where ur.user_id = auth.uid() and ur.role in ('employee', 'subcontractor'))
     and not exists (select 1 from public.user_roles ur
                      where ur.user_id = auth.uid() and ur.role not in ('employee', 'subcontractor', 'customer'))
$$;
revoke all on function public.campo_solo_cantiere() from public, anon;
grant execute on function public.campo_solo_cantiere() to authenticated;

-- Usata nelle policy qui sotto: risponde solo per l'utente collegato («lavoro su questa commessa?»).
revoke all on function public.campo_lavoro_su_commessa(uuid) from public, anon;
grant execute on function public.campo_lavoro_su_commessa(uuid) to authenticated;

-- Percorsi: <azienda>/<commessa>/... ; per i file senza commessa la seconda cartella è un nome
-- (generico, magazzino, senza-ordine) e il file lo vede chi l'ha caricato, oltre all'ufficio.
create or replace function public.campo_file_cantiere_visibile(p_name text, p_owner text)
returns boolean language plpgsql stable security definer set search_path = public
as $$
declare v_cartelle text[] := storage.foldername(p_name); v_company uuid; v_order uuid;
begin
  select p.company_id into v_company from public.profiles p where p.id = auth.uid();
  if v_company is null or v_cartelle[1] is distinct from v_company::text
     or public.utente_e_cliente_esterno() then return false; end if;
  if not public.campo_solo_cantiere() then return true; end if;
  if p_owner is not null and p_owner = auth.uid()::text then return true; end if;
  if v_cartelle[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_order := v_cartelle[2]::uuid;
    return exists (select 1 from public.orders o where o.id = v_order and o.company_id = v_company)
       and coalesce(public.campo_lavoro_su_commessa(v_order), false);
  end if;
  return false;
end $$;
revoke all on function public.campo_file_cantiere_visibile(text, text) from public, anon;
grant execute on function public.campo_file_cantiere_visibile(text, text) to authenticated;

-- Caricare: nella cartella di una commessa su cui si lavora, o in una cartella senza commessa.
create or replace function public.campo_file_cantiere_caricabile(p_name text)
returns boolean language plpgsql stable security definer set search_path = public
as $$
declare v_cartelle text[] := storage.foldername(p_name); v_company uuid; v_order uuid;
begin
  select p.company_id into v_company from public.profiles p where p.id = auth.uid();
  if v_company is null or v_cartelle[1] is distinct from v_company::text
     or public.utente_e_cliente_esterno() then return false; end if;
  if not public.campo_solo_cantiere() then return true; end if;
  if v_cartelle[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_order := v_cartelle[2]::uuid;
    return exists (select 1 from public.orders o where o.id = v_order and o.company_id = v_company)
       and coalesce(public.campo_lavoro_su_commessa(v_order), false);
  end if;
  return v_cartelle[2] is not null;
end $$;
revoke all on function public.campo_file_cantiere_caricabile(text) from public, anon;
grant execute on function public.campo_file_cantiere_caricabile(text) to authenticated;

drop policy if exists campo_rapportini_read on storage.objects;
create policy campo_rapportini_read on storage.objects for select to authenticated
  using (bucket_id = 'campo-rapportini' and public.campo_file_cantiere_visibile(name, owner_id));
drop policy if exists campo_rapportini_upload on storage.objects;
create policy campo_rapportini_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'campo-rapportini' and public.campo_file_cantiere_caricabile(name));

drop policy if exists foto_cantiere_storage_select on storage.objects;
create policy foto_cantiere_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'foto-cantiere' and public.campo_file_cantiere_visibile(name, owner_id));
drop policy if exists foto_cantiere_storage_insert on storage.objects;
create policy foto_cantiere_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'foto-cantiere' and public.campo_file_cantiere_caricabile(name));
-- Cancellare: l'ufficio, oppure l'operaio sul file che ha caricato lui.
drop policy if exists foto_cantiere_storage_delete on storage.objects;
create policy foto_cantiere_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'foto-cantiere' and public.campo_file_cantiere_visibile(name, owner_id)
         and (not public.campo_solo_cantiere() or owner_id = auth.uid()::text));

-- Tabella foto_cantiere: le policy del commercialista e del cliente restano come sono.
drop policy if exists foto_cantiere_company on public.foto_cantiere;
drop policy if exists foto_cantiere_azienda_select on public.foto_cantiere;
create policy foto_cantiere_azienda_select on public.foto_cantiere for select to authenticated
  using (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno())
         and (not (select public.campo_solo_cantiere()) or uploaded_by = (select auth.uid())
              or coalesce(public.campo_lavoro_su_commessa(order_id), false)));
drop policy if exists foto_cantiere_azienda_insert on public.foto_cantiere;
create policy foto_cantiere_azienda_insert on public.foto_cantiere for insert to authenticated
  with check (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno())
         and (not (select public.campo_solo_cantiere())
              or (uploaded_by = (select auth.uid())
                  and (order_id is null or coalesce(public.campo_lavoro_su_commessa(order_id), false)))));
drop policy if exists foto_cantiere_azienda_update on public.foto_cantiere;
create policy foto_cantiere_azienda_update on public.foto_cantiere for update to authenticated
  using (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno())
         and (not (select public.campo_solo_cantiere()) or uploaded_by = (select auth.uid())))
  with check (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno())
         and (not (select public.campo_solo_cantiere()) or uploaded_by = (select auth.uid())));
drop policy if exists foto_cantiere_azienda_delete on public.foto_cantiere;
create policy foto_cantiere_azienda_delete on public.foto_cantiere for delete to authenticated
  using (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno())
         and (not (select public.campo_solo_cantiere()) or uploaded_by = (select auth.uid())));

-- Ticket dal cantiere: una segnalazione dell'operaio non sposta la commessa in Assistenza
-- (quello resta per i ticket del cliente e dell'ufficio). E la commessa deve essere dell'azienda.
create or replace function public.auto_move_order_to_assistenza()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_support_status_id uuid;
  v_current_status_id uuid;
  v_order_company_id uuid;
  v_changed_by uuid;
begin
  if new.order_id is null or new.fonte = 'campo' then
    return new;
  end if;

  select company_id, current_status_id into v_order_company_id, v_current_status_id
  from public.orders where id = new.order_id;

  if v_order_company_id is null or v_order_company_id <> new.company_id then
    return new;
  end if;

  select id into v_support_status_id from public.order_statuses
  where company_id = v_order_company_id and is_support_phase = true limit 1;

  if v_support_status_id is null then
    raise notice 'Company % has no is_support_phase status, ticket % will not move order %',
      v_order_company_id, new.id, new.order_id;
    return new;
  end if;

  if v_current_status_id is not distinct from v_support_status_id then
    return new;
  end if;

  -- changed_by: auth.uid(), poi created_by, customer_id, assigned_to (tutti FK ad auth.users).
  v_changed_by := coalesce(auth.uid(), new.created_by, new.customer_id, new.assigned_to);

  update public.orders set current_status_id = v_support_status_id, updated_at = now()
  where id = new.order_id;

  if v_changed_by is not null then
    insert into public.order_status_history (order_id, status_id, changed_by, changed_at)
    values (new.order_id, v_support_status_id, v_changed_by, now());
  end if;

  return new;
end;
$function$;

drop policy if exists tickets_campo_insert on public.tickets;
create policy tickets_campo_insert on public.tickets for insert
  with check (((created_by = (select auth.uid())) or (customer_id = (select auth.uid())))
    and (company_id = (select public.get_my_company_id()))
    and (order_id is null or exists (select 1 from public.orders o
          where o.id = tickets.order_id and o.company_id = tickets.company_id)));

-- Un utente bloccato non ha permessi, da nessuna strada.
create or replace function public.has_permission_for_company(_user_id uuid, _permission text, _company_id uuid)
returns boolean language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  _has boolean;
begin
  if public.chiamante_anonimo() then return false; end if;

  if _user_id is null or _company_id is null then
    return false;
  end if;

  if exists (select 1 from public.profiles p where p.id = _user_id and coalesce(p.is_blocked, false)) then
    return false;
  end if;

  if has_role(_user_id, 'super_admin'::app_role) then
    return true;
  end if;

  if has_role(_user_id, 'company_admin'::app_role)
     and _company_id = get_user_company_id(_user_id) then
    return true;
  end if;

  if exists (
    select 1 from public.multi_company_access mca
    where mca.user_id = _user_id
      and mca.company_id = _company_id
      and mca.status = 'active'
      and (mca.expires_at is null or mca.expires_at > now())
      and mca.access_role::text = 'company_admin'
  ) then
    return true;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'staff_permissions'
      and column_name = _permission
  ) then
    return false;
  end if;

  begin
    execute format(
      'select %I from public.staff_permissions where user_id = $1 and company_id = $2 limit 1',
      _permission
    ) into _has using _user_id, _company_id;
  exception when others then
    return false;
  end;

  return coalesce(_has, false);
end;
$function$;
