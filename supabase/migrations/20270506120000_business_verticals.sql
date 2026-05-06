-- MP-VERT-01 — Schema business_verticals + seed 15 verticali + onboarding multi-vertical
--
-- Generalizza il pattern serramentisti esistente (`vertical_*` tables) in un
-- sistema universale: ogni company sceglie 1 vertical principale + N secondari,
-- e il sistema specializza KB, personas, tariffe, render.
--
-- Idempotente: ON CONFLICT DO UPDATE su seed.

-- ────────────────────────────────────────────────────────────────────────────
-- 1) business_verticals
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.business_verticals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical_key    text NOT NULL UNIQUE,
  display_name    text NOT NULL,
  short_label     text NOT NULL,
  parent_vertical text,
  description     text,
  icon            text,
  color           text,
  has_render_module       boolean DEFAULT false,
  render_categories       text[] DEFAULT '{}'::text[],
  enabled_personas        text[] NOT NULL DEFAULT '{}'::text[],
  vertical_personas       text[] DEFAULT '{}'::text[],
  kb_areas                text[] NOT NULL DEFAULT '{}'::text[],
  default_tariff_template text,
  default_family_template text,
  recommended_plan        text DEFAULT 'plus',
  estimated_avg_revenue   numeric,
  enabled                 boolean DEFAULT true,
  sort_order              int DEFAULT 0,
  created_at              timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_business_verticals_enabled
  ON public.business_verticals(enabled, sort_order) WHERE enabled = true;

ALTER TABLE public.business_verticals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS business_verticals_read ON public.business_verticals;
CREATE POLICY business_verticals_read ON public.business_verticals FOR SELECT USING (true);

DROP POLICY IF EXISTS business_verticals_admin ON public.business_verticals;
CREATE POLICY business_verticals_admin ON public.business_verticals FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

COMMENT ON TABLE public.business_verticals IS
  'MP-VERT-01: catalogo verticali EiC (15 settori). Ogni company.vertical_key punta qui.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2) Estensione companies con vertical_key + secondary_verticals
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS vertical_key text,
  ADD COLUMN IF NOT EXISTS secondary_verticals text[] DEFAULT '{}'::text[];

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_vertical_fk'
  ) THEN
    ALTER TABLE public.companies
      ADD CONSTRAINT companies_vertical_fk
      FOREIGN KEY (vertical_key) REFERENCES public.business_verticals(vertical_key)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_companies_vertical_key
  ON public.companies(vertical_key) WHERE vertical_key IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 3) vertical_persona_overrides
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.vertical_persona_overrides (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical_key           text NOT NULL REFERENCES public.business_verticals(vertical_key) ON DELETE CASCADE,
  persona_key            text NOT NULL,
  system_prompt_addendum text,
  vertical_kb_filter     text[] DEFAULT '{}'::text[],
  vertical_tools_extra   jsonb DEFAULT '[]'::jsonb,
  enabled                boolean DEFAULT true,
  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now(),
  UNIQUE(vertical_key, persona_key)
);

CREATE INDEX IF NOT EXISTS idx_vpo_vertical_persona
  ON public.vertical_persona_overrides(vertical_key, persona_key) WHERE enabled = true;

ALTER TABLE public.vertical_persona_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vpo_read ON public.vertical_persona_overrides;
CREATE POLICY vpo_read ON public.vertical_persona_overrides FOR SELECT USING (true);

DROP POLICY IF EXISTS vpo_admin ON public.vertical_persona_overrides;
CREATE POLICY vpo_admin ON public.vertical_persona_overrides FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

COMMENT ON TABLE public.vertical_persona_overrides IS
  'MP-VERT-01: per ogni vertical, override del system prompt persona + KB filter + tool extra.';

-- ────────────────────────────────────────────────────────────────────────────
-- 4) Estensione ai_brain_documents con vertical_key + is_universal_for_vertical
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.ai_brain_documents
  ADD COLUMN IF NOT EXISTS vertical_key text,
  ADD COLUMN IF NOT EXISTS is_universal_for_vertical boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_ai_brain_documents_vertical
  ON public.ai_brain_documents(vertical_key) WHERE vertical_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_brain_documents_universal_vertical
  ON public.ai_brain_documents(vertical_key, is_universal_for_vertical)
  WHERE is_universal_for_vertical = true;

COMMENT ON COLUMN public.ai_brain_documents.is_universal_for_vertical IS
  'MP-VERT-01: documenti con flag=true sono visibili a TUTTE le companies del vertical (es. normativa).';

-- ────────────────────────────────────────────────────────────────────────────
-- 5) Seed 15 verticali iniziali
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO public.business_verticals
  (vertical_key, display_name, short_label, description, icon, color, has_render_module, render_categories,
   enabled_personas, kb_areas, recommended_plan, sort_order)
VALUES
  ('serramentisti','Serramentisti / Infissi','Serramenti',
   'Aziende che producono e installano serramenti, finestre, persiane, scuri, zanzariere',
   'window','#0ea5e9',true,ARRAY['infissi','persiane'],
   ARRAY['silvio','pm_cantiere','sales','cfo','amministrazione'],
   ARRAY['normativa_serramenti_uni_en_14351','cam_serramenti','fiscale_50pct_ristrutturazioni','ecobonus_serramenti'],
   'plus',10),

  ('tettisti','Tettisti / Coperture','Tetti',
   'Imprese specializzate in coperture, manti bituminosi, lattoneria, isolamento termico tetti',
   'home','#dc2626',true,ARRAY['tetti'],
   ARRAY['silvio','pm_cantiere','sales','cfo','amministrazione','compliance'],
   ARRAY['normativa_tetti_uni8178','en13956_impermeabilizzanti','sicurezza_lavori_quota','pimus_ponteggi'],
   'plus',20),

  ('bagnisti','Ristrutturazioni Bagni','Bagni',
   'Ristrutturazione completa bagni e ambienti idro-sanitari',
   'bath','#0891b2',true,ARRAY['bagni'],
   ARRAY['silvio','pm_cantiere','sales','cfo','amministrazione'],
   ARRAY['dm_236_89_barriere_architettoniche','impianti_idro_sanitari','fiscale_75pct_barriere'],
   'plus',30),

  ('facciatisti','Facciatisti / Cappotto','Cappotto',
   'Cappotto termico esterno (ETICS), intonaci, trattamenti facciate',
   'building','#84cc16',false,ARRAY[]::text[],
   ARRAY['silvio','pm_cantiere','sales','cfo','amministrazione'],
   ARRAY['uni_en_13499_etics','superbonus_110_cappotto','ecobonus','asseverazioni_caat'],
   'plus',40),

  ('persianisti','Persianisti','Persiane',
   'Specialisti persiane, scuri, oscuranti motorizzati',
   'blinds','#a16207',false,ARRAY[]::text[],
   ARRAY['silvio','pm_cantiere','sales','cfo','amministrazione'],
   ARRAY['normativa_serramenti_uni_en_14351','cam_serramenti'],
   'plus',50),

  ('pergolisti','Pergolisti / Bioclimatiche','Pergole',
   'Pergole bioclimatiche, gazebo, strutture esterne fisse e mobili',
   'sun','#f59e0b',true,ARRAY['pergole'],
   ARRAY['silvio','pm_cantiere','sales','cfo','amministrazione','compliance'],
   ARRAY['edilizia_libera_dlgs_222','permessi_pergola_cila_scia','tnm_glasstech'],
   'plus',60),

  ('piscinisti','Piscinisti','Piscine',
   'Costruzione, manutenzione e ristrutturazione piscine residenziali e ricettive',
   'droplets','#0ea5e9',false,ARRAY[]::text[],
   ARRAY['silvio','pm_cantiere','sales','cfo','amministrazione','compliance'],
   ARRAY['normativa_piscine_uniformata','autorizzazioni_piscina_comunale','sicurezza_piscine_uni_pdr'],
   'premium',70),

  ('pavimentisti_interni','Pavimentisti Interni','Pavimenti int.',
   'Posa pavimenti interni: parquet, ceramica, gres, microcemento, resine',
   'layers-3','#92400e',false,ARRAY[]::text[],
   ARRAY['silvio','pm_cantiere','sales','cfo','amministrazione'],
   ARRAY['posa_pavimenti_uni_11515','massetti_uni_en_13813'],
   'plus',80),

  ('pavimentisti_esterni','Pavimentisti Esterni','Pavimenti est.',
   'Pavimentazioni esterne: autobloccanti, resine, drenanti, pietra naturale',
   'layers-3','#65a30d',false,ARRAY[]::text[],
   ARRAY['silvio','pm_cantiere','sales','cfo','amministrazione'],
   ARRAY['drenaggio_pavimenti','permeabilita_dlgs_riduzione_consumo'],
   'plus',90),

  ('porte_blindate','Porte Blindate','Blindate',
   'Vendita e installazione porte blindate, sistemi di sicurezza accessi',
   'wrench','#475569',false,ARRAY[]::text[],
   ARRAY['silvio','pm_cantiere','sales','cfo','amministrazione'],
   ARRAY['uni_envz_1627_classi_anti_effrazione','detrazione_50pct_sicurezza','marchio_ce_porte'],
   'plus',100),

  ('porte_interne','Porte Interne','Porte int.',
   'Porte interne: battenti, scorrevoli a scomparsa, raso muro',
   'package','#a16207',false,ARRAY[]::text[],
   ARRAY['silvio','pm_cantiere','sales','cfo','amministrazione'],
   ARRAY['posa_qualificata_porte','marchio_ce_porte_interne'],
   'plus',110),

  ('giardinieri','Giardinieri / Verde','Giardini',
   'Manutenzione e progettazione giardini, parchi, aree verdi',
   'paintbrush','#16a34a',false,ARRAY[]::text[],
   ARRAY['silvio','pm_cantiere','sales','cfo','amministrazione'],
   ARRAY['contratto_manutenzione_verde','codice_strada_potatura','tutela_alberi_monumentali'],
   'pro',120),

  ('ristrutturatori_interni','Ristrutturatori Interni','Ristruttur.',
   'Ristrutturazioni complete interni, comprensive di impianti',
   'hammer','#7c3aed',true,ARRAY['interni'],
   ARRAY['silvio','pm_cantiere','sales','cfo','amministrazione','compliance'],
   ARRAY['fiscale_50pct_ristrutturazioni','superbonus_110','dia_scia_cila','t_u_edilizia_dpr_380'],
   'premium',130),

  ('fotovoltaico','Fotovoltaico','FV',
   'Impianti fotovoltaici residenziali e commerciali con accumulo',
   'zap','#facc15',false,ARRAY[]::text[],
   ARRAY['silvio','pm_cantiere','sales','cfo','amministrazione','compliance'],
   ARRAY['conto_energia','scia_fv','gse_incentivi','autoconsumo_collettivo'],
   'premium',140),

  ('edili_generaliste','Imprese Edili Generaliste','Generalista',
   'Imprese edili a 360°: ristrutturazioni complete, nuove costruzioni, demolizioni',
   'construction','#a855f7',true,ARRAY['interni','esterni','tetti'],
   ARRAY['silvio','pm_cantiere','sales','cfo','amministrazione','compliance','hr'],
   ARRAY['t_u_edilizia_dpr_380','superbonus_110','sicurezza_d_lgs_81','pos_psc','pimus_ponteggi','codice_appalti_dlgs_36'],
   'enterprise',999)
ON CONFLICT (vertical_key) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      description = EXCLUDED.description,
      icon = EXCLUDED.icon,
      color = EXCLUDED.color,
      enabled_personas = EXCLUDED.enabled_personas,
      kb_areas = EXCLUDED.kb_areas,
      sort_order = EXCLUDED.sort_order;

-- ────────────────────────────────────────────────────────────────────────────
-- 6) Backfill: companies senza vertical_key → 'edili_generaliste'
-- ────────────────────────────────────────────────────────────────────────────

UPDATE public.companies
   SET vertical_key = 'edili_generaliste'
 WHERE vertical_key IS NULL;

-- Trigger updated_at su vertical_persona_overrides
CREATE OR REPLACE FUNCTION public.tg_vpo_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vpo_updated_at ON public.vertical_persona_overrides;
CREATE TRIGGER trg_vpo_updated_at
  BEFORE UPDATE ON public.vertical_persona_overrides
  FOR EACH ROW EXECUTE FUNCTION public.tg_vpo_updated_at();
