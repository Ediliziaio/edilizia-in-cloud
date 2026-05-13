-- ════════════════════════════════════════════════════════════════════════════
-- FASE 3 — vertical_subcategorie_templates
-- ────────────────────────────────────────────────────────────────────────────
-- Suggerimenti SUBCATEGORIE auto-popolabili per verticale + macrocategoria.
-- Quando l'azienda crea una macrocategoria (es. "Serramenti"), il sistema
-- propone subcategorie standard (Infissi, Persiane, Tapparelle, Zanzariere)
-- che il commerciale può accettare in bulk con un click.
--
-- I dati sono gestiti dal super_admin. La struttura è semplice: una riga
-- per (vertical_slug, nome_subcategoria) con sort_order + descrizione +
-- foto template URL opzionale.
--
-- Lato app: hook + dialog "Crea da template" che chiama una RPC che
-- inserisce N categorie sotto la macrocategoria appena creata.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.vertical_subcategorie_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical_slug TEXT NOT NULL,
  macro_slug TEXT,                -- es. "serramenti" (parent macro tipo). NULL = generico
  nome TEXT NOT NULL,             -- es. "Infissi", "Persiane", "Tapparelle"
  descrizione TEXT,
  image_url TEXT,                 -- opzionale, link a article_photo_templates URL
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vst_vertical
  ON public.vertical_subcategorie_templates (vertical_slug)
  WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_vst_macro
  ON public.vertical_subcategorie_templates (macro_slug);
CREATE INDEX IF NOT EXISTS idx_vst_sort
  ON public.vertical_subcategorie_templates (vertical_slug, sort_order);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.touch_vertical_subcategorie_templates_updated_at()
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

DROP TRIGGER IF EXISTS trg_vst_touch_updated_at ON public.vertical_subcategorie_templates;
CREATE TRIGGER trg_vst_touch_updated_at
BEFORE UPDATE ON public.vertical_subcategorie_templates
FOR EACH ROW EXECUTE FUNCTION public.touch_vertical_subcategorie_templates_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- RLS
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.vertical_subcategorie_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vst_select_authenticated" ON public.vertical_subcategorie_templates;
CREATE POLICY "vst_select_authenticated"
ON public.vertical_subcategorie_templates FOR SELECT
TO authenticated
USING (is_active = true);

DROP POLICY IF EXISTS "vst_insert_super_admin" ON public.vertical_subcategorie_templates;
CREATE POLICY "vst_insert_super_admin"
ON public.vertical_subcategorie_templates FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'super_admin'
  )
);

DROP POLICY IF EXISTS "vst_update_super_admin" ON public.vertical_subcategorie_templates;
CREATE POLICY "vst_update_super_admin"
ON public.vertical_subcategorie_templates FOR UPDATE
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

DROP POLICY IF EXISTS "vst_delete_super_admin" ON public.vertical_subcategorie_templates;
CREATE POLICY "vst_delete_super_admin"
ON public.vertical_subcategorie_templates FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'super_admin'
  )
);

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: apply_subcategorie_template
-- ────────────────────────────────────────────────────────────────────────────
-- Inserisce N subcategorie (`listino_categorie`) sotto una macrocategoria
-- specifica, partendo dalla lista di template_ids selezionati. Idempotente
-- per nome (se esiste già una categoria con quel nome sotto quella macro,
-- viene saltata).
--
-- Restituisce array di UUID delle categorie create.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.apply_subcategorie_template(
  p_macrocategoria_id UUID,
  p_template_ids UUID[]
)
RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_company_id UUID;
  v_macro_company_id UUID;
  v_template public.vertical_subcategorie_templates%ROWTYPE;
  v_created_ids UUID[] := ARRAY[]::UUID[];
  v_new_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  v_company_id := public.get_user_company_id(v_user_id);
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'no company in scope';
  END IF;

  -- Verifica che la macrocategoria appartenga alla stessa azienda
  SELECT company_id INTO v_macro_company_id
  FROM public.listino_macrocategorie
  WHERE id = p_macrocategoria_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'macrocategoria % not found', p_macrocategoria_id;
  END IF;
  IF v_macro_company_id IS DISTINCT FROM v_company_id THEN
    RAISE EXCEPTION 'macrocategoria does not belong to current company'
      USING ERRCODE = '42501';
  END IF;

  -- Itera sui template richiesti
  FOR v_template IN
    SELECT * FROM public.vertical_subcategorie_templates
    WHERE id = ANY(p_template_ids) AND is_active = true
    ORDER BY sort_order ASC
  LOOP
    -- Skip se esiste già una categoria con stesso nome sotto la macro
    IF EXISTS (
      SELECT 1 FROM public.listino_categorie
      WHERE macrocategoria_id = p_macrocategoria_id
        AND lower(trim(nome)) = lower(trim(v_template.nome))
        AND company_id = v_company_id
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.listino_categorie (
      company_id, macrocategoria_id, nome, descrizione
    ) VALUES (
      v_company_id, p_macrocategoria_id, v_template.nome, v_template.descrizione
    )
    RETURNING id INTO v_new_id;

    v_created_ids := array_append(v_created_ids, v_new_id);
  END LOOP;

  RETURN v_created_ids;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_subcategorie_template(UUID, UUID[]) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- SEED iniziale — subcategorie standard per i verticali principali
-- ════════════════════════════════════════════════════════════════════════════
INSERT INTO public.vertical_subcategorie_templates (
  vertical_slug, macro_slug, nome, descrizione, sort_order
)
SELECT * FROM (VALUES
  -- Serramenti
  ('serramenti', 'serramenti', 'Infissi',           'Finestre e porte finestre',                    10),
  ('serramenti', 'serramenti', 'Persiane',          'Persiane esterne (battenti/scorrevoli)',       20),
  ('serramenti', 'serramenti', 'Tapparelle',        'Avvolgibili motorizzati e manuali',            30),
  ('serramenti', 'serramenti', 'Zanzariere',        'Zanzariere a rullo/plissè/scorrevoli',         40),
  ('serramenti', 'serramenti', 'Inferriate',        'Grate di sicurezza fisse e apribili',          50),
  ('serramenti', 'serramenti', 'Portoncini',        'Portoncini blindati e ingresso',               60),
  -- Bagno
  ('bagno', 'bagno', 'Sanitari',                   'Wc, bidet, lavabi',                              10),
  ('bagno', 'bagno', 'Box doccia',                 'Cabine doccia, piatti, miscelatori',             20),
  ('bagno', 'bagno', 'Mobili',                     'Mobili sospesi e a terra, specchi',              30),
  ('bagno', 'bagno', 'Rivestimenti',               'Piastrelle, mosaici, gres',                      40),
  ('bagno', 'bagno', 'Rubinetteria',               'Miscelatori, soffioni, accessori',               50),
  -- Fotovoltaico
  ('fotovoltaico', 'fotovoltaico', 'Pannelli',     'Moduli FV monocristallini',                      10),
  ('fotovoltaico', 'fotovoltaico', 'Inverter',     'Inverter di stringa / ibridi',                   20),
  ('fotovoltaico', 'fotovoltaico', 'Accumulo',     'Batterie litio per autoconsumo',                 30),
  ('fotovoltaico', 'fotovoltaico', 'Strutture',    'Strutture di montaggio tetto/terra',             40),
  -- Tetti
  ('tetti', 'tetti', 'Copertura',                  'Tegole, lamiere, pannelli sandwich',             10),
  ('tetti', 'tetti', 'Isolamento',                 'Isolanti termici per tetti',                     20),
  ('tetti', 'tetti', 'Lattoneria',                 'Gronde, pluviali, scossaline',                   30),
  -- Cappotto
  ('cappotto', 'cappotto', 'Pannelli isolanti',    'EPS, lana di roccia, fibra di legno',            10),
  ('cappotto', 'cappotto', 'Finiture',             'Rasanti, primer, finiture decorative',           20),
  -- Pompe di calore
  ('pompe_calore', 'pompe_calore', 'Unità esterne',  'Pompe di calore aria/acqua',                   10),
  ('pompe_calore', 'pompe_calore', 'Bollitori',      'Bollitori sanitari per PdC',                   20)
) AS v(vertical_slug, macro_slug, nome, descrizione, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.vertical_subcategorie_templates);

COMMENT ON TABLE public.vertical_subcategorie_templates IS
  'Subcategorie standard suggerite per verticale + macrocategoria. Bulk insert via apply_subcategorie_template().';
