-- WhatsApp fermo: l'azienda lo deve sapere lo stesso giorno, non dopo un mese (27/10/2026).
--
-- Il Bagno Group: dal 1° ottobre Meta ha respinto ogni messaggio ai lead con «problema di pagamento sull'account»
-- (codice 131042). 77 messaggi mai partiti in 26 giorni: i clienti non ricevevano niente, non rispondevano, e
-- l'assistente WhatsApp non ha più fissato un appuntamento. Il motivo stava scritto in
-- whatsapp_messages.delivery_error, che non guarda nessuno.
--
-- Questa funzione avvisa gli amministratori dell'azienda in campanella e restituisce le loro email, così
-- _shared/allarmeWhatsApp.ts manda anche l'email a loro e a noi. Una volta ogni 24 ore per azienda: a canale fermo
-- i messaggi respinti sono decine, e un avviso per messaggio sarebbe rumore.
-- Idempotente.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.avvisa_whatsapp_account_bloccato(
  p_company_id uuid,
  p_motivo text,
  p_cosa_fare text default null,
  p_codice integer default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_azienda text;
  v_quanti integer := 0;
  v_email text[];
begin
  if p_company_id is null or coalesce(trim(p_motivo), '') = '' then
    return jsonb_build_object('avvisato', false, 'motivo', 'parametri mancanti');
  end if;

  -- Già avvisati nelle ultime 24 ore: non si ripete.
  if exists (
    select 1 from public.notifications n
     where n.company_id = p_company_id
       and n.type = 'whatsapp_canale_fermo'
       and n.created_at > now() - interval '24 hours'
  ) then
    return jsonb_build_object('avvisato', false, 'motivo', 'già avvisato nelle ultime 24 ore');
  end if;

  select coalesce(nullif(trim(c.business_name), ''), c.name) into v_azienda
    from public.companies c where c.id = p_company_id;

  insert into public.notifications (company_id, user_id, type, title, body, entity_type, entity_id, action_url)
  select
    p_company_id,
    p.id,
    'whatsapp_canale_fermo',
    'WhatsApp fermo: i messaggi non partono',
    'Da WhatsApp non parte più nessun messaggio ai clienti: ' || p_motivo
      || '. Finché non si sistema, chi scrive non riceve risposta e l''assistente non può fissare appuntamenti.'
      || coalesce(' ' || p_cosa_fare, ''),
    'whatsapp',
    null,
    '/azienda/impostazioni/whatsapp'
  from public.profiles p
  where p.company_id = p_company_id
    and not coalesce(p.is_blocked, false)
    and exists (
      select 1 from public.user_roles ur
       where ur.user_id = p.id and ur.role = 'company_admin'::public.app_role
    );
  get diagnostics v_quanti = row_count;

  -- Le email degli stessi amministratori: le manda chi chiama (salta i crediti, è un guasto).
  select coalesce(array_agg(distinct lower(trim(p.email))), '{}')
    into v_email
    from public.profiles p
   where p.company_id = p_company_id
     and not coalesce(p.is_blocked, false)
     and p.email is not null
     and p.email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     and p.email not like '%@no-email.ediliziaincloud.local'
     and exists (
       select 1 from public.user_roles ur
        where ur.user_id = p.id and ur.role = 'company_admin'::public.app_role
     );

  return jsonb_build_object(
    'avvisato', true,
    'azienda', coalesce(v_azienda, 'azienda'),
    'campanelle', v_quanti,
    'email', to_jsonb(v_email),
    'codice', p_codice
  );
end;
$function$;

revoke all on function public.avvisa_whatsapp_account_bloccato(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.avvisa_whatsapp_account_bloccato(uuid, text, text, integer) to service_role;
