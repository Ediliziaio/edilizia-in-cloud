-- ============================================================================
-- Preventivatore Unificato — Sprint A, Step 3 (masterprompt §4.3)
-- ----------------------------------------------------------------------------
-- Aggiunge il flag `posa_linked` a `article_families` e `article_templates`.
-- Quando il flag è TRUE (default), la riga posa/montaggio auto-generata dal
-- dialog di aggiunta voce resta LEGATA alla riga prodotto:
--   · DELETE cascade   → cancellare il prodotto cancella la posa
--   · QUANTITY sync    → cambiare qty del prodotto ricalcola la qty posa
-- Quando il flag è FALSE, posa e prodotto restano righe indipendenti: la
-- posa viene creata ma non referenzia il prodotto. Il commerciale può
-- cancellarle separatamente.
--
-- Nota: la colonna `quote_items.parent_item_id` esiste già in schema (vedi
-- types.ts riga 22186). La migration si limita a creare l'index parziale se
-- mancante.
-- ============================================================================

-- Compatibilità catena migration: article_families/axes sono state introdotte
-- formalmente più avanti, ma le estensioni listino di aprile le usano già.
CREATE TABLE IF NOT EXISTS public.article_families (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  vertical TEXT NOT NULL,
  categoria_id UUID REFERENCES public.listino_categorie(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  descrizione TEXT,
  immagine_url TEXT,
  pdf_scheda_url TEXT,
  modalita_prezzo_base TEXT NOT NULL DEFAULT 'griglia'
    CHECK (modalita_prezzo_base IN ('pz','mq','griglia','misura_libera')),
  prezzo_base_vendita NUMERIC(12,4) DEFAULT 0,
  prezzo_base_acquisto NUMERIC(12,4) DEFAULT 0,
  vat_rate NUMERIC(5,2) DEFAULT 22,
  unit_of_measure TEXT DEFAULT 'pz',
  posa_tariffa_default_id UUID REFERENCES public.tariffe_aziendali(id),
  posa_quantita_default NUMERIC DEFAULT 1,
  griglia_asse_x_label TEXT DEFAULT 'Larghezza (mm)',
  griglia_asse_y_label TEXT DEFAULT 'Altezza (mm)',
  griglia_unita TEXT DEFAULT 'mm',
  attivo BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  custom_field_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.article_family_axes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.article_families(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  codice TEXT NOT NULL,
  descrizione TEXT,
  tipo TEXT NOT NULL DEFAULT 'discrete'
    CHECK (tipo IN ('discrete','boolean')),
  obbligatorio BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(family_id, codice)
);

CREATE TABLE IF NOT EXISTS public.article_family_axis_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  axis_id UUID NOT NULL REFERENCES public.article_family_axes(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  valore TEXT NOT NULL,
  label TEXT NOT NULL,
  descrizione TEXT,
  is_default BOOLEAN DEFAULT false,
  maggiorazione_tipo TEXT NOT NULL DEFAULT 'none'
    CHECK (maggiorazione_tipo IN ('none','percentuale','fisso_pz','fisso_mq','fisso_ml','fisso_mc')),
  maggiorazione_valore NUMERIC(12,4) DEFAULT 0,
  maggiorazione_acquisto NUMERIC(12,4) DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  attivo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(axis_id, valore)
);

CREATE INDEX IF NOT EXISTS idx_families_company ON public.article_families(company_id);
CREATE INDEX IF NOT EXISTS idx_families_vertical ON public.article_families(vertical);
CREATE INDEX IF NOT EXISTS idx_families_categoria ON public.article_families(categoria_id);
CREATE INDEX IF NOT EXISTS idx_families_company_sort ON public.article_families(company_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_axes_family ON public.article_family_axes(family_id);
CREATE INDEX IF NOT EXISTS idx_axis_values_axis ON public.article_family_axis_values(axis_id);

ALTER TABLE public.article_families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.article_family_axes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.article_family_axis_values ENABLE ROW LEVEL SECURITY;

-- 1. Flag a livello famiglia
ALTER TABLE public.article_families
  ADD COLUMN IF NOT EXISTS posa_linked BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.article_families.posa_linked IS
  'Se true, la riga posa auto-generata resta legata alla riga prodotto: '
  'cancellare il prodotto cancella anche la posa, cambiare qty ricalcola '
  'la qty posa.';

-- 2. Flag a livello articolo singolo
ALTER TABLE public.article_templates
  ADD COLUMN IF NOT EXISTS posa_linked BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.article_templates.posa_linked IS
  'Se true, la riga montaggio auto-generata resta legata alla riga prodotto.';

-- 3. Index parziale su quote_items.parent_item_id (la colonna esiste già).
--    Parziale perché la maggior parte delle righe NON ha parent e non
--    vogliamo bloat sull'index.
CREATE INDEX IF NOT EXISTS idx_quote_items_parent
  ON public.quote_items(parent_item_id)
  WHERE parent_item_id IS NOT NULL;

COMMENT ON INDEX public.idx_quote_items_parent IS
  'Lookup righe figlie di un quote_item (posa/montaggio/smaltimento legati '
  'al prodotto). Serve per DELETE cascade manuale + sync qty lato client.';
