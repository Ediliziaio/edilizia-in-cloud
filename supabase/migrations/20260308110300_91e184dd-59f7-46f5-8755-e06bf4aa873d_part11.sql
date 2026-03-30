CREATE INDEX IF NOT EXISTS idx_marketing_contacts_unsubscribed ON public.marketing_contacts(company_id) WHERE unsubscribed = false;
