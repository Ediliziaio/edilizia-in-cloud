-- ═══════════════════════════════════════════════════════════════════════════
-- Varianti prezzo per famiglie listino (article_variants)
-- ═══════════════════════════════════════════════════════════════════════════
-- Le famiglie del listino prodotti hanno spesso opzioni che modificano il
-- prezzo finale senza cambiare l'articolo base: colore antracite +5%,
-- vetro triplo +€80, ferramenta anti-effrazione +€120, ecc.
--
-- Soluzione: tabella `article_variants` 1:N legata ad `article_families`.
-- Ogni variante ha:
--   - nome (es. "Vetro triplo basso-emissivo")
--   - modificatore_tipo: 'percentuale' | 'fisso'
--   - modificatore_valore: numerico (es. 5.0 = +5%, oppure 80.0 = +80€)
--   - modificatore_costo (opzionale): se la variante ha anche costo aziendale
--
-- Sul preventivo, le varianti scelte sono salvate in
-- `sr_serramenti_progetto.varianti_selezionate` (jsonb array di snapshot).
--
-- Idempotente.

-- ─── 1) Tabella article_variants ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.article_variants (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id          UUID NOT NULL REFERENCES public.article_families(id) ON DELETE CASCADE,
  company_id         UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  nome               TEXT NOT NULL,
  descrizione        TEXT,

  -- Tipo modificatore: percentuale (es. +5%) o fisso (es. +80€ per unita').
  modificatore_tipo  TEXT NOT NULL CHECK (modificatore_tipo IN ('percentuale','fisso')),
  modificatore_valore NUMERIC(10,2) NOT NULL DEFAULT 0,
  -- Costo opzionale (solo per analisi marginalita' interna, non esposto al cliente)
  modificatore_costo NUMERIC(10,2),

  attivo             BOOLEAN NOT NULL DEFAULT true,
  sort_order         INTEGER NOT NULL DEFAULT 0,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS article_variants_family_idx
  ON public.article_variants(family_id, sort_order);
CREATE INDEX IF NOT EXISTS article_variants_company_idx
  ON public.article_variants(company_id);

-- ─── 2) RLS coerenti con article_families (pattern get_my_company_id) ─────
ALTER TABLE public.article_variants ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='article_variants'
    AND policyname='article_variants_select'
  ) THEN
    CREATE POLICY article_variants_select ON public.article_variants
      FOR SELECT USING (company_id = public.get_my_company_id());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='article_variants'
    AND policyname='article_variants_cud'
  ) THEN
    CREATE POLICY article_variants_cud ON public.article_variants
      FOR ALL
      USING (company_id = public.get_my_company_id())
      WITH CHECK (company_id = public.get_my_company_id());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='article_variants'
    AND policyname='article_variants_super_admin'
  ) THEN
    CREATE POLICY article_variants_super_admin ON public.article_variants
      FOR ALL
      USING (public.has_role(auth.uid(), 'super_admin'));
  END IF;
END $$;

-- ─── 3) Trigger updated_at ────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_article_variants_updated_at ON public.article_variants;
CREATE TRIGGER trg_article_variants_updated_at
  BEFORE UPDATE ON public.article_variants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 4) Colonna varianti_selezionate sul BOM serramento ───────────────────
-- jsonb array di snapshot: [{variant_id, nome, modificatore_tipo,
-- modificatore_valore}]. Lo snapshot e' importante: se l'azienda modifica
-- una variante dopo il preventivo, il preventivo non cambia silenziosamente.
ALTER TABLE public.sr_serramenti_progetto
  ADD COLUMN IF NOT EXISTS varianti_selezionate JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.sr_serramenti_progetto.varianti_selezionate IS
  'Snapshot delle varianti scelte al momento del preventivo. Array JSON di {variant_id, nome, modificatore_tipo, modificatore_valore}.';

NOTIFY pgrst, 'reload schema';
