-- ============================================================================
-- P0 · Seed delle feature_key mancanti nel catalogo platform_feature_flags
-- ============================================================================
-- Il masterprompt richiede URL guard su un set più ampio di feature. Prima di
-- applicare i guard (FeatureRoute) dobbiamo seedare le corrispondenti entry
-- del catalogo: altrimenti la RPC resolve_company_feature fa fail-closed su
-- flag sconosciute e redirecta TUTTI gli utenti a /azienda/upgrade per pagine
-- che oggi funzionano senza gating.
--
-- Strategia fail-safe:
--   - Feature CORE (cantieri_avanzati, fatturazione, documenti, tesoreria):
--     default_value=TRUE + plans_included su TUTTI i piani attivi → chiunque
--     abbia un piano assegnato la vede, chi non ha piano vede via default
--   - Feature ADDON (hr_personale, portale_cliente, white_label, gps_fleet):
--     default_value=FALSE + plans_included solo 'pro' e 'enterprise' →
--     allineato con il listino SaaS
--
-- Per banca_psd2 e ai_voice (richiesti dal masterprompt) NON duplico: uso le
-- chiavi già seedate banca_extra e agente_vocale (migration 20260415000001).
--
-- Idempotente: ON CONFLICT (key) DO UPDATE.
-- ============================================================================

INSERT INTO public.platform_feature_flags
  (key, name, description, category, is_beta, default_value, plans_included, icon, sort_order, price_per_month)
VALUES
  -- ── CORE (abilitate di default su tutti i piani) ──────────────────────
  ('cantieri_avanzati',
   'Cantieri Avanzati',
   'Sicurezza, giornale lavori, subappaltatori, interventi, manutenzione',
   'core', false, true,
   '{starter,pro,enterprise,scopri}'::text[],
   'HardHat', 20, NULL),

  ('fatturazione',
   'Fatturazione',
   'Modulo fatturazione (esterno o nativo) + scadenzario',
   'core', false, true,
   '{starter,pro,enterprise,scopri}'::text[],
   'Receipt', 21, NULL),

  ('documenti',
   'Documenti Fiscali',
   'Documenti fiscali, cassetto SDI, registri IVA, anagrafiche',
   'core', false, true,
   '{starter,pro,enterprise,scopri}'::text[],
   'FileText', 22, NULL),

  ('tesoreria',
   'Tesoreria',
   'Prima nota, cash flow, saldi bancari',
   'core', false, true,
   '{starter,pro,enterprise,scopri}'::text[],
   'Wallet', 23, NULL),

  -- ── ADDON (disabilitate di default, abilitate per piani pro/enterprise) ─
  ('hr_personale',
   'HR & Personale',
   'Gestione personale, timbrature, ferie, cedolini',
   'addon', false, false,
   '{pro,enterprise}'::text[],
   'Users', 24, 49),

  ('portale_cliente',
   'Portale Cliente',
   'Area riservata per clienti finali con tracking ordini',
   'addon', false, false,
   '{pro,enterprise}'::text[],
   'UserCheck', 25, 29),

  ('white_label',
   'White Label',
   'Branding personalizzato (logo, colori, dominio)',
   'addon', false, false,
   '{enterprise}'::text[],
   'Palette', 26, 99),

  ('gps_fleet',
   'GPS Fleet Tracking',
   'Tracking GPS flotta veicoli aziendali',
   'addon', false, false,
   '{pro,enterprise}'::text[],
   'MapPin', 27, 39)

ON CONFLICT (key) DO UPDATE SET
  name            = EXCLUDED.name,
  description     = EXCLUDED.description,
  category        = EXCLUDED.category,
  default_value   = EXCLUDED.default_value,
  plans_included  = EXCLUDED.plans_included,
  icon            = EXCLUDED.icon,
  sort_order      = EXCLUDED.sort_order,
  price_per_month = EXCLUDED.price_per_month;

COMMENT ON TABLE public.platform_feature_flags IS
  'Catalogo master delle feature. Ampliato 2026-04-17 con cantieri_avanzati, fatturazione, documenti, tesoreria (core), hr_personale, portale_cliente, white_label, gps_fleet (addon) per permettere URL guard completo.';
