-- ============================================================================
-- Modulo Fotovoltaico EiC — Wave 1
-- ----------------------------------------------------------------------------
-- Schema completo derivato dal masterprompt v2 (235 pagine).
-- 19 tabelle principali con prefisso fv_*, RLS role-based (titolare/operatore/
-- venditore), views denormalizzate, trigger audit log e numero progressivo.
--
-- Convenzioni:
--   - Prefisso tabelle: fv_
--   - Prefisso edge functions: fv-
--   - Naming snake_case italiano (potenza_kwp, prezzo_vendita_iva_inclusa)
--   - Numerici monetari: numeric(12,2)
--   - Percentuali: numeric(5,4) (es. 0.5000 per 50%)
--   - Date: timestamptz
--   - Soft delete via campo annullato boolean + annullato_il timestamptz
-- ============================================================================

-- ─── 1. Estensioni a tabelle EiC esistenti (da §8.20) ───────────────────────
-- Listino prodotti EiC: articoli_native (catalogo generico)
ALTER TABLE public.articoli_native ADD COLUMN IF NOT EXISTS categoria_fv text
  CHECK (categoria_fv IS NULL OR categoria_fv IN
    ('pannello','inverter','accumulo','wallbox','ottimizzatore','struttura','altro'));
ALTER TABLE public.articoli_native ADD COLUMN IF NOT EXISTS potenza_w numeric(7,1);
ALTER TABLE public.articoli_native ADD COLUMN IF NOT EXISTS potenza_kw numeric(6,2);
ALTER TABLE public.articoli_native ADD COLUMN IF NOT EXISTS capacita_kwh numeric(6,2);
ALTER TABLE public.articoli_native ADD COLUMN IF NOT EXISTS garanzia_anni integer;
ALTER TABLE public.articoli_native ADD COLUMN IF NOT EXISTS efficienza_pct numeric(5,4);
ALTER TABLE public.articoli_native ADD COLUMN IF NOT EXISTS scheda_tecnica_url text;
ALTER TABLE public.articoli_native ADD COLUMN IF NOT EXISTS fornitore_fv text;
ALTER TABLE public.articoli_native ADD COLUMN IF NOT EXISTS marca_fv text;
ALTER TABLE public.articoli_native ADD COLUMN IF NOT EXISTS modello_fv text;
ALTER TABLE public.articoli_native ADD COLUMN IF NOT EXISTS certificazioni_fv text[];
ALTER TABLE public.articoli_native ADD COLUMN IF NOT EXISTS is_premium boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_articoli_categoria_fv
  ON public.articoli_native (categoria_fv) WHERE categoria_fv IS NOT NULL;

-- CRM Opportunità EiC: marketing_opportunities
ALTER TABLE public.marketing_opportunities ADD COLUMN IF NOT EXISTS fv_progetto_id uuid;
ALTER TABLE public.marketing_opportunities ADD COLUMN IF NOT EXISTS tipo_opportunita text;

-- Commesse: orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS fv_progetto_id uuid;

-- Estensione tabella companies per setup modulo FV
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS fv_modulo_attivo boolean DEFAULT false;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS fv_data_attivazione timestamptz;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS fv_setup_completato boolean DEFAULT false;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS fv_setup_step integer DEFAULT 0;

-- ─── 2. Tabella fv_progetti (PRINCIPALE, §8.2) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.fv_progetti (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  cliente_id uuid REFERENCES public.marketing_contacts(id),
  numero text NOT NULL,                          -- es. 'FV-2026-0042'
  titolo text NOT NULL,                          -- es. 'Impianto FV Mario Rossi'
  stato text NOT NULL DEFAULT 'bozza',           -- bozza|configurato|emesso|firmato|annullato
  archetipo text NOT NULL,                       -- privato_prima|privato_seconda|privato_isee|pmi|condominio|cer|industriale_grande
  -- dati immobile
  indirizzo text NOT NULL,
  comune text,
  provincia text,
  cap text,
  regione text,
  popolazione_comune integer,
  latitudine double precision,
  longitudine double precision,
  tipologia_immobile text,                       -- residenziale|capannone|ufficio|agricolo|altro
  superficie_immobile_mq numeric(8,2),
  prima_casa boolean,
  anno_costruzione integer,
  ha_impianto_esistente boolean DEFAULT false,
  -- consumi
  consumo_annuo_kwh numeric(10,2),
  bolletta_caricata_url text,
  profilo_consumo text,                          -- giorno|sera|misto|sempre|pmi_diurno|pmi_h24
  costo_kwh_attuale numeric(6,4) DEFAULT 0.32,
  tariffa_tipo text DEFAULT 'monoraria',         -- monoraria|bioraria|trioraria
  isee numeric(8,2),
  numero_figli integer DEFAULT 0,
  reddito_annuo_dichiarato numeric(12,2),
  -- analisi tetto (denormalizzato)
  fonte_dati_tetto text,                         -- solar_api|pvgis|manuale
  qualita_dati_tetto text,                       -- high|medium|low|manual
  imagery_date date,
  ore_sole_annue numeric(6,2),
  superficie_tetto_disponibile_mq numeric(8,2),
  numero_pannelli_max integer,
  potenza_max_kwp numeric(6,2),
  -- configurazione scelta
  numero_pannelli_scelti integer,
  potenza_kwp numeric(6,2),
  con_accumulo boolean DEFAULT false,
  capacita_accumulo_kwh numeric(6,2),
  con_wallbox boolean DEFAULT false,
  con_ottimizzatori boolean DEFAULT false,
  -- finanziario denormalizzato
  produzione_annua_kwh numeric(10,2),
  autoconsumo_pct numeric(5,4),
  costo_totale_netto numeric(12,2),
  prezzo_vendita_iva_inclusa numeric(12,2),
  iva_aliquota numeric(5,4) DEFAULT 0.10,
  margine_eur numeric(12,2),
  margine_pct numeric(5,4),
  incentivi_applicati jsonb,
  capienza_irpef_ok boolean,
  capienza_irpef_warning text,
  scenario_finanziamento text DEFAULT 'cash',    -- cash|prestito|leasing|cessione
  risparmio_anno1 numeric(10,2),
  payback_anni numeric(4,1),
  npv_25_anni numeric(12,2),
  irr_pct numeric(5,4),
  co2_evitata_25_anni_kg numeric(10,0),
  -- output
  pdf_vendita_url text,
  pdf_tecnico_url text,
  pdf_mobile_url text,
  opportunita_crm_id uuid REFERENCES public.marketing_opportunities(id),
  ordine_id uuid REFERENCES public.orders(id),
  -- metadata
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  emesso_il timestamptz,
  firmato_il timestamptz,
  annullato boolean NOT NULL DEFAULT false,
  annullato_il timestamptz,
  annullato_motivo text,
  created_by uuid REFERENCES auth.users(id),
  ultima_modifica_by uuid REFERENCES auth.users(id),
  versione integer DEFAULT 1,
  versione_padre_id uuid REFERENCES public.fv_progetti(id),
  -- constraint
  CONSTRAINT fv_progetti_numero_company_unique UNIQUE (company_id, numero),
  CONSTRAINT fv_progetti_archetipo_check CHECK
    (archetipo IN ('privato_prima','privato_seconda','privato_isee','pmi','condominio','cer','industriale_grande')),
  CONSTRAINT fv_progetti_stato_check CHECK
    (stato IN ('bozza','configurato','emesso','firmato','annullato')),
  CONSTRAINT fv_progetti_kwp_positivo CHECK (potenza_kwp IS NULL OR potenza_kwp > 0),
  CONSTRAINT fv_progetti_autoconsumo_range CHECK
    (autoconsumo_pct IS NULL OR (autoconsumo_pct >= 0 AND autoconsumo_pct <= 1)),
  CONSTRAINT fv_progetti_lat_italia CHECK
    (latitudine IS NULL OR (latitudine >= 35 AND latitudine <= 48)),
  CONSTRAINT fv_progetti_lng_italia CHECK
    (longitudine IS NULL OR (longitudine >= 6 AND longitudine <= 19))
);

CREATE INDEX IF NOT EXISTS idx_fv_progetti_company ON public.fv_progetti(company_id) WHERE annullato = false;
CREATE INDEX IF NOT EXISTS idx_fv_progetti_cliente ON public.fv_progetti(cliente_id) WHERE annullato = false;
CREATE INDEX IF NOT EXISTS idx_fv_progetti_stato ON public.fv_progetti(company_id, stato) WHERE annullato = false;
CREATE INDEX IF NOT EXISTS idx_fv_progetti_data ON public.fv_progetti(company_id, created_at desc);

-- Trigger updated_at riusa funzione esistente (eic_set_updated_at se presente, altrimenti la creiamo)
CREATE OR REPLACE FUNCTION public.fv_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_fv_progetti_updated_at ON public.fv_progetti;
CREATE TRIGGER trg_fv_progetti_updated_at
  BEFORE UPDATE ON public.fv_progetti
  FOR EACH ROW EXECUTE FUNCTION public.fv_set_updated_at();

-- ─── 3. Tabella fv_pannelli_layout (§8.3) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fv_pannelli_layout (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  progetto_id uuid NOT NULL REFERENCES public.fv_progetti(id) ON DELETE CASCADE,
  segment_index integer,
  centro_lat double precision NOT NULL,
  centro_lng double precision NOT NULL,
  azimuth_deg numeric(5,1),
  tilt_deg numeric(4,1),
  orientamento text DEFAULT 'LANDSCAPE',
  larghezza_m numeric(4,3) DEFAULT 1.046,
  altezza_m numeric(4,3) DEFAULT 1.879,
  produzione_annua_kwh numeric(8,2),
  attivo boolean DEFAULT true,
  origine text,                                   -- solar_api|manuale|pvgis_stimato
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fv_pannelli_progetto
  ON public.fv_pannelli_layout(progetto_id) WHERE attivo = true;

-- ─── 4. Tabella fv_componenti_progetto (§8.4) ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.fv_componenti_progetto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  progetto_id uuid NOT NULL REFERENCES public.fv_progetti(id) ON DELETE CASCADE,
  articolo_id uuid REFERENCES public.articoli_native(id),
  categoria text NOT NULL,
  descrizione text NOT NULL,
  marca text,
  modello text,
  quantita numeric(8,2) NOT NULL,
  unita_misura text DEFAULT 'pz',
  prezzo_unitario_netto numeric(10,2) NOT NULL,
  prezzo_unitario_vendita numeric(10,2) NOT NULL,
  margine_pct numeric(5,4),
  potenza_unitaria_w numeric(7,1),
  potenza_unitaria_kw numeric(6,2),
  capacita_kwh numeric(6,2),
  garanzia_anni integer,
  ordinamento integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT fv_componenti_categoria_check CHECK
    (categoria IN ('pannello','inverter','accumulo','wallbox','ottimizzatore','struttura','cavi','altro'))
);

CREATE INDEX IF NOT EXISTS idx_fv_componenti_progetto
  ON public.fv_componenti_progetto(progetto_id);

-- ─── 5. Tabella fv_manodopera_progetto (§8.5) ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.fv_manodopera_progetto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  progetto_id uuid NOT NULL REFERENCES public.fv_progetti(id) ON DELETE CASCADE,
  tariffa_id uuid REFERENCES public.tariffe_aziendali(id),
  descrizione text NOT NULL,
  ore numeric(6,2) NOT NULL,
  tariffa_oraria_netta numeric(8,2) NOT NULL,
  tariffa_oraria_vendita numeric(8,2) NOT NULL,
  margine_pct numeric(5,4),
  ordinamento integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fv_manodopera_progetto
  ON public.fv_manodopera_progetto(progetto_id);

-- ─── 6. Tabella fv_servizi_progetto (§8.6) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fv_servizi_progetto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  progetto_id uuid NOT NULL REFERENCES public.fv_progetti(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  descrizione text NOT NULL,
  quantita numeric(8,2) DEFAULT 1,
  prezzo_netto numeric(10,2) NOT NULL,
  prezzo_vendita numeric(10,2) NOT NULL,
  ordinamento integer DEFAULT 0,
  note_operative text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fv_servizi_progetto
  ON public.fv_servizi_progetto(progetto_id);

-- ─── 7. Tabella fv_incentivi_catalogo (§8.7) — globale, gestita SuperAdmin ──
CREATE TABLE IF NOT EXISTS public.fv_incentivi_catalogo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codice text NOT NULL UNIQUE,
  nome text NOT NULL,
  descrizione_breve text,                         -- max 140 char
  descrizione_lunga text,
  tipo text NOT NULL,                             -- detrazione_irpef|fondo_perduto|tariffa_incentivante|sconto_iva|deducibilita_fiscale|informativa
  aliquota numeric(5,4),
  plafond_max_eur numeric(10,2),
  durata_anni integer,
  condizioni jsonb,
  cumulabile_con text[],
  non_cumulabile_con text[],
  attivo boolean DEFAULT true,
  data_inizio_validita date,
  data_fine_validita date,
  ordinamento integer DEFAULT 0,
  fonte_normativa text,
  link_normativa text,
  ultima_modifica timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fv_incentivi_attivo
  ON public.fv_incentivi_catalogo(attivo) WHERE attivo = true;

-- ─── 8. Tabella fv_calcolo_finanziario (§8.8) ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.fv_calcolo_finanziario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  progetto_id uuid NOT NULL REFERENCES public.fv_progetti(id) ON DELETE CASCADE,
  versione integer NOT NULL DEFAULT 1,
  attivo boolean DEFAULT true,
  -- input
  produzione_annua_kwh numeric(10,2),
  autoconsumo_pct numeric(5,4),
  costo_kwh_attuale numeric(6,4),
  inflazione_energia_pct numeric(5,4) DEFAULT 0.025,
  degradazione_pannelli_annua_pct numeric(5,4) DEFAULT 0.005,
  performance_ratio numeric(4,3) DEFAULT 0.85,
  prezzo_rid_eur_kwh numeric(6,4) DEFAULT 0.10,
  scenario_finanziamento text DEFAULT 'cash',
  prestito_durata_anni integer,
  prestito_taeg numeric(5,4),
  reddito_annuo numeric(12,2),
  aliquota_irpef numeric(5,4),
  -- output anno 1
  energia_autoconsumata_kwh numeric(8,2),
  energia_immessa_rete_kwh numeric(8,2),
  risparmio_bolletta_eur numeric(10,2),
  ricavi_rid_eur numeric(10,2),
  detrazione_anno_eur numeric(10,2),
  -- output 25 anni
  cassa_anno_per_anno jsonb,
  cassa_mese_anno1 jsonb,
  payback_anni numeric(4,1),
  npv_25_anni numeric(12,2),
  irr_pct numeric(5,4),
  risparmio_totale_25_anni numeric(12,2),
  capienza_irpef_ok boolean,
  capienza_irpef_recuperabile_pct numeric(5,4),
  -- sensitivity
  sensitivity_minus15 jsonb,
  sensitivity_plus15 jsonb,
  -- what-if
  scenario_auto_elettrica jsonb,
  scenario_pompa_calore jsonb,
  -- confronti
  confronto_btp_25anni jsonb,
  confronto_deposito_25anni jsonb,
  -- incentivi
  incentivi jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fv_calcolo_progetto
  ON public.fv_calcolo_finanziario(progetto_id, attivo);

-- ─── 9. Tabella fv_solar_api_cache (§8.9) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fv_solar_api_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key text NOT NULL UNIQUE,
  endpoint text NOT NULL,
  response jsonb NOT NULL,
  quality_level text,
  imagery_date date,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '180 days')
);

CREATE INDEX IF NOT EXISTS idx_fv_solar_cache_key ON public.fv_solar_api_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_fv_solar_cache_expires ON public.fv_solar_api_cache(expires_at);

-- ─── 10. Tabella fv_pvgis_cache (§8.10) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fv_pvgis_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key text NOT NULL UNIQUE,
  response jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '365 days')
);

CREATE INDEX IF NOT EXISTS idx_fv_pvgis_cache_key ON public.fv_pvgis_cache(cache_key);

-- ─── 11. Tabella fv_solar_api_usage (§8.11, quota tracking) ─────────────────
CREATE TABLE IF NOT EXISTS public.fv_solar_api_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id),
  endpoint text NOT NULL,
  call_count integer DEFAULT 1,
  source text,                                    -- cache|api|error
  cost_estimate_eur numeric(8,4),
  mese_anno text NOT NULL,                        -- 'YYYY-MM'
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fv_solar_usage_mese ON public.fv_solar_api_usage(mese_anno, endpoint);
CREATE INDEX IF NOT EXISTS idx_fv_solar_usage_company ON public.fv_solar_api_usage(company_id, mese_anno);

-- ─── 12. Tabella fv_function_logs (§8.12) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fv_function_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name text NOT NULL,
  company_id uuid,
  user_id uuid,
  progetto_id uuid,
  request_payload jsonb,
  response_status integer,
  response_summary jsonb,
  error_message text,
  duration_ms integer,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fv_logs_function ON public.fv_function_logs(function_name, created_at desc);
CREATE INDEX IF NOT EXISTS idx_fv_logs_company ON public.fv_function_logs(company_id, created_at desc);
CREATE INDEX IF NOT EXISTS idx_fv_logs_errors ON public.fv_function_logs(response_status) WHERE response_status >= 400;

-- ─── 13. Tabella fv_pdf_generation_log (§8.13) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.fv_pdf_generation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  progetto_id uuid NOT NULL REFERENCES public.fv_progetti(id) ON DELETE CASCADE,
  tipo text NOT NULL,                             -- vendita|tecnico|mobile
  versione_template integer DEFAULT 1,
  storage_url text,
  size_bytes integer,
  pages_count integer,
  duration_ms integer,
  status text,                                    -- success|failed|timeout
  error_message text,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- ─── 14. Tabella fv_progetti_audit (§8.14) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fv_progetti_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  progetto_id uuid NOT NULL REFERENCES public.fv_progetti(id) ON DELETE CASCADE,
  azione text NOT NULL,                           -- created|updated|emesso|firmato|annullato|riaperto
  campo_modificato text,
  valore_precedente jsonb,
  valore_nuovo jsonb,
  user_id uuid REFERENCES auth.users(id),
  user_role text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fv_audit_progetto ON public.fv_progetti_audit(progetto_id, created_at desc);

-- ─── 15. Tabella fv_parametri_calcolo (§8.15) — gestita SuperAdmin ──────────
CREATE TABLE IF NOT EXISTS public.fv_parametri_calcolo (
  chiave text PRIMARY KEY,
  valore numeric(12,6) NOT NULL,
  unita text,
  descrizione text,
  categoria text,                                 -- fisica|finanziaria|fiscale|altro
  ultima_modifica timestamptz DEFAULT now(),
  modificato_da uuid REFERENCES auth.users(id)
);

-- Seed parametri (§8.15 + §14)
INSERT INTO public.fv_parametri_calcolo (chiave, valore, unita, descrizione, categoria) VALUES
  ('degradazione_annua_pannelli', 0.005, '%/anno', 'Decadimento annuo produzione pannelli standard', 'fisica'),
  ('degradazione_annua_pannelli_premium', 0.003, '%/anno', 'Decadimento annuo pannelli premium', 'fisica'),
  ('inflazione_energia_annua', 0.025, '%/anno', 'Inflazione media annua del costo energia', 'finanziaria'),
  ('performance_ratio_default', 0.85, '-', 'Performance Ratio sistema FV standard', 'fisica'),
  ('performance_ratio_premium', 0.88, '-', 'Performance Ratio sistema FV con ottimizzatori', 'fisica'),
  ('perdita_temperatura_pct', 0.04, '%', 'Perdita per temperatura tipica', 'fisica'),
  ('perdita_mismatch_pct', 0.02, '%', 'Perdita per mismatch elettrico', 'fisica'),
  ('perdita_sporcamento_pct', 0.03, '%', 'Perdita per sporcamento pannelli', 'fisica'),
  ('perdita_inverter_pct', 0.02, '%', 'Perdita conversione inverter', 'fisica'),
  ('prezzo_rid_eur_kwh', 0.10, '€/kWh', 'Prezzo medio RID per simulazione', 'finanziaria'),
  ('costo_kwh_default_residenziale', 0.32, '€/kWh', 'Costo €/kWh default cliente residenziale', 'finanziaria'),
  ('costo_kwh_default_pmi', 0.28, '€/kWh', 'Costo €/kWh default cliente PMI', 'finanziaria'),
  ('orizzonte_simulazione_anni', 25, 'anni', 'Anni orizzonte calcolo NPV', 'finanziaria'),
  ('tasso_sconto_npv', 0.04, '%/anno', 'Tasso di sconto per NPV', 'finanziaria'),
  ('tasso_btp_25anni', 0.038, '%/anno', 'Rendimento BTP 25Y per confronto', 'finanziaria'),
  ('tasso_deposito_vincolato', 0.025, '%/anno', 'Tasso medio conto deposito 5Y', 'finanziaria'),
  ('co2_factor_kg_per_kwh', 0.319, 'kg/kWh', 'Fattore emissione mix elettrico Italia', 'altro'),
  ('soglia_capienza_irpef_warning', 0.80, '%', 'Sotto questa soglia mostra warning capienza', 'fiscale'),
  ('costo_manutenzione_eur_per_kwp_anno', 8.0, '€/kWp/anno', 'Costo manutenzione media', 'finanziaria'),
  ('costo_sostituzione_inverter_eur', 1500, '€', 'Costo sostituzione inverter anno 12', 'finanziaria')
ON CONFLICT (chiave) DO NOTHING;

-- ─── 16. Tabella fv_profili_autoconsumo (§8.16) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.fv_profili_autoconsumo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codice text NOT NULL UNIQUE,
  nome_visualizzato text NOT NULL,
  emoji text,
  descrizione text,
  autoconsumo_no_accumulo numeric(5,4),
  autoconsumo_accumulo_5kwh numeric(5,4),
  autoconsumo_accumulo_10kwh numeric(5,4),
  autoconsumo_accumulo_15kwh numeric(5,4),
  ordinamento integer DEFAULT 0,
  attivo boolean DEFAULT true
);

INSERT INTO public.fv_profili_autoconsumo
  (codice, nome_visualizzato, emoji, descrizione, autoconsumo_no_accumulo,
   autoconsumo_accumulo_5kwh, autoconsumo_accumulo_10kwh, autoconsumo_accumulo_15kwh, ordinamento) VALUES
  ('sera', 'Solo serale', '🌙', 'Casa vuota di giorno, consumi serali', 0.25, 0.55, 0.75, 0.85, 1),
  ('misto', 'Misto', '⏰', 'Casa parzialmente occupata di giorno', 0.35, 0.65, 0.85, 0.92, 2),
  ('giorno', 'Smart working', '💻', 'Casa di giorno, lavoro da remoto', 0.50, 0.75, 0.92, 0.95, 3),
  ('sempre', 'Sempre a casa', '🏠', 'Anziani, casalinghi, sempre presenti', 0.55, 0.80, 0.94, 0.96, 4),
  ('pmi_diurno', 'PMI consumo diurno', '🏢', 'Capannone, ufficio, attività diurna', 0.60, 0.82, 0.95, 0.96, 5),
  ('pmi_h24', 'PMI H24', '🌐', 'Attività continuativa giorno e notte', 0.40, 0.70, 0.88, 0.92, 6)
ON CONFLICT (codice) DO NOTHING;

-- ─── 17. Tabella fv_servizi_catalogo (§8.17) — per azienda ──────────────────
CREATE TABLE IF NOT EXISTS public.fv_servizi_catalogo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  codice text NOT NULL,
  descrizione text NOT NULL,
  prezzo_netto_default numeric(10,2) NOT NULL,
  margine_pct_default numeric(5,4) DEFAULT 0.20,
  attivo boolean DEFAULT true,
  ordinamento integer DEFAULT 0,
  note_operative text,
  CONSTRAINT fv_servizi_catalogo_unique UNIQUE (company_id, codice)
);

-- ─── 18. Tabella fv_template_pdf (§8.18) — personalizzazione per azienda ────
CREATE TABLE IF NOT EXISTS public.fv_template_pdf (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  logo_url text,
  colore_primario text DEFAULT '#1E3A5F',
  colore_accento text DEFAULT '#F97316',
  font_titoli text DEFAULT 'Outfit',
  font_corpo text DEFAULT 'Inter',
  presentazione_impresa_html text,
  foto_team_url text,
  recensioni jsonb,                               -- array di {nome, citta, testo, stelle}
  cantieri_galleria jsonb,                        -- array di {url_foto, descrizione}
  testimonial_video_url text,
  certificazioni jsonb,                           -- array di {nome, url_logo}
  contatto_telefono text,
  contatto_whatsapp text,
  contatto_email text,
  url_sito text,
  scadenza_validita_preventivo_giorni integer DEFAULT 30,
  recesso_giorni integer DEFAULT 14,
  acconto_pct integer DEFAULT 30,
  updated_at timestamptz DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_fv_template_pdf_updated_at ON public.fv_template_pdf;
CREATE TRIGGER trg_fv_template_pdf_updated_at
  BEFORE UPDATE ON public.fv_template_pdf
  FOR EACH ROW EXECUTE FUNCTION public.fv_set_updated_at();

-- ─── 19. Tabella fv_eventi (§8.19) — analytics di prodotto ──────────────────
CREATE TABLE IF NOT EXISTS public.fv_eventi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id),
  user_id uuid REFERENCES auth.users(id),
  progetto_id uuid REFERENCES public.fv_progetti(id),
  evento text NOT NULL,                           -- wizard_step_completed, pdf_generated, preventivo_emesso
  step integer,
  payload jsonb,
  user_agent text,
  ip text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fv_eventi_company ON public.fv_eventi(company_id, created_at desc);
CREATE INDEX IF NOT EXISTS idx_fv_eventi_evento ON public.fv_eventi(evento, created_at desc);

-- ============================================================================
-- ─── 20. Foreign keys per auto-link CRM/orders ──────────────────────────────
-- ============================================================================
-- I FK su opportunita.fv_progetto_id e orders.fv_progetto_id sono soft (no FK
-- a livello DB per evitare cascade; il join è gestito a livello applicativo).

-- ============================================================================
-- ─── 21. Row Level Security — pattern role-based (§8.21) ────────────────────
-- ============================================================================
-- Tutte le tabelle fv_progetti, fv_pannelli_layout, fv_componenti_progetto,
-- fv_manodopera_progetto, fv_servizi_progetto, fv_calcolo_finanziario,
-- fv_progetti_audit, fv_pdf_generation_log: filtro per company_id via
-- get_effective_company_id() (helper esistente in EiC).
-- ============================================================================

ALTER TABLE public.fv_progetti ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fv_pannelli_layout ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fv_componenti_progetto ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fv_manodopera_progetto ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fv_servizi_progetto ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fv_calcolo_finanziario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fv_pdf_generation_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fv_progetti_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fv_servizi_catalogo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fv_template_pdf ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fv_eventi ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fv_solar_api_usage ENABLE ROW LEVEL SECURITY;

-- fv_progetti — policy company tenant (non distinguiamo ruolo a livello DB
-- perché get_effective_company_id() già copre il tenant; il filtro per ruolo
-- viene applicato a livello view/UI).
DROP POLICY IF EXISTS "co_fv_progetti_all" ON public.fv_progetti;
CREATE POLICY "co_fv_progetti_all" ON public.fv_progetti FOR ALL TO authenticated
  USING (company_id = public.get_effective_company_id())
  WITH CHECK (company_id = public.get_effective_company_id());

-- fv_pannelli_layout — via progetto
DROP POLICY IF EXISTS "co_fv_pannelli_all" ON public.fv_pannelli_layout;
CREATE POLICY "co_fv_pannelli_all" ON public.fv_pannelli_layout FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.fv_progetti p WHERE p.id = progetto_id AND p.company_id = public.get_effective_company_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.fv_progetti p WHERE p.id = progetto_id AND p.company_id = public.get_effective_company_id()));

DROP POLICY IF EXISTS "co_fv_componenti_all" ON public.fv_componenti_progetto;
CREATE POLICY "co_fv_componenti_all" ON public.fv_componenti_progetto FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.fv_progetti p WHERE p.id = progetto_id AND p.company_id = public.get_effective_company_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.fv_progetti p WHERE p.id = progetto_id AND p.company_id = public.get_effective_company_id()));

DROP POLICY IF EXISTS "co_fv_manodopera_all" ON public.fv_manodopera_progetto;
CREATE POLICY "co_fv_manodopera_all" ON public.fv_manodopera_progetto FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.fv_progetti p WHERE p.id = progetto_id AND p.company_id = public.get_effective_company_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.fv_progetti p WHERE p.id = progetto_id AND p.company_id = public.get_effective_company_id()));

DROP POLICY IF EXISTS "co_fv_servizi_progetto_all" ON public.fv_servizi_progetto;
CREATE POLICY "co_fv_servizi_progetto_all" ON public.fv_servizi_progetto FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.fv_progetti p WHERE p.id = progetto_id AND p.company_id = public.get_effective_company_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.fv_progetti p WHERE p.id = progetto_id AND p.company_id = public.get_effective_company_id()));

DROP POLICY IF EXISTS "co_fv_calcolo_all" ON public.fv_calcolo_finanziario;
CREATE POLICY "co_fv_calcolo_all" ON public.fv_calcolo_finanziario FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.fv_progetti p WHERE p.id = progetto_id AND p.company_id = public.get_effective_company_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.fv_progetti p WHERE p.id = progetto_id AND p.company_id = public.get_effective_company_id()));

DROP POLICY IF EXISTS "co_fv_pdf_log_all" ON public.fv_pdf_generation_log;
CREATE POLICY "co_fv_pdf_log_all" ON public.fv_pdf_generation_log FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.fv_progetti p WHERE p.id = progetto_id AND p.company_id = public.get_effective_company_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.fv_progetti p WHERE p.id = progetto_id AND p.company_id = public.get_effective_company_id()));

DROP POLICY IF EXISTS "co_fv_audit_select" ON public.fv_progetti_audit;
CREATE POLICY "co_fv_audit_select" ON public.fv_progetti_audit FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.fv_progetti p WHERE p.id = progetto_id AND p.company_id = public.get_effective_company_id()));

DROP POLICY IF EXISTS "co_fv_servizi_catalogo_all" ON public.fv_servizi_catalogo;
CREATE POLICY "co_fv_servizi_catalogo_all" ON public.fv_servizi_catalogo FOR ALL TO authenticated
  USING (company_id = public.get_effective_company_id())
  WITH CHECK (company_id = public.get_effective_company_id());

DROP POLICY IF EXISTS "co_fv_template_all" ON public.fv_template_pdf;
CREATE POLICY "co_fv_template_all" ON public.fv_template_pdf FOR ALL TO authenticated
  USING (company_id = public.get_effective_company_id())
  WITH CHECK (company_id = public.get_effective_company_id());

DROP POLICY IF EXISTS "co_fv_eventi_select" ON public.fv_eventi;
CREATE POLICY "co_fv_eventi_select" ON public.fv_eventi FOR SELECT TO authenticated
  USING (company_id = public.get_effective_company_id());

DROP POLICY IF EXISTS "co_fv_solar_usage_select" ON public.fv_solar_api_usage;
CREATE POLICY "co_fv_solar_usage_select" ON public.fv_solar_api_usage FOR SELECT TO authenticated
  USING (company_id = public.get_effective_company_id());

-- ============================================================================
-- ─── 22. Views denormalizzate per performance (§8.22) ───────────────────────
-- ============================================================================

CREATE OR REPLACE VIEW public.v_fv_progetti_dashboard AS
SELECT
  p.id, p.company_id, p.numero, p.titolo, p.stato, p.archetipo,
  p.indirizzo, p.comune,
  trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')) AS cliente_nome,
  p.potenza_kwp,
  p.prezzo_vendita_iva_inclusa,
  p.margine_eur,
  p.margine_pct,
  p.payback_anni,
  p.created_at, p.updated_at, p.emesso_il, p.firmato_il
FROM public.fv_progetti p
LEFT JOIN public.marketing_contacts c ON c.id = p.cliente_id
WHERE p.annullato = false;

CREATE OR REPLACE VIEW public.v_fv_stats_azienda AS
SELECT
  company_id,
  count(*) AS progetti_totali,
  count(*) FILTER (WHERE stato = 'bozza') AS progetti_bozza,
  count(*) FILTER (WHERE stato = 'emesso') AS progetti_emessi,
  count(*) FILTER (WHERE stato = 'firmato') AS progetti_firmati,
  count(*) FILTER (WHERE created_at >= date_trunc('month', now())) AS progetti_mese_corrente,
  count(*) FILTER (WHERE firmato_il >= date_trunc('month', now())) AS firmati_mese_corrente,
  avg(prezzo_vendita_iva_inclusa) FILTER (WHERE stato IN ('emesso','firmato')) AS ticket_medio,
  avg(margine_pct) AS margine_medio,
  count(*) FILTER (WHERE stato = 'firmato')::numeric / nullif(count(*) FILTER (WHERE stato IN ('emesso','firmato')), 0) AS tasso_conversione
FROM public.fv_progetti
WHERE annullato = false
GROUP BY company_id;

-- ============================================================================
-- ─── 23. Trigger audit log automatico (§8.23) ───────────────────────────────
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fv_progetti_audit_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.fv_progetti_audit (progetto_id, azione, user_id, valore_nuovo)
    VALUES (NEW.id, 'created', auth.uid(), to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.stato IS DISTINCT FROM NEW.stato THEN
      INSERT INTO public.fv_progetti_audit (progetto_id, azione, campo_modificato, valore_precedente, valore_nuovo, user_id)
      VALUES (NEW.id, 'stato_change', 'stato', jsonb_build_object('stato', OLD.stato), jsonb_build_object('stato', NEW.stato), auth.uid());
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fv_progetti_audit ON public.fv_progetti;
CREATE TRIGGER trg_fv_progetti_audit
  AFTER INSERT OR UPDATE ON public.fv_progetti
  FOR EACH ROW EXECUTE FUNCTION public.fv_progetti_audit_trigger();

-- Funzione per generare numero progressivo progetto (FV-2026-0042)
CREATE OR REPLACE FUNCTION public.fv_genera_numero_progetto(p_company_id uuid)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_anno text := to_char(now(), 'YYYY');
  v_progressivo integer;
  v_numero text;
BEGIN
  SELECT coalesce(max(
    cast(regexp_replace(numero, '^FV-' || v_anno || '-', '') AS integer)
  ), 0) + 1
  INTO v_progressivo
  FROM public.fv_progetti
  WHERE company_id = p_company_id
    AND numero LIKE 'FV-' || v_anno || '-%';
  v_numero := 'FV-' || v_anno || '-' || lpad(v_progressivo::text, 4, '0');
  RETURN v_numero;
END;
$$;

-- ============================================================================
-- ─── 24. Storage bucket per PDF e immagini satellitari ──────────────────────
-- ============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'fv-progetti', 'fv-progetti', false, 31457280, -- 30 MB
  ARRAY['application/pdf','image/png','image/jpeg','image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'fv-static-maps', 'fv-static-maps', false, 5242880, -- 5 MB per immagine
  ARRAY['image/png','image/jpeg','image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage RLS
DROP POLICY IF EXISTS "fv_progetti_select" ON storage.objects;
CREATE POLICY "fv_progetti_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'fv-progetti'
    AND (storage.foldername(name))[1] = public.get_effective_company_id()::text);

DROP POLICY IF EXISTS "fv_progetti_insert" ON storage.objects;
CREATE POLICY "fv_progetti_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'fv-progetti'
    AND (storage.foldername(name))[1] = public.get_effective_company_id()::text);

DROP POLICY IF EXISTS "fv_progetti_update" ON storage.objects;
CREATE POLICY "fv_progetti_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'fv-progetti'
    AND (storage.foldername(name))[1] = public.get_effective_company_id()::text);

DROP POLICY IF EXISTS "fv_progetti_delete" ON storage.objects;
CREATE POLICY "fv_progetti_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'fv-progetti'
    AND (storage.foldername(name))[1] = public.get_effective_company_id()::text);

DROP POLICY IF EXISTS "fv_static_maps_select" ON storage.objects;
CREATE POLICY "fv_static_maps_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'fv-static-maps');  -- shared cache per Static Maps

DROP POLICY IF EXISTS "fv_static_maps_insert" ON storage.objects;
CREATE POLICY "fv_static_maps_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'fv-static-maps');

-- ============================================================================
-- ─── 25. Seed iniziale catalogo incentivi 2026 ──────────────────────────────
-- ============================================================================

INSERT INTO public.fv_incentivi_catalogo
  (codice, nome, descrizione_breve, tipo, aliquota, plafond_max_eur, durata_anni, attivo, fonte_normativa, ordinamento) VALUES
  ('DETR_50_PRIMA', 'Detrazione IRPEF 50% (prima casa)',
   'Detrazione IRPEF del 50% in 10 quote annuali costanti per impianti FV su abitazione principale.',
   'detrazione_irpef', 0.50, 96000, 10, true, 'Legge 190/2025', 1),
  ('DETR_36_SECONDA', 'Detrazione IRPEF 36% (seconda casa)',
   'Detrazione IRPEF del 36% in 10 quote annuali per immobili non principali.',
   'detrazione_irpef', 0.36, 96000, 10, true, 'Legge 190/2025', 2),
  ('REDDITO_ENERGETICO', 'Reddito Energetico Nazionale',
   'Fondo perduto per famiglie con ISEE ≤ 15.000 € (≤ 30.000 € se 4+ figli).',
   'fondo_perduto', NULL, 11000, 1, true, 'Decreto MASE 2024', 3),
  ('IVA_10', 'IVA agevolata 10%',
   'IVA al 10% invece del 22% per interventi FV su edifici a destinazione abitativa.',
   'sconto_iva', 0.10, NULL, 1, true, 'DPR 633/72 - Tab. A III', 4),
  ('RID', 'Ritiro Dedicato (RID)',
   'Vendita energia in eccesso al GSE a prezzo medio orario per zona.',
   'tariffa_incentivante', NULL, NULL, NULL, true, 'GSE - Delibera AEEG 280/07', 5),
  ('CER_INFO', 'CER (Comunità Energetiche Rinnovabili)',
   'Tariffa incentivante 60-120 €/MWh per energia condivisa. In zona Bonus PNRR per comuni < 50.000 ab.',
   'informativa', NULL, NULL, 20, true, 'D.Lgs 199/21 + Decreto MASE 7/12/2023', 6),
  ('AMMORTAMENTO_PMI', 'Ammortamento PMI / partita IVA',
   'Ammortamento ordinario 4% annuo per imprese e partite IVA. Deducibilità IVA al 22%.',
   'deducibilita_fiscale', 0.04, NULL, NULL, true, 'TUIR art. 102', 7),
  ('TRANSIZIONE_5_0', 'Transizione 5.0',
   'Credito d''imposta dal 35% al 45% per investimenti FV abbinati a riduzione consumi (5-15% min).',
   'deducibilita_fiscale', 0.35, NULL, NULL, true, 'DL 19/2024 + Decreto MIMIT', 8)
ON CONFLICT (codice) DO NOTHING;

-- Cumulabilità (UPDATE separato per leggibilità) — derivata da §16-17
UPDATE public.fv_incentivi_catalogo SET
  cumulabile_con = ARRAY['IVA_10','RID','CER_INFO']::text[],
  non_cumulabile_con = ARRAY['REDDITO_ENERGETICO','TRANSIZIONE_5_0']::text[]
  WHERE codice = 'DETR_50_PRIMA';

UPDATE public.fv_incentivi_catalogo SET
  cumulabile_con = ARRAY['IVA_10','RID','CER_INFO']::text[],
  non_cumulabile_con = ARRAY['REDDITO_ENERGETICO','TRANSIZIONE_5_0']::text[]
  WHERE codice = 'DETR_36_SECONDA';

UPDATE public.fv_incentivi_catalogo SET
  cumulabile_con = ARRAY['IVA_10','RID']::text[],
  non_cumulabile_con = ARRAY['DETR_50_PRIMA','DETR_36_SECONDA','TRANSIZIONE_5_0']::text[]
  WHERE codice = 'REDDITO_ENERGETICO';

UPDATE public.fv_incentivi_catalogo SET
  cumulabile_con = ARRAY['IVA_10','RID']::text[],
  non_cumulabile_con = ARRAY['DETR_50_PRIMA','DETR_36_SECONDA','REDDITO_ENERGETICO']::text[]
  WHERE codice = 'TRANSIZIONE_5_0';

COMMIT;
