-- ============================================================================
-- P1 · Join table `plan_feature_defaults` — plan × feature con limit/credits
-- ============================================================================
-- Oggi il mapping piano→feature vive in `platform_feature_flags.plans_included`
-- (text[] grossolano) e i limiti/crediti inclusi sono impliciti nella
-- descrizione testuale dei piani (jsonb `features`). Il masterprompt richiede
-- una tabella di default per-piano configurabile dal SuperAdmin, che diventi
-- la sorgente di verità per:
--   - feature abilitata/disabilitata per piano (come oggi)
--   - limit_value: quota numerica gated (es. max cantieri attivi)
--   - credits_included: quota crediti mensili inclusi nel piano
--
-- Logica di risoluzione (resolver v2):
--   override attivo (company_feature_overrides)
--     > default per-plan (plan_feature_defaults)
--     > plans_included[] array (backward compat)
--     > default_value globale (platform_feature_flags)
--
-- Lasciamo entrambi i path attivi per non rompere niente: finché i seed sono
-- allineati, nessuna azienda cambia comportamento. La migration che segue
-- aggiorna il resolver per consultare la nuova tabella.
-- ============================================================================

-- ── TABELLA ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plan_feature_defaults (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id          uuid NOT NULL REFERENCES public.subscription_plans(id) ON DELETE CASCADE,
  feature_key      text NOT NULL REFERENCES public.platform_feature_flags(key) ON DELETE CASCADE,

  -- Abilitazione effettiva per questo piano (TRUE = sbloccata di default)
  is_enabled       boolean NOT NULL DEFAULT false,

  -- Limite numerico (es. max cantieri attivi, max utenti).
  -- NULL = illimitato, 0 = bloccato, >0 = quota.
  limit_value      integer,

  -- Crediti inclusi ogni ciclo di billing (EUR per ai/email/whatsapp, interi per render).
  -- NULL = nessuna allocazione inclusa in questo piano.
  credits_included numeric(12,4),

  -- Quale wallet alimenta `credits_included`. Coerente con RPC consume_credits.
  credit_type      text CHECK (credit_type IN ('ai','email','whatsapp','render') OR credit_type IS NULL),

  -- Note libere per il SuperAdmin (es. "Include 100 SMS/mese per il lancio Q2")
  notes            text,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  UNIQUE(plan_id, feature_key)
);

COMMENT ON TABLE public.plan_feature_defaults IS
  'Default per-piano per-feature: is_enabled, limit_value, credits_included. Superscedera'' il mapping coarse `platform_feature_flags.plans_included` quando presente.';

COMMENT ON COLUMN public.plan_feature_defaults.limit_value IS
  'NULL=illimitato, 0=bloccato, >0=quota. Interpretazione specifica per feature (es. cantieri_attivi=max cantieri, users=max utenti).';
COMMENT ON COLUMN public.plan_feature_defaults.credits_included IS
  'Crediti mensili inclusi. EUR decimali per wallet EUR (ai/email/whatsapp), intero per render.';
COMMENT ON COLUMN public.plan_feature_defaults.credit_type IS
  'Wallet di credito alimentato. Deve combaciare con i tipi supportati da RPC consume_credits.';

-- ── INDICI ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_plan_feature_defaults_plan
  ON public.plan_feature_defaults(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_feature_defaults_feature
  ON public.plan_feature_defaults(feature_key);

-- ── TRIGGER updated_at ───────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_plan_feature_defaults_updated_at ON public.plan_feature_defaults;
CREATE TRIGGER trg_plan_feature_defaults_updated_at
  BEFORE UPDATE ON public.plan_feature_defaults
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────
-- Authenticated possono leggere (serve alla UI consumer per mostrare cosa include
-- il proprio piano); solo super_admin può scrivere.
ALTER TABLE public.plan_feature_defaults ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plan_feature_defaults_select_auth"        ON public.plan_feature_defaults;
DROP POLICY IF EXISTS "plan_feature_defaults_insert_super_admin" ON public.plan_feature_defaults;
DROP POLICY IF EXISTS "plan_feature_defaults_update_super_admin" ON public.plan_feature_defaults;
DROP POLICY IF EXISTS "plan_feature_defaults_delete_super_admin" ON public.plan_feature_defaults;

CREATE POLICY "plan_feature_defaults_select_auth"
  ON public.plan_feature_defaults FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "plan_feature_defaults_insert_super_admin"
  ON public.plan_feature_defaults FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "plan_feature_defaults_update_super_admin"
  ON public.plan_feature_defaults FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "plan_feature_defaults_delete_super_admin"
  ON public.plan_feature_defaults FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- ── SEED: migra lo stato attuale di plans_included[] in rows esplicite ────
-- Per ogni (plan, feature) dove plan.slug ∈ feature.plans_included, creiamo
-- una riga con is_enabled=true. Idempotente via ON CONFLICT.
INSERT INTO public.plan_feature_defaults (plan_id, feature_key, is_enabled)
  SELECT sp.id, pff.key, true
    FROM public.subscription_plans sp
    CROSS JOIN public.platform_feature_flags pff
   WHERE pff.plans_included IS NOT NULL
     AND sp.slug = ANY(pff.plans_included)
ON CONFLICT (plan_id, feature_key) DO NOTHING;

-- Per feature "core" (default_value=true), se non c'è riga specifica, seed con TRUE
-- per tutti i piani — garantisce coerenza con il comportamento attuale.
INSERT INTO public.plan_feature_defaults (plan_id, feature_key, is_enabled)
  SELECT sp.id, pff.key, true
    FROM public.subscription_plans sp
    CROSS JOIN public.platform_feature_flags pff
   WHERE pff.default_value = true
ON CONFLICT (plan_id, feature_key) DO NOTHING;

-- ── GRANT ───────────────────────────────────────────────────────────────
GRANT SELECT                         ON public.plan_feature_defaults TO authenticated;
GRANT INSERT, UPDATE, DELETE         ON public.plan_feature_defaults TO authenticated; -- Gate RLS
