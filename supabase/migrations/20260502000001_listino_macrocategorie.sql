-- Migration: Catalogo — Macrocategorie (gerarchia a 3 livelli)
-- Struttura:
--   listino_macrocategorie (nuovo)
--     └─ listino_categorie (esistente, aggiungo FK macrocategoria_id)
--         └─ article_families (esistente, via categoria_id)
--
-- Esempio: INFISSO MODELLO 1 → FINESTRA 1 ANTA → Articolo concreto con prezzo
-- Idempotente: IF NOT EXISTS ovunque.

-- ═══════════════════════════════════════════════════════════════
-- 1. Tabella listino_macrocategorie
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.listino_macrocategorie (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome           TEXT NOT NULL,
  descrizione    TEXT,
  icona          TEXT,  -- emoji o lucide name
  colore         TEXT,  -- hex o tailwind token
  sort_order     INT NOT NULL DEFAULT 0,
  attivo         BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, nome)
);

CREATE INDEX IF NOT EXISTS idx_listino_macrocategorie_company
  ON public.listino_macrocategorie(company_id, sort_order);

ALTER TABLE public.listino_macrocategorie ENABLE ROW LEVEL SECURITY;

-- RLS: company_admin + super_admin possono gestire; tutti i membri della company
-- possono leggere.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='listino_macrocategorie' AND policyname='macrocat_select'
  ) THEN
    CREATE POLICY macrocat_select ON public.listino_macrocategorie
      FOR SELECT USING (
        company_id = public.get_my_company_id()
        OR public.has_role(auth.uid(), 'super_admin'::app_role)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='listino_macrocategorie' AND policyname='macrocat_insert'
  ) THEN
    CREATE POLICY macrocat_insert ON public.listino_macrocategorie
      FOR INSERT WITH CHECK (
        company_id = public.get_my_company_id()
        AND public.has_role(auth.uid(), 'company_admin'::app_role)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='listino_macrocategorie' AND policyname='macrocat_update'
  ) THEN
    CREATE POLICY macrocat_update ON public.listino_macrocategorie
      FOR UPDATE USING (
        company_id = public.get_my_company_id()
        AND public.has_role(auth.uid(), 'company_admin'::app_role)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='listino_macrocategorie' AND policyname='macrocat_delete'
  ) THEN
    CREATE POLICY macrocat_delete ON public.listino_macrocategorie
      FOR DELETE USING (
        company_id = public.get_my_company_id()
        AND public.has_role(auth.uid(), 'company_admin'::app_role)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='listino_macrocategorie' AND policyname='macrocat_super_admin'
  ) THEN
    CREATE POLICY macrocat_super_admin ON public.listino_macrocategorie
      FOR ALL USING (public.has_role(auth.uid(), 'super_admin'::app_role));
  END IF;
END $$;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_macrocategorie_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_macrocategorie_updated_at ON public.listino_macrocategorie;
CREATE TRIGGER trg_macrocategorie_updated_at
  BEFORE UPDATE ON public.listino_macrocategorie
  FOR EACH ROW EXECUTE FUNCTION public.set_macrocategorie_updated_at();

COMMENT ON TABLE public.listino_macrocategorie IS
  'Macrocategoria listino (livello top). Esempio: INFISSO MODELLO 1, '
  'ACCESSORI, ZANZARIERE. Contiene N listino_categorie.';

-- ═══════════════════════════════════════════════════════════════
-- 2. listino_categorie.macrocategoria_id
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE public.listino_categorie
  ADD COLUMN IF NOT EXISTS macrocategoria_id UUID
    REFERENCES public.listino_macrocategorie(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_listino_categorie_macro
  ON public.listino_categorie(macrocategoria_id)
  WHERE macrocategoria_id IS NOT NULL;

COMMENT ON COLUMN public.listino_categorie.macrocategoria_id IS
  'Macrocategoria padre (nullable per retrocompatibilità). Se NULL, la '
  'categoria è "orfana" e viene mostrata nel gruppo "Senza macrocategoria".';

-- ═══════════════════════════════════════════════════════════════
-- Fine migration
-- ═══════════════════════════════════════════════════════════════
