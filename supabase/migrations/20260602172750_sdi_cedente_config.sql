-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Stato di onboarding Fatturazione Elettronica per azienda (modello intermediario:
-- 1 account openapi piattaforma → N cedenti registrati). Permette di scalare a
-- migliaia di aziende tracciando registrazione + delega di ciascuna.
CREATE TABLE IF NOT EXISTS public.sdi_cedente_config (
  id                  uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id          uuid NOT NULL UNIQUE,
  provider            text NOT NULL DEFAULT 'openapi',
  fiscal_id           text,                       -- P.IVA del cedente
  name                text,
  email               text,
  provider_config_id  text,                       -- id config presso il provider
  codice_destinatario text,                       -- codice SDI del canale (per ricezione)
  stato               text NOT NULL DEFAULT 'pending'
                        CHECK (stato IN ('pending','registrato','attivo','errore','disattivato')),
  delega_stato        text NOT NULL DEFAULT 'none'
                        CHECK (delega_stato IN ('none','richiesta','attiva','revocata')),
  last_error          text,
  registered_at       timestamptz,
  last_checked_at     timestamptz,
  meta                jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.sdi_cedente_config IS
  'Onboarding FE/SDI per azienda (registrazione cedente su openapi + stato delega). Scala multi-tenant.';

CREATE INDEX IF NOT EXISTS idx_sdi_cedente_stato ON public.sdi_cedente_config (stato);

ALTER TABLE public.sdi_cedente_config ENABLE ROW LEVEL SECURITY;
-- i membri dell'azienda vedono la propria config; il super_admin tutte. Service-role bypassa.
DROP POLICY IF EXISTS "company reads own sdi config" ON public.sdi_cedente_config;
CREATE POLICY "company reads own sdi config"
  ON public.sdi_cedente_config FOR SELECT
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.has_role(auth.uid(), 'super_admin'));

DROP TRIGGER IF EXISTS trg_sdi_cedente_updated_at ON public.sdi_cedente_config;
CREATE TRIGGER trg_sdi_cedente_updated_at
  BEFORE UPDATE ON public.sdi_cedente_config
  FOR EACH ROW EXECUTE FUNCTION public.tg_lss_searches_updated_at();
