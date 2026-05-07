-- ════════════════════════════════════════════════════════════════════════════
-- QUOTE TEMPLATES — Libreria componibile (template per tipo)
-- ════════════════════════════════════════════════════════════════════════════
-- Ridisegna `quote_templates` come libreria di blocchi riusabili.
-- Ogni template ha un `kind` (tipo) e contiene SOLO i campi pertinenti.
--
--   • kind='offerta'      → master template (estetica generale + link blocchi)
--   • kind='copertina'    → solo immagine + titolo + sottotitolo + claim
--   • kind='condizioni'   → testo ricco multi-pagina (clausole contrattuali)
--   • kind='legali'       → privacy, recesso, foro competente
--   • kind='prodotto'     → scheda prodotto (immagine + specs + prezzo indicativo)
--   • kind='sezione'      → sezione libera riusabile (es. "Chi siamo", "Garanzie")
--
-- Composizione: un template `kind=offerta` può linkare un copertina + un
-- condizioni + un legali + N prodotti tramite FK separate. Così l'utente
-- crea blocchi una volta e li riusa in offerte diverse.
--
-- Tutto additive + idempotente. La migration precedente (20270306000000)
-- ha già aggiunto cover_*, contractual_*, legal_* come campi inline; qui li
-- promuoviamo a entità prima class via `kind`.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Colonna kind
ALTER TABLE public.quote_templates
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'offerta'
    CHECK (kind IN ('offerta', 'copertina', 'condizioni', 'legali', 'prodotto', 'sezione'));

COMMENT ON COLUMN public.quote_templates.kind IS
  'Tipo di template nella libreria. offerta = master compositore. Gli altri sono blocchi riusabili.';

-- 2) FK per composizione (solo kind=offerta li popola)
ALTER TABLE public.quote_templates
  ADD COLUMN IF NOT EXISTS linked_cover_id uuid
    REFERENCES public.quote_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS linked_terms_id uuid
    REFERENCES public.quote_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS linked_legal_id uuid
    REFERENCES public.quote_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS linked_product_ids uuid[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS linked_section_ids uuid[] DEFAULT '{}';

COMMENT ON COLUMN public.quote_templates.linked_cover_id IS
  'FK al template kind=copertina linkato (solo per kind=offerta).';
COMMENT ON COLUMN public.quote_templates.linked_terms_id IS
  'FK al template kind=condizioni linkato.';
COMMENT ON COLUMN public.quote_templates.linked_legal_id IS
  'FK al template kind=legali linkato.';
COMMENT ON COLUMN public.quote_templates.linked_product_ids IS
  'Array di FK a kind=prodotto (schede prodotto inseribili nel preventivo).';
COMMENT ON COLUMN public.quote_templates.linked_section_ids IS
  'Array di FK a kind=sezione (sezioni libere riusabili: "Chi siamo", ecc.).';

-- 3) Campi specifici per kind=condizioni / legali / sezione
--    Body ricco (HTML/markdown) multi-pagina supportato. Apparira' come
--    pagine dedicate del PDF al momento della generazione.
ALTER TABLE public.quote_templates
  ADD COLUMN IF NOT EXISTS body_html text,
  ADD COLUMN IF NOT EXISTS body_format text DEFAULT 'markdown'
    CHECK (body_format IN ('markdown', 'html', 'plain'));

COMMENT ON COLUMN public.quote_templates.body_html IS
  'Contenuto rich (markdown o HTML) per kind=condizioni/legali/sezione. Supporta merge tag {{cliente.nome}}.';

-- 4) Campi specifici per kind=prodotto
ALTER TABLE public.quote_templates
  ADD COLUMN IF NOT EXISTS product_image_url text,
  ADD COLUMN IF NOT EXISTS product_short_description text,
  ADD COLUMN IF NOT EXISTS product_long_description text,
  ADD COLUMN IF NOT EXISTS product_specs jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS product_indicative_price numeric(12,2),
  ADD COLUMN IF NOT EXISTS product_unit text,
  ADD COLUMN IF NOT EXISTS product_category text;

COMMENT ON COLUMN public.quote_templates.product_specs IS
  'Array di {label, value} per la scheda prodotto. Es. [{"label":"Spessore","value":"3 cm"}].';
COMMENT ON COLUMN public.quote_templates.product_indicative_price IS
  'Prezzo indicativo (NON vincolante per il preventivo finale).';
COMMENT ON COLUMN public.quote_templates.product_category IS
  'Categoria libera per filtri UI (es. "Serramenti", "Pavimenti", "Bagno").';

-- 5) Flag display
ALTER TABLE public.quote_templates
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS description text;

COMMENT ON COLUMN public.quote_templates.thumbnail_url IS
  'Anteprima visuale per la libreria template (auto-generata o caricata).';

-- 6) Indici per filtraggio veloce per kind
CREATE INDEX IF NOT EXISTS idx_quote_templates_kind
  ON public.quote_templates (company_id, kind, is_active)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_quote_templates_product_category
  ON public.quote_templates (company_id, product_category)
  WHERE kind = 'prodotto' AND is_active = true;

-- 7) Vincoli logici: solo kind=offerta può avere is_default=true (1 default per company)
DROP INDEX IF EXISTS uq_quote_templates_default_per_company;
CREATE UNIQUE INDEX IF NOT EXISTS uq_quote_templates_default_per_company
  ON public.quote_templates (company_id)
  WHERE is_default = true AND is_active = true AND kind = 'offerta';

-- 8) Vista helper: conteggio template per kind per company (UI tabs)
CREATE OR REPLACE VIEW public.v_quote_template_counts AS
SELECT
  company_id,
  kind,
  count(*) FILTER (WHERE is_active = true) AS active_count,
  count(*) AS total_count
FROM public.quote_templates
GROUP BY company_id, kind;

GRANT SELECT ON public.v_quote_template_counts TO authenticated;

-- 9) Migrazione dati esistenti: i template legacy (senza kind) restano 'offerta'
--    grazie al DEFAULT. Se ci sono righe con kind NULL (improbabile con DEFAULT),
--    le sistemiamo qui per sicurezza.
UPDATE public.quote_templates SET kind = 'offerta' WHERE kind IS NULL;

COMMENT ON TABLE public.quote_templates IS
  'Libreria componibile di template per offerte. Ogni record ha un kind (offerta master, copertina, condizioni, legali, prodotto, sezione). I template offerta linkano gli altri come blocchi riusabili.';
