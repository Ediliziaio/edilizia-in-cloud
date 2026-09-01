-- WhatsApp Locale dentro il centro Conversazioni (e nella timeline contatto).
--
-- Il centro Conversazioni (conversazioni_lista / conversazione_timeline) legge
-- TUTTO da v_conversazioni_messaggi: i messaggi del canale WhatsApp Locale
-- (openwa_messages) non c'erano, quindi quelle chat vivevano solo nella pagina
-- dedicata. Questo ramo li porta nel centro e nella scheda del contatto senza
-- toccare altro codice.
--
-- Scelte:
--  * company_id deriva dal CONTATTO (openwa_messages non ha company_id: il
--    canale e' della piattaforma, il contatto dice a chi appartiene);
--  * solo messaggi con contact_id: un numero mai collegato a un contatto non
--    ha una scheda in cui comparire (si collega dall'inbox WhatsApp Locale);
--  * media_url passa solo se e' un URL http: per gli inbound e' un PATH del
--    bucket privato openwa-media, fuori dall'inbox sarebbe un link rotto —
--    in quel caso il testo diventa "allegato".
--
-- La vista e' rigenerata con la definizione live corrente + il nuovo ramo
-- (una vista non puo' referenziare se stessa).

CREATE OR REPLACE VIEW public.v_conversazioni_messaggi AS
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
  WHERE COALESCE(eo.status, ''::text) <> 'draft'::text
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
    ct.id AS entita_id,
    wa.company_id,
    'whatsapp'::text AS canale,
    'in'::text AS direzione,
    wa.from_phone AS controparte,
    NULL::text AS oggetto,
    COALESCE(NULLIF(wa.content_text, ''::text), '📎 allegato'::text) AS testo,
    wa.media_url,
    wa.created_at AS ts,
    'whatsapp_messages'::text AS ref_tabella,
    wa.id AS ref_id
   FROM whatsapp_messages wa
     JOIN marketing_contacts ct ON ct.company_id = wa.company_id AND regexp_replace(COALESCE(ct.phone, ''::text), '[^0-9]'::text, ''::text, 'g'::text) <> ''::text AND regexp_replace(COALESCE(ct.phone, ''::text), '[^0-9]'::text, ''::text, 'g'::text) = regexp_replace(COALESCE(wa.from_phone, ''::text), '[^0-9]'::text, ''::text, 'g'::text)
  WHERE wa.direction = 'inbound'::text
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
  WHERE COALESCE(eo.status, ''::text) <> 'draft'::text
UNION ALL
 SELECT 'cliente'::text AS entita_tipo,
    p.id AS entita_id,
    wa.company_id,
    'whatsapp'::text AS canale,
    'in'::text AS direzione,
    wa.from_phone AS controparte,
    NULL::text AS oggetto,
    COALESCE(NULLIF(wa.content_text, ''::text), '📎 allegato'::text) AS testo,
    wa.media_url,
    wa.created_at AS ts,
    'whatsapp_messages'::text AS ref_tabella,
    wa.id AS ref_id
   FROM whatsapp_messages wa
     JOIN profiles p ON p.company_id = wa.company_id AND p.customer_type IS NOT NULL AND regexp_replace(COALESCE(p.phone, ''::text), '[^0-9]'::text, ''::text, 'g'::text) <> ''::text AND regexp_replace(COALESCE(p.phone, ''::text), '[^0-9]'::text, ''::text, 'g'::text) = regexp_replace(COALESCE(wa.from_phone, ''::text), '[^0-9]'::text, ''::text, 'g'::text)
  WHERE wa.direction = 'inbound'::text
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
    NULL::text AS oggetto,
    COALESCE(NULLIF(om.body, ''::text),
        CASE WHEN om.media_url IS NOT NULL THEN '📎 allegato'::text ELSE ''::text END) AS testo,
    CASE WHEN om.media_url ~* '^https?://'::text THEN om.media_url ELSE NULL::text END AS media_url,
    om.created_at AS ts,
    'openwa_messages'::text AS ref_tabella,
    om.id AS ref_id
   FROM openwa_messages om
     JOIN marketing_contacts ct ON ct.id = om.contact_id;
