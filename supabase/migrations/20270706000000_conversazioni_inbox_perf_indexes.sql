-- =============================================================================
-- Conversazioni / Inbox unificato — indici di performance per l'aggregatore
-- =============================================================================
-- La view v_conversazioni_messaggi (migration 20270704) unisce email/sms/whatsapp/
-- customer_messages con join su lower(email), telefono_normalized e phone_number,
-- e le RPC conversazioni_lista/conversazione_timeline ri-aggregano e ordinano per
-- created_at. Senza indici funzionali questi join/ordinamenti fanno scan completi.
--
-- Indici ADDITIVI e idempotenti (CREATE INDEX IF NOT EXISTS). Colonne verificate su
-- information_schema. Nessun rischio sui dati. Da applicare quando si esce dalla
-- modalità solo-locale (è una migration di sole performance, non cambia il comportamento).
-- =============================================================================

-- Join contatto via email (CONTATTO · EMAIL in/out)
CREATE INDEX IF NOT EXISTS idx_marketing_contacts_company_lower_email
  ON public.marketing_contacts (company_id, lower(email));

-- Join contatto via telefono normalizzato (SMS + WhatsApp)
CREATE INDEX IF NOT EXISTS idx_marketing_contacts_tel_normalized
  ON public.marketing_contacts (telefono_normalized)
  WHERE telefono_normalized IS NOT NULL;

-- Email ricevute: match from_email per azienda
CREATE INDEX IF NOT EXISTS idx_email_inbox_company_lower_from
  ON public.email_inbox (company_id, lower(from_email));

-- WhatsApp: join conversazione per azienda + numero
CREATE INDEX IF NOT EXISTS idx_messaging_conversations_company_phone
  ON public.messaging_conversations (company_id, phone_number);

-- Timeline WhatsApp: messaggi per conversazione ordinati nel tempo
CREATE INDEX IF NOT EXISTS idx_messaging_messages_conv_created
  ON public.messaging_messages (conversation_id, created_at);

-- CLIENTE · customer_messages: lista + timeline per azienda/cliente nel tempo
CREATE INDEX IF NOT EXISTS idx_customer_messages_company_cust_created
  ON public.customer_messages (company_id, customer_id, created_at);

-- SMS per azienda nel tempo
CREATE INDEX IF NOT EXISTS idx_sms_logs_company_created
  ON public.sms_logs (company_id, created_at);
