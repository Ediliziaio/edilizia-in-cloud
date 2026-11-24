-- Chi è tecnico, per le liste «scegli il tecnico» del sopralluogo.
-- Piano: docs/piano-sopralluoghi-vendita-tecnico.md, lotto 1 (seguito).
--
-- Il tecnico si segna in Utenti e permessi con l'area «Tecnico» (staff_permissions.visible_areas),
-- ma quella tabella la legge solo chi gestisce le persone: chi fissa un sopralluogo non la vede, e
-- le liste mostravano tutti (in «Assegna sopralluogo» anche i clienti). Questa funzione dice solo
-- chi ha l'area, nell'azienda di chi chiede.

create or replace function public.tecnici_azienda(p_company uuid)
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $function$
  select sp.user_id
    from public.staff_permissions sp
    join public.profiles p on p.id = sp.user_id and p.company_id = sp.company_id
   where sp.company_id = p_company
     and 'tecnico' = any(sp.visible_areas)
     and auth.uid() is not null
     and not public.utente_bloccato()
     and not public.utente_e_cliente_esterno()
     and (p_company = public.get_my_company_id() or public.is_super_admin());
$function$;

revoke all on function public.tecnici_azienda(uuid) from public, anon;
grant execute on function public.tecnici_azienda(uuid) to authenticated, service_role;
