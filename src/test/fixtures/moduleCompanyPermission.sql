-- Definizione del controllo permessi effettivamente presente nel database, verificata il 15/10/2026.
CREATE OR REPLACE FUNCTION public.has_permission_for_company(_user_id uuid, _permission text, _company_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  _has boolean;
begin
  if public.chiamante_anonimo() then return false; end if;

  if _user_id is null or _company_id is null then
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
$function$

;
