-- Anti-doppione opportunità auto-generate dai lead FB/Meta.
-- Contesto: il fix "re-entry lead ripetuto" (20260718140000) ri-arruola i lead FB
-- ripetuti nell'automazione, che esegue l'azione crea_opportunita. Quell'azione
-- (process-automation, create_opportunity) NON deduplica → un lead ripetuto avrebbe
-- generato una 2ª opportunità aperta sullo stesso contatto.
--
-- Fix DB: BEFORE INSERT su marketing_opportunities. Se il contatto ha GIÀ
-- un'opportunità APERTA da fonte facebook/meta, salta l'insert (RETURN NULL).
-- Le opportunità manuali (altra source) e i contatti senza opp aperta NON sono
-- toccati; una opp facebook nasce solo se non ce n'è già una aperta (es. dopo
-- che la precedente è stata vinta/persa, un nuovo lead ne crea una nuova).

CREATE OR REPLACE FUNCTION public.dedupe_fb_open_opportunity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.contact_id IS NOT NULL
     AND COALESCE(NEW.status, 'open') = 'open'
     AND (NEW.source ILIKE 'facebook%' OR NEW.source ILIKE '%meta%')
     AND EXISTS (
       SELECT 1 FROM public.marketing_opportunities o
       WHERE o.company_id = NEW.company_id
         AND o.contact_id = NEW.contact_id
         AND o.status = 'open'
         AND (o.source ILIKE 'facebook%' OR o.source ILIKE '%meta%')
     )
  THEN
    RETURN NULL; -- salta l'insert: niente doppione
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dedupe_fb_open_opportunity ON public.marketing_opportunities;
CREATE TRIGGER trg_dedupe_fb_open_opportunity
BEFORE INSERT ON public.marketing_opportunities
FOR EACH ROW
EXECUTE FUNCTION public.dedupe_fb_open_opportunity();
