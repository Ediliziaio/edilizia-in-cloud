-- Il mezzo preso al volo (24/11/2026, richiesta del founder).
--
-- In cantiere l'operaio vede solo i mezzi assegnati a lui o al cantiere (campo_mezzi_ammessi). Se prende dal deposito
-- la betoniera o il miniescavatore senza che l'ufficio l'abbia assegnato, non lo può segnare nel rapportino.
-- Ora: dal rapportino sceglie il mezzo dall'elenco dell'azienda; se è LIBERO (non assegnato a nessun cantiere né
-- persona) passa a questo cantiere, l'ufficio riceve un avviso e lo storico delle assegnazioni lo registra
-- (trg_mezzi_storico_assegnazione). Se è assegnato altrove non si sposta niente: lo dice e chi è in ufficio decide.
-- Solo i mezzi «singoli» (i materiali a quantità, come i ponteggi a mq, non si assegnano a un cantiere).

create or replace function public.campo_mezzi_azienda(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_company uuid;
begin
  select company_id into v_company from public.orders where id = p_order_id and deleted_at is null;
  if auth.uid() is null or v_company is null or not coalesce(public.campo_lavoro_su_commessa(p_order_id), false) then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', m.id, 'nome', m.nome, 'tipo', m.tipo, 'targa', m.targa,
             'libero', m.assegnato_order_id is null and m.assegnato_hr_profilo_id is null and m.su_mezzo_id is null,
             'dove', case
               when m.assegnato_order_id = p_order_id then 'questo_cantiere'
               when m.assegnato_order_id is not null then coalesce((select o.order_code from public.orders o where o.id = m.assegnato_order_id), 'altro cantiere')
               when m.assegnato_hr_profilo_id is not null then 'assegnato a una persona'
               when m.su_mezzo_id is not null then 'a bordo di un mezzo'
               else null end)
           order by m.nome)
      from public.mezzi m
     where m.company_id = v_company and m.deleted_at is null
       and coalesce(m.stato, 'in_servizio') = 'in_servizio'
       and coalesce(m.gestione, 'singola') = 'singola'
  ), '[]'::jsonb);
end;
$$;

create or replace function public.campo_mezzo_al_volo(p_order_id uuid, p_mezzo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_company uuid;
  v_codice text;
  v_m public.mezzi%rowtype;
  v_chi text;
begin
  select company_id, order_code into v_company, v_codice from public.orders where id = p_order_id and deleted_at is null;
  if auth.uid() is null or v_company is null or not coalesce(public.campo_lavoro_su_commessa(p_order_id), false) then
    raise exception 'Non lavori su questo cantiere' using errcode = '42501';
  end if;
  select * into v_m from public.mezzi
   where id = p_mezzo_id and company_id = v_company and deleted_at is null
   for update;
  if not found then raise exception 'Mezzo non trovato' using errcode = 'P0002'; end if;
  if v_m.assegnato_order_id = p_order_id then
    return jsonb_build_object('esito', 'gia_qui');
  end if;
  if coalesce(v_m.gestione, 'singola') <> 'singola' or coalesce(v_m.stato, 'in_servizio') <> 'in_servizio' then
    return jsonb_build_object('esito', 'non_disponibile');
  end if;
  if v_m.assegnato_order_id is not null or v_m.assegnato_hr_profilo_id is not null or v_m.su_mezzo_id is not null then
    return jsonb_build_object('esito', 'assegnato_altrove');
  end if;

  update public.mezzi set assegnato_order_id = p_order_id where id = v_m.id;

  select nullif(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '') into v_chi
    from public.profiles where id = auth.uid();
  insert into public.notifications (company_id, user_id, type, title, body, entity_type, entity_id, action_url)
  select v_company, destinatari.user_id, 'mezzo_al_volo',
         'Mezzo spostato in cantiere · ' || coalesce(v_codice, ''),
         left(coalesce(v_chi, 'Un operaio') || ' ha usato «' || v_m.nome || '» sul cantiere ' || coalesce(v_codice, '') || ': ora è assegnato lì.', 300),
         'mezzo', v_m.id, '/azienda/mezzi'
    from (
      select p.id as user_id
        from public.profiles p
        join public.user_roles ur on ur.user_id = p.id and ur.role = 'company_admin'
       where p.company_id = v_company
      union
      select sp.user_id from public.staff_permissions sp
       where sp.company_id = v_company and sp.can_edit_mezzi
    ) destinatari
   where destinatari.user_id <> auth.uid();

  return jsonb_build_object('esito', 'spostato');
end;
$$;

revoke all on function public.campo_mezzi_azienda(uuid) from public, anon;
revoke all on function public.campo_mezzo_al_volo(uuid, uuid) from public, anon;
grant execute on function public.campo_mezzi_azienda(uuid) to authenticated;
grant execute on function public.campo_mezzo_al_volo(uuid, uuid) to authenticated;
