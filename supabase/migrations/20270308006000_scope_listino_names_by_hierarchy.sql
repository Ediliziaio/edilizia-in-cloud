-- Listino hierarchy uniqueness fix.
--
-- Business rule:
--   - Macrocategoria: unique per company.
--   - Categoria: same name can exist in different macrocategorie.
--   - Article family: same display name can exist in different categorie.
--
-- This replaces the older global uniqueness constraints that forced imports to
-- append macrocategoria/supplier-code fragments to visible names.

ALTER TABLE public.listino_categorie
  DROP CONSTRAINT IF EXISTS listino_categorie_company_id_nome_key;

DROP INDEX IF EXISTS public.listino_categorie_company_id_nome_key;
DROP INDEX IF EXISTS public.listino_categorie_company_macro_nome_uniq;
DROP INDEX IF EXISTS public.listino_categorie_company_nome_no_macro_uniq;
DROP INDEX IF EXISTS public.article_families_company_nome_vertical_uniq;
DROP INDEX IF EXISTS public.article_families_company_vertical_category_nome_uniq;
DROP INDEX IF EXISTS public.article_families_company_vertical_nome_no_category_uniq;

DO $$
DECLARE
  v_company_id uuid;
BEGIN
  SELECT id INTO v_company_id
  FROM public.companies
  WHERE name = 'Ke Bei Serramenti'
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE NOTICE 'Ke Bei Serramenti company not found; skipping visible-name cleanup.';
  ELSE
    -- Categories: remove "<Macrocategoria> — " prefixes and technical suffixes.
    UPDATE public.listino_categorie lc
       SET nome = regexp_replace(
             CASE
               WHEN lm.id IS NOT NULL AND lc.nome LIKE lm.nome || ' — %'
                 THEN substr(lc.nome, length(lm.nome || ' — ') + 1)
               ELSE lc.nome
             END,
             '\s+·\s+BM_[A-Z0-9_]+$',
             ''
           ),
           descrizione = NULL,
           updated_at = now()
      FROM public.listino_macrocategorie lm
     WHERE lc.company_id = v_company_id
       AND lc.macrocategoria_id = lm.id
       AND (
         lc.nome LIKE lm.nome || ' — %'
         OR lc.nome ~ '\s+·\s+BM_[A-Z0-9_]+$'
         OR lc.descrizione IS NOT NULL
       );

    UPDATE public.listino_categorie lc
       SET nome = regexp_replace(lc.nome, '\s+·\s+BM_[A-Z0-9_]+$', ''),
           descrizione = NULL,
           updated_at = now()
     WHERE lc.company_id = v_company_id
       AND lc.macrocategoria_id IS NULL
       AND (
         lc.nome ~ '\s+·\s+BM_[A-Z0-9_]+$'
         OR lc.descrizione IS NOT NULL
       );

    -- Article families: remove supplier-code suffixes used only to satisfy the
    -- previous global uniqueness index. The category scope now disambiguates.
    UPDATE public.article_families af
       SET nome = regexp_replace(af.nome, '\s+·\s+BM_[A-Z0-9_]+$', ''),
           descrizione = NULL,
           updated_at = now()
     WHERE af.company_id = v_company_id
       AND af.vertical = 'serramentista'
       AND af.deleted_at IS NULL
       AND (
         af.nome ~ '\s+·\s+BM_[A-Z0-9_]+$'
         OR af.descrizione IS NOT NULL
       );

    UPDATE public.listino_macrocategorie lm
       SET descrizione = NULL,
           updated_at = now()
     WHERE lm.company_id = v_company_id
       AND lm.descrizione IS NOT NULL;
  END IF;
END $$;

-- Guard rails before adding scoped uniqueness.
DO $$
DECLARE
  v_duplicate_count integer;
BEGIN
  SELECT count(*) INTO v_duplicate_count
  FROM (
    SELECT company_id, macrocategoria_id, nome
    FROM public.listino_categorie
    WHERE macrocategoria_id IS NOT NULL
    GROUP BY company_id, macrocategoria_id, nome
    HAVING count(*) > 1
  ) d;

  IF v_duplicate_count > 0 THEN
    RAISE EXCEPTION
      'Cannot create scoped category uniqueness: % duplicate category names inside the same macrocategoria',
      v_duplicate_count;
  END IF;

  SELECT count(*) INTO v_duplicate_count
  FROM (
    SELECT company_id, nome
    FROM public.listino_categorie
    WHERE macrocategoria_id IS NULL
    GROUP BY company_id, nome
    HAVING count(*) > 1
  ) d;

  IF v_duplicate_count > 0 THEN
    RAISE EXCEPTION
      'Cannot create no-macro category uniqueness: % duplicate category names without macrocategoria',
      v_duplicate_count;
  END IF;

  SELECT count(*) INTO v_duplicate_count
  FROM (
    SELECT company_id, vertical, categoria_id, nome
    FROM public.article_families
    WHERE attivo = true
      AND deleted_at IS NULL
      AND categoria_id IS NOT NULL
    GROUP BY company_id, vertical, categoria_id, nome
    HAVING count(*) > 1
  ) d;

  IF v_duplicate_count > 0 THEN
    RAISE EXCEPTION
      'Cannot create scoped family uniqueness: % duplicate active family names inside the same categoria',
      v_duplicate_count;
  END IF;

  SELECT count(*) INTO v_duplicate_count
  FROM (
    SELECT company_id, vertical, nome
    FROM public.article_families
    WHERE attivo = true
      AND deleted_at IS NULL
      AND categoria_id IS NULL
    GROUP BY company_id, vertical, nome
    HAVING count(*) > 1
  ) d;

  IF v_duplicate_count > 0 THEN
    RAISE EXCEPTION
      'Cannot create no-category family uniqueness: % duplicate active family names without categoria',
      v_duplicate_count;
  END IF;
END $$;

CREATE UNIQUE INDEX listino_categorie_company_macro_nome_uniq
  ON public.listino_categorie (company_id, macrocategoria_id, nome)
  WHERE macrocategoria_id IS NOT NULL;

CREATE UNIQUE INDEX listino_categorie_company_nome_no_macro_uniq
  ON public.listino_categorie (company_id, nome)
  WHERE macrocategoria_id IS NULL;

CREATE UNIQUE INDEX article_families_company_vertical_category_nome_uniq
  ON public.article_families (company_id, vertical, categoria_id, nome)
  WHERE attivo = true
    AND deleted_at IS NULL
    AND categoria_id IS NOT NULL;

CREATE UNIQUE INDEX article_families_company_vertical_nome_no_category_uniq
  ON public.article_families (company_id, vertical, nome)
  WHERE attivo = true
    AND deleted_at IS NULL
    AND categoria_id IS NULL;

COMMENT ON INDEX public.listino_categorie_company_macro_nome_uniq IS
  'Categorie uniche solo dentro la macrocategoria padre. Consente lo stesso nome categoria in macrocategorie diverse.';

COMMENT ON INDEX public.listino_categorie_company_nome_no_macro_uniq IS
  'Retrocompatibilità: categorie senza macrocategoria restano uniche per azienda.';

COMMENT ON INDEX public.article_families_company_vertical_category_nome_uniq IS
  'Famiglie articolo attive uniche solo dentro la categoria padre. Consente lo stesso nome famiglia in categorie diverse.';

COMMENT ON INDEX public.article_families_company_vertical_nome_no_category_uniq IS
  'Retrocompatibilità: famiglie senza categoria restano uniche per azienda e verticale.';
