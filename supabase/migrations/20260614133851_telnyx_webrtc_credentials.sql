-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Credenziali WebRTC Telnyx per operatore (softphone in-app, Fase 1 centralina).
-- Una credential SIP per utente, riusata; il token effimero si genera a richiesta.
-- I segreti restano lato server: nessuna policy per authenticated → solo service_role.
CREATE TABLE IF NOT EXISTS public.telnyx_webrtc_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  telnyx_credential_id text NOT NULL,
  sip_username text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, company_id)
);

ALTER TABLE public.telnyx_webrtc_credentials ENABLE ROW LEVEL SECURITY;
-- Nessuna policy permissiva per authenticated: i client NON leggono i segreti.
-- L'edge function (service_role) bypassa la RLS e gestisce tutto.

COMMENT ON TABLE public.telnyx_webrtc_credentials IS
  'Credenziali WebRTC Telnyx per operatore (softphone in-app). Gestita solo da edge function telnyx-webrtc-token.';
