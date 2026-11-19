-- Un'unica lettura per Personale e Manodopera, anche per gli operai senza login.
create function public.stati_app_operai(p_company_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'profilo_id', h.id, 'utente_id', p.id,
    'stato', case
      when h.user_id is null then 'mai_dato'
      when p.id is null or p.deleted_at is not null or u.id is null then 'revocato'
      when p.is_blocked or u.banned_until > now() then 'bloccato'
      else 'attivo' end,
    'ripristinabile', coalesce(p.is_blocked, false) and p.deleted_at is null and u.id is not null
      and not exists (select 1 from public.user_roles r where r.user_id=p.id and r.role in ('company_admin','super_admin'))
      and (u.banned_until is null or u.banned_until <= now() or exists (
        select 1 from private.blocchi_accesso_profilo b where b.user_id=p.id
        and u.banned_until = '9999-12-31 00:00:00+00'::timestamptz
        and (b.banned_until_precedente is null or b.banned_until_precedente <= now())
      ))
  )), '[]'::jsonb)
  from public.hr_profili h
  left join public.profiles p on p.id=h.user_id and p.company_id=h.company_id
  left join auth.users u on u.id=p.id
  where h.company_id=p_company_id and h.lavora_in_cantiere
    and (public.has_permission_for_company(auth.uid(),'can_view_operai',p_company_id)
      or public.has_permission_for_company(auth.uid(),'can_view_persone',p_company_id));
$$;
revoke all on function public.stati_app_operai(uuid) from public, anon;
grant execute on function public.stati_app_operai(uuid) to authenticated;
notify pgrst,'reload schema';
