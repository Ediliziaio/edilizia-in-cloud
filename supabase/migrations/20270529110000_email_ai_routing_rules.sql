-- ════════════════════════════════════════════════════════════════════════════
-- MP-EMAIL-AI-05 · Motore di Regole di Instradamento Email
-- ────────────────────────────────────────────────────────────────────────────
-- Risolve il caso "stessa entità, più canali" (newsletter@/preventivi@/ordini@/
-- logistica@ dello stesso fornitore → trattamenti diversi).
-- Modello: TRIGGER (condizioni AND/OR) → AZIONI (multiple).
-- Gira nel Livello 1 della cascata → costo ZERO token.
--
-- Precedenza (MP-05 §4): regole manuali > regole auto > mittenti_noti >
--   header > regex generiche > L2/L3.
--
-- Idempotente. Non rompe la cascata MP-01.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.email_regole (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome            text NOT NULL,                          -- 'Preventivi Edil Forniture'
  origine         text NOT NULL DEFAULT 'manuale',        -- 'manuale' | 'auto'
  stato           text NOT NULL DEFAULT 'attiva',         -- 'attiva'|'in_approvazione'|'disattivata'|'rifiutata'
  priorita        int  NOT NULL DEFAULT 100,              -- più basso = valutata prima
  combinatore     text NOT NULL DEFAULT 'AND',            -- 'AND' | 'OR' tra le condizioni
  condizioni      jsonb NOT NULL DEFAULT '[]'::jsonb,     -- [{campo, operatore, valore}, ...]
  azioni          jsonb NOT NULL DEFAULT '[]'::jsonb,     -- [{tipo, valore}, ...]
  supporto        int DEFAULT 0,                          -- per 'auto': quante conferme l'hanno generata
  creata_da       uuid,
  approvata_da    uuid,
  match_count     int NOT NULL DEFAULT 0,                 -- quante email ha instradato
  ultimo_match_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_regole_origine_check CHECK (origine IN ('manuale', 'auto')),
  CONSTRAINT email_regole_stato_check CHECK (stato IN ('attiva', 'in_approvazione', 'disattivata', 'rifiutata')),
  CONSTRAINT email_regole_combinatore_check CHECK (combinatore IN ('AND', 'OR'))
);

CREATE INDEX IF NOT EXISTS idx_email_regole_eval
  ON public.email_regole (company_id, stato, priorita)
  WHERE stato = 'attiva';

CREATE INDEX IF NOT EXISTS idx_email_regole_company
  ON public.email_regole (company_id, created_at DESC);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.tg_email_regole_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_email_regole_updated_at ON public.email_regole;
CREATE TRIGGER trg_email_regole_updated_at
  BEFORE UPDATE ON public.email_regole
  FOR EACH ROW EXECUTE FUNCTION public.tg_email_regole_updated_at();

-- ─── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.email_regole ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_regole_company_read ON public.email_regole;
CREATE POLICY email_regole_company_read ON public.email_regole
  FOR SELECT TO authenticated USING (company_id = public.get_effective_company_id());

DROP POLICY IF EXISTS email_regole_company_write ON public.email_regole;
CREATE POLICY email_regole_company_write ON public.email_regole
  FOR INSERT TO authenticated WITH CHECK (company_id = public.get_effective_company_id());

DROP POLICY IF EXISTS email_regole_company_update ON public.email_regole;
CREATE POLICY email_regole_company_update ON public.email_regole
  FOR UPDATE TO authenticated USING (company_id = public.get_effective_company_id())
  WITH CHECK (company_id = public.get_effective_company_id());

DROP POLICY IF EXISTS email_regole_company_delete ON public.email_regole;
CREATE POLICY email_regole_company_delete ON public.email_regole
  FOR DELETE TO authenticated USING (company_id = public.get_effective_company_id());

DROP POLICY IF EXISTS email_regole_service_all ON public.email_regole;
CREATE POLICY email_regole_service_all ON public.email_regole
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS email_regole_super_admin ON public.email_regole;
CREATE POLICY email_regole_super_admin ON public.email_regole
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- ─── RPC: incrementa contatore match (chiamata dall'edge dopo applicazione) ──
CREATE OR REPLACE FUNCTION public.bump_email_regola_match(p_regola_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.email_regole
  SET match_count = match_count + 1, ultimo_match_at = now()
  WHERE id = p_regola_id;
END $$;
GRANT EXECUTE ON FUNCTION public.bump_email_regola_match(uuid) TO service_role, authenticated;

COMMENT ON TABLE public.email_regole IS
  'MP-EMAIL-AI-05: regole di instradamento TRIGGER→AZIONI. Valutate in L1 (costo zero) PRIMA di mittenti_noti e regex generiche. condizioni/azioni come JSONB flessibile.';

-- ─── Seed di esempio NON inserito (le regole sono per-azienda) ──────────────
-- Esempio documentale (Edil Forniture, 4 indirizzi) — vedi STATUS.md / UI.
