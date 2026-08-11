-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- MP-EMAIL-AI-01 · L0+L1 — Cascata classificazione email a costo zero

-- ─── 1) Enum tassonomia MP ──────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'email_categoria_v2') THEN
    CREATE TYPE public.email_categoria_v2 AS ENUM (
      'cliente', 'fornitore', 'operaio', 'preventivo', 'fattura',
      'opportunita', 'supporto', 'pratica', 'newsletter', 'social',
      'notifica', 'spam', 'altro'
    );
  END IF;
END $$;

-- ─── 2) Colonne classificazione su email_inbox ──────────────────────────────
ALTER TABLE public.email_inbox
  ADD COLUMN IF NOT EXISTS categoria       public.email_categoria_v2,
  ADD COLUMN IF NOT EXISTS entita_tipo     text,
  ADD COLUMN IF NOT EXISTS entita_id       uuid,
  ADD COLUMN IF NOT EXISTS confidenza      numeric(3,2),
  ADD COLUMN IF NOT EXISTS classificato_da text,
  ADD COLUMN IF NOT EXISTS da_rivedere     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS headers         jsonb,
  ADD COLUMN IF NOT EXISTS classificato_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'email_inbox_classificato_da_check'
  ) THEN
    ALTER TABLE public.email_inbox
      ADD CONSTRAINT email_inbox_classificato_da_check
      CHECK (classificato_da IS NULL OR classificato_da IN ('regola', 'embedding', 'haiku', 'manuale'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'email_inbox_entita_tipo_check'
  ) THEN
    ALTER TABLE public.email_inbox
      ADD CONSTRAINT email_inbox_entita_tipo_check
      CHECK (entita_tipo IS NULL OR entita_tipo IN ('cliente', 'fornitore', 'operaio', 'opportunita', 'ordine'));
  END IF;
END $$;

-- ─── 3) Indici per cascata L1 ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_email_inbox_pending_cascade
  ON public.email_inbox (company_id, received_at DESC)
  WHERE categoria IS NULL AND status != 'spam';

CREATE INDEX IF NOT EXISTS idx_email_inbox_user_categoria
  ON public.email_inbox (user_id, categoria, received_at DESC)
  WHERE is_trashed = false;

CREATE INDEX IF NOT EXISTS idx_email_inbox_company_categoria
  ON public.email_inbox (company_id, categoria, received_at DESC)
  WHERE is_trashed = false;

CREATE INDEX IF NOT EXISTS idx_email_inbox_da_rivedere
  ON public.email_inbox (company_id, da_rivedere, received_at DESC)
  WHERE da_rivedere = true;

-- ─── 4) Tabella mittenti_noti ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mittenti_noti (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email            text NOT NULL,
  dominio          text,
  categoria        public.email_categoria_v2 NOT NULL,
  entita_tipo      text,
  entita_id        uuid,
  fonte            text NOT NULL,
  hit_count        integer NOT NULL DEFAULT 1,
  last_seen_at     timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mittenti_noti_unique_per_company UNIQUE (company_id, email),
  CONSTRAINT mittenti_noti_fonte_check CHECK (fonte IN ('regola', 'haiku', 'manuale')),
  CONSTRAINT mittenti_noti_entita_tipo_check CHECK (entita_tipo IS NULL OR entita_tipo IN ('cliente', 'fornitore', 'operaio', 'opportunita', 'ordine'))
);

CREATE INDEX IF NOT EXISTS idx_mittenti_noti_email_lookup
  ON public.mittenti_noti (company_id, email);

CREATE INDEX IF NOT EXISTS idx_mittenti_noti_dominio_lookup
  ON public.mittenti_noti (company_id, dominio)
  WHERE dominio IS NOT NULL;

CREATE OR REPLACE FUNCTION public.tg_mittenti_noti_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_mittenti_noti_updated_at ON public.mittenti_noti;
CREATE TRIGGER trg_mittenti_noti_updated_at
  BEFORE UPDATE ON public.mittenti_noti
  FOR EACH ROW EXECUTE FUNCTION public.tg_mittenti_noti_updated_at();

-- ─── 5) RLS mittenti_noti ───────────────────────────────────────────────────
ALTER TABLE public.mittenti_noti ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mittenti_noti_company_read ON public.mittenti_noti;
CREATE POLICY mittenti_noti_company_read ON public.mittenti_noti
  FOR SELECT TO authenticated
  USING (company_id = public.get_effective_company_id());

DROP POLICY IF EXISTS mittenti_noti_company_write ON public.mittenti_noti;
CREATE POLICY mittenti_noti_company_write ON public.mittenti_noti
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_effective_company_id());

DROP POLICY IF EXISTS mittenti_noti_company_update ON public.mittenti_noti;
CREATE POLICY mittenti_noti_company_update ON public.mittenti_noti
  FOR UPDATE TO authenticated
  USING (company_id = public.get_effective_company_id())
  WITH CHECK (company_id = public.get_effective_company_id());

DROP POLICY IF EXISTS mittenti_noti_company_delete ON public.mittenti_noti;
CREATE POLICY mittenti_noti_company_delete ON public.mittenti_noti
  FOR DELETE TO authenticated
  USING (company_id = public.get_effective_company_id());

DROP POLICY IF EXISTS mittenti_noti_service_all ON public.mittenti_noti;
CREATE POLICY mittenti_noti_service_all ON public.mittenti_noti
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS mittenti_noti_super_admin ON public.mittenti_noti;
CREATE POLICY mittenti_noti_super_admin ON public.mittenti_noti
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- ─── 6) RPC upsert_mittente_noto ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.upsert_mittente_noto(
  p_email          text,
  p_categoria      public.email_categoria_v2,
  p_entita_tipo    text DEFAULT NULL,
  p_entita_id      uuid DEFAULT NULL,
  p_fonte          text DEFAULT 'manuale'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_id uuid;
  v_email_lower text;
  v_dominio text;
BEGIN
  v_company_id := public.get_effective_company_id();
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Nessuna azienda attiva';
  END IF;

  IF p_email IS NULL OR length(trim(p_email)) = 0 THEN
    RAISE EXCEPTION 'Email mittente obbligatoria';
  END IF;

  v_email_lower := lower(trim(p_email));
  v_dominio := lower(split_part(v_email_lower, '@', 2));

  INSERT INTO public.mittenti_noti (
    company_id, email, dominio, categoria, entita_tipo, entita_id, fonte
  ) VALUES (
    v_company_id, v_email_lower, NULLIF(v_dominio, ''),
    p_categoria, p_entita_tipo, p_entita_id, p_fonte
  )
  ON CONFLICT (company_id, email) DO UPDATE SET
    categoria    = EXCLUDED.categoria,
    entita_tipo  = EXCLUDED.entita_tipo,
    entita_id    = EXCLUDED.entita_id,
    fonte        = EXCLUDED.fonte,
    hit_count    = public.mittenti_noti.hit_count + 1,
    last_seen_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION public.upsert_mittente_noto(
  text, public.email_categoria_v2, text, uuid, text
) TO authenticated;

-- ─── 7) RPC reclassify_email_manuale ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reclassify_email_manuale(
  p_email_id    uuid,
  p_categoria   public.email_categoria_v2,
  p_entita_tipo text DEFAULT NULL,
  p_entita_id   uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_from_email text;
BEGIN
  v_company_id := public.get_effective_company_id();
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Nessuna azienda attiva';
  END IF;

  SELECT from_email INTO v_from_email
  FROM public.email_inbox
  WHERE id = p_email_id AND company_id = v_company_id;

  IF v_from_email IS NULL THEN
    RAISE EXCEPTION 'Email non trovata o fuori scope';
  END IF;

  UPDATE public.email_inbox
  SET categoria       = p_categoria,
      entita_tipo     = p_entita_tipo,
      entita_id       = p_entita_id,
      confidenza      = 1.0,
      classificato_da = 'manuale',
      da_rivedere     = false,
      classificato_at = now()
  WHERE id = p_email_id;

  PERFORM public.upsert_mittente_noto(
    v_from_email, p_categoria, p_entita_tipo, p_entita_id, 'manuale'
  );
END $$;

GRANT EXECUTE ON FUNCTION public.reclassify_email_manuale(
  uuid, public.email_categoria_v2, text, uuid
) TO authenticated;

-- ─── 8) View con join CRM ───────────────────────────────────────────────────
-- Schema reale (verificato 2026-05-28):
--   suppliers.name (text) ✓
--   employees.first_name + last_name (no 'name')
--   customers: tabella NON esiste (la "Lista Clienti" usa altre RPC)
CREATE OR REPLACE VIEW public.v_email_inbox_classified AS
SELECT
  e.*,
  COALESCE(e.categoria::text, e.ai_category, 'altro') AS categoria_ui,
  CASE e.entita_tipo
    WHEN 'fornitore' THEN (SELECT s.name FROM public.suppliers s WHERE s.id = e.entita_id AND s.company_id = e.company_id)
    WHEN 'operaio'   THEN (SELECT trim(concat_ws(' ', emp.first_name, emp.last_name)) FROM public.employees emp WHERE emp.id = e.entita_id AND emp.company_id = e.company_id)
    ELSE NULL
  END AS entita_nome
FROM public.email_inbox e;

GRANT SELECT ON public.v_email_inbox_classified TO authenticated;

-- ─── 9) Stats helper ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.email_ai_cascade_stats(p_days int DEFAULT 30)
RETURNS TABLE (
  totale            bigint,
  da_regola         bigint,
  da_haiku          bigint,
  da_manuale        bigint,
  da_rivedere       bigint,
  non_classificate  bigint,
  perc_l1           numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  v_company_id := public.get_effective_company_id();
  RETURN QUERY
  SELECT
    count(*)::bigint AS totale,
    count(*) FILTER (WHERE classificato_da = 'regola')::bigint AS da_regola,
    count(*) FILTER (WHERE classificato_da = 'haiku')::bigint AS da_haiku,
    count(*) FILTER (WHERE classificato_da = 'manuale')::bigint AS da_manuale,
    count(*) FILTER (WHERE da_rivedere = true)::bigint AS da_rivedere,
    count(*) FILTER (WHERE categoria IS NULL)::bigint AS non_classificate,
    CASE WHEN count(*) > 0
      THEN ROUND(100.0 * count(*) FILTER (WHERE classificato_da = 'regola') / count(*), 1)
      ELSE 0
    END AS perc_l1
  FROM public.email_inbox
  WHERE company_id = v_company_id
    AND received_at > now() - (p_days || ' days')::interval;
END $$;

GRANT EXECUTE ON FUNCTION public.email_ai_cascade_stats(int) TO authenticated;

-- ─── 10) Commenti documentali ───────────────────────────────────────────────
COMMENT ON COLUMN public.email_inbox.categoria IS 'MP-EMAIL-AI-01: categoria operativa risultante dalla cascata L1→L3. NULL = non ancora classificata.';
COMMENT ON COLUMN public.email_inbox.entita_tipo IS 'MP-EMAIL-AI-01: tipo entità CRM linkata (cliente/fornitore/operaio/opportunita/ordine).';
COMMENT ON COLUMN public.email_inbox.entita_id IS 'MP-EMAIL-AI-01: ID entità CRM linkata. FK soft (no constraint) per agnosticità.';
COMMENT ON COLUMN public.email_inbox.confidenza IS 'MP-EMAIL-AI-01: 0..1 — regola=1.0, haiku=output modello, manuale=1.0.';
COMMENT ON COLUMN public.email_inbox.classificato_da IS 'MP-EMAIL-AI-01: regola|embedding|haiku|manuale.';
COMMENT ON COLUMN public.email_inbox.da_rivedere IS 'MP-EMAIL-AI-01: true se confidenza < soglia o ambigua → resta nella tab "Da fare".';
COMMENT ON COLUMN public.email_inbox.headers IS 'MP-EMAIL-AI-01: header email grezzi (List-Unsubscribe, List-Id, Precedence, Auto-Submitted, Return-Path, ecc) per regole deterministiche.';
COMMENT ON TABLE public.mittenti_noti IS 'MP-EMAIL-AI-01: cache mittenti già classificati. Permette al L1a di risolvere email future di quel mittente a costo zero.';
