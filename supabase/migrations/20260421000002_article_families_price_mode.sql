-- ============================================================================
-- article_families · Gestione prezzo vendita vs acquisto+markup + IVA 0%
-- ============================================================================
-- Use case business:
--
--  Tipologia A (aziende che vendono a prezzo fisso):
--   Caricano direttamente il prezzo di vendita. Non vogliono calcolare
--   margini. Il campo prezzo_base_vendita è la sola cosa che gli serve.
--
--  Tipologia B (aziende rivenditori / installatori con markup):
--   Caricano il prezzo di ACQUISTO dal fornitore (quello del listino del
--   produttore). Il prezzo di vendita viene derivato tramite:
--     - markup in percentuale (es. +45%)
--     - markup fisso per pezzo (es. +120 € al pezzo)
--     - markup a valore libero (compilato al preventivo)
--   Il valore persistito in prezzo_base_vendita viene tenuto allineato
--   via il client (calcolo pure in src/lib/priceMarkup.ts). Il DB non
--   forza la consistenza: se il mode è "acquisto_markup" la colonna
--   vendita è una cache del calcolo.
--
-- IVA 0%:
--   La vecchia CHECK implicita (via codice client) non ammetteva 0.
--   Acquisti intracomunitari / esteri con inversione contabile richiedono
--   IVA 0%. Rimuoviamo qualunque CHECK restrittiva se presente.
--
-- Campi aggiunti:
--  - prezzo_base_mode TEXT DEFAULT 'vendita'
--      · 'vendita'          → input diretto prezzo vendita
--      · 'acquisto_markup'  → input prezzo acquisto, vendita = acquisto + markup
--  - markup_tipo TEXT DEFAULT 'none'
--      · 'none'         → nessun ricarico (vendita = acquisto)
--      · 'percentuale'  → vendita = acquisto * (1 + markup_valore/100)
--      · 'fisso_pz'     → vendita = acquisto + markup_valore
--  - markup_valore NUMERIC(12,4) DEFAULT 0
--
-- Retrocompat: tutte le righe esistenti ottengono 'vendita'/'none'/0
-- (identico al comportamento pre-migration).
-- ============================================================================

ALTER TABLE public.article_families
  ADD COLUMN IF NOT EXISTS prezzo_base_mode TEXT NOT NULL DEFAULT 'vendita';

ALTER TABLE public.article_families
  ADD COLUMN IF NOT EXISTS markup_tipo TEXT NOT NULL DEFAULT 'none';

ALTER TABLE public.article_families
  ADD COLUMN IF NOT EXISTS markup_valore NUMERIC(12,4) NOT NULL DEFAULT 0;

-- CHECK constraint: idempotente (DROP se esiste + ADD)
ALTER TABLE public.article_families
  DROP CONSTRAINT IF EXISTS article_families_prezzo_base_mode_check;
ALTER TABLE public.article_families
  ADD CONSTRAINT article_families_prezzo_base_mode_check
    CHECK (prezzo_base_mode IN ('vendita', 'acquisto_markup'));

ALTER TABLE public.article_families
  DROP CONSTRAINT IF EXISTS article_families_markup_tipo_check;
ALTER TABLE public.article_families
  ADD CONSTRAINT article_families_markup_tipo_check
    CHECK (markup_tipo IN ('none', 'percentuale', 'fisso_pz'));

-- IVA: non c'è CHECK esplicito nel DDL originale (20260917000002 linea 32
-- ha solo DEFAULT 22), ma assicuriamoci che 0 sia ammesso rimuovendo
-- qualsiasi vincolo aggiunto successivamente. 0 < IVA <= 100 è il solo
-- vincolo ragionevole (no negativi / no > 100).
ALTER TABLE public.article_families
  DROP CONSTRAINT IF EXISTS article_families_vat_rate_check;
ALTER TABLE public.article_families
  ADD CONSTRAINT article_families_vat_rate_check
    CHECK (vat_rate >= 0 AND vat_rate <= 100);

COMMENT ON COLUMN public.article_families.prezzo_base_mode IS
  'Modalità gestione prezzo: "vendita" (input diretto) oppure '
  '"acquisto_markup" (input acquisto + markup per calcolare vendita).';

COMMENT ON COLUMN public.article_families.markup_tipo IS
  'Tipo markup applicato quando prezzo_base_mode="acquisto_markup": '
  '"none", "percentuale" o "fisso_pz".';

COMMENT ON COLUMN public.article_families.markup_valore IS
  'Valore del markup. Percentuale se markup_tipo="percentuale" (es. 45 = +45%), '
  'EUR fissi al pezzo se markup_tipo="fisso_pz", ignorato se "none".';

-- Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
