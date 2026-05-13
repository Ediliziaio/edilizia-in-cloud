-- ════════════════════════════════════════════════════════════════════════════
-- 20270513 — article_families.macrocategoria_id (collegamento diretto)
-- ────────────────────────────────────────────────────────────────────────────
-- REFACTOR STRATEGICO
-- Le aziende non usano il livello "categoria" intermedio: di fatto operano
-- con MACROCATEGORIA → ARTICOLO. Il livello categoria era artefatto tecnico
-- creato automaticamente dalla SubcategorieTemplateDialog ma poi non
-- utilizzato nei preventivi.
--
-- QUESTA MIGRATION
-- 1) Aggiunge article_families.macrocategoria_id (FK diretto, nullable)
-- 2) Backfilla da listino_categorie.macrocategoria_id (preserva associazioni
--    esistenti delle aziende)
-- 3) Crea indice per query "articoli per macro"
-- 4) NON tocca listino_categorie / categoria_id (drop in migration separata
--    dopo verifica produzione)
--
-- BACKWARD COMPATIBILITY
-- - categoria_id resta valorizzato sui record esistenti (no break)
-- - nuovi articoli scrivono macrocategoria_id (lato app via useFamilyMutations)
-- - lettura ibrida: macrocategoria_id se presente, altrimenti via categoria
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Colonna FK nullable
ALTER TABLE public.article_families
  ADD COLUMN IF NOT EXISTS macrocategoria_id UUID
  REFERENCES public.listino_macrocategorie(id) ON DELETE SET NULL;

-- 2) Backfill da categoria_id → categoria.macrocategoria_id
UPDATE public.article_families af
SET macrocategoria_id = lc.macrocategoria_id
FROM public.listino_categorie lc
WHERE af.categoria_id = lc.id
  AND af.macrocategoria_id IS NULL
  AND lc.macrocategoria_id IS NOT NULL;

-- 3) Indice query per macro (no WHERE clause: include anche rows NULL per
--    fast scan "articoli orfani")
CREATE INDEX IF NOT EXISTS idx_article_families_macrocategoria
  ON public.article_families (macrocategoria_id);

COMMENT ON COLUMN public.article_families.macrocategoria_id IS
  'FK diretto a listino_macrocategorie. Sostituisce il salto via categoria_id. '
  'Backfillato da listino_categorie.macrocategoria_id (migration 20270513200000). '
  'NULL = articolo non assegnato a nessuna macro.';

-- 4) Aggiorna RPC import_article_family_template: aggancia direttamente alla
--    macrocategoria invece che alla categoria intermedia.
DROP FUNCTION IF EXISTS public.import_article_family_template(UUID, UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.import_article_family_template(
  p_template_id UUID,
  p_company_id UUID,
  p_macrocategoria_id UUID DEFAULT NULL,
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
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  IF public.get_user_company_id(v_user_id) IS DISTINCT FROM p_company_id THEN
    RAISE EXCEPTION 'not a member of company %', p_company_id
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_template
  FROM public.article_family_templates
  WHERE id = p_template_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'template % not found or inactive', p_template_id;
  END IF;

  INSERT INTO public.article_families (
    company_id, vertical, macrocategoria_id, nome, descrizione,
    immagine_url, modalita_prezzo_base, prezzo_base_vendita, vat_rate,
    unit_of_measure, griglia_asse_x_label, griglia_asse_y_label, griglia_unita,
    custom_field_values, attivo
  ) VALUES (
    p_company_id,
    v_template.vertical_slug,
    p_macrocategoria_id,
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

  -- Inserisce assi + valori (logica invariata)
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

NOTIFY pgrst, 'reload schema';
