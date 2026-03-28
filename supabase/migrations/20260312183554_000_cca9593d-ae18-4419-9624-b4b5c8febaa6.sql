-- ============================================================
-- ANAGRAFICA AZIENDA EMITTENTE (per ogni company/tenant)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.anagrafica_azienda (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE UNIQUE,

  ragione_sociale TEXT NOT NULL,
  partita_iva TEXT NOT NULL CHECK (length(partita_iva) = 11),
  codice_fiscale TEXT NOT NULL,
  forma_giuridica TEXT NOT NULL DEFAULT 'SRL',

  indirizzo_via TEXT NOT NULL,
  indirizzo_numero_civico TEXT,
  indirizzo_cap TEXT NOT NULL CHECK (length(indirizzo_cap) = 5),
  indirizzo_comune TEXT NOT NULL,
  indirizzo_provincia CHAR(2) NOT NULL,
  indirizzo_nazione CHAR(2) NOT NULL DEFAULT 'IT',

  codice_sdi TEXT CHECK (codice_sdi IS NULL OR length(codice_sdi) = 7),
  pec TEXT,
  codice_rea TEXT,
  capitale_sociale DECIMAL(15,2),
  numero_iscr_registro_imprese TEXT,

  regime_fiscale TEXT NOT NULL DEFAULT 'RF01',

  iban_principale TEXT,
  bic_swift TEXT,
  intestatario_conto TEXT,
  nome_banca TEXT,

  logo_url TEXT,
  colore_primario TEXT DEFAULT '#0EA5E9',
  font_fattura TEXT DEFAULT 'Inter',

  telefono TEXT,
  email TEXT,
  sito_web TEXT,

  ultimo_numero_fattura INTEGER DEFAULT 0,
  ultimo_numero_nc INTEGER DEFAULT 0,
  ultimo_numero_ddt INTEGER DEFAULT 0,
  ultimo_numero_preventivo INTEGER DEFAULT 0,
  prefisso_fattura TEXT DEFAULT 'FT',
  prefisso_nc TEXT DEFAULT 'NC',
  prefisso_ddt TEXT DEFAULT 'DDT',
  prefisso_preventivo TEXT DEFAULT 'PRV',
  anno_corrente INTEGER DEFAULT EXTRACT(YEAR FROM NOW()),
  reset_numeratore_annuale BOOLEAN DEFAULT TRUE,

  note_fattura_default TEXT,
  condizioni_pagamento_default TEXT,

  sdi_provider TEXT DEFAULT 'manuale' CHECK (sdi_provider IN ('aruba','infocert','poste','manuale')),
  sdi_api_key TEXT,
  sdi_configurato BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
