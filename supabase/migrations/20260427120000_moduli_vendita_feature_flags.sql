-- ============================================================================
-- Moduli Vendita Verticali — seed feature flags + migrazione fv_modulo_attivo
-- ============================================================================
-- Refactor Hub Preventivi: introduce 6 moduli di vendita verticali gestiti via
-- platform_feature_flags con categoria dedicata 'modulo_vendita'. Il flag
-- legacy fv_modulo_attivo viene migrato a modulo_fotovoltaico_attivo
-- preservando tutti gli override company esistenti (zero regressioni in
-- produzione sul modulo Fotovoltaico).
--
-- Strategia:
--   - Nuova categoria 'modulo_vendita' (separata da 'addon' per UI dedicata)
--   - 1 modulo attivo (Fotovoltaico) + 5 coming soon (serramenti, tetti,
--     bagni, cappotto, pompe_calore)
--   - default_value = false: ogni modulo va attivato esplicitamente per
--     company tramite override (logica SaaS premium)
--   - Migrazione idempotente degli override esistenti via INSERT…SELECT
--     con ON CONFLICT DO NOTHING per evitare doppia attivazione
--   - Colonna companies.fv_modulo_attivo marcata come DEPRECATED via COMMENT
--     (rimozione fisica posticipata a un cleanup successivo per safety)
-- ============================================================================

-- 1) Catalogo platform_feature_flags
INSERT INTO public.platform_feature_flags
  (key, name, description, category, is_beta, default_value, plans_included, icon, sort_order, price_per_month)
VALUES
  -- Modulo attivo: replica il legacy fv_modulo_attivo con chiave coerente
  ('modulo_fotovoltaico_attivo',
   'Fotovoltaico',
   'Modulo verticale per la vendita di impianti fotovoltaici: configuratore, dimensionamento, business plan e onboarding cliente.',
   'modulo_vendita', false, false,
   '{pro,enterprise,scopri}'::text[],
   'Sun', 100, 149),

  -- Coming Soon
  ('modulo_serramenti_attivo',
   'Serramenti',
   'Configuratore vendita finestre, porte e oscuranti con listini, supercategorie e preventivo intelligente. (In arrivo)',
   'modulo_vendita', true, false,
   '{pro,enterprise}'::text[],
   'PanelTop', 101, 149),

  ('modulo_tetti_attivo',
   'Tetti',
   'Modulo per progettazione e vendita coperture (rifacimento tetto, isolamento, lattoneria). (In arrivo)',
   'modulo_vendita', true, false,
   '{pro,enterprise}'::text[],
   'Home', 102, 149),

  ('modulo_bagni_attivo',
   'Bagni',
   'Configuratore ristrutturazione bagno chiavi in mano: sanitari, rivestimenti, impianti. (In arrivo)',
   'modulo_vendita', true, false,
   '{pro,enterprise}'::text[],
   'Bath', 103, 149),

  ('modulo_cappotto_attivo',
   'Cappotto Termico',
   'Modulo per la vendita di cappotto termico esterno con calcolo trasmittanze e incentivi. (In arrivo)',
   'modulo_vendita', true, false,
   '{pro,enterprise}'::text[],
   'Layers', 104, 149),

  ('modulo_pompe_calore_attivo',
   'Pompe di Calore',
   'Modulo per dimensionamento e vendita pompe di calore residenziali e commerciali. (In arrivo)',
   'modulo_vendita', true, false,
   '{pro,enterprise}'::text[],
   'Thermometer', 105, 149)

ON CONFLICT (key) DO UPDATE SET
  name            = EXCLUDED.name,
  description     = EXCLUDED.description,
  category        = EXCLUDED.category,
  is_beta         = EXCLUDED.is_beta,
  plans_included  = EXCLUDED.plans_included,
  icon            = EXCLUDED.icon,
  sort_order      = EXCLUDED.sort_order,
  price_per_month = EXCLUDED.price_per_month;

-- 2) Migrazione override esistenti fv_modulo_attivo → modulo_fotovoltaico_attivo
--    Preserva is_enabled, limit_value, price_override, expires_at, notes
--    ON CONFLICT DO NOTHING: se un override sul nuovo flag esiste già, vince
--    quello (consente eventuali backfill manuali pre-migration).
INSERT INTO public.company_feature_overrides
  (company_id, feature_key, is_enabled, limit_value, price_override, expires_at, notes)
SELECT
  company_id,
  'modulo_fotovoltaico_attivo' AS feature_key,
  is_enabled,
  limit_value,
  price_override,
  expires_at,
  COALESCE(notes, '') || CASE WHEN COALESCE(notes, '') = '' THEN '' ELSE E'\n' END
    || '[migrated 2026-04-27 from fv_modulo_attivo]'
FROM public.company_feature_overrides
WHERE feature_key = 'fv_modulo_attivo'
ON CONFLICT (company_id, feature_key) DO NOTHING;

-- 3) Backfill: companies con fv_modulo_attivo=TRUE ma senza override esplicito
--    (caso tipico: flag abilitato pre-feature-flags via colonna boolean).
--
--    NOTA su ordine migrazioni: la colonna `companies.fv_modulo_attivo` è
--    creata da `20261027120000_fv_modulo_wave1.sql` (timestamp Oct 2026,
--    posteriore a questo). Su DB di produzione la colonna esiste già; su
--    deploy fresh (CI/E2E) potrebbe non esistere ancora — guard con
--    `to_regclass` + `information_schema.columns` per essere robusti.
DO $$
DECLARE
  v_has_col BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'companies'
      AND column_name  = 'fv_modulo_attivo'
  ) INTO v_has_col;

  IF v_has_col THEN
    EXECUTE $sql$
      INSERT INTO public.company_feature_overrides
        (company_id, feature_key, is_enabled, notes)
      SELECT
        c.id,
        'modulo_fotovoltaico_attivo',
        TRUE,
        '[backfill 2026-04-27 from companies.fv_modulo_attivo=true]'
      FROM public.companies c
      WHERE c.fv_modulo_attivo = TRUE
        AND NOT EXISTS (
          SELECT 1
          FROM public.company_feature_overrides o
          WHERE o.company_id = c.id
            AND o.feature_key = 'modulo_fotovoltaico_attivo'
        )
      ON CONFLICT (company_id, feature_key) DO NOTHING
    $sql$;

    -- Marca la colonna legacy come DEPRECATED solo se esiste
    EXECUTE 'COMMENT ON COLUMN public.companies.fv_modulo_attivo IS '
         || quote_literal('DEPRECATED 2026-04-27: usare resolve_company_feature(company_id, ''modulo_fotovoltaico_attivo''). Mantenuto per backward compatibility durante transizione. Cleanup pianificato dopo verifica produzione.');
  ELSE
    RAISE NOTICE 'Skipping fv_modulo_attivo backfill: column not yet created (sarà gestito dalla migration successiva idempotente)';
  END IF;
END $$;

COMMENT ON TABLE public.platform_feature_flags IS
  'Catalogo master delle feature. Categoria modulo_vendita aggiunta 2026-04-27 per moduli di vendita verticali (Fotovoltaico + 5 in arrivo) gestiti dall''Hub Preventivi.';
