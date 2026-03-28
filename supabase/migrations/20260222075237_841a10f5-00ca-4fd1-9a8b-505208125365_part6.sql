-- 3. marketing_contact_field_values
CREATE TABLE public.marketing_contact_field_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.marketing_contacts(id) ON DELETE CASCADE,
  field_id uuid NOT NULL REFERENCES public.marketing_custom_fields(id) ON DELETE CASCADE,
  value text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(contact_id, field_id)
);
