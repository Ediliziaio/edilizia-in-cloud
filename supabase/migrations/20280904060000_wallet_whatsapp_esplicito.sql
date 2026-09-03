-- Ondata 0.5 — il wallet WhatsApp esiste, anche quando è vuoto
--
-- Misurato prima dell'intervento: 18 aziende, 18 wallet AI, 18 wallet email,
-- **0 wallet WhatsApp**. AI ed email vengono creati da un trigger alla nascita
-- dell'azienda (init_company_credits, init_company_email_credits); per WhatsApp
-- non lo faceva nessuno. La riga nasceva per caso, alla prima ricarica o al
-- primo addebito.
--
-- Con l'assenza della riga, "non ho credito" e "il wallet non è mai stato
-- creato" sono lo stesso stato: chi legge non sa distinguerli, e l'interfaccia
-- non mostra nulla invece di mostrare 0,00 €. Ora la riga c'è sempre, e un
-- saldo a zero è un fatto dichiarato invece che un'assenza.
--
-- Questo NON regala credito: il saldo parte da zero, quindi gli invii restano
-- bloccati finché non si ricarica — che è esattamente il punto dell'ondata 0.5.
--
-- Idempotente.

CREATE OR REPLACE FUNCTION public.init_company_whatsapp_credits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.whatsapp_credits (company_id) VALUES (NEW.id)
  ON CONFLICT (company_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_init_whatsapp_credits ON public.companies;
CREATE TRIGGER trg_init_whatsapp_credits
  AFTER INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.init_company_whatsapp_credits();

-- Le aziende già esistenti: il wallet a zero, non un regalo.
INSERT INTO public.whatsapp_credits (company_id)
SELECT c.id FROM public.companies c
WHERE NOT EXISTS (
  SELECT 1 FROM public.whatsapp_credits w WHERE w.company_id = c.id
)
ON CONFLICT (company_id) DO NOTHING;
