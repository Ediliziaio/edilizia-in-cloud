-- Conversazioni: da quale numero / indirizzo è partito (o arrivato) ogni messaggio.
--
-- La timeline mostrava solo «WhatsApp» o «Email»: con più numeri collegati e
-- caselle diverse non si capiva da dove fosse partita un'email né a quale numero
-- il cliente avesse risposto. Questa funzione dà, per i messaggi di un contatto,
-- mittente e destinatario veri e il canale usato (numero WhatsApp Business,
-- casella collegata o indirizzo della piattaforma). La timeline resta com'è
-- (vista v_conversazioni_messaggi): l'app unisce le due risposte per ref_id.

create or replace function public.conversazione_dettagli_invio(p_entita_tipo text, p_entita_id uuid)
returns table(ref_tabella text, ref_id uuid, da text, a text, via text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_email text;
  v_tail text;
  v_piattaforma text;
begin
  if p_entita_tipo is distinct from 'contatto' then
    return;
  end if;

  select c.company_id, lower(nullif(btrim(c.email), '')),
         right(regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g'), 9)
    into v_company, v_email, v_tail
    from public.marketing_contacts c
   where c.id = p_entita_id;

  if v_company is null or public.conversazioni_puo_accedere(v_company) is not true then
    raise exception 'Accesso negato alla conversazione' using errcode = '42501';
  end if;

  -- Indirizzo della piattaforma, per le email che non partono da una casella collegata.
  select d.from_email into v_piattaforma
    from public.company_email_domains d
   where d.company_id = v_company and d.is_active is true and d.from_email is not null
   order by d.created_at
   limit 1;

  return query
  (
    -- WhatsApp ufficiale: il numero aziendale è quello del numero collegato, non l'id tecnico.
    select 'whatsapp_messages'::text, w.id,
           case when w.direction = 'inbound' then w.from_phone
                else coalesce(n.numero, w.from_phone) end,
           case when w.direction = 'inbound' then coalesce(n.numero, w.to_phone)
                else w.to_phone end,
           nullif(btrim(coalesce(n.display_name, n.nome_account, '')), '')
      from public.whatsapp_messages w
      left join public.ai_whatsapp_numbers n on n.id = w.wa_number_id
     where w.company_id = v_company
       and (w.contact_id = p_entita_id
            or (w.contact_id is null and length(v_tail) >= 8
                and right(regexp_replace(coalesce(case when w.direction = 'inbound' then w.from_phone else w.to_phone end, ''), '[^0-9]', '', 'g'), 9) = v_tail))
     order by w.created_at desc
     limit 500
  )
  union all
  (
    -- Email inviate
    select 'email_outbox'::text, eo.id,
           coalesce(oc.email_address, v_piattaforma),
           v_email,
           case when oc.email_address is not null then 'Casella collegata'
                else 'Indirizzo della piattaforma' end
      from public.email_outbox eo
      left join public.email_oauth_connections oc on oc.id = eo.oauth_connection_id
     where eo.company_id = v_company and v_email is not null
       and v_email = any (select lower(x) from unnest(eo.to_emails) x)
     order by eo.created_at desc
     limit 500
  )
  union all
  (
    -- Email ricevute
    select 'email_inbox'::text, ei.id,
           ei.from_email,
           coalesce(oc.email_address, ei.to_email),
           case when oc.email_address is not null then 'Casella collegata'
                else 'Indirizzo della piattaforma' end
      from public.email_inbox ei
      left join public.email_oauth_connections oc on oc.id = ei.oauth_connection_id
     where ei.company_id = v_company
       and (ei.matched_contact_id = p_entita_id
            or (v_email is not null and lower(ei.from_email) = v_email))
     order by ei.received_at desc
     limit 500
  );
end;
$$;

revoke all on function public.conversazione_dettagli_invio(text, uuid) from public, anon;
grant execute on function public.conversazione_dettagli_invio(text, uuid) to authenticated;
