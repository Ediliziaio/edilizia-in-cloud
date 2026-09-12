-- Il tetto di spesa pubblicitaria esisteva solo sulla carta: `ad_spend_guard`
-- era VUOTA in produzione, e il controllo in fase di pubblicazione era scritto
-- per lasciar passare tutto quando la riga manca. Il «Cap mensile protetto
-- 7.500 €» che il cliente legge in pagina era un numero scritto nel browser,
-- senza niente dietro: nessun tetto giornaliero, nessun tetto mensile, nessuna
-- pausa automatica. Il controllo orario (meta-ads-spend-check) è scritto bene
-- ma non aveva righe su cui lavorare.
--
-- Ogni azienda ha la sua riga, creata da qui in avanti insieme all'azienda.
INSERT INTO public.ad_spend_guard (company_id)
SELECT c.id FROM public.companies c
WHERE c.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.ad_spend_guard g WHERE g.company_id = c.id AND g.ad_account_id IS NULL);

CREATE OR REPLACE FUNCTION public.crea_tetto_spesa_ads()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.ad_spend_guard (company_id)
  VALUES (NEW.id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_crea_tetto_spesa_ads ON public.companies;
CREATE TRIGGER trg_crea_tetto_spesa_ads
AFTER INSERT ON public.companies
FOR EACH ROW
EXECUTE FUNCTION public.crea_tetto_spesa_ads();
