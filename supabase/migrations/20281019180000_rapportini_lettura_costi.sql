-- Rapportini: li legge anche chi ha il permesso Costi (19/10/2026).
-- La pagina Costi → Personale si apre col permesso Costi e conta ore e costi dai rapportini:
-- con la policy del 19/10 chi aveva Costi ma non Commesse né Personale la vedeva a zero.
-- In più: se un contratto di subappalto cambia ditta, l'accesso al cantiere passa alla nuova.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

drop policy if exists cr_select on public.campo_rapportini;
create policy cr_select on public.campo_rapportini for select to authenticated
  using (
    user_id = (select auth.uid())
    or (company_id = (select public.get_my_company_id())
        and (
          -- ufficio: chi vede le commesse, per quelle che segue
          ((select coalesce(public.has_permission(auth.uid(), 'can_view_orders'), false))
           and case when (select public.ufficio_vede_tutte_le_commesse()) then true
                    else public.ufficio_vede_commessa(order_id) end)
          -- personale e costi: ore e costi delle persone
          or (select coalesce(public.has_permission(auth.uid(), 'can_view_persone'), false))
          or (select coalesce(public.has_permission(auth.uid(), 'can_view_costs'), false))
          -- capocantiere della commessa
          or exists (select 1 from public.order_campo_assignments oca
                      where oca.order_id = campo_rapportini.order_id
                        and oca.user_id = (select auth.uid()) and oca.is_capocantiere)))
  );

create or replace function public.contratto_subappalto_accesso_cantiere()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_user uuid;
begin
  -- Il contratto vecchio (non più attivo, spostato o passato a un'altra ditta) toglie l'accesso che aveva dato.
  if tg_op in ('UPDATE', 'DELETE') and old.order_id is not null then
    select s.user_id into v_user from public.subappaltatori_sicurezza ss
      join public.subappaltatori s on s.id = ss.campo_subappaltatore_id where ss.id = old.subappaltatore_id;
    if v_user is not null and (tg_op = 'DELETE' or new.stato is distinct from 'attivo'
                               or new.order_id is distinct from old.order_id
                               or new.subappaltatore_id is distinct from old.subappaltatore_id) then
      delete from public.order_campo_assignments
       where order_id = old.order_id and user_id = v_user and note = 'Dal contratto di subappalto';
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.stato = 'attivo' and new.order_id is not null then
    select s.user_id into v_user from public.subappaltatori_sicurezza ss
      join public.subappaltatori s on s.id = ss.campo_subappaltatore_id where ss.id = new.subappaltatore_id;
    if v_user is not null then
      insert into public.order_campo_assignments
        (company_id, order_id, user_id, role_type, data_inizio, data_fine_prevista, is_capocantiere, note)
      values (new.company_id, new.order_id, v_user, 'subcontractor', new.data_inizio, new.data_fine_prevista, false,
              'Dal contratto di subappalto')
      on conflict (order_id, user_id) do nothing;
    end if;
  end if;
  return coalesce(new, old);
end $$;
revoke all on function public.contratto_subappalto_accesso_cantiere() from public, anon, authenticated;
