-- 2. ai_campaign_contacts
CREATE TABLE IF NOT EXISTS public.ai_campaign_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.ai_campaigns_v2(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.marketing_contacts(id) ON DELETE SET NULL,
  nome text,
  telefono text NOT NULL,
  stato text NOT NULL DEFAULT 'in_coda',
  tentativo_corrente int DEFAULT 0,
  ultimo_tentativo_il timestamptz,
  risposta boolean DEFAULT false,
  durata_secondi int DEFAULT 0,
  note text,
  metadata jsonb DEFAULT '{}',
  creato_il timestamptz DEFAULT now()
);
