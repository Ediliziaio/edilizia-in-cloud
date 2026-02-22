ALTER TABLE marketing_contacts ADD COLUMN call_center_id uuid REFERENCES auth.users(id);
ALTER TABLE marketing_opportunities ADD COLUMN call_center_id uuid REFERENCES auth.users(id);