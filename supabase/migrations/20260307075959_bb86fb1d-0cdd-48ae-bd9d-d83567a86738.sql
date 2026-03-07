
-- 1. Create contact_messages table
CREATE TABLE public.contact_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.marketing_contacts(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  channel text NOT NULL,
  content text NOT NULL,
  subject text,
  sent_at timestamptz DEFAULT now(),
  status text DEFAULT 'sent',
  sent_by uuid,
  created_at timestamptz DEFAULT now()
);

-- Validation trigger for channel
CREATE OR REPLACE FUNCTION public.validate_contact_message_channel()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.channel NOT IN ('whatsapp', 'email', 'sms') THEN
    RAISE EXCEPTION 'channel deve essere whatsapp, email o sms';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_contact_message_channel
  BEFORE INSERT OR UPDATE ON public.contact_messages
  FOR EACH ROW EXECUTE FUNCTION public.validate_contact_message_channel();

-- Index for fast lookups
CREATE INDEX idx_contact_messages_contact_id ON public.contact_messages(contact_id);
CREATE INDEX idx_contact_messages_company_id ON public.contact_messages(company_id);

-- Enable RLS
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

-- RLS policies: authenticated users can CRUD on their own company
CREATE POLICY "Users can view own company messages" ON public.contact_messages
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert own company messages" ON public.contact_messages
  FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update own company messages" ON public.contact_messages
  FOR UPDATE TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can delete own company messages" ON public.contact_messages
  FOR DELETE TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- Super admin full access
CREATE POLICY "Super admin full access contact_messages" ON public.contact_messages
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- 2. Add preference columns to marketing_contacts
ALTER TABLE public.marketing_contacts ADD COLUMN IF NOT EXISTS preferred_language text DEFAULT 'italiano';
ALTER TABLE public.marketing_contacts ADD COLUMN IF NOT EXISTS preferred_channel text DEFAULT 'whatsapp';
ALTER TABLE public.marketing_contacts ADD COLUMN IF NOT EXISTS optout_whatsapp boolean DEFAULT false;
ALTER TABLE public.marketing_contacts ADD COLUMN IF NOT EXISTS optout_email boolean DEFAULT false;
