-- ============================================================================
-- article_families · Sconti fornitore a cascata (s1 + s2)
-- ============================================================================
-- Use case business:
--
--   I listini dei fornitori italiani di serramenti (AGB, Schuco, Savio, ecc.)
--   espongono prezzi LORDI. Lo sconto commerciale è pattuito per categoria di
--   rivenditore/installatore e spesso applicato IN CASCATA: per es. "55% + 3%".
--
--   Flusso economico:
--     prezzo_lordo_fornitore → sconto 1 → sconto 2 → acquisto_netto → markup → vendita
--
--   Esempio numerico (Finestra a Wasistas, lordo €1000, sconti 55% + 3%, markup 40%):
--     €1000 × (1 - 55/100) = €450.00
--     €450.00 × (1 - 3/100) = €436.50  ← acquisto netto (quello che paghi al fornitore)
--     €436.50 × (1 + 40/100) = €611.10 ← prezzo di vendita cliente
--
--   Oggi il campo `prezzo_base_acquisto` contiene già "l'acquisto netto" se
--   l'utente si calcola a mano lo sconto. I nuovi campi permettono invece di
--   caricare direttamente il prezzo lordo di listino + sconti e delegare il
--   calcolo al client (coerente con markup_tipo/markup_valore).
--
-- Retrocompat: default 0/0 → comportamento invariato (nessuno sconto applicato).
-- Le famiglie create pre-migration funzionano esattamente come prima.
-- ============================================================================

ALTER TABLE public.article_families
  ADD COLUMN IF NOT EXISTS sconto_fornitore_1 NUMERIC(5,2) NOT NULL DEFAULT 0;

ALTER TABLE public.article_families
  ADD COLUMN IF NOT EXISTS sconto_fornitore_2 NUMERIC(5,2) NOT NULL DEFAULT 0;

-- CHECK constraints: idempotenti (DROP se esistono + ADD).
-- Range [0, 100]: 0 = nessuno sconto, 100 = gratis (edge case ammesso).
ALTER TABLE public.article_families
  DROP CONSTRAINT IF EXISTS article_families_sconto_fornitore_1_check;
ALTER TABLE public.article_families
  ADD CONSTRAINT article_families_sconto_fornitore_1_check
    CHECK (sconto_fornitore_1 >= 0 AND sconto_fornitore_1 <= 100);

ALTER TABLE public.article_families
  DROP CONSTRAINT IF EXISTS article_families_sconto_fornitore_2_check;
ALTER TABLE public.article_families
  ADD CONSTRAINT article_families_sconto_fornitore_2_check
    CHECK (sconto_fornitore_2 >= 0 AND sconto_fornitore_2 <= 100);

COMMENT ON COLUMN public.article_families.sconto_fornitore_1 IS
  'Primo sconto in cascata applicato al prezzo lordo del listino fornitore (0-100%). '
  'Esempio: 55 = -55%. Ignorato se prezzo_base_mode <> "acquisto_markup".';

COMMENT ON COLUMN public.article_families.sconto_fornitore_2 IS
  'Secondo sconto in cascata applicato dopo il primo (0-100%). '
  'Esempio: 3 = -3% (in cascata: dopo s1 -55%, un ulteriore -3%). '
  'Ignorato se prezzo_base_mode <> "acquisto_markup".';

-- Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
