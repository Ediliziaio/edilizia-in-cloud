ALTER TABLE marketing_contacts ADD COLUMN call_center_id uuid REFERENCES auth.users(id);
