-- 2. Reassign existing bank triggers to use the dedicated function
DROP TRIGGER IF EXISTS trg_bank_connections_updated_at ON public.bank_connections;
