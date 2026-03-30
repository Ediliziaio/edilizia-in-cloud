ALTER TABLE marketing_opportunities ADD COLUMN IF NOT EXISTS call_center_id uuid REFERENCES auth.users(id);
