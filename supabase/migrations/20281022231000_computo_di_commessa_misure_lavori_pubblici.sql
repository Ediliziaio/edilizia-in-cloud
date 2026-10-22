-- ════════════════════════════════════════════════════════════════════════════
-- Computo metrico di commessa: capitoli, righe di misura, lavori pubblici
-- ════════════════════════════════════════════════════════════════════════════
-- Richiesta di 2D S.r.l (22/10/2026, lavori per la pubblica amministrazione):
-- il computo deve essere «perfetto» e diventare la base della distinta dei
-- materiali da acquistare. Fin qui il computo importato (computo_uploads +
-- computo_voci_estratte) serviva solo a fare un preventivo: un capitolo solo,
-- la quantità totale senza le misure, nessun legame con la commessa.
--
-- Qui, senza toccare chi lo usa già:
--   - computo_uploads: la commessa, i totali dichiarati dal documento (per
--     controllare l'import contro «SOMMANO» e riepiloghi), i dati da lavoro
--     pubblico (ribasso d'asta, oneri della sicurezza non soggetti a ribasso,
--     CIG, CUP, stazione appaltante) e lo stato del computo;
--   - computo_voci_estratte: numero d'ordine, la gerarchia PriMus
--     (super-categoria › categoria › sotto-categoria), codice tariffa, voce
--     di sicurezza, voce in detrazione;
--   - computo_voci_misure (nuova): le righe di misura di ogni voce, come nel
--     libretto (descrizione, par.ug., lung., larg., H/peso, quantità, formula).
-- Solo colonne nuove nullable e una tabella nuova: nessuna riga scritta.
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.computo_uploads
  ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS titolo text,
  ADD COLUMN IF NOT EXISTS stato text NOT NULL DEFAULT 'bozza',
  ADD COLUMN IF NOT EXISTS totale_dichiarato numeric(14,2),
  ADD COLUMN IF NOT EXISTS totale_calcolato numeric(14,2),
  ADD COLUMN IF NOT EXISTS controllo_totali jsonb,
  ADD COLUMN IF NOT EXISTS prezzari text[],
  ADD COLUMN IF NOT EXISTS lavoro_pubblico boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stazione_appaltante text,
  ADD COLUMN IF NOT EXISTS cig text,
  ADD COLUMN IF NOT EXISTS cup text,
  ADD COLUMN IF NOT EXISTS ribasso_percentuale numeric(7,4),
  ADD COLUMN IF NOT EXISTS oneri_sicurezza numeric(14,2);

DO $$ BEGIN
  ALTER TABLE public.computo_uploads
    ADD CONSTRAINT computo_uploads_stato_check
    CHECK (stato IN ('bozza', 'verificato', 'contrattuale', 'archiviato'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN public.computo_uploads.order_id IS 'Commessa a cui appartiene il computo (null = computo usato solo per un preventivo).';
COMMENT ON COLUMN public.computo_uploads.totale_dichiarato IS 'Totale scritto nel documento (riepilogo PriMus): serve a verificare che l''import non abbia perso voci.';
COMMENT ON COLUMN public.computo_uploads.controllo_totali IS 'Esito del confronto voce per voce e per capitolo fra quantità×prezzo, SOMMANO e riepiloghi.';
COMMENT ON COLUMN public.computo_uploads.oneri_sicurezza IS 'Oneri della sicurezza non soggetti a ribasso d''asta.';

CREATE INDEX IF NOT EXISTS computo_uploads_order_idx ON public.computo_uploads (order_id) WHERE order_id IS NOT NULL;

ALTER TABLE public.computo_voci_estratte
  ADD COLUMN IF NOT EXISTS numero_ordine text,
  ADD COLUMN IF NOT EXISTS codice_tariffa text,
  ADD COLUMN IF NOT EXISTS super_categoria text,
  ADD COLUMN IF NOT EXISTS categoria text,
  ADD COLUMN IF NOT EXISTS sotto_categoria text,
  ADD COLUMN IF NOT EXISTS is_sicurezza boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_detrazione boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS a_corpo boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.computo_voci_misure (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  voce_id uuid NOT NULL REFERENCES public.computo_voci_estratte(id) ON DELETE CASCADE,
  ordine integer NOT NULL DEFAULT 0,
  descrizione text,
  parti_uguali numeric(16,4),
  lunghezza numeric(16,4),
  larghezza numeric(16,4),
  altezza_peso numeric(16,4),
  quantita numeric(18,4),
  formula text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.computo_voci_misure IS 'Righe di misura di una voce di computo (libretto delle misure): la quantità della voce è la somma delle righe.';

CREATE INDEX IF NOT EXISTS computo_voci_misure_voce_idx ON public.computo_voci_misure (voce_id, ordine);
CREATE INDEX IF NOT EXISTS computo_voci_misure_company_idx ON public.computo_voci_misure (company_id);

ALTER TABLE public.computo_voci_misure ENABLE ROW LEVEL SECURITY;

-- Stesse regole delle voci del computo: azienda dell'utente, niente clienti esterni.
DROP POLICY IF EXISTS computo_voci_misure_select ON public.computo_voci_misure;
CREATE POLICY computo_voci_misure_select ON public.computo_voci_misure FOR SELECT TO authenticated
  USING (company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = (SELECT auth.uid()))
         AND NOT (SELECT public.utente_e_cliente_esterno()));
DROP POLICY IF EXISTS computo_voci_misure_insert ON public.computo_voci_misure;
CREATE POLICY computo_voci_misure_insert ON public.computo_voci_misure FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = (SELECT auth.uid()))
              AND NOT (SELECT public.utente_e_cliente_esterno()));
DROP POLICY IF EXISTS computo_voci_misure_update ON public.computo_voci_misure;
CREATE POLICY computo_voci_misure_update ON public.computo_voci_misure FOR UPDATE TO authenticated
  USING (company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = (SELECT auth.uid()))
         AND NOT (SELECT public.utente_e_cliente_esterno()))
  WITH CHECK (company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = (SELECT auth.uid())));
DROP POLICY IF EXISTS computo_voci_misure_delete ON public.computo_voci_misure;
CREATE POLICY computo_voci_misure_delete ON public.computo_voci_misure FOR DELETE TO authenticated
  USING (company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = (SELECT auth.uid()))
         AND NOT (SELECT public.utente_e_cliente_esterno()));
DROP POLICY IF EXISTS blocco_utente_bloccato ON public.computo_voci_misure;
CREATE POLICY blocco_utente_bloccato ON public.computo_voci_misure AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT (SELECT public.utente_bloccato()))
  WITH CHECK (NOT (SELECT public.utente_bloccato()));

REVOKE ALL ON public.computo_voci_misure FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.computo_voci_misure TO authenticated;
GRANT ALL ON public.computo_voci_misure TO service_role;
