-- Index for cleanup and lookup
CREATE INDEX IF NOT EXISTS idx_active_impersonations_admin ON public.active_impersonations(admin_user_id);
