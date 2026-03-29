-- GAP1: Tabella per fatture passive ricevute via SDI
-- Contiene i dati estratti dalle fatture XML ricevute dal Sistema di Interscambio

CREATE TABLE IF NOT EXISTS public.fatture_ricevute (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Dati SDI
  sdi_id_trasmissione text,
  sdi_progressivo text,

  -- Cedente/Prestatore (fornitore)
  cedente_piva text,
  cedente_cf text,
  cedente_ragione_sociale text NOT NULL,
  cedente_paese text DEFAULT 'IT',
  cedente_indirizzo text,
  cedente_cap text,
  cedente_comune text,
  cedente_provincia text,

  -- Dati documento
  tipo_documento text NOT NULL DEFAULT 'TD01',
  numero_fattura text NOT NULL,
  data_fattura date NOT NULL,

  -- Importi
  imponibile_totale numeric(12,2) DEFAULT 0,
  iva_totale numeric(12,2) DEFAULT 0,
  totale_documento numeric(12,2) DEFAULT 0,

  -- Righe (JSONB come documenti_fiscali)
  righe jsonb DEFAULT '[]'::jsonb,
  riepilogo_iva jsonb DEFAULT '[]'::jsonb,

  -- File XML e PDF
  xml_raw text,
  xml_url text,
  pdf_url text,

  -- Stato workflow
  stato text NOT NULL DEFAULT 'non_letta'
    CHECK (stato IN ('non_letta', 'letta', 'contabilizzata', 'rifiutata')),

  -- Collegamento a prima nota
  prima_nota_id uuid,

  -- Note
  note text,

  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
