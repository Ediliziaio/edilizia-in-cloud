-- Manodopera e Mezzi: chi può fare da responsabile di una squadra (26/09/2026).
--
-- Il responsabile può essere uno della squadra o un'altra persona del
-- Personale (il geometra, il capocantiere dell'ufficio). Chi crea le squadre
-- ha il permesso «Operai», non quello del Personale: questa funzione gli dà
-- solo nome, mansione e se è operaio, delle persone attive dell'azienda.

create or replace function public.manodopera_persone(p_company_id uuid)
returns table (id uuid, nome text, cognome text, mansione text, colore_avatar text, operaio boolean, ha_accesso_app boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.has_permission_for_company(auth.uid(), 'can_edit_operai', p_company_id) then
    raise exception using errcode = '42501', message = 'Non hai il permesso di modificare le squadre.';
  end if;
  return query
  select h.id, h.nome, h.cognome, nullif(h.mansione, ''), h.colore_avatar, h.lavora_in_cantiere, h.user_id is not null
    from public.hr_profili h
   where h.company_id = p_company_id and coalesce(h.attivo, true)
   order by h.lavora_in_cantiere desc, h.cognome, h.nome;
end;
$$;
revoke all on function public.manodopera_persone(uuid) from public, anon;
grant execute on function public.manodopera_persone(uuid) to authenticated;
