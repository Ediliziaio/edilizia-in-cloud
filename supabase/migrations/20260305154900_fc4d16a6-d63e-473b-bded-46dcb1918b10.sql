-- Index for salesperson_id filtering
CREATE INDEX IF NOT EXISTS idx_profiles_salesperson_id ON public.profiles (salesperson_id);
