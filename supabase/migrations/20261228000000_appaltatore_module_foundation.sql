-- ============================================================================
-- Modulo Appaltatori — Foundation (Phase 0+1+2)
-- ----------------------------------------------------------------------------
-- Aggiunge le fondamenta DB per il "Modulo Appaltatori":
-- una azienda installatrice tradizionale fa lavori di fornitura+posa per
-- privati o imprese committenti dirette. Alcune aziende invece operano
-- (anche) come SUBAPPALTATORI per altre imprese committenti — fanno solo
-- manodopera su lavori passati da appaltatori principali.
--
-- Questa migration introduce:
--
--   1. FEATURE FLAG `appaltatore_module` (default OFF)
--      Solo i superadmin possono attivarla per company via
--      company_feature_overrides. Le aziende che non hanno l'override
--      non vedono ALCUNA modifica UI.
--
--   2. profiles.customer_type ('privato' | 'appaltatore')
--      Distingue il cliente finale (default, comportamento attuale)
--      dall'impresa committente che passa lavori (manodopera).
--      I profili "appaltatore" usano solo i campi business
--      (business_name, fiscal_code, indirizzo sede legale, fatturazione).
--
--   3. orders.order_type ('cliente' | 'appaltatore_lavoro')
--      Distingue l'ordine cliente standard (fornitura+posa, default)
--      dal "Lavoro per appaltatore" (sola manodopera commissionata).
--
--   4. orders.work_address / work_description / materials_location /
--      work_start_date / work_end_date
--      Campi dedicati al "Lavoro per appaltatore". Sono NULLABLE perché
--      irrilevanti per ordini cliente standard.
--
-- Strategia di non-rottura:
--   - Tutti i CHECK constraint accettano i valori legacy come default.
--   - Nessuna colonna esistente viene rinominata o droppata.
--   - Le query frontend pre-feature continuano a funzionare:
--     order_type='cliente' è il default per tutti gli ordini esistenti;
--     customer_type='privato' è il default per tutti i profili esistenti.
-- ============================================================================

-- ─── 1. profiles.customer_type ───────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS customer_type text NOT NULL DEFAULT 'privato'
  CHECK (customer_type IN ('privato', 'appaltatore'));

COMMENT ON COLUMN public.profiles.customer_type IS
  'Tipologia cliente: "privato" = cliente finale (fornitura+posa, comportamento standard); '
  '"appaltatore" = impresa committente che passa lavori di sola manodopera. '
  'Il valore "appaltatore" è visibile/editabile solo se il modulo Appaltatori '
  '(platform_feature_flags.key = appaltatore_module) è attivo per la company.';

-- Indice per filtrare velocemente i clienti per tipo nelle liste
CREATE INDEX IF NOT EXISTS idx_profiles_customer_type
  ON public.profiles(company_id, customer_type)
  WHERE customer_type = 'appaltatore';

-- ─── 2. orders.order_type + work_* fields ────────────────────────────────────

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_type text NOT NULL DEFAULT 'cliente'
  CHECK (order_type IN ('cliente', 'appaltatore_lavoro'));

COMMENT ON COLUMN public.orders.order_type IS
  '"cliente" = ordine standard fornitura+posa (default, comportamento legacy). '
  '"appaltatore_lavoro" = lavoro di sola manodopera commissionato da un appaltatore. '
  'Il valore "appaltatore_lavoro" richiede customer_id che punti a un profilo '
  'con customer_type=''appaltatore''. Validazione applicativa (non DB).';

-- Campi dedicati al "Lavoro per appaltatore". NULLABLE perché irrilevanti
-- per ordini cliente standard.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS work_address text,
  ADD COLUMN IF NOT EXISTS work_description text,
  ADD COLUMN IF NOT EXISTS materials_location text,
  ADD COLUMN IF NOT EXISTS work_start_date date,
  ADD COLUMN IF NOT EXISTS work_end_date date;

COMMENT ON COLUMN public.orders.work_address IS
  'Indirizzo del cantiere/sito di lavoro per ordini di tipo appaltatore_lavoro.';
COMMENT ON COLUMN public.orders.work_description IS
  'Descrizione testuale del lavoro da svolgere (briefing operativo per i posatori).';
COMMENT ON COLUMN public.orders.materials_location IS
  'Posizione/depot da cui ritirare la merce (magazzino appaltatore, deposito, cantiere stesso, ecc.).';
COMMENT ON COLUMN public.orders.work_start_date IS
  'Data prevista di inizio lavori (cantiere). Si integra con il calendario lavori.';
COMMENT ON COLUMN public.orders.work_end_date IS
  'Data prevista di fine lavori (cantiere). Vincolo soft: work_end_date >= work_start_date.';

-- Indice per filtrare ordini per tipo (lista, dashboard, calendar)
CREATE INDEX IF NOT EXISTS idx_orders_order_type
  ON public.orders(company_id, order_type);

-- ─── 3. Feature flag platform-level ──────────────────────────────────────────
-- Registriamo il modulo nel registro globale dei feature flag così appare
-- automaticamente nel pannello /admin/FeatureFlags. I superadmin possono poi
-- attivarlo per company specifica via company_feature_overrides.

INSERT INTO public.platform_feature_flags (
  key,
  name,
  description,
  category,
  icon,
  is_beta,
  default_value,
  plans_included,
  sort_order
)
VALUES (
  'appaltatore_module',
  'Modulo Appaltatori',
  'Gestione clienti appaltatori (imprese committenti) e lavori di sola manodopera. '
    'Aggiunge il tipo cliente "Appaltatore" e il tipo ordine "Lavoro per appaltatore" '
    'con campi dedicati (indirizzo cantiere, descrizione lavoro, posizione materiali, '
    'date inizio/fine). Si integra con calendario lavori, operai e finanze. '
    'Sblocco esclusivo per company tramite override superadmin.',
  'orders',
  'HardHat',
  true,
  false,
  '{}'::text[],
  200
)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  icon = EXCLUDED.icon,
  is_beta = EXCLUDED.is_beta,
  sort_order = EXCLUDED.sort_order;

-- ─── 4. (Opzionale futura) Vista helper per dashboard ────────────────────────
-- Lasciamo come TODO Phase 7: una view orders_appaltatore che join orders +
-- profiles + order_employees aggregati per dashboard "Lavori in corso".
-- Non la creiamo ora per evitare dipendenze RLS da rivedere.
