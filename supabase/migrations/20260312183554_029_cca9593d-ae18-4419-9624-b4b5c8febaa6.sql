CREATE TRIGGER trigger_stats_anagrafica_native
AFTER INSERT OR UPDATE ON public.documenti_fiscali
FOR EACH ROW EXECUTE FUNCTION public.aggiorna_stats_anagrafica_native();
