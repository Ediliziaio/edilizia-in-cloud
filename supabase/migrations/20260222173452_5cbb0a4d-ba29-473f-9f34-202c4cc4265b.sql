ALTER TABLE marketing_contacts ADD COLUMN IF NOT EXISTS call_center_id uuid REFERENCES auth.users(id);
