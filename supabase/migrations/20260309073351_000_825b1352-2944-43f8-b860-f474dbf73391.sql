-- Add user_id to referrers so partners can log in and view their data
ALTER TABLE public.referrers ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
