-- ============================================================
-- DOCUMENTI FISCALI (tabella centrale unificata)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.documenti_fiscali (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  tipo TEXT NOT NULL CHECK (tipo IN (
    'fattura','fattura_pa','nota_credito','nota_debito',
    'autofattura','fattura_riepilogativa','proforma','preventivo','ddt'
  )),

  numero TEXT NOT NULL,
  numero_progressivo INTEGER NOT NULL,
  anno INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM NOW()),
  serie TEXT DEFAULT 'A',

  data_emissione DATE NOT NULL DEFAULT CURRENT_DATE,
  data_scadenza DATE,
  data_consegna DATE,

  anagrafica_id UUID REFERENCES public.anagrafiche_native(id),
  cliente_snapshot JSONB NOT NULL DEFAULT '{}',

  stato TEXT NOT NULL DEFAULT 'bozza' CHECK (stato IN (
    'bozza','emessa','inviata_sdi','consegnata','accettata',
    'rifiutata','scaduta','pagata','parzialmente_pagata','stornata','annullata'
  )),

  sdi_id_trasmissione TEXT,
  sdi_stato TEXT,
  sdi_data_consegna TIMESTAMPTZ,
  sdi_file_xml_url TEXT,
  sdi_ricevuta_url TEXT,
  sdi_errori JSONB DEFAULT '[]',
  sdi_notifica_tipo TEXT,
  trasmissione TEXT DEFAULT 'sdi' CHECK (trasmissione IN ('sdi','pec','manuale')),

  righe JSONB NOT NULL DEFAULT '[]',
  riepilogo_iva JSONB NOT NULL DEFAULT '[]',

  subtotale DECIMAL(15,2) NOT NULL DEFAULT 0,
  sconto_globale_percentuale DECIMAL(5,2) DEFAULT 0,
  sconto_globale_valore DECIMAL(15,2) DEFAULT 0,
  imponibile_totale DECIMAL(15,2) NOT NULL DEFAULT 0,
  iva_totale DECIMAL(15,2) NOT NULL DEFAULT 0,
  totale_documento DECIMAL(15,2) NOT NULL DEFAULT 0,
  arrotondamento DECIMAL(5,2) DEFAULT 0,

  bollo_virtuale BOOLEAN DEFAULT FALSE,
  bollo_importo DECIMAL(5,2) DEFAULT 2.00,

  ritenuta_acconto BOOLEAN DEFAULT FALSE,
  ritenuta_tipo TEXT,
  ritenuta_aliquota DECIMAL(5,2),
  ritenuta_causale TEXT,
  ritenuta_importo DECIMAL(15,2),

  cassa_previdenziale BOOLEAN DEFAULT FALSE,
  cassa_tipo TEXT,
  cassa_aliquota DECIMAL(5,2),
  cassa_imponibile DECIMAL(15,2),
  cassa_importo DECIMAL(15,2),
  cassa_aliquota_iva TEXT,
  cassa_ritenuta BOOLEAN DEFAULT FALSE,

  totale_da_pagare DECIMAL(15,2) NOT NULL DEFAULT 0,

  scadenze_pagamento JSONB DEFAULT '[]',
  metodo_pagamento_codice TEXT DEFAULT 'MP05',
  metodo_pagamento_nome TEXT DEFAULT 'Bonifico Bancario',
  iban_pagamento TEXT,
  bic_pagamento TEXT,
  nome_banca TEXT,
  intestatario_conto TEXT,

  riferimenti_ordine JSONB DEFAULT '[]',
  riferimenti_ddt JSONB DEFAULT '[]',
  documento_correlato_id UUID REFERENCES public.documenti_fiscali(id),

  cig TEXT,
  cup TEXT,
  codice_commessa_convenzione TEXT,

  ddt_causale_trasporto TEXT,
  ddt_numero_colli INTEGER,
  ddt_peso TEXT,
  ddt_mezzo_trasporto TEXT,
  ddt_data_ora_consegna TIMESTAMPTZ,
  ddt_indirizzo_consegna JSONB,
  ddt_porto TEXT CHECK (ddt_porto IS NULL OR ddt_porto IN ('Franco','Assegnato')),
  ddt_aspetto_beni TEXT,
  ddt_vettore JSONB,
  ddt_fatturato BOOLEAN DEFAULT FALSE,
  ddt_fattura_id UUID REFERENCES public.documenti_fiscali(id),

  allegati JSONB DEFAULT '[]',
  pdf_url TEXT,
  note_documento TEXT,
  causale JSONB DEFAULT '[]',
  note_interne TEXT,

  importo_pagato DECIMAL(15,2) DEFAULT 0,
  pagato_at TIMESTAMPTZ,

  data_validita DATE,
  probabilita_chiusura INTEGER DEFAULT 50,
  testo_intro TEXT,
  testo_conclusivo TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_numero_tipo_anno_company UNIQUE (company_id, tipo, numero, anno)
);
