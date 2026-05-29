-- ════════════════════════════════════════════════════════════════════════════
-- MP-SILVIO-07 · Multicanale — identità per canale (fondazione)
-- Stesso cervello, molte bocche: i canali (voce, WhatsApp) sono adattatori verso
-- l'unico orchestratore. Identità PRIMA dell'azione: nessuna azione sensibile da
-- un canale esterno senza numero→utente verificato. Le regole/permessi NON
-- cambiano col canale (restano quelli del registro MP-SILVIO-01).
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.silvio_canali_identita (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  utente_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  canale         text NOT NULL CHECK (canale IN ('whatsapp','voce')),
  identificativo text NOT NULL,                 -- numero di telefono normalizzato (E.164)
  verificato     boolean NOT NULL DEFAULT false,
  verificato_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (canale, identificativo)
);
CREATE INDEX IF NOT EXISTS idx_silvio_canali_company ON public.silvio_canali_identita (company_id, canale);

-- Risolve un identificativo di canale → utente (SOLO se verificato).
-- Usata dagli adattatori prima di concedere azioni (auth debole → identità certa).
CREATE OR REPLACE FUNCTION public.silvio_canale_risolvi_utente(p_canale text, p_identificativo text)
RETURNS TABLE (utente_id uuid, company_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT utente_id, company_id FROM public.silvio_canali_identita
  WHERE canale = p_canale AND identificativo = p_identificativo AND verificato = true
  LIMIT 1;
$$;

ALTER TABLE public.silvio_canali_identita ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS silvio_canali_staff ON public.silvio_canali_identita;
CREATE POLICY silvio_canali_staff ON public.silvio_canali_identita FOR ALL TO authenticated
  USING (company_id = public.get_effective_company_id() AND public.is_email_staff_interno())
  WITH CHECK (company_id = public.get_effective_company_id() AND public.is_email_staff_interno());
DROP POLICY IF EXISTS silvio_canali_service ON public.silvio_canali_identita;
CREATE POLICY silvio_canali_service ON public.silvio_canali_identita FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS silvio_canali_super ON public.silvio_canali_identita;
CREATE POLICY silvio_canali_super ON public.silvio_canali_identita FOR ALL TO authenticated USING (public.is_super_admin(auth.uid()));

REVOKE EXECUTE ON FUNCTION public.silvio_canale_risolvi_utente(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.silvio_canale_risolvi_utente(text, text) TO service_role;

COMMENT ON TABLE public.silvio_canali_identita IS 'MP-SILVIO-07: lega numero (WhatsApp/voce) a un utente verificato. Identità prima dell''azione sui canali esterni.';
