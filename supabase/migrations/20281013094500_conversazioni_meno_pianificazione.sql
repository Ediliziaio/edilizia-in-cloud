-- Già applicata: recuperata dal registro per riallineare il repository.
-- Conversazioni: il contatore dei non letti e la vista dei messaggi si pianificano
-- una volta, non a ogni chiamata (13/10/2026).
--
-- conversazioni_non_lette dà il numero del badge «Chat» nella barra laterale: ogni
-- scheda in vista la chiama ogni 30 secondi (3.817 chiamate il 12/10, il 4,7% del
-- tempo del database in pg_stat_statements). Misurata in produzione impersonando
-- utenti veri, in transazioni annullate, il costo stava quasi tutto nella
-- PIANIFICAZIONE della query interna: 17 ms a ogni chiamata (30 ms a connessione
-- fredda) contro 1-8 ms di esecuzione. Con il parametro p_company_id il piano
-- generico costa più della media dei piani personalizzati delle aziende piccole,
-- quindi in modalità automatica PostgreSQL ripianifica sempre (minimo misurato da
-- pg_stat_statements: 19 ms).
--
-- 1. v_conversazioni_messaggi. Le email in arrivo e gli SMS trovavano il contatto
--    con un OR nel JOIN («stessa email» o «contatto già collegato»; «stesso id» o
--    «stesso numero»). Per un OR il pianificatore prova ogni indice di
--    marketing_contacts su ciascun lato: 9 ms dei 16 di pianificazione della vista.
--    Ora ogni OR sta in due rami UNION ALL: il primo con la prima condizione, il
--    secondo con l'altra e la prima «non vera» (IS NOT TRUE), così ogni coppia
--    messaggio-contatto esce una volta sola, come con l'OR. Nel secondo ramo delle
--    email «matched_contact_id IS NOT NULL» scarta subito le email senza contatto
--    collegato, prima del controllo sulle risposte.
--    Stesse righe di prima (5.224 su 5.224, EXCEPT ALL nei due versi), stesse
--    colonne nello stesso ordine; pianificazione 16 → 8 ms. Ne beneficiano tutte
--    le funzioni che leggono la vista: conversazione 17-20 → 9-12 ms a chiamata,
--    avvisi nella campanella (ogni minuto) 17 → 10 ms di pianificazione.
--
-- 2. conversazioni_non_lette tiene il piano generico (plan_cache_mode =
--    force_generic_plan): si pianifica una volta per connessione (PostgREST ne
--    tiene aperte 24, in media da più di mezz'ora) e poi si riusa. A chiamata,
--    piano compreso, sulle aziende che lo usano di più: da 19-26 ms a 2-9 ms
--    (l'azienda con più messaggi 26 → 9 ms); un'azienda di prova 56 → 5. Il piano
--    generico va peggio solo per un'azienda dimostrativa con 3.700 email personali
--    da scartare (40 ms), che nelle ultime 24 ore non ha aperto nessuno.
--
-- 3. conversazioni_lista si pianifica a ogni chiamata (force_custom_plan): in
--    modalità automatica, dopo cinque chiamate PostgreSQL passava al piano
--    generico, che per l'elenco più grande (1.364 conversazioni) costa 97-135 ms
--    contro i 49 di quello personalizzato; per un elenco piccolo (253) il generico
--    fa 12 ms e il personalizzato 19.
--
-- I corpi delle due funzioni restano quelli del 08/10/2026 (stesse impronte md5):
-- cambia solo il modo di pianificare. Confronti in produzione, con copie in pg_temp
-- nella stessa transazione annullata: contatore su 373 casi (utenti attivi sulla
-- loro azienda, accessi multi-azienda, super admin su ogni azienda, utenti su
-- un'azienda non loro, anonimo): stesso numero o stesso «accesso negato» in tutti;
-- elenco su 48 casi (3.832 righe), conversazione su 92 entità (608 messaggi, stesso
-- ordine), ricerca su 192 casi: tutti uguali.
--
-- CREATE OR REPLACE tiene GRANT e dipendenze. La vista prende un lock esclusivo:
-- lock_timeout evita di restare in coda dietro una lettura lunga. Rilanciabile:
-- vista e funzioni devono avere la definizione censita il 13/10/2026 (impronta md5)
-- oppure essere già quelle nuove.

set local lock_timeout = '3s';
-- Il testo della vista (pg_get_viewdef) dipende dal search_path: lo stesso del
-- censimento, così le impronte si confrontano alla pari.
set local search_path = "$user", public, extensions;

do $$
declare
  -- Vista: [impronta censita, impronta nuova] di pg_get_viewdef(…, true).
  v_vista constant text[] := array['c6f70a73b3fdf3831ddea4b041612c44', '1a812df95d8f7d36c2d0adc381ca8f20'];
  -- Funzioni: impronta del corpo (prosrc), la stessa prima e dopo.
  v_corpi constant jsonb := jsonb_build_object(
    'public.conversazioni_non_lette(uuid)', 'e0bfe1440a4aff3d2319eed77d5bd9b8',
    'public.conversazioni_lista(uuid)', 'e333c6206c1ca00e0f6715683d3a8982');
  v_impronta text;
  v_firma text;
begin
  v_impronta := md5(pg_get_viewdef('public.v_conversazioni_messaggi'::regclass, true));
  if not (v_impronta = any (v_vista)) then
    raise exception 'Vista v_conversazioni_messaggi cambiata dopo il censimento del 13/10/2026 (impronta %): rivedere prima di sostituirla', v_impronta;
  end if;
  for v_firma in select jsonb_object_keys(v_corpi) loop
    select md5(p.prosrc) into v_impronta from pg_catalog.pg_proc p where p.oid = v_firma::regprocedure;
    if v_impronta is distinct from v_corpi ->> v_firma then
      raise exception 'Funzione % cambiata dopo il censimento del 13/10/2026 (impronta %): rivedere prima di sostituirla', v_firma, v_impronta;
    end if;
  end loop;
end $$;

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
     JOIN marketing_contacts ct ON ct.company_id = ei.company_id AND ei.from_email IS NOT NULL AND lower(ct.email) = lower(ei.from_email)
  WHERE ei.is_personale IS NOT TRUE AND COALESCE(ei.is_trashed, false) = false
    AND (ei.oauth_connection_id IS NULL OR public.email_risponde_a_conversazioni(ei.company_id, ei.in_reply_to, ei.references_ids))
UNION ALL
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
     JOIN marketing_contacts ct ON ct.company_id = ei.company_id AND ct.id = ei.matched_contact_id
       AND (ei.from_email IS NOT NULL AND lower(ct.email) = lower(ei.from_email)) IS NOT TRUE
  WHERE ei.matched_contact_id IS NOT NULL AND ei.is_personale IS NOT TRUE AND COALESCE(ei.is_trashed, false) = false
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
     JOIN marketing_contacts ct ON ct.company_id = s.company_id AND ct.id = s.contact_id
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
     JOIN marketing_contacts ct ON ct.company_id = s.company_id AND ct.telefono_normalized IS NOT NULL AND ct.telefono_normalized = regexp_replace(COALESCE(
        CASE
            WHEN s.direction = 'inbound'::text THEN s.from_number
            ELSE s.to_number
        END, ''::text), '[^0-9]'::text, ''::text, 'g'::text)
       AND (ct.id = s.contact_id) IS NOT TRUE
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

CREATE OR REPLACE FUNCTION public.conversazioni_non_lette(p_company_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET plan_cache_mode TO 'force_generic_plan'
AS $function$
DECLARE n integer;
BEGIN
  IF public.conversazioni_puo_accedere(p_company_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  -- 08/10/2026: prima ricostruiva l'intera lista (nomi, anteprime) solo per contarne le righe, ogni 30 secondi per
  -- ogni utente con il gestionale aperto. Ora conta solo i messaggi in arrivo dopo l'ultima lettura.
  WITH msg AS (
    SELECT m.entita_tipo, m.entita_id, m.ts FROM public.v_conversazioni_messaggi m WHERE m.company_id = p_company_id AND m.direzione = 'in'
    UNION ALL
    SELECT s.entita_tipo, s.entita_id, s.ts FROM public.v_conversazioni_social s WHERE s.company_id = p_company_id AND s.direzione = 'in'
  )
  SELECT count(*)::integer INTO n FROM (
    SELECT m.entita_tipo, m.entita_id
      FROM msg m
      LEFT JOIN public.conversazioni cv
             ON cv.company_id = p_company_id AND cv.entita_tipo = m.entita_tipo AND cv.entita_id = m.entita_id
     WHERE m.ts > COALESCE(cv.last_read_at, '-infinity'::timestamptz)
     GROUP BY m.entita_tipo, m.entita_id
  ) x;
  RETURN n;
END;
$function$;

CREATE OR REPLACE FUNCTION public.conversazioni_lista(p_company_id uuid)
 RETURNS TABLE(entita_tipo text, entita_id uuid, nome text, email text, telefono text, ultimo_ts timestamp with time zone, ultimo_canale text, ultimo_direzione text, anteprima text, non_letti bigint, totale_messaggi bigint, stato text, assegnato_a uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
BEGIN
  IF public.conversazioni_puo_accedere(p_company_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;

  -- 08/10/2026: i non letti si contano in UN passaggio (prima: un conteggio sull'intera lista dei messaggi per OGNI
  -- conversazione, quadratico: 633 ms su BeMade a riposo, 1,5 s sotto carico, il 44% del tempo del database).
  -- Stesso risultato riga per riga, verificato su 4 aziende; ora 37 ms.
  RETURN QUERY
  WITH msg AS MATERIALIZED (
    SELECT m.entita_tipo, m.entita_id, m.ts, m.canale, m.direzione, m.testo FROM public.v_conversazioni_messaggi m WHERE m.company_id = p_company_id
    UNION ALL
    SELECT s.entita_tipo, s.entita_id, s.ts, s.canale, s.direzione, s.testo FROM public.v_conversazioni_social s WHERE s.company_id = p_company_id
  ),
  conv AS (
    SELECT c.entita_tipo, c.entita_id, c.stato, c.assegnato_a, c.last_read_at FROM public.conversazioni c WHERE c.company_id = p_company_id
  ),
  agg AS (
    SELECT m.entita_tipo, m.entita_id, count(*) AS tot, max(m.ts) AS last_ts,
           count(*) FILTER (WHERE m.direzione = 'in' AND m.ts > COALESCE(cv.last_read_at, '-infinity'::timestamptz)) AS nl
      FROM msg m
      LEFT JOIN conv cv ON cv.entita_tipo = m.entita_tipo AND cv.entita_id = m.entita_id
     GROUP BY m.entita_tipo, m.entita_id
  ),
  ultimo AS (
    SELECT DISTINCT ON (m.entita_tipo, m.entita_id) m.entita_tipo, m.entita_id, m.canale, m.direzione, m.testo
      FROM msg m ORDER BY m.entita_tipo, m.entita_id, m.ts DESC
  )
  SELECT
    a.entita_tipo, a.entita_id,
    CASE a.entita_tipo
      WHEN 'contatto' THEN NULLIF(trim(COALESCE(mc.first_name,'')||' '||COALESCE(mc.last_name,'')), '')
      WHEN 'cliente'  THEN NULLIF(trim(COALESCE(pr.first_name,'')||' '||COALESCE(pr.last_name,'')), '')
    END,
    CASE a.entita_tipo WHEN 'contatto' THEN mc.email WHEN 'cliente' THEN pr.email END,
    CASE a.entita_tipo WHEN 'contatto' THEN mc.phone WHEN 'cliente' THEN pr.phone END,
    a.last_ts, u.canale, u.direzione, left(u.testo, 140),
    a.nl::bigint, a.tot::bigint,
    COALESCE(cv.stato, 'aperta'), cv.assegnato_a
  FROM agg a
  JOIN ultimo u ON u.entita_tipo = a.entita_tipo AND u.entita_id = a.entita_id
  LEFT JOIN conv cv ON cv.entita_tipo = a.entita_tipo AND cv.entita_id = a.entita_id
  LEFT JOIN public.marketing_contacts mc ON a.entita_tipo = 'contatto' AND mc.id = a.entita_id
  LEFT JOIN public.profiles pr ON a.entita_tipo = 'cliente' AND pr.id = a.entita_id
  ORDER BY a.last_ts DESC
;
END;
$function$;

-- Come prima: chiuse ad anon, aperte a chi ha una sessione e al servizio.
revoke all on function public.conversazioni_non_lette(uuid) from public, anon;
grant execute on function public.conversazioni_non_lette(uuid) to authenticated, service_role;
revoke all on function public.conversazioni_lista(uuid) from public, anon;
grant execute on function public.conversazioni_lista(uuid) to authenticated, service_role;

-- Il risultato è quello provato: la vista scritta qui è quella confrontata riga per
-- riga, e le due funzioni hanno il modo di pianificare atteso.
do $$
declare
  v_impronta text := md5(pg_get_viewdef('public.v_conversazioni_messaggi'::regclass, true));
begin
  if v_impronta <> '1a812df95d8f7d36c2d0adc381ca8f20' then
    raise exception 'v_conversazioni_messaggi: definizione diversa da quella provata il 13/10/2026 (impronta %)', v_impronta;
  end if;
  if not exists (select 1 from pg_catalog.pg_proc p
                  where p.oid = 'public.conversazioni_non_lette(uuid)'::regprocedure
                    and 'plan_cache_mode=force_generic_plan' = any (p.proconfig)) then
    raise exception 'conversazioni_non_lette: manca plan_cache_mode = force_generic_plan';
  end if;
  if not exists (select 1 from pg_catalog.pg_proc p
                  where p.oid = 'public.conversazioni_lista(uuid)'::regprocedure
                    and 'plan_cache_mode=force_custom_plan' = any (p.proconfig)) then
    raise exception 'conversazioni_lista: manca plan_cache_mode = force_custom_plan';
  end if;
end $$;
