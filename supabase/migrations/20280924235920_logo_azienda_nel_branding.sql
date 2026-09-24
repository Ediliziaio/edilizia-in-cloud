-- Il logo aziendale arriva anche alla pagina di login white label (24/09/2026)
--
-- La pagina di login su un sottodominio white label
-- (innovasol.ediliziaincloud.com) legge il logo da company_branding.logo_url,
-- perché chi non è ancora entrato non può leggere companies. Quella copia si
-- aggiornava solo caricando il logo da Impostazioni → Branding: da Profilo
-- aziendale restava il logo vecchio. Ora la allinea il database, da qualunque
-- parte arrivi il cambio.
--
-- Solo per le aziende che hanno già una riga di branding: nessuna riga nuova,
-- quindi nessuna azienda diventa leggibile da fuori senza averlo scelto. Al
-- 24/09 le quattro righe esistenti erano già allineate: niente da recuperare.
--
-- Email e PDF invece il logo aziendale lo prendono come riserva al momento
-- (supabase/functions/_shared/logoAzienda.ts): lì non serve copiarlo.

CREATE OR REPLACE FUNCTION public.logo_azienda_nel_branding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.company_branding
     SET logo_url = NEW.logo_url,
         updated_at = now()
   WHERE company_id = NEW.id
     AND logo_url IS DISTINCT FROM NEW.logo_url;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.logo_azienda_nel_branding() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_logo_azienda_nel_branding ON public.companies;
CREATE TRIGGER trg_logo_azienda_nel_branding
  AFTER UPDATE OF logo_url ON public.companies
  FOR EACH ROW
  WHEN (NEW.logo_url IS DISTINCT FROM OLD.logo_url)
  EXECUTE FUNCTION public.logo_azienda_nel_branding();
