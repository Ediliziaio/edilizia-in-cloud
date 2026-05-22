-- ============================================================================
-- AI Prompt Templates — biblioteca prompt riusabili per il modulo Pubblicità
-- ============================================================================
-- L'utente ha richiesto: "ti genera i testi con i prompt specifici che andrò
-- ad inserire". Questa tabella permette di salvare prompt personalizzati
-- per riusarli nel Creative Studio.
--
-- Strategia:
--   • Templates "ufficiali" (company_id NULL) seedati globalmente
--   • Templates personalizzati (company_id NOT NULL) salvati dalla company
--   • Variables JSONB per placeholder dinamici (es. {{zone}}, {{offer}})
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ai_prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'copy', -- copy | image | hybrid
  description TEXT,

  -- Il prompt vero e proprio
  system_prompt TEXT NOT NULL,
  user_prompt_template TEXT, -- con {{placeholders}}

  -- Variabili attese (per validation + UI)
  -- Es. [{name: "zone", label: "Zona operativa", required: true}]
  variables JSONB DEFAULT '[]'::jsonb,

  -- Settore edile target (filter)
  segment TEXT, -- serramenti | bagni | ristrutturazioni | fotovoltaico | tetti | etc.

  -- Tono
  tone TEXT, -- professionale | familiare | tecnico | urgenza

  -- Usage tracking
  usage_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,

  is_official BOOLEAN NOT NULL DEFAULT false, -- template EiC seeded
  is_active BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT ai_prompt_templates_category_valid CHECK (category IN ('copy','image','hybrid'))
);

CREATE INDEX IF NOT EXISTS idx_ai_prompt_templates_company ON public.ai_prompt_templates(company_id);
CREATE INDEX IF NOT EXISTS idx_ai_prompt_templates_category ON public.ai_prompt_templates(category);
CREATE INDEX IF NOT EXISTS idx_ai_prompt_templates_segment ON public.ai_prompt_templates(segment) WHERE segment IS NOT NULL;

-- ============================================================================
-- Trigger updated_at
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_ai_prompt_templates_updated ON public.ai_prompt_templates';
    EXECUTE 'CREATE TRIGGER trg_ai_prompt_templates_updated BEFORE UPDATE ON public.ai_prompt_templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()';
  END IF;
END $$;

-- ============================================================================
-- RLS
-- ============================================================================
ALTER TABLE public.ai_prompt_templates ENABLE ROW LEVEL SECURITY;

-- I template ufficiali (company_id NULL) sono visibili a tutti
-- I template aziendali (company_id NOT NULL) solo alla propria company
DROP POLICY IF EXISTS "Users can view available prompt templates" ON public.ai_prompt_templates;
CREATE POLICY "Users can view available prompt templates"
  ON public.ai_prompt_templates FOR SELECT TO authenticated
  USING (
    company_id IS NULL  -- official templates
    OR company_id = public.get_user_company_id(auth.uid())
  );

DROP POLICY IF EXISTS "Admins can manage own company prompt templates" ON public.ai_prompt_templates;
CREATE POLICY "Admins can manage own company prompt templates"
  ON public.ai_prompt_templates FOR ALL TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'super_admin'))
  )
  WITH CHECK (
    company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'super_admin'))
  );

-- Super admin può gestire i template ufficiali (company_id NULL)
DROP POLICY IF EXISTS "Super admin can manage official prompt templates" ON public.ai_prompt_templates;
CREATE POLICY "Super admin can manage official prompt templates"
  ON public.ai_prompt_templates FOR ALL TO authenticated
  USING (company_id IS NULL AND public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (company_id IS NULL AND public.has_role(auth.uid(), 'super_admin'));

-- ============================================================================
-- SEED — template ufficiali EiC per settori edili comuni
-- ============================================================================
INSERT INTO public.ai_prompt_templates (
  id, company_id, name, category, description, system_prompt, user_prompt_template,
  variables, segment, tone, is_official, is_active
)
VALUES
  (
    gen_random_uuid(), NULL,
    'Serramenti — preventivo locale',
    'copy',
    'Copy Meta Ads per richieste preventivo serramenti.',
    'Sei un copywriter Meta Ads esperto in serramenti. Genera 5 varianti copy + 3 hook + 3 prompt immagine per impresa locale che vende serramenti. Tono professionale ma diretto. Italiano perfetto.',
    'Brief: {{brief}}. Zona: {{zone}}. Offerta concreta: {{offer}}. Target: famiglie 28-65 anni proprietarie casa.',
    '[
      {"name": "brief", "label": "Brief libero", "required": true},
      {"name": "zone", "label": "Zona operativa", "required": false},
      {"name": "offer", "label": "Offerta specifica", "required": false}
    ]'::jsonb,
    'serramenti',
    'professionale',
    true, true
  ),
  (
    gen_random_uuid(), NULL,
    'Bagni — chiavi in mano',
    'copy',
    'Copy per ristrutturazione bagni con preventivo chiaro.',
    'Sei un copywriter Meta Ads esperto in ristrutturazione bagni. Genera 5 copy + 3 hook che enfatizzino: tempi chiari, materiali certificati, preventivo trasparente. Tono affidabile, no claim esagerati. Italiano perfetto.',
    'Brief: {{brief}}. Zona: {{zone}}. USP: {{usp}}.',
    '[
      {"name": "brief", "label": "Brief", "required": true},
      {"name": "zone", "label": "Zona", "required": false},
      {"name": "usp", "label": "Punto di forza unico", "required": false}
    ]'::jsonb,
    'bagni',
    'professionale',
    true, true
  ),
  (
    gen_random_uuid(), NULL,
    'Fotovoltaico — risparmio bollette',
    'copy',
    'Copy per impianti fotovoltaici con focus su risparmio reale.',
    'Sei un copywriter Meta Ads per fotovoltaico residenziale. Genera 5 copy che evitino claim su "risparmi garantiti" e si concentrino su: valutazione gratuita, sopralluogo tecnico, autoconsumo. CTA: consulenza personalizzata. Italiano perfetto.',
    'Brief: {{brief}}. Zona operativa: {{zone}}. Tipo immobili target: {{target}}.',
    '[
      {"name": "brief", "label": "Brief", "required": true},
      {"name": "zone", "label": "Zona", "required": false},
      {"name": "target", "label": "Tipo immobili", "required": false}
    ]'::jsonb,
    'fotovoltaico',
    'tecnico',
    true, true
  ),
  (
    gen_random_uuid(), NULL,
    'Ristrutturazioni — generale',
    'copy',
    'Copy generico per ristrutturazione casa.',
    'Sei un copywriter Meta Ads per ristrutturazioni edili. Genera 5 copy che parlino di: sopralluogo qualificato, gestione lavori, tempi rispettati. Evita promesse di prezzo. CTA: richiedi consulenza. Italiano perfetto.',
    'Brief: {{brief}}. Zona: {{zone}}.',
    '[
      {"name": "brief", "label": "Brief", "required": true},
      {"name": "zone", "label": "Zona", "required": false}
    ]'::jsonb,
    'ristrutturazioni',
    'professionale',
    true, true
  ),
  (
    gen_random_uuid(), NULL,
    'Immagine cantiere realistica',
    'image',
    'Prompt DALL-E per immagini cantiere/lavoro autentiche.',
    'Genera prompt DALL-E (gpt-image-1) per immagini di lavori edili. Stile: realistico fotografico, no rendering 3D cartoonesco, contesto Italia, luce naturale. Niente persone con volti riconoscibili.',
    'Settore: {{segment}}. Soggetto: {{subject}}. Atmosfera: {{mood}}. Formato consigliato: {{format}}.',
    '[
      {"name": "segment", "label": "Settore", "required": true},
      {"name": "subject", "label": "Cosa mostrare", "required": true},
      {"name": "mood", "label": "Atmosfera", "required": false},
      {"name": "format", "label": "Formato (1:1/4:5/9:16)", "required": false}
    ]'::jsonb,
    NULL,
    'professionale',
    true, true
  )
ON CONFLICT DO NOTHING;

COMMENT ON TABLE public.ai_prompt_templates IS 'Template prompt riusabili per Creative Studio. Officiale (company_id NULL) o aziendale.';
