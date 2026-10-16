-- Add is_blocked column to profiles for admin-controlled access blocking
-- Different from locked_until (which is automatic from failed login attempts)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS blocked_by UUID REFERENCES auth.users(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS block_reason TEXT;

-- Completa gli indici FK rinviati dalla ricostruzione di maggio 2026.
CREATE INDEX IF NOT EXISTS idx_profiles_blocked_by ON public.profiles(blocked_by);
