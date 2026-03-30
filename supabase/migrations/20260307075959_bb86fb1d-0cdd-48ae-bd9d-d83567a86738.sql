-- 1. Create contact_messages table
CREATE TABLE IF NOT EXISTS public.contact_messages (
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
