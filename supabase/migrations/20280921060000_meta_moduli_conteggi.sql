-- ════════════════════════════════════════════════════════════════════════════
-- Recupero lead Facebook: l'ultimo conteggio di lead visto per ogni modulo
-- ════════════════════════════════════════════════════════════════════════════
--
-- PERCHÉ
-- meta-leads-backfill (cron ogni 15 minuti) chiede a Facebook i lead di OGNI
-- modulo di ogni pagina collegata: 336 moduli per giro, ~33.000 chiamate al
-- giorno, quasi tutte senza niente di nuovo (misurato il 20-21/09/2026).
-- Facebook dice già quanti lead ha ogni modulo (`leads_count` nell'elenco dei
-- moduli di una pagina): tenendo da parte l'ultimo conteggio visto, si chiedono
-- i lead solo dei moduli il cui conteggio è cambiato. Le regole stanno in
-- supabase/functions/_shared/metaModuliDaInterrogare.ts.
--
-- COSA C'È
-- Una riga per pagina collegata (meta_assets.id) con la mappa
--   { "<form_id>": { "n": <leads_count>, "cambiato": "<quando si è visto questo n la prima volta>" } }
-- La scrive e la legge solo la funzione, con la chiave di servizio: RLS accesa
-- e nessuna policy.
--
-- PERCHÉ NON IN meta_lead_forms
-- Una riga lì per ognuno dei ~318 moduli mai configurati comparirebbe nel
-- pannello «Moduli Facebook» del cliente e nei selettori dei flussi.
--
-- PERCHÉ SENZA company_id
-- È una cache. Il backup delle aziende prende ogni tabella con company_id
-- (admin_tabelle_da_esportare), e questa non va né salvata né ripristinata:
-- se sparisce, il giro dopo rilegge tutti i moduli una volta e la ricostruisce.
-- Si cancella a cascata con la pagina, e quindi con l'azienda.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.meta_moduli_conteggi (
  page_asset_id uuid PRIMARY KEY REFERENCES public.meta_assets(id) ON DELETE CASCADE,
  conteggi      jsonb NOT NULL DEFAULT '{}'::jsonb,
  aggiornato_il timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.meta_moduli_conteggi ENABLE ROW LEVEL SECURITY;

-- Nessuna policy: ci arriva solo la chiave di servizio, che salta la RLS.
REVOKE ALL ON public.meta_moduli_conteggi FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_moduli_conteggi TO service_role;

COMMENT ON TABLE public.meta_moduli_conteggi IS
  'Ultimo leads_count visto per ogni modulo Facebook, una riga per pagina collegata. '
  'Lo usa solo meta-leads-backfill per non chiedere i lead dei moduli fermi. È una cache: si ricostruisce da sola.';
