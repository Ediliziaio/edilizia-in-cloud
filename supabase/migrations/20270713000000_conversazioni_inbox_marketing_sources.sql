-- =============================================================================
-- Conversazioni inbox — aggancio sorgenti marketing-contatto
-- =============================================================================
-- Gap: v_conversazioni_messaggi NON includeva i messaggi WhatsApp del composer
-- contatto. L'OUTBOUND vive in `contact_messages` (channel='whatsapp') e
-- l'INBOUND nel webhook in `whatsapp_messages` — nessuna delle due era tra le
-- sorgenti della vista (che usa messaging_messages + telefono_normalized, e
-- telefono_normalized è vuoto sui contatti) → l'inbox restava vuoto anche con
-- conversazioni reali.
--
-- Fix: 2 branch ADDITIVE alla vista:
--   6) contact_messages (solo channel='whatsapp', outbound)
--   7) whatsapp_messages (direction='inbound') agganciata al contatto per
--      telefono normalizzato AL VOLO da marketing_contacts.phone (no dipendenza
--      da telefono_normalized).
-- Le 5 branch esistenti (email in/out, sms, whatsapp operativo, customer) sono
-- riprodotte invariate (CREATE OR REPLACE richiede la definizione completa).
-- =============================================================================

CREATE OR REPLACE VIEW public.v_conversazioni_messaggi AS
-- 1) Email IN ARRIVO
SELECT 'contatto'::text AS entita_tipo, ct.id AS entita_id, ei.company_id, 'email'::text AS canale, 'in'::text AS direzione,
       ei.from_email AS controparte, ei.subject AS oggetto,
       "left"(COALESCE(NULLIF(ei.raw_text,''::text), regexp_replace(COALESCE(ei.raw_html,''::text),'<[^>]+>'::text,' '::text,'g'::text)),4000) AS testo,
       NULL::text AS media_url, ei.received_at AS ts, 'email_inbox'::text AS ref_tabella, ei.id AS ref_id
FROM email_inbox ei
JOIN marketing_contacts ct ON ct.company_id = ei.company_id AND ei.from_email IS NOT NULL AND lower(ct.email)=lower(ei.from_email)
WHERE ei.is_personale IS NOT TRUE AND COALESCE(ei.is_trashed,false)=false
UNION ALL
-- 2) Email INVIATE (modulo/transazionali)
SELECT 'contatto'::text, ct.id, eo.company_id, 'email'::text, 'out'::text, addr.email, eo.subject,
       "left"(COALESCE(NULLIF(eo.body_text,''::text), regexp_replace(COALESCE(eo.body_html,''::text),'<[^>]+>'::text,' '::text,'g'::text)),4000),
       NULL::text, COALESCE(eo.sent_at, eo.created_at), 'email_outbox'::text, eo.id
FROM email_outbox eo
CROSS JOIN LATERAL unnest(eo.to_emails) addr(email)
JOIN marketing_contacts ct ON ct.company_id = eo.company_id AND lower(ct.email)=lower(addr.email)
WHERE COALESCE(eo.status,''::text) <> 'draft'::text
UNION ALL
-- 3) SMS
SELECT 'contatto'::text, ct.id, s.company_id, 'sms'::text,
       CASE WHEN s.direction='inbound'::text THEN 'in'::text ELSE 'out'::text END,
       CASE WHEN s.direction='inbound'::text THEN s.from_number ELSE s.to_number END,
       NULL::text, s.body, NULL::text, s.created_at, 'sms_logs'::text, s.id
FROM sms_logs s
JOIN marketing_contacts ct ON ct.company_id = s.company_id
 AND (ct.id = s.contact_id OR ct.telefono_normalized IS NOT NULL AND ct.telefono_normalized = regexp_replace(COALESCE(CASE WHEN s.direction='inbound'::text THEN s.from_number ELSE s.to_number END,''::text),'[^0-9]'::text,''::text,'g'::text))
UNION ALL
-- 4) WhatsApp operativo (messaging_messages)
SELECT 'contatto'::text, ct.id, mc.company_id, 'whatsapp'::text,
       CASE WHEN mm.sender_type='contact'::text THEN 'in'::text ELSE 'out'::text END,
       mc.phone_number, NULL::text, COALESCE(NULLIF(mm.content,''::text), mm.transcription), mm.media_url, mm.created_at, 'messaging_messages'::text, mm.id
FROM messaging_messages mm
JOIN messaging_conversations mc ON mc.id = mm.conversation_id
JOIN marketing_contacts ct ON ct.company_id = mc.company_id AND ct.telefono_normalized IS NOT NULL AND ct.telefono_normalized = regexp_replace(COALESCE(mc.phone_number,''::text),'[^0-9]'::text,''::text,'g'::text)
UNION ALL
-- 5) Messaggi cliente (customer_messages)
SELECT 'cliente'::text, cm.customer_id, cm.company_id,
       CASE cm.channel WHEN 'nota_interna'::text THEN 'nota'::text WHEN 'internal'::text THEN 'nota'::text WHEN 'whatsapp'::text THEN 'whatsapp'::text WHEN 'sms'::text THEN 'sms'::text ELSE 'email'::text END,
       CASE WHEN cm.sender_role='customer'::text THEN 'in'::text ELSE 'out'::text END,
       p.email, cm.subject, cm.body, NULL::text, cm.created_at, 'customer_messages'::text, cm.id
FROM customer_messages cm
JOIN profiles p ON p.id = cm.customer_id
UNION ALL
-- 6) [NUOVO] WhatsApp INVIATO dal composer contatto (contact_messages, solo whatsapp)
SELECT 'contatto'::text, cm.contact_id, cm.company_id, 'whatsapp'::text, 'out'::text,
       ct.phone, NULL::text, cm.content, NULL::text, cm.created_at, 'contact_messages'::text, cm.id
FROM contact_messages cm
JOIN marketing_contacts ct ON ct.id = cm.contact_id
WHERE cm.contact_id IS NOT NULL AND cm.channel = 'whatsapp'
UNION ALL
-- 7) [NUOVO] WhatsApp IN ARRIVO (whatsapp_messages inbound, agganciato per telefono al volo)
SELECT 'contatto'::text, ct.id, wa.company_id, 'whatsapp'::text, 'in'::text,
       wa.from_phone, NULL::text, COALESCE(NULLIF(wa.content_text,''::text), '📎 allegato'), wa.media_url, wa.created_at, 'whatsapp_messages'::text, wa.id
FROM whatsapp_messages wa
JOIN marketing_contacts ct ON ct.company_id = wa.company_id
 AND regexp_replace(COALESCE(ct.phone,''::text),'[^0-9]'::text,''::text,'g'::text) <> ''
 AND regexp_replace(COALESCE(ct.phone,''::text),'[^0-9]'::text,''::text,'g'::text) = regexp_replace(COALESCE(wa.from_phone,''::text),'[^0-9]'::text,''::text,'g'::text)
WHERE wa.direction = 'inbound';
