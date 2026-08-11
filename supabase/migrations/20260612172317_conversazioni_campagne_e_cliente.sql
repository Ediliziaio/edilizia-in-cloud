-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

CREATE OR REPLACE VIEW public.v_conversazioni_messaggi AS
-- 1) Email IN ARRIVO (contatto)
SELECT 'contatto'::text AS entita_tipo, ct.id AS entita_id, ei.company_id, 'email'::text AS canale, 'in'::text AS direzione,
       ei.from_email AS controparte, ei.subject AS oggetto,
       "left"(COALESCE(NULLIF(ei.raw_text,''::text), regexp_replace(COALESCE(ei.raw_html,''::text),'<[^>]+>'::text,' '::text,'g'::text)),4000) AS testo,
       NULL::text AS media_url, ei.received_at AS ts, 'email_inbox'::text AS ref_tabella, ei.id AS ref_id
FROM email_inbox ei
JOIN marketing_contacts ct ON ct.company_id = ei.company_id AND ei.from_email IS NOT NULL AND lower(ct.email)=lower(ei.from_email)
WHERE ei.is_personale IS NOT TRUE AND COALESCE(ei.is_trashed,false)=false
UNION ALL
-- 2) Email INVIATE (contatto, modulo/transazionali)
SELECT 'contatto'::text, ct.id, eo.company_id, 'email'::text, 'out'::text, addr.email, eo.subject,
       "left"(COALESCE(NULLIF(eo.body_text,''::text), regexp_replace(COALESCE(eo.body_html,''::text),'<[^>]+>'::text,' '::text,'g'::text)),4000),
       NULL::text, COALESCE(eo.sent_at, eo.created_at), 'email_outbox'::text, eo.id
FROM email_outbox eo
CROSS JOIN LATERAL unnest(eo.to_emails) addr(email)
JOIN marketing_contacts ct ON ct.company_id = eo.company_id AND lower(ct.email)=lower(addr.email)
WHERE COALESCE(eo.status,''::text) <> 'draft'::text
UNION ALL
-- 3) SMS (contatto)
SELECT 'contatto'::text, ct.id, s.company_id, 'sms'::text,
       CASE WHEN s.direction='inbound'::text THEN 'in'::text ELSE 'out'::text END,
       CASE WHEN s.direction='inbound'::text THEN s.from_number ELSE s.to_number END,
       NULL::text, s.body, NULL::text, s.created_at, 'sms_logs'::text, s.id
FROM sms_logs s
JOIN marketing_contacts ct ON ct.company_id = s.company_id
 AND (ct.id = s.contact_id OR ct.telefono_normalized IS NOT NULL AND ct.telefono_normalized = regexp_replace(COALESCE(CASE WHEN s.direction='inbound'::text THEN s.from_number ELSE s.to_number END,''::text),'[^0-9]'::text,''::text,'g'::text))
UNION ALL
-- 4) WhatsApp operativo (contatto, messaging_messages)
SELECT 'contatto'::text, ct.id, mc.company_id, 'whatsapp'::text,
       CASE WHEN mm.sender_type='contact'::text THEN 'in'::text ELSE 'out'::text END,
       mc.phone_number, NULL::text, COALESCE(NULLIF(mm.content,''::text), mm.transcription), mm.media_url, mm.created_at, 'messaging_messages'::text, mm.id
FROM messaging_messages mm
JOIN messaging_conversations mc ON mc.id = mm.conversation_id
JOIN marketing_contacts ct ON ct.company_id = mc.company_id AND ct.telefono_normalized IS NOT NULL AND ct.telefono_normalized = regexp_replace(COALESCE(mc.phone_number,''::text),'[^0-9]'::text,''::text,'g'::text)
UNION ALL
-- 5) Messaggi cliente (portale, customer_messages)
SELECT 'cliente'::text, cm.customer_id, cm.company_id,
       CASE cm.channel WHEN 'nota_interna'::text THEN 'nota'::text WHEN 'internal'::text THEN 'nota'::text WHEN 'whatsapp'::text THEN 'whatsapp'::text WHEN 'sms'::text THEN 'sms'::text ELSE 'email'::text END,
       CASE WHEN cm.sender_role='customer'::text THEN 'in'::text ELSE 'out'::text END,
       p.email, cm.subject, cm.body, NULL::text, cm.created_at, 'customer_messages'::text, cm.id
FROM customer_messages cm
JOIN profiles p ON p.id = cm.customer_id
UNION ALL
-- 6) WhatsApp INVIATO dal composer contatto (contact_messages, solo whatsapp)
SELECT 'contatto'::text, cm.contact_id, cm.company_id, 'whatsapp'::text, 'out'::text,
       ct.phone, NULL::text, cm.content, NULL::text, cm.created_at, 'contact_messages'::text, cm.id
FROM contact_messages cm
JOIN marketing_contacts ct ON ct.id = cm.contact_id
WHERE cm.contact_id IS NOT NULL AND cm.channel = 'whatsapp'
UNION ALL
-- 7) WhatsApp IN ARRIVO (contatto, whatsapp_messages per telefono al volo)
SELECT 'contatto'::text, ct.id, wa.company_id, 'whatsapp'::text, 'in'::text,
       wa.from_phone, NULL::text, COALESCE(NULLIF(wa.content_text,''::text), '📎 allegato'), wa.media_url, wa.created_at, 'whatsapp_messages'::text, wa.id
FROM whatsapp_messages wa
JOIN marketing_contacts ct ON ct.company_id = wa.company_id
 AND regexp_replace(COALESCE(ct.phone,''::text),'[^0-9]'::text,''::text,'g'::text) <> ''
 AND regexp_replace(COALESCE(ct.phone,''::text),'[^0-9]'::text,''::text,'g'::text) = regexp_replace(COALESCE(wa.from_phone,''::text),'[^0-9]'::text,''::text,'g'::text)
WHERE wa.direction = 'inbound'
UNION ALL
-- 8) [NUOVO] Email di CAMPAGNA marketing inviate al contatto (con stato engagement)
SELECT 'contatto'::text, el.contact_id, el.company_id, 'email'::text, 'out'::text,
       ct.email, COALESCE(ec.subject, ec.name),
       '📣 Campagna "' || ec.name || '"'
         || CASE WHEN el.clicked_at IS NOT NULL THEN ' · ✓ cliccata'
                 WHEN el.opened_at IS NOT NULL THEN ' · ✓ aperta'
                 WHEN el.status = 'bounced' THEN ' · ✗ respinta'
                 ELSE '' END,
       NULL::text, el.event_timestamp, 'email_logs'::text, el.id
FROM email_logs el
JOIN email_campaigns ec ON ec.id = el.campaign_id
JOIN marketing_contacts ct ON ct.id = el.contact_id
WHERE el.contact_id IS NOT NULL AND el.status <> 'failed'
UNION ALL
-- 9) [NUOVO] Email IN ARRIVO dal CLIENTE (match per email del profilo cliente)
SELECT 'cliente'::text, p.id, ei.company_id, 'email'::text, 'in'::text,
       ei.from_email, ei.subject,
       "left"(COALESCE(NULLIF(ei.raw_text,''::text), regexp_replace(COALESCE(ei.raw_html,''::text),'<[^>]+>'::text,' '::text,'g'::text)),4000),
       NULL::text, ei.received_at, 'email_inbox'::text, ei.id
FROM email_inbox ei
JOIN profiles p ON p.company_id = ei.company_id AND p.customer_type IS NOT NULL
 AND ei.from_email IS NOT NULL AND lower(p.email)=lower(ei.from_email)
WHERE ei.is_personale IS NOT TRUE AND COALESCE(ei.is_trashed,false)=false
UNION ALL
-- 10) [NUOVO] Email INVIATE al CLIENTE
SELECT 'cliente'::text, p.id, eo.company_id, 'email'::text, 'out'::text,
       addr.email, eo.subject,
       "left"(COALESCE(NULLIF(eo.body_text,''::text), regexp_replace(COALESCE(eo.body_html,''::text),'<[^>]+>'::text,' '::text,'g'::text)),4000),
       NULL::text, COALESCE(eo.sent_at, eo.created_at), 'email_outbox'::text, eo.id
FROM email_outbox eo
CROSS JOIN LATERAL unnest(eo.to_emails) addr(email)
JOIN profiles p ON p.company_id = eo.company_id AND p.customer_type IS NOT NULL
 AND lower(p.email)=lower(addr.email)
WHERE COALESCE(eo.status,''::text) <> 'draft'::text
UNION ALL
-- 11) [NUOVO] WhatsApp IN ARRIVO dal CLIENTE (match per telefono del profilo)
SELECT 'cliente'::text, p.id, wa.company_id, 'whatsapp'::text, 'in'::text,
       wa.from_phone, NULL::text, COALESCE(NULLIF(wa.content_text,''::text), '📎 allegato'), wa.media_url, wa.created_at, 'whatsapp_messages'::text, wa.id
FROM whatsapp_messages wa
JOIN profiles p ON p.company_id = wa.company_id AND p.customer_type IS NOT NULL
 AND regexp_replace(COALESCE(p.phone,''::text),'[^0-9]'::text,''::text,'g'::text) <> ''
 AND regexp_replace(COALESCE(p.phone,''::text),'[^0-9]'::text,''::text,'g'::text) = regexp_replace(COALESCE(wa.from_phone,''::text),'[^0-9]'::text,''::text,'g'::text)
WHERE wa.direction = 'inbound'
UNION ALL
-- 12) [NUOVO] SMS da/verso CLIENTE (match per telefono del profilo)
SELECT 'cliente'::text, p.id, s.company_id, 'sms'::text,
       CASE WHEN s.direction='inbound'::text THEN 'in'::text ELSE 'out'::text END,
       CASE WHEN s.direction='inbound'::text THEN s.from_number ELSE s.to_number END,
       NULL::text, s.body, NULL::text, s.created_at, 'sms_logs'::text, s.id
FROM sms_logs s
JOIN profiles p ON p.company_id = s.company_id AND p.customer_type IS NOT NULL
 AND regexp_replace(COALESCE(p.phone,''::text),'[^0-9]'::text,''::text,'g'::text) <> ''
 AND regexp_replace(COALESCE(p.phone,''::text),'[^0-9]'::text,''::text,'g'::text) = regexp_replace(COALESCE(CASE WHEN s.direction='inbound'::text THEN s.from_number ELSE s.to_number END,''::text),'[^0-9]'::text,''::text,'g'::text);
