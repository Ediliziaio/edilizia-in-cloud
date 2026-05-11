-- ═══════════════════════════════════════════════════════════════════════════
-- Serramenti Preventivatore — Wave 1: Foundation DB
-- ---------------------------------------------------------------------------
-- Crea la struttura completa per il modulo "Stima Serramenti", parallelo
-- al fotovoltaico ma con specificità del verticale infissi:
--
--   sr_progetti                 hub progetto (cliente, immobile, totali)
--   sr_serramenti_progetto      BOM serramenti per progetto
--   sr_accessori_progetto       BOM accessori (avvolgibili, cassonetti, ecc.)
--   sr_progetti_media           foto (situazione, prodotti, render, cantiere)
--   sr_calcolo_risparmio        ROI 10 anni cashflow + Ecobonus + risparmio
--   sr_template_pdf             branding/copy default per azienda
--   sr_cantieri_referenza       lavori completati con foto (proof per nuovi)
--   sr_pdf_generation_log       audit generazione PDF
--   sr_progetti_audit           audit eventi su progetto
--
-- Settings azienda (su companies):
--   sr_varianti_enabled         abilita opzioni Standard/Comfort/Premium
--   sr_default_anticipo_pct     anticipo finanziamento default
--   sr_default_consulente_id    consulente default per nuovi progetti
--   sr_default_valido_giorni    validità preventivo default
--
-- RLS: tutto isolato per company_id, super_admin bypass via is_super_admin().
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. ENUMS
-- ═══════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE sr_stato_progetto AS ENUM (
    'bozza',         -- in compilazione
    'da_consegnare', -- pronto, da inviare al cliente
    'consegnato',    -- inviato al cliente
    'in_valutazione',-- cliente sta valutando
    'accettato',     -- cliente ha firmato
    'rifiutato',
    'scaduto',
    'archiviato'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE sr_tipo_intervento AS ENUM (
    'sostituzione',
    'nuova_costruzione',
    'ristrutturazione',
    'manutenzione'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE sr_materiale_principale AS ENUM (
    'alluminio',
    'pvc',
    'legno',
    'alluminio_legno',
    'acciaio',
    'misto'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE sr_media_kind AS ENUM (
    'situazione',     -- foto stato attuale (dal sopralluogo)
    'prodotto',       -- foto prodotto dal listino
    'cantiere_simile',-- referenza (cantiere completato simile)
    'render',         -- mockup/simulazione
    'allegato'        -- altro
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. HUB PROGETTO
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.sr_progetti (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code                  text NOT NULL,            -- es. SF-260510-1178
  stato                 sr_stato_progetto NOT NULL DEFAULT 'bozza',
  created_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  -- Cliente / anagrafica
  cliente_id            uuid,                     -- soft link a clients/marketing_contacts
  cliente_nome          text,
  cliente_cognome       text,
  cliente_indirizzo     text,
  cliente_citta         text,
  cliente_cap           text,
  cliente_provincia     text,
  cliente_telefono      text,
  cliente_email         text,
  cliente_codice_fiscale text,

  -- Cantiere (può differire dall'anagrafica cliente)
  cantiere_indirizzo    text,
  cantiere_citta        text,
  cantiere_cap          text,
  cantiere_provincia    text,
  cantiere_lat          numeric(9,6),
  cantiere_lng          numeric(9,6),
  cantiere_zona_climatica text,                   -- A..F (DM 26/06/2015) per stima risparmio
  cantiere_piano        text,
  cantiere_condominio   boolean DEFAULT false,
  cantiere_vincoli      text[],                   -- ['paesaggistico','storico','condominiale']

  -- Intervento
  tipo_intervento       sr_tipo_intervento NOT NULL DEFAULT 'sostituzione',
  intervento_titolo     text,                     -- "Per Paolo · Milano · 6 serramenti · sostituzione"
  intervento_sintesi    text,                     -- 1-2 frasi riassunto
  materiale_principale  sr_materiale_principale,
  totale_serramenti     int DEFAULT 0,
  totale_accessori      int DEFAULT 0,
  metri_quadri_totali   numeric(10,2),

  -- Copy preventivo (default da sr_template_pdf, override per progetto)
  esigenze              jsonb DEFAULT '[]'::jsonb, -- [{titolo, descrizione}]
  soluzione             jsonb DEFAULT '[]'::jsonb, -- [{titolo, descrizione}]
  perche_noi            text[],                    -- 5 USP bullet
  incluso_investimento  text[],                    -- 5 bullet
  testimonianze         jsonb DEFAULT '[]'::jsonb, -- [{quote, autore, citta, intervento}]
  prossimi_passi        text[],                    -- 4 step

  -- Economia (forbice + finanziamento)
  totale_min            numeric(12,2) DEFAULT 0,
  totale_max            numeric(12,2) DEFAULT 0,
  iva_inclusa           boolean DEFAULT true,
  iva_percentuale       numeric(4,2) DEFAULT 22,
  sconto_percentuale    numeric(5,2) DEFAULT 0,
  sconto_importo        numeric(12,2) DEFAULT 0,

  fin_anticipo_pct      numeric(5,2) DEFAULT 40,
  fin_piani             jsonb DEFAULT '[]'::jsonb, -- [{nome, mesi, tasso, rata_mese, anticipo, finanziato}]
  fin_tabella_id        uuid,                      -- soft link a eic_tabelle_finanziamento

  -- 3 varianti (Standard / Comfort / Premium) — opzionale per azienda
  varianti_attive       boolean DEFAULT false,
  varianti              jsonb DEFAULT '[]'::jsonb, -- [{nome, prezzo, specs:{Uw,Rw,...}, raccomandato}]
  variante_selezionata  text,                      -- 'standard' | 'comfort' | 'premium'

  -- ROI / risparmio (calcolato da edge function sr-calcolo-risparmio)
  risparmio_calcolato   boolean DEFAULT false,
  risparmio_eur_anno    numeric(10,2),             -- € risparmio bolletta annuo
  detrazione_aliquota   numeric(4,2),              -- 50 / 65
  detrazione_eur_totale numeric(12,2),
  detrazione_eur_anno   numeric(10,2),             -- ÷10 anni
  payback_anni          numeric(4,2),
  co2_risparmiata_t_anno numeric(8,3),

  -- Consulenza
  consulente_id         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  consulenza_at         timestamptz,
  consulenza_luogo      text,                      -- "A casa tua" / "In showroom"

  -- Cronoprogramma (calcolato da n° pezzi × tempi standard)
  crono_giorni_produzione int DEFAULT 30,
  crono_giorni_posa     int DEFAULT 5,
  crono_giorni_collaudo int DEFAULT 1,

  -- Validità
  valido_fino_giorni    int DEFAULT 15,
  valido_fino_data      date,

  -- Microsito pubblico (per firma/visione cliente senza login)
  public_token          text UNIQUE,               -- random 32 char
  public_url            text,
  allow_self_signing    boolean DEFAULT true,
  firmato_il            timestamptz,
  firma_cliente_url     text,

  -- Referral / porta-un-amico
  referral_amount_eur   numeric(8,2) DEFAULT 0,

  -- Link a moduli correlati
  sopralluogo_id        uuid,                      -- soft → surveys.id
  sopralluogo_eseguito_il date,
  opportunita_id        uuid,                      -- soft → marketing_opportunities.id
  ordine_id             uuid,                      -- soft → quando converte in commessa

  -- Output
  pdf_url               text,
  pdf_generated_at      timestamptz,
  pdf_html_url          text,                      -- versione HTML salvata su Storage

  -- Note interne (non in PDF)
  note_interne          text
);

-- Unique code per company
CREATE UNIQUE INDEX IF NOT EXISTS sr_progetti_company_code_uk
  ON public.sr_progetti(company_id, code);

CREATE INDEX IF NOT EXISTS sr_progetti_company_idx       ON public.sr_progetti(company_id);
CREATE INDEX IF NOT EXISTS sr_progetti_cliente_idx       ON public.sr_progetti(cliente_id);
CREATE INDEX IF NOT EXISTS sr_progetti_sopralluogo_idx   ON public.sr_progetti(sopralluogo_id);
CREATE INDEX IF NOT EXISTS sr_progetti_opportunita_idx   ON public.sr_progetti(opportunita_id);
CREATE INDEX IF NOT EXISTS sr_progetti_stato_idx         ON public.sr_progetti(stato);
CREATE INDEX IF NOT EXISTS sr_progetti_public_token_idx  ON public.sr_progetti(public_token);
CREATE INDEX IF NOT EXISTS sr_progetti_created_at_idx    ON public.sr_progetti(created_at DESC);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.sr_progetti_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS sr_progetti_touch ON public.sr_progetti;
CREATE TRIGGER sr_progetti_touch
  BEFORE UPDATE ON public.sr_progetti
  FOR EACH ROW EXECUTE FUNCTION public.sr_progetti_touch_updated_at();

-- Auto-genera code se assente: SF-YYMMDD-NNNN
CREATE OR REPLACE FUNCTION public.sr_progetti_autocode()
RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE
  v_seq int;
BEGIN
  IF NEW.code IS NOT NULL AND length(NEW.code) > 0 THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(MAX(
    NULLIF(regexp_replace(code, '^SF-\d{6}-(\d+)$', '\1'), code)::int
  ), 0) + 1
  INTO v_seq
  FROM public.sr_progetti
  WHERE company_id = NEW.company_id
    AND code LIKE 'SF-' || to_char(now(), 'YYMMDD') || '-%';

  NEW.code := 'SF-' || to_char(now(), 'YYMMDD') || '-' || lpad(v_seq::text, 4, '0');
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS sr_progetti_autocode ON public.sr_progetti;
CREATE TRIGGER sr_progetti_autocode
  BEFORE INSERT ON public.sr_progetti
  FOR EACH ROW EXECUTE FUNCTION public.sr_progetti_autocode();

-- Auto-genera public_token + valido_fino_data
CREATE OR REPLACE FUNCTION public.sr_progetti_autotoken()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.public_token IS NULL THEN
    NEW.public_token := encode(gen_random_bytes(16), 'hex');
  END IF;
  IF NEW.valido_fino_data IS NULL AND NEW.valido_fino_giorni IS NOT NULL THEN
    NEW.valido_fino_data := (now() + (NEW.valido_fino_giorni || ' days')::interval)::date;
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS sr_progetti_autotoken ON public.sr_progetti;
CREATE TRIGGER sr_progetti_autotoken
  BEFORE INSERT ON public.sr_progetti
  FOR EACH ROW EXECUTE FUNCTION public.sr_progetti_autotoken();

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. BOM — SERRAMENTI
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.sr_serramenti_progetto (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  progetto_id         uuid NOT NULL REFERENCES public.sr_progetti(id) ON DELETE CASCADE,
  company_id          uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  position            int NOT NULL DEFAULT 0,

  -- Identificazione
  tipologia           text NOT NULL,             -- finestra_1anta / finestra_2ante / portafinestra_2ante / ...
  tipologia_label     text,                      -- "Finestra a 2 ante"
  ambiente            text,                      -- "Soggiorno" / "Cucina" / ...

  -- Specifiche
  materiale           sr_materiale_principale,
  serie               text,                      -- "Serie 90"
  vetro               text,                      -- "Vetrocamera basso-emissiva"
  vetro_specs         jsonb,                     -- {Uw, Ug, Uf, Rw, classe_acustica}
  apertura            text,                      -- "battente_dx" / "anta_ribalta_sx" / ...
  colore_interno      text,
  colore_esterno      text,

  -- Misure
  larghezza_mm        int,
  altezza_mm          int,
  quantita            int NOT NULL DEFAULT 1,
  metri_quadri        numeric(8,3),              -- calcolato: L × H × q / 1.000.000

  -- Listino
  family_id           uuid,                      -- soft → article_families
  listino_voce_id     uuid,                      -- soft → listino_griglia
  prezzo_unitario     numeric(10,2),
  prezzo_totale       numeric(12,2),             -- prezzo_unitario × quantita

  -- Foto
  foto_storage_path   text,                      -- foto situazione attuale
  foto_render_path    text,                      -- foto prodotto/render

  note                text,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sr_serramenti_progetto_idx  ON public.sr_serramenti_progetto(progetto_id, position);
CREATE INDEX IF NOT EXISTS sr_serramenti_company_idx   ON public.sr_serramenti_progetto(company_id);

DROP TRIGGER IF EXISTS sr_serr_touch ON public.sr_serramenti_progetto;
CREATE TRIGGER sr_serr_touch
  BEFORE UPDATE ON public.sr_serramenti_progetto
  FOR EACH ROW EXECUTE FUNCTION public.sr_progetti_touch_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. BOM — ACCESSORI
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.sr_accessori_progetto (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  progetto_id         uuid NOT NULL REFERENCES public.sr_progetti(id) ON DELETE CASCADE,
  company_id          uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  position            int NOT NULL DEFAULT 0,

  tipo                text NOT NULL,             -- avvolgibile / cassonetto / zanzariera / persiana / inferriata
  descrizione         text,
  quantita            int NOT NULL DEFAULT 1,
  prezzo_unitario     numeric(10,2),
  prezzo_totale       numeric(12,2),

  listino_voce_id     uuid,                      -- soft → listino_griglia
  serramento_id       uuid REFERENCES public.sr_serramenti_progetto(id) ON DELETE SET NULL,
                                                 -- accessorio collegato ad uno specifico serramento

  note                text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sr_accessori_progetto_idx  ON public.sr_accessori_progetto(progetto_id, position);
CREATE INDEX IF NOT EXISTS sr_accessori_company_idx   ON public.sr_accessori_progetto(company_id);

DROP TRIGGER IF EXISTS sr_acc_touch ON public.sr_accessori_progetto;
CREATE TRIGGER sr_acc_touch
  BEFORE UPDATE ON public.sr_accessori_progetto
  FOR EACH ROW EXECUTE FUNCTION public.sr_progetti_touch_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. MEDIA (foto progetto)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.sr_progetti_media (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  progetto_id         uuid NOT NULL REFERENCES public.sr_progetti(id) ON DELETE CASCADE,
  company_id          uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  kind                sr_media_kind NOT NULL DEFAULT 'situazione',

  storage_path        text NOT NULL,
  url                 text,                       -- signed url (rigenerato a ogni get)
  caption             text,
  posizione_pdf       text,                       -- 'pag1_hero' | 'pag1_esigenze' | 'pag3_bom' | NULL
  position            int NOT NULL DEFAULT 0,

  serramento_id       uuid REFERENCES public.sr_serramenti_progetto(id) ON DELETE SET NULL,

  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sr_progetti_media_idx  ON public.sr_progetti_media(progetto_id, position);

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. CALCOLO RISPARMIO ENERGETICO (10 anni cashflow)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.sr_calcolo_risparmio (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  progetto_id         uuid NOT NULL REFERENCES public.sr_progetti(id) ON DELETE CASCADE,
  company_id          uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Input
  zona_climatica      text,                       -- A..F
  m2_serramenti       numeric(8,2),
  uw_attuale          numeric(4,2),               -- es. 5.0 W/m²K (singolo vetro vecchio)
  uw_nuovo            numeric(4,2),               -- es. 1.1 W/m²K (nuovo)
  gradi_giorno        int,                        -- da zona climatica
  ore_riscaldamento_giorno int DEFAULT 14,
  prezzo_kwh_termico  numeric(6,4),               -- €/kWh
  inflazione_energia_annua numeric(5,2) DEFAULT 3, -- %
  bolletta_media_anno_eur numeric(10,2),          -- bolletta riscaldamento media

  -- Output (calcolato server-side)
  risparmio_kwh_anno  numeric(10,2),
  risparmio_eur_anno  numeric(10,2),
  risparmio_pct       numeric(5,2),               -- % bolletta
  co2_risparmiata_kg_anno numeric(10,2),

  -- Ecobonus
  detrazione_aliquota numeric(4,2),               -- 50 / 65
  detrazione_base_eur numeric(12,2),
  detrazione_eur_totale numeric(12,2),
  detrazione_eur_anno numeric(10,2),              -- /10

  -- Cashflow 10 anni
  cashflow            jsonb,                      -- [{anno:1, risparmio, detrazione, totale, cumulato},...]
  payback_anni        numeric(4,2),
  totale_recuperato_10y numeric(12,2),

  calcolato_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sr_calcolo_risparmio_idx ON public.sr_calcolo_risparmio(progetto_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. TEMPLATE PDF (default copy/branding per azienda)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.sr_template_pdf (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Branding
  colore_primario     text DEFAULT '#2D7D5C',
  logo_url            text,
  ragione_sociale     text,
  indirizzo_completo  text,
  telefono            text,
  email               text,
  partita_iva         text,

  -- Default copy (override per progetto)
  esigenze_default    jsonb DEFAULT '[
    {"titolo":"Spifferi","descrizione":"Telai nuovi con guarnizioni multiple e perimetro sigillato a regola d''arte. Niente più aria fredda dalle finestre."},
    {"titolo":"Condensa","descrizione":"Vetri con prestazioni isolanti adeguate al clima della tua zona. Niente più condensa al mattino sui vetri."},
    {"titolo":"Aspetto","descrizione":"Colore, finitura e maniglie scelte da te in consulenza. I serramenti si integrano con lo stile della casa."}
  ]'::jsonb,
  soluzione_default   jsonb DEFAULT '[
    {"titolo":"Serramenti su misura","descrizione":"Profili durevoli e prestazionali, finitura sempre in ordine."},
    {"titolo":"Posa qualificata","descrizione":"Sigillature al perimetro con nastri autoespandenti e membrane traspiranti, eseguite a regola d''arte: zero infiltrazioni d''aria o acqua nel tempo, garanzia decennale sulla posa scritta in contratto."}
  ]'::jsonb,
  perche_noi_default  text[] DEFAULT ARRAY[
    'Un solo interlocutore dalla prima Consulenza al collaudo finale',
    'Posa eseguita a regola d''arte con sigillature certificate nel tempo',
    'Garanzia decennale sulla posa scritta in contratto',
    'Squadre di posa interne nostre, mai subappaltatori',
    'Prezzo del Piano dei Lavori bloccato fino alla firma'
  ],
  incluso_default     text[] DEFAULT ARRAY[
    'Rilievo dimensionale a casa tua con un nostro tecnico, senza costi aggiuntivi',
    'Smontaggio e smaltimento dei serramenti vecchi a carico nostro',
    'Posa qualificata da squadre interne specializzate, mai subappaltata',
    'Sigillature con nastri autoespandenti e membrane traspiranti, per tenuta all''aria e all''acqua duratura',
    'Collaudo finale, regolazioni a richiesta e manuale di manutenzione consegnato a fine lavori'
  ],
  prossimi_passi_default text[] DEFAULT ARRAY[
    'Ci vediamo a casa tua per la Consulenza tecnica',
    'Ascoltiamo le tue esigenze e troviamo la soluzione migliore',
    'Sviluppiamo il Piano dei Lavori e definiamo i dettagli',
    'Firmi e procediamo insieme'
  ],
  testimonianze_default jsonb DEFAULT '[]'::jsonb,

  -- Default cronoprogramma
  crono_giorni_produzione_default int DEFAULT 30,
  crono_giorni_posa_per_pezzo_default numeric(4,2) DEFAULT 0.8,
  crono_giorni_collaudo_default int DEFAULT 1,

  -- Default economia
  iva_percentuale_default numeric(4,2) DEFAULT 22,
  anticipo_pct_default numeric(5,2) DEFAULT 40,
  valido_giorni_default int DEFAULT 15,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS sr_template_pdf_touch ON public.sr_template_pdf;
CREATE TRIGGER sr_template_pdf_touch
  BEFORE UPDATE ON public.sr_template_pdf
  FOR EACH ROW EXECUTE FUNCTION public.sr_progetti_touch_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. CANTIERI REFERENZA (proof per nuovi clienti — "i nostri cantieri in zona")
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.sr_cantieri_referenza (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  progetto_origine_id uuid REFERENCES public.sr_progetti(id) ON DELETE SET NULL,

  citta               text,
  cap                 text,
  provincia           text,
  lat                 numeric(9,6),
  lng                 numeric(9,6),

  tipo_intervento     sr_tipo_intervento,
  materiale_principale sr_materiale_principale,
  numero_serramenti   int,
  testo_breve         text,                       -- "Bifamiliare nuova costruzione, 22 serramenti alluminio-legno"

  foto_storage_paths  text[] DEFAULT ARRAY[]::text[],
  consenso_uso_marketing boolean DEFAULT false,

  attiva              boolean DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sr_cantieri_company_idx ON public.sr_cantieri_referenza(company_id, attiva);
CREATE INDEX IF NOT EXISTS sr_cantieri_geo_idx     ON public.sr_cantieri_referenza(lat, lng) WHERE attiva = true;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. AUDIT + LOG GENERAZIONE PDF
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.sr_progetti_audit (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  progetto_id         uuid NOT NULL REFERENCES public.sr_progetti(id) ON DELETE CASCADE,
  company_id          uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type          text NOT NULL,              -- created / updated / state_change / pdf_generated / signed / ...
  event_data          jsonb DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sr_audit_progetto_idx ON public.sr_progetti_audit(progetto_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.sr_pdf_generation_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  progetto_id         uuid NOT NULL REFERENCES public.sr_progetti(id) ON DELETE CASCADE,
  company_id          uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  variant             text,                       -- 'vendita' | 'tecnico' | 'mobile'
  status              text NOT NULL DEFAULT 'success',
  pdf_url             text,
  html_url            text,
  duration_ms         int,
  pages_count         int,
  error_message       text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sr_pdf_log_progetto_idx ON public.sr_pdf_generation_log(progetto_id, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. COMPANY SETTINGS — flag per il modulo
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS sr_varianti_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS sr_default_anticipo_pct numeric(5,2) DEFAULT 40,
  ADD COLUMN IF NOT EXISTS sr_default_consulente_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sr_default_valido_giorni int DEFAULT 15,
  ADD COLUMN IF NOT EXISTS sr_default_iva_percentuale numeric(4,2) DEFAULT 22,
  ADD COLUMN IF NOT EXISTS sr_referral_amount_eur numeric(8,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sr_microsito_enabled boolean DEFAULT true;

-- ═══════════════════════════════════════════════════════════════════════════
-- 11. RLS POLICIES
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.sr_progetti               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sr_serramenti_progetto    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sr_accessori_progetto     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sr_progetti_media         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sr_calcolo_risparmio      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sr_template_pdf           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sr_cantieri_referenza     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sr_progetti_audit         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sr_pdf_generation_log     ENABLE ROW LEVEL SECURITY;

-- Policy generator: select/insert/update/delete dove company_id = get_my_company_id()
-- + super_admin bypass

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'sr_progetti','sr_serramenti_progetto','sr_accessori_progetto','sr_progetti_media',
    'sr_calcolo_risparmio','sr_template_pdf','sr_cantieri_referenza',
    'sr_progetti_audit','sr_pdf_generation_log'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I', t, t);
    EXECUTE format($p$
      CREATE POLICY %I_select ON public.%I FOR SELECT
        USING (company_id = public.get_my_company_id() OR public.is_super_admin())
    $p$, t, t);

    EXECUTE format('DROP POLICY IF EXISTS %I_insert ON public.%I', t, t);
    EXECUTE format($p$
      CREATE POLICY %I_insert ON public.%I FOR INSERT
        WITH CHECK (company_id = public.get_my_company_id() OR public.is_super_admin())
    $p$, t, t);

    EXECUTE format('DROP POLICY IF EXISTS %I_update ON public.%I', t, t);
    EXECUTE format($p$
      CREATE POLICY %I_update ON public.%I FOR UPDATE
        USING (company_id = public.get_my_company_id() OR public.is_super_admin())
        WITH CHECK (company_id = public.get_my_company_id() OR public.is_super_admin())
    $p$, t, t);

    EXECUTE format('DROP POLICY IF EXISTS %I_delete ON public.%I', t, t);
    EXECUTE format($p$
      CREATE POLICY %I_delete ON public.%I FOR DELETE
        USING (company_id = public.get_my_company_id() OR public.is_super_admin())
    $p$, t, t);
  END LOOP;
END $$;

-- Policy pubblica per il microsito cliente: chi ha il public_token può leggere
-- (read-only, e solo se allow_self_signing o stato pubblicabile)
DROP POLICY IF EXISTS sr_progetti_public_token_read ON public.sr_progetti;
CREATE POLICY sr_progetti_public_token_read ON public.sr_progetti FOR SELECT
  USING (
    public_token IS NOT NULL
    AND stato IN ('da_consegnare','consegnato','in_valutazione','accettato')
    AND current_setting('request.jwt.claims', true)::jsonb ->> 'sr_public_token' = public_token
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 12. RPC HELPERS
-- ═══════════════════════════════════════════════════════════════════════════

-- Crea progetto da sopralluogo Infissi v6: pre-popola BOM serramenti+accessori
CREATE OR REPLACE FUNCTION public.sr_create_progetto_da_sopralluogo(
  p_sopralluogo_id uuid,
  p_cliente_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $fn$
DECLARE
  v_company_id uuid;
  v_progetto_id uuid;
  v_survey record;
BEGIN
  -- Verifica autorizzazione (l'utente deve poter vedere il sopralluogo)
  SELECT s.* INTO v_survey
  FROM public.surveys s
  WHERE s.id = p_sopralluogo_id
    AND (s.company_id = public.get_my_company_id() OR public.is_super_admin());

  IF v_survey IS NULL THEN
    RAISE EXCEPTION 'Sopralluogo non trovato o non accessibile';
  END IF;

  v_company_id := v_survey.company_id;

  -- Crea progetto base
  INSERT INTO public.sr_progetti (
    company_id, sopralluogo_id, sopralluogo_eseguito_il,
    cliente_id, cantiere_indirizzo, cantiere_citta, cantiere_cap, cantiere_provincia,
    tipo_intervento, created_by
  ) VALUES (
    v_company_id, p_sopralluogo_id,
    COALESCE(v_survey.completed_at::date, CURRENT_DATE),
    COALESCE(p_cliente_id, v_survey.client_id),
    v_survey.address, v_survey.city, v_survey.zip, v_survey.province,
    'sostituzione', auth.uid()
  ) RETURNING id INTO v_progetto_id;

  -- BOM popolato dalla edge function sr-import-da-sopralluogo (Wave 4)
  -- Qui solo la riga progetto, la mappatura survey_elements → sr_serramenti
  -- viene fatta async per evitare carico nella transazione.

  INSERT INTO public.sr_progetti_audit (progetto_id, company_id, user_id, event_type, event_data)
  VALUES (v_progetto_id, v_company_id, auth.uid(), 'created_from_sopralluogo',
          jsonb_build_object('sopralluogo_id', p_sopralluogo_id));

  RETURN v_progetto_id;
END
$fn$;

GRANT EXECUTE ON FUNCTION public.sr_create_progetto_da_sopralluogo(uuid, uuid) TO authenticated;

-- Cerca cantieri referenza vicini al cliente (entro X km)
CREATE OR REPLACE FUNCTION public.sr_cantieri_referenza_vicini(
  p_lat numeric,
  p_lng numeric,
  p_raggio_km numeric DEFAULT 10,
  p_limit int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  citta text,
  testo_breve text,
  foto_storage_paths text[],
  distanza_km numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $fn$
  -- Formula haversine semplificata (approx, sufficiente per filtraggio entro pochi km)
  SELECT
    r.id, r.citta, r.testo_breve, r.foto_storage_paths,
    (6371 * acos(
      cos(radians(p_lat)) * cos(radians(r.lat)) *
      cos(radians(r.lng) - radians(p_lng)) +
      sin(radians(p_lat)) * sin(radians(r.lat))
    ))::numeric(8,2) AS distanza_km
  FROM public.sr_cantieri_referenza r
  WHERE r.attiva = true
    AND r.consenso_uso_marketing = true
    AND r.company_id = public.get_my_company_id()
    AND r.lat IS NOT NULL AND r.lng IS NOT NULL
    AND (6371 * acos(
      cos(radians(p_lat)) * cos(radians(r.lat)) *
      cos(radians(r.lng) - radians(p_lng)) +
      sin(radians(p_lat)) * sin(radians(r.lat))
    )) <= p_raggio_km
  ORDER BY distanza_km ASC
  LIMIT p_limit;
$fn$;

GRANT EXECUTE ON FUNCTION public.sr_cantieri_referenza_vicini(numeric, numeric, numeric, int) TO authenticated;

COMMIT;
