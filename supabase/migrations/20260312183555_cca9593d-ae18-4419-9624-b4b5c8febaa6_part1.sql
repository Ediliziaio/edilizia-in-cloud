-- ============================================================
-- ANAGRAFICHE CLIENTI/FORNITORI
-- ============================================================
CREATE TABLE IF NOT EXISTS public.anagrafiche_native (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  tipo TEXT NOT NULL DEFAULT 'cliente' CHECK (tipo IN ('cliente','fornitore','entrambi')),
  tipo_soggetto TEXT NOT NULL DEFAULT 'giuridico' CHECK (tipo_soggetto IN ('giuridico','fisico','pa','estero')),

  ragione_sociale TEXT,
  forma_giuridica TEXT,
  nome TEXT,
  cognome TEXT,

  partita_iva TEXT,
  codice_fiscale TEXT,
  codice_sdi TEXT DEFAULT '0000000',
  pec TEXT,

  indirizzo_via TEXT,
  indirizzo_numero_civico TEXT,
  indirizzo_cap TEXT,
  indirizzo_comune TEXT,
  indirizzo_provincia CHAR(2),
  indirizzo_nazione CHAR(2) DEFAULT 'IT',

  telefono TEXT,
  cellulare TEXT,
  email TEXT,
  email_fatture TEXT,
  sito_web TEXT,

  indirizzi_consegna JSONB DEFAULT '[]',

  tipo_cliente TEXT DEFAULT 'B2B' CHECK (tipo_cliente IN ('B2B','B2C','PA','Estero')),
  aliquota_iva_default TEXT DEFAULT '22',
  sconto_default DECIMAL(5,2) DEFAULT 0,
  condizioni_pagamento_default TEXT DEFAULT '30gg',
  metodo_pagamento_default TEXT DEFAULT 'MP05',
  giorni_pagamento_default INTEGER DEFAULT 30,

  iban_cliente TEXT,
  bic_cliente TEXT,

  cig TEXT,
  cup TEXT,

  fatturato_totale DECIMAL(15,2) DEFAULT 0,
  numero_fatture INTEGER DEFAULT 0,
  ultima_fattura_at TIMESTAMPTZ,

  note TEXT,
  tags TEXT[] DEFAULT '{}',
  attivo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_piva_company UNIQUE (company_id, partita_iva)
);
