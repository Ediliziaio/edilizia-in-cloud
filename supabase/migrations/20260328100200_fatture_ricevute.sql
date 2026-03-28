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

-- Indexes
CREATE INDEX idx_fatture_ricevute_company ON public.fatture_ricevute(company_id);
CREATE INDEX idx_fatture_ricevute_stato ON public.fatture_ricevute(company_id, stato);
CREATE INDEX idx_fatture_ricevute_cedente ON public.fatture_ricevute(company_id, cedente_piva);
CREATE INDEX idx_fatture_ricevute_data ON public.fatture_ricevute(company_id, data_fattura DESC);
CREATE UNIQUE INDEX idx_fatture_ricevute_sdi_unique ON public.fatture_ricevute(sdi_id_trasmissione)
  WHERE sdi_id_trasmissione IS NOT NULL;

-- RLS: company isolation (same pattern as documenti_fiscali)
ALTER TABLE public.fatture_ricevute ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fatture_ricevute_company_isolation"
  ON public.fatture_ricevute
  FOR ALL
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

-- Grant access
GRANT SELECT, INSERT, UPDATE ON public.fatture_ricevute TO authenticated;

-- Trigger updated_at
CREATE OR REPLACE TRIGGER trg_fatture_ricevute_updated_at
  BEFORE UPDATE ON public.fatture_ricevute
  FOR EACH ROW
  EXECUTE FUNCTION public.moddatetime('updated_at');
