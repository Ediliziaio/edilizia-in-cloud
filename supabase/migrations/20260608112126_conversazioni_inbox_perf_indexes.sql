-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

CREATE INDEX IF NOT EXISTS idx_marketing_contacts_company_lower_email
  ON public.marketing_contacts (company_id, lower(email));

CREATE INDEX IF NOT EXISTS idx_marketing_contacts_tel_normalized
  ON public.marketing_contacts (telefono_normalized)
  WHERE telefono_normalized IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_inbox_company_lower_from
  ON public.email_inbox (company_id, lower(from_email));

CREATE INDEX IF NOT EXISTS idx_messaging_conversations_company_phone
  ON public.messaging_conversations (company_id, phone_number);

CREATE INDEX IF NOT EXISTS idx_messaging_messages_conv_created
  ON public.messaging_messages (conversation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_customer_messages_company_cust_created
  ON public.customer_messages (company_id, customer_id, created_at);

CREATE INDEX IF NOT EXISTS idx_sms_logs_company_created
  ON public.sms_logs (company_id, created_at);
