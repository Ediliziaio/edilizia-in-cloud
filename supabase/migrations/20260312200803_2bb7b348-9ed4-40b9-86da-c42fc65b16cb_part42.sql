CREATE TRIGGER trg_calcola_giornata_hr
AFTER INSERT ON public.hr_timbrature
FOR EACH ROW
EXECUTE FUNCTION public.calcola_giornata_hr();
