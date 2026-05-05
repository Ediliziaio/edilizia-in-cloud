-- MP-QF-01 — Integrazione Preventivi ↔ Finanziamenti
--
-- Aggiunge a `quotes` 5 campi per agganciare un preventivo a una proposta
-- di finanziamento calcolata via lib/finanziamenti/calcolaFinanziamento.
--
-- Tutti nullable: backward compat con preventivi esistenti senza finanziamento.

-- La tabella completa dei finanziamenti e' introdotta in una migration futura
-- (20261027100000_finanziamenti_tabelle_mvp). Questo aggancio preventivi pero'
-- arriva prima nella timeline e deve poter creare la FK anche su database puliti.
-- Manteniamo qui solo lo schema base compatibile; la migration futura aggiunge
-- trigger, storage bucket e policy applicative.
CREATE TABLE IF NOT EXISTS public.eic_finanziarie (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome            TEXT NOT NULL,
  ragione_sociale TEXT,
  partita_iva     TEXT,
  logo_url        TEXT,
  email_pratiche  TEXT,
  telefono        TEXT,
  note            TEXT,
  attiva          BOOLEAN NOT NULL DEFAULT true,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT eic_finanziarie_nome_company_unique UNIQUE (company_id, nome)
);

CREATE TABLE IF NOT EXISTS public.eic_tabelle_finanziamento (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  finanziaria_id      UUID NOT NULL REFERENCES public.eic_finanziarie(id) ON DELETE RESTRICT,
  nome_prodotto       TEXT NOT NULL,
  codice_condizione   TEXT,
  subtariffa_default  TEXT,
  tan_base            NUMERIC(5,3),
  pdf_url             TEXT,
  pdf_filename        TEXT,
  csv_url             TEXT,
  csv_filename        TEXT,
  data_decorrenza     DATE,
  data_scadenza       DATE,
  attiva              BOOLEAN NOT NULL DEFAULT true,
  note                TEXT,
  righe_count         INTEGER NOT NULL DEFAULT 0,
  importo_min         NUMERIC(12,2),
  importo_max         NUMERIC(12,2),
  durate_disponibili  INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  created_by          UUID REFERENCES auth.users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.eic_tabelle_finanziamento_righe (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tabella_id               UUID NOT NULL REFERENCES public.eic_tabelle_finanziamento(id) ON DELETE CASCADE,
  company_id               UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  subtariffa               TEXT,
  importo_erogato          NUMERIC(12,2) NOT NULL,
  spese_istruttoria        NUMERIC(10,2) NOT NULL DEFAULT 0,
  importo_totale_credito   NUMERIC(12,2) NOT NULL,
  numero_rate              INTEGER NOT NULL,
  durata_mesi              INTEGER NOT NULL,
  prima_rata_giorni        INTEGER NOT NULL DEFAULT 30,
  importo_rata             NUMERIC(10,2) NOT NULL,
  spese_incasso_rata       NUMERIC(8,2) NOT NULL DEFAULT 0,
  interessi_cliente        NUMERIC(12,2) NOT NULL,
  importo_totale_dovuto    NUMERIC(12,2) NOT NULL,
  tan                      NUMERIC(6,3) NOT NULL,
  taeg                     NUMERIC(6,3) NOT NULL,
  icc                      NUMERIC(6,3),
  provvigione_dealer       NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT eic_righe_unique_lookup UNIQUE (tabella_id, importo_erogato, numero_rate),
  CONSTRAINT eic_righe_numero_rate_positivo CHECK (numero_rate > 0),
  CONSTRAINT eic_righe_importo_positivo CHECK (importo_erogato > 0),
  CONSTRAINT eic_righe_rata_positiva CHECK (importo_rata > 0)
);

ALTER TABLE public.eic_finanziarie ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eic_tabelle_finanziamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eic_tabelle_finanziamento_righe ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS financing_table_id uuid
    REFERENCES public.eic_tabelle_finanziamento(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS financing_amount numeric(12, 2),
    -- importo finanziato (di norma = total ma puo' essere diverso)
  ADD COLUMN IF NOT EXISTS financing_num_installments int,
    -- es. 12, 24, 36, 60, 84 — vincolata a durate_disponibili della tabella
  ADD COLUMN IF NOT EXISTS financing_monthly_rate numeric(10, 2),
    -- rata mensile calcolata (importo_rata da RigaTabellaFinanziamento)
  ADD COLUMN IF NOT EXISTS financing_total_due numeric(12, 2),
    -- importo totale dovuto (rata × n + spese)
  ADD COLUMN IF NOT EXISTS financing_calculation_json jsonb;
    -- snapshot del RisultatoCalcolo completo (audit trail + replay)

-- Indice per filtrare preventivi con finanziamento (analisi conversione)
CREATE INDEX IF NOT EXISTS idx_quotes_financing_table_id
  ON public.quotes(financing_table_id)
  WHERE financing_table_id IS NOT NULL;

COMMENT ON COLUMN public.quotes.financing_table_id IS
  'FK a eic_tabelle_finanziamento se il preventivo include proposta finanziamento.';
COMMENT ON COLUMN public.quotes.financing_amount IS
  'Importo finanziato (puo essere diverso dal total se finanzia solo una parte).';
COMMENT ON COLUMN public.quotes.financing_num_installments IS
  'Numero rate scelte (deve essere in durate_disponibili della tabella).';
COMMENT ON COLUMN public.quotes.financing_monthly_rate IS
  'Rata mensile calcolata (snapshot al momento della creazione).';
COMMENT ON COLUMN public.quotes.financing_total_due IS
  'Importo totale dovuto = rata × num + spese istruttoria + spese incasso.';
COMMENT ON COLUMN public.quotes.financing_calculation_json IS
  'Snapshot RisultatoCalcolo (TAN, TAEG, ICC, modalita esatto/interpolato).';
