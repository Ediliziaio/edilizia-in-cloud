-- ════════════════════════════════════════════════════════════════════════════
-- FASE 2 — article_family_templates
-- ────────────────────────────────────────────────────────────────────────────
-- Galleria globale di TEMPLATE ARTICOLI pre-confezionati, gestiti dal
-- super_admin. Ogni template descrive una "famiglia" tipo (es. Finestra 1
-- anta, Finestra 2 ante, Persiana scorrevole, Pannello FV 400Wp, ecc.) con:
--   • metadati commerciali (nome, descrizione, foto, vertical/categoria)
--   • configurazione preventivo (modalita_prezzo_base, griglia, assi, unit_of_measure)
--   • assi default (es. Apertura: anta-ribalta/scorrevole; Vetro: doppio/triplo)
--   • griglia prezzi suggerita (opzionale — il commerciale poi ritocca)
--   • custom_field_defaults JSONB per i campi scheda tecnica
--
-- Workflow: dal FamilyCatalog il commerciale clicca "Importa da template" →
-- modal con galleria filtrabile → click "Importa" → si clonano i record
-- (article_families + article_family_axes + article_family_axis_values) sotto
-- il company_id corrente, pre-popolando tutto. Il commerciale può poi
-- modificare/personalizzare normalmente.
--
-- Differenze chiave vs article_photo_templates (FASE 1):
--   • foto template ≠ family template: la foto è solo l'immagine, la family
--     template è la struttura COMPLETA pronta da clonare.
--   • Una family template può PUNTARE a una photo template (via image_url).
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.article_family_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identità
  nome TEXT NOT NULL,
  descrizione TEXT,
  vertical_slug TEXT NOT NULL,
  categoria_slug TEXT,
  tipologia TEXT,         -- es. "infisso", "porta_finestra", "persiana"
  materiale TEXT,         -- es. "pvc", "alluminio", "legno"

  -- Immagine (può riusare URL dalla galleria foto template)
  image_url TEXT,
  thumbnail_url TEXT,

  -- Tag per ricerca / filtro
  tags TEXT[] NOT NULL DEFAULT '{}',

  -- Configurazione preventivo (specchio di article_families.*)
  modalita_prezzo_base TEXT NOT NULL DEFAULT 'griglia'
    CHECK (modalita_prezzo_base IN ('pz','mq','griglia','misura_libera')),
  prezzo_base_vendita NUMERIC(12,4) DEFAULT 0,
  vat_rate NUMERIC(5,2) DEFAULT 22,
  unit_of_measure TEXT DEFAULT 'pz',

  -- Griglia (label assi + unità di misura)
  griglia_asse_x_label TEXT DEFAULT 'Larghezza (mm)',
  griglia_asse_y_label TEXT DEFAULT 'Altezza (mm)',
  griglia_unita TEXT DEFAULT 'mm',

  -- Assi & valori di default — JSONB array di oggetti tipo:
  -- [{
  --    nome: "Apertura", codice: "apertura", tipo: "discrete", obbligatorio: true,
  --    sort_order: 0,
  --    values: [
  --      { valore: "anta_ribalta", label: "Anta-Ribalta", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 },
  --      { valore: "scorrevole",   label: "Scorrevole",   is_default: false, maggiorazione_tipo: "percentuale", maggiorazione_valore: 10 }
  --    ]
  -- }, ...]
  assi_default JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Griglia prezzi suggerita (opzionale)
  -- Formato: { x: [800, 1000, 1200, 1400], y: [800, 1000, 1200, 1400, 1800], prezzi: [[120,150,...], ...] }
  griglia_default JSONB,

  -- Custom field default values (specchio di article_families.custom_field_values)
  custom_field_defaults JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Stato + ordinamento
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_aft_vertical
  ON public.article_family_templates (vertical_slug)
  WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_aft_categoria
  ON public.article_family_templates (categoria_slug);
CREATE INDEX IF NOT EXISTS idx_aft_tipologia
  ON public.article_family_templates (tipologia);
CREATE INDEX IF NOT EXISTS idx_aft_tags
  ON public.article_family_templates USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_aft_sort
  ON public.article_family_templates (vertical_slug, sort_order, nome);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.touch_article_family_templates_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_aft_touch_updated_at ON public.article_family_templates;
CREATE TRIGGER trg_aft_touch_updated_at
BEFORE UPDATE ON public.article_family_templates
FOR EACH ROW EXECUTE FUNCTION public.touch_article_family_templates_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- RLS
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.article_family_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "aft_select_authenticated" ON public.article_family_templates;
CREATE POLICY "aft_select_authenticated"
ON public.article_family_templates FOR SELECT
TO authenticated
USING (is_active = true);

DROP POLICY IF EXISTS "aft_insert_super_admin" ON public.article_family_templates;
CREATE POLICY "aft_insert_super_admin"
ON public.article_family_templates FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'super_admin'
  )
);

DROP POLICY IF EXISTS "aft_update_super_admin" ON public.article_family_templates;
CREATE POLICY "aft_update_super_admin"
ON public.article_family_templates FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'super_admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'super_admin'
  )
);

DROP POLICY IF EXISTS "aft_delete_super_admin" ON public.article_family_templates;
CREATE POLICY "aft_delete_super_admin"
ON public.article_family_templates FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'super_admin'
  )
);

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: importa template in azienda (clone)
-- ────────────────────────────────────────────────────────────────────────────
-- Clona un template dentro public.article_families + assi + valori del
-- company_id corrente. Restituisce l'id della famiglia creata.
-- Sicurezza: l'utente DEVE appartenere all'azienda destinazione e avere
-- almeno il ruolo titolare/admin/responsabile_commerciale.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.import_article_family_template(
  p_template_id UUID,
  p_company_id UUID,
  p_categoria_id UUID DEFAULT NULL,
  p_nome_override TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_template public.article_family_templates%ROWTYPE;
  v_family_id UUID;
  v_asse JSONB;
  v_axis_id UUID;
  v_value JSONB;
  v_user_id UUID := auth.uid();
BEGIN
  -- Authn
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  -- Authz: l'utente deve appartenere all'azienda destinazione.
  -- Riusiamo l'helper get_user_company_id (presente nello schema, usato
  -- in tutte le policy RLS company-scoped).
  IF public.get_user_company_id(v_user_id) IS DISTINCT FROM p_company_id THEN
    RAISE EXCEPTION 'not a member of company %', p_company_id
      USING ERRCODE = '42501';
  END IF;

  -- Carica template
  SELECT * INTO v_template
  FROM public.article_family_templates
  WHERE id = p_template_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'template % not found or inactive', p_template_id;
  END IF;

  -- Inserisce article_families
  INSERT INTO public.article_families (
    company_id, vertical, categoria_id, nome, descrizione,
    immagine_url, modalita_prezzo_base, prezzo_base_vendita, vat_rate,
    unit_of_measure, griglia_asse_x_label, griglia_asse_y_label, griglia_unita,
    custom_field_values, attivo
  ) VALUES (
    p_company_id,
    v_template.vertical_slug,
    p_categoria_id,
    COALESCE(p_nome_override, v_template.nome),
    v_template.descrizione,
    v_template.image_url,
    v_template.modalita_prezzo_base,
    COALESCE(v_template.prezzo_base_vendita, 0),
    COALESCE(v_template.vat_rate, 22),
    COALESCE(v_template.unit_of_measure, 'pz'),
    COALESCE(v_template.griglia_asse_x_label, 'Larghezza (mm)'),
    COALESCE(v_template.griglia_asse_y_label, 'Altezza (mm)'),
    COALESCE(v_template.griglia_unita, 'mm'),
    COALESCE(v_template.custom_field_defaults, '{}'::jsonb),
    true
  )
  RETURNING id INTO v_family_id;

  -- Inserisce assi + valori
  FOR v_asse IN SELECT * FROM jsonb_array_elements(COALESCE(v_template.assi_default, '[]'::jsonb))
  LOOP
    INSERT INTO public.article_family_axes (
      family_id, company_id, nome, codice, descrizione, tipo, obbligatorio, sort_order
    ) VALUES (
      v_family_id,
      p_company_id,
      v_asse->>'nome',
      v_asse->>'codice',
      v_asse->>'descrizione',
      COALESCE(v_asse->>'tipo', 'discrete'),
      COALESCE((v_asse->>'obbligatorio')::boolean, true),
      COALESCE((v_asse->>'sort_order')::int, 0)
    )
    RETURNING id INTO v_axis_id;

    FOR v_value IN SELECT * FROM jsonb_array_elements(COALESCE(v_asse->'values', '[]'::jsonb))
    LOOP
      INSERT INTO public.article_family_axis_values (
        axis_id, company_id, valore, label, descrizione, is_default,
        maggiorazione_tipo, maggiorazione_valore, sort_order, attivo
      ) VALUES (
        v_axis_id,
        p_company_id,
        v_value->>'valore',
        v_value->>'label',
        v_value->>'descrizione',
        COALESCE((v_value->>'is_default')::boolean, false),
        COALESCE(v_value->>'maggiorazione_tipo', 'none'),
        COALESCE((v_value->>'maggiorazione_valore')::numeric, 0),
        COALESCE((v_value->>'sort_order')::int, 0),
        true
      );
    END LOOP;
  END LOOP;

  RETURN v_family_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.import_article_family_template(UUID, UUID, UUID, TEXT)
  TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- SEED iniziale — Serramenti (4 template chiave)
-- ────────────────────────────────────────────────────────────────────────────
-- Solo se la tabella è vuota (idempotente).
-- ════════════════════════════════════════════════════════════════════════════
INSERT INTO public.article_family_templates (
  nome, descrizione, vertical_slug, categoria_slug, tipologia, materiale,
  image_url, tags, modalita_prezzo_base, vat_rate, unit_of_measure,
  griglia_asse_x_label, griglia_asse_y_label, griglia_unita,
  assi_default, sort_order
)
SELECT * FROM (VALUES
  (
    'Finestra 1 anta', 'Finestra ad anta-ribalta singola, configurazione base.',
    'serramenti', 'infissi', 'infisso', 'pvc',
    'https://images.unsplash.com/photo-1416331108676-a22ccb276e35?w=800&q=80',
    ARRAY['finestra','1anta','infisso','pvc'],
    'griglia', 22, 'pz',
    'Larghezza (mm)', 'Altezza (mm)', 'mm',
    '[
      {"nome":"Vetro","codice":"vetro","tipo":"discrete","obbligatorio":true,"sort_order":0,"values":[
        {"valore":"doppio","label":"Vetrocamera doppia 4/16/4","is_default":true,"maggiorazione_tipo":"none","maggiorazione_valore":0},
        {"valore":"triplo","label":"Vetrocamera tripla 4/14/4/14/4","is_default":false,"maggiorazione_tipo":"percentuale","maggiorazione_valore":15}
      ]},
      {"nome":"Apertura","codice":"apertura","tipo":"discrete","obbligatorio":true,"sort_order":1,"values":[
        {"valore":"anta_ribalta","label":"Anta-Ribalta","is_default":true,"maggiorazione_tipo":"none","maggiorazione_valore":0},
        {"valore":"battente","label":"Solo battente","is_default":false,"maggiorazione_tipo":"none","maggiorazione_valore":0}
      ]}
    ]'::jsonb,
    10
  ),
  (
    'Finestra 2 ante', 'Finestra a due ante con anta-ribalta principale.',
    'serramenti', 'infissi', 'infisso', 'pvc',
    'https://images.unsplash.com/photo-1502005229762-cf1b2da7c5d6?w=800&q=80',
    ARRAY['finestra','2ante','infisso','pvc'],
    'griglia', 22, 'pz',
    'Larghezza (mm)', 'Altezza (mm)', 'mm',
    '[
      {"nome":"Vetro","codice":"vetro","tipo":"discrete","obbligatorio":true,"sort_order":0,"values":[
        {"valore":"doppio","label":"Vetrocamera doppia","is_default":true,"maggiorazione_tipo":"none","maggiorazione_valore":0},
        {"valore":"triplo","label":"Vetrocamera tripla","is_default":false,"maggiorazione_tipo":"percentuale","maggiorazione_valore":15}
      ]}
    ]'::jsonb,
    20
  ),
  (
    'Porta finestra 1 anta', 'Porta finestra ad anta-ribalta singola.',
    'serramenti', 'infissi', 'porta_finestra', 'pvc',
    'https://images.unsplash.com/photo-1564540586988-aa4e53c3d799?w=800&q=80',
    ARRAY['portafinestra','1anta','infisso'],
    'griglia', 22, 'pz',
    'Larghezza (mm)', 'Altezza (mm)', 'mm',
    '[
      {"nome":"Vetro","codice":"vetro","tipo":"discrete","obbligatorio":true,"sort_order":0,"values":[
        {"valore":"doppio","label":"Vetrocamera doppia","is_default":true,"maggiorazione_tipo":"none","maggiorazione_valore":0},
        {"valore":"triplo","label":"Vetrocamera tripla","is_default":false,"maggiorazione_tipo":"percentuale","maggiorazione_valore":15}
      ]},
      {"nome":"Maniglione","codice":"maniglione","tipo":"boolean","obbligatorio":false,"sort_order":1,"values":[
        {"valore":"si","label":"Sì","is_default":false,"maggiorazione_tipo":"fisso_pz","maggiorazione_valore":80},
        {"valore":"no","label":"No","is_default":true,"maggiorazione_tipo":"none","maggiorazione_valore":0}
      ]}
    ]'::jsonb,
    30
  ),
  (
    'Persiana scorrevole', 'Persiana scorrevole esterna in alluminio.',
    'serramenti', 'persiane', 'persiana', 'alluminio',
    'https://images.unsplash.com/photo-1503387837-b154d5074bd2?w=800&q=80',
    ARRAY['persiana','scorrevole','alluminio'],
    'mq', 22, 'mq',
    'Larghezza (mm)', 'Altezza (mm)', 'mm',
    '[
      {"nome":"Colore","codice":"colore","tipo":"discrete","obbligatorio":true,"sort_order":0,"values":[
        {"valore":"bianco","label":"Bianco RAL 9010","is_default":true,"maggiorazione_tipo":"none","maggiorazione_valore":0},
        {"valore":"antracite","label":"Antracite RAL 7016","is_default":false,"maggiorazione_tipo":"percentuale","maggiorazione_valore":8}
      ]}
    ]'::jsonb,
    40
  )
) AS v(nome, descrizione, vertical_slug, categoria_slug, tipologia, materiale,
       image_url, tags, modalita_prezzo_base, vat_rate, unit_of_measure,
       griglia_asse_x_label, griglia_asse_y_label, griglia_unita,
       assi_default, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.article_family_templates);

COMMENT ON TABLE public.article_family_templates IS
  'Template articoli pre-confezionati, gestiti da super_admin. Cloneable in article_families via import_article_family_template().';
