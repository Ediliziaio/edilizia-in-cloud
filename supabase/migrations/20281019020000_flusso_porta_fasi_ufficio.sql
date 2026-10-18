-- Il flusso applicato in automatico alla commessa nuova porta sul passo anche: se è d'ufficio, la sua
-- posizione nel flusso e la fase del cantiere da aspettare (per nome, «dopo_fase_lavorazione»).
-- Un passo che aspetta una fase del cantiere non ancora chiusa nasce «in attesa» senza scadenza;
-- lo sblocca il trigger sblocca_fasi_ufficio_da_cantiere (migrazione 20281019010000).
-- Il responsabile di una fase d'ufficio deve essere una persona d'ufficio dell'azienda: lo controlla
-- una funzione che non dipende da chi sta lavorando (prima dipendeva dai permessi del chiamante, e
-- un venditore che crea la commessa avrebbe fatto fallire il flusso automatico). Se il responsabile
-- proposto non va bene, il flusso automatico lascia la fase senza responsabile invece di bloccarsi.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.e_persona_ufficio(p_user uuid, p_company uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.profiles p join public.user_roles ur on ur.user_id = p.id
                  where p.id = p_user and p.company_id = p_company and not coalesce(p.is_blocked, false)
                    and ur.role in ('company_admin', 'company_staff', 'salesperson', 'call_center', 'employee', 'worker', 'subcontractor'))
      or exists (select 1 from public.user_roles ur where ur.user_id = p_user and ur.role = 'super_admin')
$$;
revoke all on function public.e_persona_ufficio(uuid, uuid) from public, anon;
grant execute on function public.e_persona_ufficio(uuid, uuid) to authenticated;

create or replace function public.validate_office_task()
returns trigger language plpgsql set search_path to 'public'
as $function$
begin
  if new.activity_scope = 'ufficio' then
    if new.order_id is not null and not exists(select 1 from public.orders where id = new.order_id and company_id = new.company_id) then
      raise exception 'Commessa non disponibile per questa azienda.' using errcode = '23514'; end if;
    if new.assigned_to is not null and not public.e_persona_ufficio(new.assigned_to, new.company_id) then
      raise exception 'Il responsabile di una fase d’ufficio deve essere una persona dell’azienda.' using errcode = '23514'; end if;
    if new.status = 'completata' and new.assigned_to is null and new.ufficio_id is null then
      raise exception 'Assegna un responsabile o un ufficio prima di completare la fase d’ufficio.' using errcode = '23514'; end if;
    if new.attende_fase_id is not null and not exists (
      select 1 from public.order_work_phases f where f.id = new.attende_fase_id and f.order_id = new.order_id
    ) then raise exception 'La fase del cantiere attesa non è di questa commessa.' using errcode = '23514'; end if;
  end if;
  return new;
end; $function$;

create or replace function public.applica_flusso_commessa(p_order_id uuid)
returns integer language plpgsql security definer set search_path to 'public'
as $function$
declare
  _o          record;
  _vertical   text;
  _creato_da  uuid;
  _oggi       date := (now() at time zone 'Europe/Rome')::date;
  _passo      record;
  _mappa      jsonb := '{}'::jsonb;
  _nuovo      uuid;
  _pred       uuid;
  _fase       uuid;
  _assegnato  uuid;
  _progresso  boolean;
  _forza      boolean := false;
  _giro       integer := 0;
  _creati     integer := 0;
begin
  select o.id, o.company_id, o.assigned_to, o.created_by, c.vertical
    into _o
    from public.orders o join public.companies c on c.id = o.company_id
   where o.id = p_order_id and o.deleted_at is null;
  if not found then return 0; end if;

  _vertical := case
    when _o.vertical in ('serramentista','fotovoltaico','tetti','bagno','ristrutturazione',
                         'tende_da_sole','vetrate','caldaie','clima','generico')
    then _o.vertical else 'generico' end;

  _creato_da := coalesce(
    _o.created_by,
    auth.uid(),
    (select ur.user_id from public.user_roles ur
       join public.profiles p on p.id = ur.user_id
      where p.company_id = _o.company_id and ur.role = 'company_admin'
      order by p.created_at limit 1));
  if _creato_da is null then return 0; end if;

  for _passo in
    select t.id, lower(trim(t.titolo)) as chiave
      from public.order_task_template t
     where t.company_id = _o.company_id and t.attivo
       and coalesce(t.ambito, 'commessa') = 'commessa' and t.vertical = _vertical
  loop
    select k.id into _nuovo
      from public.tasks k
     where k.order_id = p_order_id and lower(trim(k.title)) = _passo.chiave
     limit 1;
    if _nuovo is not null then
      _mappa := _mappa || jsonb_build_object(_passo.id::text, _nuovo);
    end if;
  end loop;

  loop
    _giro := _giro + 1;
    _progresso := false;
    for _passo in
      select t.*
        from public.order_task_template t
       where t.company_id = _o.company_id and t.attivo
         and coalesce(t.ambito, 'commessa') = 'commessa' and t.vertical = _vertical
         and not (_mappa ? t.id::text)
       order by t.sort_order
    loop
      if not _forza
         and _passo.dipende_da_id is not null
         and not (_mappa ? _passo.dipende_da_id::text) then
        continue;
      end if;

      _pred := case
        when _passo.dipende_da_id is not null and (_mappa ? _passo.dipende_da_id::text)
        then (_mappa ->> _passo.dipende_da_id::text)::uuid end;

      -- Fase del cantiere da aspettare (per nome), solo se il passo non aspetta già un'altra attività.
      _fase := null;
      if _pred is null and nullif(btrim(_passo.dopo_fase_lavorazione), '') is not null then
        select f.id into _fase from public.order_work_phases f
         where f.order_id = p_order_id and lower(trim(f.name)) = lower(trim(_passo.dopo_fase_lavorazione))
           and f.status <> 'completata'
         order by f.position limit 1;
      end if;

      _assegnato := case
        when _passo.assegna_a_ufficio_id is not null then
          (select u.responsabile_id from public.company_uffici u where u.id = _passo.assegna_a_ufficio_id)
        else coalesce(_passo.assegna_a_utente, _o.assigned_to, _creato_da) end;
      if coalesce(_passo.activity_scope, 'generale') = 'ufficio' and _assegnato is not null
         and not public.e_persona_ufficio(_assegnato, _o.company_id) then
        _assegnato := null;
      end if;

      insert into public.tasks (
        company_id, order_id, title, notes, status, due_date,
        bloccata_da_task_id, sblocco_giorni, priority, category,
        chiudi_su_evento, ufficio_id, assigned_to, created_by, fase_al_completamento_id,
        activity_scope, sort_order, attende_fase_id)
      values (
        _o.company_id, p_order_id, _passo.titolo, _passo.descrizione,
        case when _pred is null and _fase is null then 'da_fare' else 'in_attesa' end,
        case when _pred is null and _fase is null then _oggi + coalesce(_passo.giorni_offset, 0) end,
        _pred,
        case when _pred is not null or _fase is not null then coalesce(_passo.giorni_dopo_sblocco, 0) end,
        coalesce(_passo.priorita, 'normale'), 'ordini',
        _passo.chiudi_su_evento, _passo.assegna_a_ufficio_id, _assegnato, _creato_da,
        _passo.fase_raggiunta_id,
        coalesce(_passo.activity_scope, 'generale'), _passo.sort_order, _fase)
      returning id into _nuovo;

      _mappa := _mappa || jsonb_build_object(_passo.id::text, _nuovo);
      _creati := _creati + 1;
      _progresso := true;
    end loop;

    exit when _giro > 60;
    if not _progresso then
      exit when _forza or not exists (
        select 1 from public.order_task_template t
         where t.company_id = _o.company_id and t.attivo
           and coalesce(t.ambito, 'commessa') = 'commessa' and t.vertical = _vertical
           and not (_mappa ? t.id::text));
      _forza := true;
    end if;
  end loop;

  return _creati;
end;
$function$;
