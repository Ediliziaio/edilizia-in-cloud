-- Conversazioni senza le email private (25/09/2026).
--
-- v_conversazioni_messaggi prendeva tutta la posta delle caselle collegate
-- (Gmail/Outlook degli utenti): in Conversazioni finivano le email private con
-- i clienti. Ora di email restano:
--   - quelle del sistema: automazioni, campagne, risposte arrivate dal
--     routing marketing (email-inbound-reply, senza casella collegata);
--   - quelle scritte da Conversazioni (email_outbox.origine = 'conversazioni',
--     anche se partite dalla casella personale) e le risposte a quelle
--     (In-Reply-To / References = Message-ID che abbiamo mandato noi).
-- Il resto della casella personale resta nella Posta, non qui.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.email_outbox add column if not exists origine text;
comment on column public.email_outbox.origine is
  'Da dove è partita l''email: ''conversazioni'' = scritta dalla chat Conversazioni (resta visibile lì anche se partita dalla casella personale).';

create index if not exists idx_email_outbox_msgid_conversazioni
  on public.email_outbox (company_id, provider_message_id)
  where origine = 'conversazioni' and provider_message_id is not null;

-- Un'email in arrivo nella casella personale è la risposta a una scritta da Conversazioni?
create or replace function public.email_risponde_a_conversazioni(p_company uuid, p_in_reply_to text, p_references text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.email_outbox o
     where o.company_id = p_company
       and o.origine = 'conversazioni'
       and o.provider_message_id is not null
       and (o.provider_message_id = p_in_reply_to or o.provider_message_id = any (coalesce(p_references, '{}'::text[])))
  )
$$;

-- La leggono solo le RPC di Conversazioni (security definer) attraverso la vista.
revoke all on function public.email_risponde_a_conversazioni(uuid, text, text[]) from public, anon, authenticated;
grant execute on function public.email_risponde_a_conversazioni(uuid, text, text[]) to service_role;

create or replace view public.v_conversazioni_messaggi
  with (security_invoker = on) as
 SELECT 'contatto'::text AS entita_tipo,
    ct.id AS entita_id,
    ei.company_id,
    'email'::text AS canale,
    'in'::text AS direzione,
    ei.from_email AS controparte,
    ei.subject AS oggetto,
    "left"(COALESCE(NULLIF(ei.raw_text, ''::text), regexp_replace(COALESCE(ei.raw_html, ''::text), '<[^>]+>'::text, ' '::text, 'g'::text)), 4000) AS testo,
    NULL::text AS media_url,
    ei.received_at AS ts,
    'email_inbox'::text AS ref_tabella,
    ei.id AS ref_id
   FROM email_inbox ei
     JOIN marketing_contacts ct ON ct.company_id = ei.company_id AND (ei.from_email IS NOT NULL AND lower(ct.email) = lower(ei.from_email) OR ct.id = ei.matched_contact_id)
  WHERE ei.is_personale IS NOT TRUE AND COALESCE(ei.is_trashed, false) = false
    AND (ei.oauth_connection_id IS NULL OR public.email_risponde_a_conversazioni(ei.company_id, ei.in_reply_to, ei.references_ids))
UNION ALL
 SELECT 'contatto'::text AS entita_tipo,
    ct.id AS entita_id,
    eo.company_id,
    'email'::text AS canale,
    'out'::text AS direzione,
    addr.email AS controparte,
    eo.subject AS oggetto,
    "left"(COALESCE(NULLIF(eo.body_text, ''::text), regexp_replace(COALESCE(eo.body_html, ''::text), '<[^>]+>'::text, ' '::text, 'g'::text)), 4000) AS testo,
    NULL::text AS media_url,
    COALESCE(eo.sent_at, eo.created_at) AS ts,
    'email_outbox'::text AS ref_tabella,
    eo.id AS ref_id
   FROM email_outbox eo
     CROSS JOIN LATERAL unnest(eo.to_emails) addr(email)
     JOIN marketing_contacts ct ON ct.company_id = eo.company_id AND lower(ct.email) = lower(addr.email)
  WHERE COALESCE(eo.status, ''::text) <> 'draft'::text AND (eo.oauth_connection_id IS NULL OR eo.origine = 'conversazioni'::text)
UNION ALL
 SELECT 'contatto'::text AS entita_tipo,
    ct.id AS entita_id,
    s.company_id,
    'sms'::text AS canale,
        CASE
            WHEN s.direction = 'inbound'::text THEN 'in'::text
            ELSE 'out'::text
        END AS direzione,
        CASE
            WHEN s.direction = 'inbound'::text THEN s.from_number
            ELSE s.to_number
        END AS controparte,
    NULL::text AS oggetto,
    s.body AS testo,
    NULL::text AS media_url,
    s.created_at AS ts,
    'sms_logs'::text AS ref_tabella,
    s.id AS ref_id
   FROM sms_logs s
     JOIN marketing_contacts ct ON ct.company_id = s.company_id AND (ct.id = s.contact_id OR ct.telefono_normalized IS NOT NULL AND ct.telefono_normalized = regexp_replace(COALESCE(
        CASE
            WHEN s.direction = 'inbound'::text THEN s.from_number
            ELSE s.to_number
        END, ''::text), '[^0-9]'::text, ''::text, 'g'::text))
UNION ALL
 SELECT 'contatto'::text AS entita_tipo,
    ct.id AS entita_id,
    mc.company_id,
    'whatsapp'::text AS canale,
        CASE
            WHEN mm.sender_type = 'contact'::text THEN 'in'::text
            ELSE 'out'::text
        END AS direzione,
    mc.phone_number AS controparte,
    NULL::text AS oggetto,
    COALESCE(NULLIF(mm.content, ''::text), mm.transcription) AS testo,
    mm.media_url,
    mm.created_at AS ts,
    'messaging_messages'::text AS ref_tabella,
    mm.id AS ref_id
   FROM messaging_messages mm
     JOIN messaging_conversations mc ON mc.id = mm.conversation_id
     JOIN marketing_contacts ct ON ct.company_id = mc.company_id AND ct.telefono_normalized IS NOT NULL AND ct.telefono_normalized = regexp_replace(COALESCE(mc.phone_number, ''::text), '[^0-9]'::text, ''::text, 'g'::text)
UNION ALL
 SELECT 'cliente'::text AS entita_tipo,
    cm.customer_id AS entita_id,
    cm.company_id,
        CASE cm.channel
            WHEN 'nota_interna'::text THEN 'nota'::text
            WHEN 'internal'::text THEN 'nota'::text
            WHEN 'whatsapp'::text THEN 'whatsapp'::text
            WHEN 'sms'::text THEN 'sms'::text
            ELSE 'email'::text
        END AS canale,
        CASE
            WHEN cm.sender_role = 'customer'::text THEN 'in'::text
            ELSE 'out'::text
        END AS direzione,
    p.email AS controparte,
    cm.subject AS oggetto,
    cm.body AS testo,
    NULL::text AS media_url,
    cm.created_at AS ts,
    'customer_messages'::text AS ref_tabella,
    cm.id AS ref_id
   FROM customer_messages cm
     JOIN profiles p ON p.id = cm.customer_id
UNION ALL
 SELECT 'contatto'::text AS entita_tipo,
    cm.contact_id AS entita_id,
    cm.company_id,
    'whatsapp'::text AS canale,
    'out'::text AS direzione,
    ct.phone AS controparte,
    NULL::text AS oggetto,
    cm.content AS testo,
    NULL::text AS media_url,
    cm.created_at AS ts,
    'contact_messages'::text AS ref_tabella,
    cm.id AS ref_id
   FROM contact_messages cm
     JOIN marketing_contacts ct ON ct.id = cm.contact_id
  WHERE cm.contact_id IS NOT NULL AND cm.channel = 'whatsapp'::text
UNION ALL
 SELECT 'contatto'::text AS entita_tipo,
    el.contact_id AS entita_id,
    el.company_id,
    'email'::text AS canale,
    'out'::text AS direzione,
    ct.email AS controparte,
    COALESCE(ec.subject, ec.name) AS oggetto,
    (('📣 Campagna "'::text || ec.name) || '"'::text) ||
        CASE
            WHEN el.clicked_at IS NOT NULL THEN ' · ✓ cliccata'::text
            WHEN el.opened_at IS NOT NULL THEN ' · ✓ aperta'::text
            WHEN el.status = 'bounced'::text THEN ' · ✗ respinta'::text
            ELSE ''::text
        END AS testo,
    NULL::text AS media_url,
    el.event_timestamp AS ts,
    'email_logs'::text AS ref_tabella,
    el.id AS ref_id
   FROM email_logs el
     JOIN email_campaigns ec ON ec.id = el.campaign_id
     JOIN marketing_contacts ct ON ct.id = el.contact_id
  WHERE el.contact_id IS NOT NULL AND el.status <> 'failed'::text
UNION ALL
 SELECT 'cliente'::text AS entita_tipo,
    p.id AS entita_id,
    ei.company_id,
    'email'::text AS canale,
    'in'::text AS direzione,
    ei.from_email AS controparte,
    ei.subject AS oggetto,
    "left"(COALESCE(NULLIF(ei.raw_text, ''::text), regexp_replace(COALESCE(ei.raw_html, ''::text), '<[^>]+>'::text, ' '::text, 'g'::text)), 4000) AS testo,
    NULL::text AS media_url,
    ei.received_at AS ts,
    'email_inbox'::text AS ref_tabella,
    ei.id AS ref_id
   FROM email_inbox ei
     JOIN profiles p ON p.company_id = ei.company_id AND p.customer_type IS NOT NULL AND ei.from_email IS NOT NULL AND lower(p.email) = lower(ei.from_email)
  WHERE ei.is_personale IS NOT TRUE AND COALESCE(ei.is_trashed, false) = false
    AND (ei.oauth_connection_id IS NULL OR public.email_risponde_a_conversazioni(ei.company_id, ei.in_reply_to, ei.references_ids))
UNION ALL
 SELECT 'cliente'::text AS entita_tipo,
    p.id AS entita_id,
    eo.company_id,
    'email'::text AS canale,
    'out'::text AS direzione,
    addr.email AS controparte,
    eo.subject AS oggetto,
    "left"(COALESCE(NULLIF(eo.body_text, ''::text), regexp_replace(COALESCE(eo.body_html, ''::text), '<[^>]+>'::text, ' '::text, 'g'::text)), 4000) AS testo,
    NULL::text AS media_url,
    COALESCE(eo.sent_at, eo.created_at) AS ts,
    'email_outbox'::text AS ref_tabella,
    eo.id AS ref_id
   FROM email_outbox eo
     CROSS JOIN LATERAL unnest(eo.to_emails) addr(email)
     JOIN profiles p ON p.company_id = eo.company_id AND p.customer_type IS NOT NULL AND lower(p.email) = lower(addr.email)
  WHERE COALESCE(eo.status, ''::text) <> 'draft'::text AND (eo.oauth_connection_id IS NULL OR eo.origine = 'conversazioni'::text)
UNION ALL
 SELECT 'cliente'::text AS entita_tipo,
    p.id AS entita_id,
    s.company_id,
    'sms'::text AS canale,
        CASE
            WHEN s.direction = 'inbound'::text THEN 'in'::text
            ELSE 'out'::text
        END AS direzione,
        CASE
            WHEN s.direction = 'inbound'::text THEN s.from_number
            ELSE s.to_number
        END AS controparte,
    NULL::text AS oggetto,
    s.body AS testo,
    NULL::text AS media_url,
    s.created_at AS ts,
    'sms_logs'::text AS ref_tabella,
    s.id AS ref_id
   FROM sms_logs s
     JOIN profiles p ON p.company_id = s.company_id AND p.customer_type IS NOT NULL AND regexp_replace(COALESCE(p.phone, ''::text), '[^0-9]'::text, ''::text, 'g'::text) <> ''::text AND regexp_replace(COALESCE(p.phone, ''::text), '[^0-9]'::text, ''::text, 'g'::text) = regexp_replace(COALESCE(
        CASE
            WHEN s.direction = 'inbound'::text THEN s.from_number
            ELSE s.to_number
        END, ''::text), '[^0-9]'::text, ''::text, 'g'::text)
UNION ALL
 SELECT 'contatto'::text AS entita_tipo,
    om.contact_id AS entita_id,
    ct.company_id,
    'whatsapp'::text AS canale,
        CASE
            WHEN om.direction = 'inbound'::text THEN 'in'::text
            ELSE 'out'::text
        END AS direzione,
    om.contact_phone AS controparte,
    NULLIF(TRIM(BOTH FROM
        CASE
            WHEN onum.display_name IS NOT NULL AND onum.numero IS NOT NULL THEN (onum.display_name || ' · '::text) || onum.numero
            ELSE COALESCE(onum.display_name, onum.numero, ''::text)
        END), ''::text) AS oggetto,
    COALESCE(NULLIF(om.body, ''::text),
        CASE
            WHEN om.media_url IS NOT NULL THEN '📎 allegato'::text
            ELSE ''::text
        END) AS testo,
        CASE
            WHEN om.media_url ~* '^https?://'::text THEN om.media_url
            ELSE NULL::text
        END AS media_url,
    om.created_at AS ts,
    'openwa_messages'::text AS ref_tabella,
    om.id AS ref_id
   FROM openwa_messages om
     JOIN marketing_contacts ct ON ct.id = om.contact_id
     LEFT JOIN openwa_numbers onum ON onum.id = om.number_id
UNION ALL
 SELECT 'contatto'::text AS entita_tipo,
    ct.id AS entita_id,
    dl.company_id,
    'email'::text AS canale,
    'out'::text AS direzione,
    dl.recipient AS controparte,
    dl.subject AS oggetto,
    "left"(COALESCE(NULLIF(btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(replace(replace(regexp_replace(COALESCE(tp.html_content, ''::text), '<div style="display:none[^>]*?>.*?</div>'::text, ''::text, 'i'::text), '{{contact.first_name}}'::text, COALESCE(ct.first_name, ''::text)), '{{contatto.first_name}}'::text, COALESCE(ct.first_name, ''::text)), '<br\s*/?>|</(p|div|li|tr|h[1-6])>'::text, chr(10), 'gi'::text), '<[^>]+>|&nbsp;|&zwnj;'::text, ' '::text, 'g'::text), '[ \t]+'::text, ' '::text, 'g'::text), '[ \t]*\n[ \t]*(\n[ \t]*)+'::text, chr(10) || chr(10), 'g'::text), '[ \t]*\n[ \t]*'::text, chr(10), 'g'::text), chr(10) || ' '::text), ''::text), '✉️ Email automatica (il testo non è nel registro degli invii)'::text), 4000) AS testo,
    NULL::text AS media_url,
    dl.sent_at AS ts,
    'email_delivery_log'::text AS ref_tabella,
    dl.id AS ref_id
   FROM email_delivery_log dl
     JOIN marketing_contacts ct ON ct.company_id = dl.company_id AND ct.id =
        CASE
            WHEN (dl.metadata ->> 'contact_id'::text) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'::text THEN (dl.metadata ->> 'contact_id'::text)::uuid
            ELSE NULL::uuid
        END
     LEFT JOIN email_templates tp ON tp.company_id = dl.company_id AND tp.id =
        CASE
            WHEN (dl.metadata ->> 'template_id'::text) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'::text THEN (dl.metadata ->> 'template_id'::text)::uuid
            ELSE NULL::uuid
        END
  WHERE dl.template_type = 'automation_send'::text AND dl.status = 'sent'::text
UNION ALL
 SELECT 'contatto'::text AS entita_tipo,
    ct.id AS entita_id,
    wa.company_id,
    'whatsapp'::text AS canale,
        CASE
            WHEN wa.direction = 'inbound'::text THEN 'in'::text
            ELSE 'out'::text
        END AS direzione,
        CASE
            WHEN wa.direction = 'inbound'::text THEN wa.from_phone
            ELSE wa.to_phone
        END AS controparte,
        CASE
            WHEN wa.direction = 'inbound'::text THEN NULL::text
            ELSE NULLIF(concat_ws(' · '::text,
            CASE
                WHEN wa.message_type = 'template'::text THEN 'modello'::text
                ELSE NULL::text
            END,
            CASE wa.delivery_status
                WHEN 'failed'::text THEN '✗ non consegnato'::text || COALESCE(': '::text || wa.delivery_error, ''::text)
                WHEN 'read'::text THEN '✓✓ letto'::text
                WHEN 'delivered'::text THEN '✓✓ consegnato'::text
                WHEN 'sent'::text THEN '✓ inviato'::text
                ELSE NULL::text
            END), ''::text)
        END AS oggetto,
    COALESCE(NULLIF(wa.content_text, ''::text), '📎 allegato'::text) AS testo,
    wa.media_url,
    wa.created_at AS ts,
    'whatsapp_messages'::text AS ref_tabella,
    wa.id AS ref_id
   FROM whatsapp_messages wa
     JOIN marketing_contacts ct ON ct.id = wa.contact_id AND ct.company_id = wa.company_id
UNION ALL
 SELECT 'contatto'::text AS entita_tipo,
    ct.id AS entita_id,
    wa.company_id,
    'whatsapp'::text AS canale,
        CASE
            WHEN wa.direction = 'inbound'::text THEN 'in'::text
            ELSE 'out'::text
        END AS direzione,
        CASE
            WHEN wa.direction = 'inbound'::text THEN wa.from_phone
            ELSE wa.to_phone
        END AS controparte,
        CASE
            WHEN wa.direction = 'inbound'::text THEN NULL::text
            ELSE NULLIF(concat_ws(' · '::text,
            CASE
                WHEN wa.message_type = 'template'::text THEN 'modello'::text
                ELSE NULL::text
            END,
            CASE wa.delivery_status
                WHEN 'failed'::text THEN '✗ non consegnato'::text || COALESCE(': '::text || wa.delivery_error, ''::text)
                WHEN 'read'::text THEN '✓✓ letto'::text
                WHEN 'delivered'::text THEN '✓✓ consegnato'::text
                WHEN 'sent'::text THEN '✓ inviato'::text
                ELSE NULL::text
            END), ''::text)
        END AS oggetto,
    COALESCE(NULLIF(wa.content_text, ''::text), '📎 allegato'::text) AS testo,
    wa.media_url,
    wa.created_at AS ts,
    'whatsapp_messages'::text AS ref_tabella,
    wa.id AS ref_id
   FROM whatsapp_messages wa
     JOIN marketing_contacts ct ON ct.company_id = wa.company_id AND regexp_replace(COALESCE(ct.phone, ''::text), '[^0-9]'::text, ''::text, 'g'::text) <> ''::text AND regexp_replace(COALESCE(ct.phone, ''::text), '[^0-9]'::text, ''::text, 'g'::text) = regexp_replace(COALESCE(
        CASE
            WHEN wa.direction = 'inbound'::text THEN wa.from_phone
            ELSE wa.to_phone
        END, ''::text), '[^0-9]'::text, ''::text, 'g'::text)
  WHERE wa.contact_id IS NULL
UNION ALL
 SELECT 'cliente'::text AS entita_tipo,
    p.id AS entita_id,
    wa.company_id,
    'whatsapp'::text AS canale,
        CASE
            WHEN wa.direction = 'inbound'::text THEN 'in'::text
            ELSE 'out'::text
        END AS direzione,
        CASE
            WHEN wa.direction = 'inbound'::text THEN wa.from_phone
            ELSE wa.to_phone
        END AS controparte,
        CASE
            WHEN wa.direction = 'inbound'::text THEN NULL::text
            ELSE NULLIF(concat_ws(' · '::text,
            CASE
                WHEN wa.message_type = 'template'::text THEN 'modello'::text
                ELSE NULL::text
            END,
            CASE wa.delivery_status
                WHEN 'failed'::text THEN '✗ non consegnato'::text || COALESCE(': '::text || wa.delivery_error, ''::text)
                WHEN 'read'::text THEN '✓✓ letto'::text
                WHEN 'delivered'::text THEN '✓✓ consegnato'::text
                WHEN 'sent'::text THEN '✓ inviato'::text
                ELSE NULL::text
            END), ''::text)
        END AS oggetto,
    COALESCE(NULLIF(wa.content_text, ''::text), '📎 allegato'::text) AS testo,
    wa.media_url,
    wa.created_at AS ts,
    'whatsapp_messages'::text AS ref_tabella,
    wa.id AS ref_id
   FROM whatsapp_messages wa
     JOIN profiles p ON p.company_id = wa.company_id AND p.customer_type IS NOT NULL AND telefono_chiave(p.phone) IS NOT NULL AND telefono_chiave(p.phone) = telefono_chiave(
        CASE
            WHEN wa.direction = 'inbound'::text THEN wa.from_phone
            ELSE wa.to_phone
        END)
UNION ALL
 SELECT 'contatto'::text AS entita_tipo,
    r.contact_id AS entita_id,
    b.company_id,
    'whatsapp'::text AS canale,
    'out'::text AS direzione,
    r.phone AS controparte,
    NULLIF(concat_ws(' · '::text, 'modello'::text,
        CASE r.status
            WHEN 'failed'::text THEN '✗ non consegnato'::text || COALESCE(': '::text || r.error_message, ''::text)
            WHEN 'replied'::text THEN '✓✓ letto'::text
            WHEN 'read'::text THEN '✓✓ letto'::text
            WHEN 'delivered'::text THEN '✓✓ consegnato'::text
            WHEN 'sent'::text THEN '✓ inviato'::text
            ELSE NULL::text
        END), ''::text) AS oggetto,
    ('📣 Broadcast «'::text || COALESCE(NULLIF(b.nome, ''::text), b.template_name, 'WhatsApp'::text)) || '»'::text AS testo,
    NULL::text AS media_url,
    COALESCE(r.sent_at, b.started_at, b.created_at) AS ts,
    'whatsapp_broadcast_recipients'::text AS ref_tabella,
    r.id AS ref_id
   FROM whatsapp_broadcast_recipients r
     JOIN whatsapp_broadcasts b ON b.id = r.broadcast_id
     JOIN marketing_contacts ct ON ct.id = r.contact_id AND ct.company_id = b.company_id;
