-- Manodopera e Mezzi (26/09/2026): spostare un operaio da una squadra
-- all'altra dalla commessa, e mai accessi a cantieri per account di un'altra
-- azienda.
--
-- 1. squadra_accessi_voluti() dava l'accesso al cantiere a chiunque fosse
--    collegato alla scheda del Personale. Nella Demo Azienda 2 sette schede
--    erano rimaste collegate agli account della Demo Azienda 1 (la copia della
--    demo aveva portato gli user_id): la squadra ha così dato a due account
--    della Demo 1 l'accesso a cantieri della Demo 2. Ora conta solo chi ha
--    l'account nella stessa azienda (o vi ha un accesso multi-azienda attivo).
-- 2. Pulizia: tolti quegli accessi dati dalla squadra e, nella sola Demo 2
--    (vetrina), staccati dalle schede gli account della Demo 1.
-- 3. manodopera_sposta_operaio(scheda, squadra): sposta un operaio in un'altra
--    squadra (o lo toglie da tutte) e riallinea gli accessi ai cantieri delle
--    due squadre. Restituisce la squadra di prima, per «Annulla».

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.account_della_azienda(p_user_id uuid, p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles p where p.id = p_user_id and p.company_id = p_company_id)
      or exists (select 1 from public.multi_company_access m
                  where m.user_id = p_user_id and m.company_id = p_company_id and m.status = 'active'
                    and (m.expires_at is null or m.expires_at > now()))
$$;
revoke all on function public.account_della_azienda(uuid, uuid) from public, anon, authenticated;

create or replace function public.squadra_accessi_voluti(p_squadra_id uuid)
returns table (order_id uuid, user_id uuid, company_id uuid, dal date, al date, responsabile boolean, capocantiere boolean)
language sql
stable
security definer
set search_path = public
as $$
  select sc.order_id, h.user_id, sc.company_id, sc.dal, sc.al,
         (h.id = t.responsabile_hr_profilo_id), sc.capocantiere
    from public.squadre_commesse sc
    join public.external_teams t on t.id = sc.squadra_id and t.is_active
    join public.hr_profili h
      on h.company_id = sc.company_id
     and h.user_id is not null
     and coalesce(h.attivo, true)
     and (h.id = t.responsabile_hr_profilo_id
          or exists (select 1 from public.squadre_componenti c where c.squadra_id = t.id and c.hr_profilo_id = h.id))
   where sc.squadra_id = p_squadra_id
     and public.account_della_azienda(h.user_id, sc.company_id)
$$;
revoke all on function public.squadra_accessi_voluti(uuid) from public, anon, authenticated;

-- Pulizia degli accessi dati dalla squadra ad account di altre aziende.
delete from public.order_campo_assignments a
 where a.da_squadra_id is not null
   and not public.account_della_azienda(a.user_id, a.company_id);

-- Demo Azienda 2 (vetrina): le schede non puntano più agli account della Demo 1.
update public.employees e
   set user_id = null
 where e.company_id = 'd2000000-0000-4000-a000-000000000002'
   and e.user_id is not null
   and not public.account_della_azienda(e.user_id, e.company_id);
update public.hr_profili h
   set user_id = null, updated_at = now()
 where h.company_id = 'd2000000-0000-4000-a000-000000000002'
   and h.user_id is not null
   and not public.account_della_azienda(h.user_id, h.company_id);

create or replace function public.manodopera_sposta_operaio(p_profilo_id uuid, p_squadra_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_h public.hr_profili;
  v_prima uuid;
begin
  select * into v_h from public.hr_profili where id = p_profilo_id;
  if not found
     or not (public.has_permission_for_company(v_uid, 'can_edit_operai', v_h.company_id)
             or public.has_permission_for_company(v_uid, 'can_edit_orders', v_h.company_id)) then
    raise exception using errcode = '42501', message = 'Non puoi spostare questo operaio.';
  end if;
  if p_squadra_id is not null then
    perform 1 from public.external_teams t
     where t.id = p_squadra_id and t.company_id = v_h.company_id and t.kind = 'interna' and t.is_active;
    if not found then
      raise exception using errcode = '22023', message = 'Questa squadra non c''è più.';
    end if;
    if not v_h.lavora_in_cantiere then
      raise exception using errcode = '22023', message = 'Nelle squadre stanno gli operai: accendi «Lavora in cantiere» nella sua scheda.';
    end if;
  end if;

  select c.squadra_id into v_prima from public.squadre_componenti c where c.hr_profilo_id = p_profilo_id;
  if v_prima is not distinct from p_squadra_id then
    return v_prima;
  end if;

  delete from public.squadre_componenti where hr_profilo_id = p_profilo_id;
  if p_squadra_id is not null then
    insert into public.squadre_componenti (company_id, squadra_id, hr_profilo_id, created_by)
    values (v_h.company_id, p_squadra_id, p_profilo_id, v_uid);
  end if;

  perform public.squadra_allinea_accessi(v_prima);
  perform public.squadra_allinea_accessi(p_squadra_id);
  return v_prima;
end;
$$;
revoke all on function public.manodopera_sposta_operaio(uuid, uuid) from public, anon;
grant execute on function public.manodopera_sposta_operaio(uuid, uuid) to authenticated;
