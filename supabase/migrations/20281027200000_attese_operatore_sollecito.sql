-- Chi chiede una persona non deve aspettare un mese (27/10/2026).
--
-- Il Bagno Group: Raffaela Campitiello scrive «se può mi chiami pure adesso», poi «devo parlare con qualcuno».
-- L'assistente fa la cosa giusta — passa la scheda in «Intervento operatore» e avvisa in campanella — ma nessuno
-- la richiama: 28 giorni. Con lei altre quattro persone, la più vecchia ferma da 43 giorni. La campanella da sola
-- non basta: se nessuno guarda l'app, il lead muore lì.
--
-- Questa funzione elenca chi aspetta un operatore da più di qualche ora e non ha ancora ricevuto risposta. La fase
-- è quella scelta dall'azienda nell'agente WhatsApp (tools_config.lead_whatsapp.fase_operatore_id): si guarda il
-- CRM, non la pausa del bot, perché un bot in pausa può essere una scelta (BeMade ne ha decine, volute).
-- Idempotente.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.attese_operatore_da_sollecitare(
  p_company_id uuid default null,
  p_ore integer default 4
)
returns table (company_id uuid, azienda text, quante integer, persone jsonb, email text[])
language sql
security definer
set search_path to 'public'
as $function$
  with agenti as (
    select a.company_id, (a.tools_config->'lead_whatsapp'->>'fase_operatore_id')::uuid fase
      from ai_agents_v2 a
     where a.tools_config->'lead_whatsapp'->>'fase_operatore_id' is not null
       and (p_company_id is null or a.company_id = p_company_id)
  ),
  attese as (
    select o.company_id,
           coalesce(nullif(trim(c.first_name || ' ' || coalesce(c.last_name, '')), ''), c.company_name, 'Contatto') chi,
           c.phone,
           o.stage_changed_at,
           (current_date - o.stage_changed_at::date) giorni
      from marketing_opportunities o
      join agenti ag on ag.company_id = o.company_id and o.stage_id = ag.fase
      join marketing_contacts c on c.id = o.contact_id
     where o.deleted_at is null
       and o.stage_changed_at < now() - make_interval(hours => greatest(1, coalesce(p_ore, 4)))
       -- Nessuno ha ancora scritto al cliente dopo il passaggio: se hanno risposto, non è più in attesa.
       and not exists (
         select 1 from whatsapp_messages m
          where m.company_id = o.company_id and m.contact_id = o.contact_id
            and m.direction = 'outbound' and m.created_at > o.stage_changed_at
       )
  )
  select a.company_id,
         coalesce(nullif(trim(co.business_name), ''), co.name) azienda,
         count(*)::integer quante,
         jsonb_agg(jsonb_build_object('chi', a.chi, 'telefono', a.phone, 'giorni', a.giorni)
                   order by a.stage_changed_at) persone,
         coalesce((
           select array_agg(distinct lower(trim(p.email)))
             from profiles p
            where p.company_id = a.company_id
              and not coalesce(p.is_blocked, false)
              and p.email is not null
              and p.email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
              and p.email not like '%@no-email.ediliziaincloud.local'
              and exists (select 1 from user_roles ur where ur.user_id = p.id and ur.role = 'company_admin'::public.app_role)
         ), '{}') email
    from attese a
    join companies co on co.id = a.company_id
   group by a.company_id, co.business_name, co.name;
$function$;

revoke all on function public.attese_operatore_da_sollecitare(uuid, integer) from public, anon;
grant execute on function public.attese_operatore_da_sollecitare(uuid, integer) to service_role;

-- La campanella a chi amministra l'azienda, una volta al giorno (l'email la manda la edge function).
create or replace function public.avvisa_attese_operatore(p_company_id uuid, p_quante integer, p_piu_vecchia integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_quanti integer := 0;
begin
  if p_company_id is null or coalesce(p_quante, 0) < 1 then
    return jsonb_build_object('avvisato', false);
  end if;
  if exists (
    select 1 from notifications n
     where n.company_id = p_company_id and n.type = 'attesa_operatore'
       and n.created_at > now() - interval '24 hours'
  ) then
    return jsonb_build_object('avvisato', false, 'motivo', 'già avvisato nelle ultime 24 ore');
  end if;

  insert into notifications (company_id, user_id, type, title, body, entity_type, entity_id, action_url)
  select p_company_id, p.id, 'attesa_operatore',
    case when p_quante = 1 then 'Una persona aspetta di essere richiamata'
         else p_quante || ' persone aspettano di essere richiamate' end,
    'Hanno chiesto di parlare con qualcuno e l''assistente ha passato la conversazione'
      || case when coalesce(p_piu_vecchia,0) > 0 then '. La più vecchia aspetta da ' || p_piu_vecchia || ' giorni' else '' end
      || '. Finché nessuno le richiama restano ferme.',
    'opportunita', null, '/azienda/marketing/opportunita'
  from profiles p
  where p.company_id = p_company_id and not coalesce(p.is_blocked, false)
    and exists (select 1 from user_roles ur where ur.user_id = p.id and ur.role = 'company_admin'::public.app_role);
  get diagnostics v_quanti = row_count;
  return jsonb_build_object('avvisato', v_quanti > 0, 'campanelle', v_quanti);
end;
$function$;

revoke all on function public.avvisa_attese_operatore(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.avvisa_attese_operatore(uuid, integer, integer) to service_role;
