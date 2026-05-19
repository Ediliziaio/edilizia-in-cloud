-- ============================================================================
-- v8.6.86 — Onboarding Quick Start (TTV < 5min)
--
-- Activation framework completo:
--   1. Aggiunge action_url + action_label su onboarding_steps (CTA "Vai →")
--   2. Crea template "Quick Start Edilizia" + 6 step concreti con auto_check_key
--   3. Trigger AUTO-ASSIGN del template a ogni nuova company in INSERT
--   4. Backfill: assegna a tutte le aziende esistenti senza onboarding
-- ============================================================================

-- ─── 1. Aggiungi colonne action_* ───────────────────────────────────────────
ALTER TABLE public.onboarding_steps
  ADD COLUMN IF NOT EXISTS action_url   text,
  ADD COLUMN IF NOT EXISTS action_label text;

COMMENT ON COLUMN public.onboarding_steps.action_url IS
  'URL relativo (es. /azienda/clienti/nuovo) cliccato dalla CTA dello step';
COMMENT ON COLUMN public.onboarding_steps.action_label IS
  'Label CTA (es. "Aggiungi cliente"). Se NULL → "Vai" generico.';

-- ─── 2. Template Quick Start Edilizia ───────────────────────────────────────
DO $$
DECLARE
  v_template_id uuid;
  v_super_admin_id uuid;
BEGIN
  -- Trova un super_admin per il created_by (NOT NULL).
  -- user_roles non ha created_at quindi prendiamo solo il primo trovato.
  SELECT user_id INTO v_super_admin_id
  FROM public.user_roles
  WHERE role = 'super_admin'::app_role
  LIMIT 1;

  -- Inserisci template se non esiste
  INSERT INTO public.onboarding_templates (name, description, is_default, created_by)
  VALUES (
    'Quick Start Edilizia',
    'Setup guidato in 6 passi per essere operativi in meno di 5 minuti',
    true,
    v_super_admin_id
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_template_id;

  IF v_template_id IS NULL THEN
    SELECT id INTO v_template_id
    FROM public.onboarding_templates
    WHERE name = 'Quick Start Edilizia'
    LIMIT 1;
  END IF;

  -- Step 1 — Profilo azienda
  INSERT INTO public.onboarding_steps
    (template_id, title, description, sort_order, is_required, auto_check_key, action_url, action_label)
  VALUES
    (v_template_id, 'Completa il profilo aziendale',
     'Inserisci Ragione Sociale, P.IVA e logo. Servono per fatture e branding.',
     1, true, 'has_company_profile',
     '/azienda/impostazioni/profilo', 'Completa profilo'),
    (v_template_id, 'Aggiungi il tuo primo cliente',
     'Importa contatti dal telefono o aggiungi un cliente. Da qui parte tutto.',
     2, true, 'has_first_customer',
     '/azienda/clienti', 'Aggiungi cliente'),
    (v_template_id, 'Crea la prima commessa',
     'Apri un cantiere con cliente, descrizione lavoro e importo. Il cuore di EiC.',
     3, true, 'has_first_order',
     '/azienda/ordini/nuovo', 'Nuova commessa'),
    (v_template_id, 'Invita il tuo team',
     'Aggiungi capocantiere, amministrazione o commerciale. Tutti lavorano insieme.',
     4, false, 'has_team_member',
     '/azienda/impostazioni/persone', 'Invita persone'),
    (v_template_id, 'Crea il primo preventivo',
     'Genera un preventivo per un cliente con righe, sconti e firma elettronica.',
     5, false, 'has_first_quote',
     '/azienda/marketing/preventivi/nuovo', 'Nuovo preventivo'),
    (v_template_id, 'Configura la fatturazione',
     'Scegli fatturazione nativa SDI o esterna. Imposta numerazione e provider.',
     6, false, 'has_billing_config',
     '/azienda/impostazioni/fatturazione', 'Configura')
  ON CONFLICT DO NOTHING;
END $$;

-- ─── 3. Trigger auto-assign template alle NUOVE company ────────────────────
CREATE OR REPLACE FUNCTION public.assign_default_onboarding_template()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_template_id uuid;
BEGIN
  -- Trova il template default
  SELECT id INTO v_template_id
  FROM public.onboarding_templates
  WHERE is_default = true
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_template_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Inserisci assignment se non già presente
  INSERT INTO public.company_onboarding (company_id, template_id, status, started_at)
  VALUES (NEW.id, v_template_id, 'in_progress', now())
  ON CONFLICT (company_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_onboarding ON public.companies;
CREATE TRIGGER trg_assign_onboarding
  AFTER INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.assign_default_onboarding_template();

-- ─── 4. Backfill: assegna template a tutte aziende esistenti ───────────────
DO $$
DECLARE
  v_template_id uuid;
BEGIN
  SELECT id INTO v_template_id
  FROM public.onboarding_templates
  WHERE is_default = true
  LIMIT 1;

  IF v_template_id IS NULL THEN
    RAISE NOTICE 'No default onboarding template — skipping backfill';
    RETURN;
  END IF;

  INSERT INTO public.company_onboarding (company_id, template_id, status, started_at)
  SELECT c.id, v_template_id, 'in_progress', c.created_at
  FROM public.companies c
  WHERE NOT EXISTS (
    SELECT 1 FROM public.company_onboarding co WHERE co.company_id = c.id
  );
END $$;
