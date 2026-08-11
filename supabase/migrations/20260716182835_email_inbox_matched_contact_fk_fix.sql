-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- email_inbox.matched_contact_id puntava a PROFILES per errore di schema:
-- mai scritta da nessuno (0 righe valorizzate su 2497, zero riferimenti nel
-- codice). La si ripunta a marketing_contacts, il significato inteso — è la
-- colonna che l'edge email-inbound-reply usa per agganciare le risposte al
-- contatto CRM (reply GHL-style).
ALTER TABLE public.email_inbox DROP CONSTRAINT IF EXISTS email_inbox_matched_contact_id_fkey;
ALTER TABLE public.email_inbox ADD CONSTRAINT email_inbox_matched_contact_id_fkey
  FOREIGN KEY (matched_contact_id) REFERENCES public.marketing_contacts(id) ON DELETE SET NULL;
