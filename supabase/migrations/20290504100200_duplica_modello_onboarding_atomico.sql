create function public.duplica_modello_onboarding(
  p_origine uuid,
  p_nome text,
  p_descrizione text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_copia uuid;
begin
  if not coalesce(public.has_role(auth.uid(), 'super_admin'::public.app_role), false) then
    raise exception 'Operazione riservata agli amministratori di piattaforma' using errcode = '42501';
  end if;
  if nullif(btrim(p_nome), '') is null then
    raise exception 'Inserisci il nome del modello' using errcode = '22023';
  end if;

  perform 1 from public.onboarding_templates where id = p_origine for key share;
  if not found then
    raise exception 'Il modello di origine non è più disponibile' using errcode = 'P0002';
  end if;

  insert into public.onboarding_templates (name, description, is_default, created_by)
  values (btrim(p_nome), p_descrizione, false, auth.uid())
  returning id into v_copia;

  insert into public.onboarding_steps (
    template_id, title, description, sort_order, is_required, auto_check_key, action_label, action_url
  )
  select v_copia, title, description, sort_order, is_required, auto_check_key, action_label, action_url
  from public.onboarding_steps
  where template_id = p_origine;

  return v_copia;
end;
$$;

revoke execute on function public.duplica_modello_onboarding(uuid, text, text) from public, anon;
grant execute on function public.duplica_modello_onboarding(uuid, text, text) to authenticated;
