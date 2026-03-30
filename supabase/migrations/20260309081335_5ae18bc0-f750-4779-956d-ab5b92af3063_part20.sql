-- Triggers
DROP TRIGGER IF EXISTS trg_bank_connections_updated_at ON public.bank_connections;
CREATE TRIGGER trg_bank_connections_updated_at BEFORE UPDATE ON public.bank_connections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
