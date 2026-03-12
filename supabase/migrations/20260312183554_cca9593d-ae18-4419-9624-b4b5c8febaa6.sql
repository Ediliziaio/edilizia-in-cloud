
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

-- ============================================================
-- ARTICOLI / LISTINO
-- ============================================================
CREATE TABLE IF NOT EXISTS public.articoli_native (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  codice TEXT,
  descrizione TEXT NOT NULL,
  descrizione_estesa TEXT,
  unita_misura TEXT DEFAULT 'pz',

  prezzo_vendita DECIMAL(15,4) NOT NULL DEFAULT 0,
  prezzo_acquisto DECIMAL(15,4),

  aliquota_iva TEXT NOT NULL DEFAULT '22',
  natura_iva TEXT,

  categoria TEXT,
  attivo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

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

-- ============================================================
-- MOVIMENTI CASSA
-- ============================================================
CREATE TABLE IF NOT EXISTS public.movimenti_cassa_native (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  documento_id UUID REFERENCES public.documenti_fiscali(id),

  tipo TEXT NOT NULL CHECK (tipo IN ('incasso','pagamento','storno','rettifica')),
  data_movimento DATE NOT NULL DEFAULT CURRENT_DATE,
  importo DECIMAL(15,2) NOT NULL,
  metodo TEXT,
  riferimento TEXT,
  note TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SDI LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sdi_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  documento_id UUID REFERENCES public.documenti_fiscali(id),

  evento TEXT NOT NULL,
  sdi_id TEXT,
  tipo_notifica TEXT,
  messaggio TEXT,
  errori JSONB DEFAULT '[]',
  xml_content TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PERFORMANCE INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_documenti_company ON public.documenti_fiscali(company_id);
CREATE INDEX IF NOT EXISTS idx_documenti_tipo ON public.documenti_fiscali(tipo);
CREATE INDEX IF NOT EXISTS idx_documenti_stato ON public.documenti_fiscali(stato);
CREATE INDEX IF NOT EXISTS idx_documenti_data ON public.documenti_fiscali(data_emissione DESC);
CREATE INDEX IF NOT EXISTS idx_documenti_cliente ON public.documenti_fiscali(anagrafica_id);
CREATE INDEX IF NOT EXISTS idx_documenti_sdi ON public.documenti_fiscali(sdi_id_trasmissione);
CREATE INDEX IF NOT EXISTS idx_anagrafiche_company ON public.anagrafiche_native(company_id);
CREATE INDEX IF NOT EXISTS idx_articoli_company ON public.articoli_native(company_id);
CREATE INDEX IF NOT EXISTS idx_movimenti_company ON public.movimenti_cassa_native(company_id);
CREATE INDEX IF NOT EXISTS idx_movimenti_documento ON public.movimenti_cassa_native(documento_id);

-- ============================================================
-- RLS POLICIES (using get_my_company_id())
-- ============================================================
ALTER TABLE public.anagrafica_azienda ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anagrafiche_native ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.articoli_native ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documenti_fiscali ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimenti_cassa_native ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sdi_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_isolation" ON public.anagrafica_azienda
  FOR ALL USING (company_id = public.get_my_company_id());

CREATE POLICY "company_isolation" ON public.anagrafiche_native
  FOR ALL USING (company_id = public.get_my_company_id());

CREATE POLICY "company_isolation" ON public.articoli_native
  FOR ALL USING (company_id = public.get_my_company_id());

CREATE POLICY "company_isolation" ON public.documenti_fiscali
  FOR ALL USING (company_id = public.get_my_company_id());

CREATE POLICY "company_isolation" ON public.movimenti_cassa_native
  FOR ALL USING (company_id = public.get_my_company_id());

CREATE POLICY "company_isolation" ON public.sdi_log
  FOR ALL USING (company_id = public.get_my_company_id());

-- ============================================================
-- TRIGGER: aggiorna stats anagrafica dopo inserimento fattura
-- ============================================================
CREATE OR REPLACE FUNCTION public.aggiorna_stats_anagrafica_native()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.anagrafica_id IS NOT NULL AND NEW.tipo IN ('fattura','fattura_pa')
     AND NEW.stato NOT IN ('bozza','annullata','stornata') THEN
    UPDATE public.anagrafiche_native SET
      fatturato_totale = (
        SELECT COALESCE(SUM(totale_documento),0)
        FROM public.documenti_fiscali
        WHERE anagrafica_id = NEW.anagrafica_id
        AND tipo IN ('fattura','fattura_pa')
        AND stato NOT IN ('bozza','annullata','stornata')
      ),
      numero_fatture = (
        SELECT COUNT(*) FROM public.documenti_fiscali
        WHERE anagrafica_id = NEW.anagrafica_id
        AND tipo IN ('fattura','fattura_pa')
        AND stato NOT IN ('bozza','annullata','stornata')
      ),
      ultima_fattura_at = NOW()
    WHERE id = NEW.anagrafica_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

CREATE TRIGGER trigger_stats_anagrafica_native
AFTER INSERT OR UPDATE ON public.documenti_fiscali
FOR EACH ROW EXECUTE FUNCTION public.aggiorna_stats_anagrafica_native();

-- ============================================================
-- FUNCTION: genera numero documento progressivo (ATOMIC)
-- ============================================================
CREATE OR REPLACE FUNCTION public.genera_numero_documento_native(
  p_company_id UUID,
  p_tipo TEXT,
  p_anno INTEGER DEFAULT EXTRACT(YEAR FROM NOW())::INTEGER
)
RETURNS TEXT AS $$
DECLARE
  v_prefisso TEXT;
  v_contatore INTEGER;
  v_ana public.anagrafica_azienda%ROWTYPE;
BEGIN
  SELECT * INTO v_ana FROM public.anagrafica_azienda
  WHERE company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Anagrafica azienda non trovata per company_id: %', p_company_id;
  END IF;

  CASE p_tipo
    WHEN 'fattura', 'fattura_pa' THEN
      v_prefisso := COALESCE(v_ana.prefisso_fattura, 'FT');
      UPDATE public.anagrafica_azienda
      SET ultimo_numero_fattura = ultimo_numero_fattura + 1
      WHERE company_id = p_company_id
      RETURNING ultimo_numero_fattura INTO v_contatore;
    WHEN 'nota_credito' THEN
      v_prefisso := COALESCE(v_ana.prefisso_nc, 'NC');
      UPDATE public.anagrafica_azienda
      SET ultimo_numero_nc = ultimo_numero_nc + 1
      WHERE company_id = p_company_id
      RETURNING ultimo_numero_nc INTO v_contatore;
    WHEN 'ddt' THEN
      v_prefisso := COALESCE(v_ana.prefisso_ddt, 'DDT');
      UPDATE public.anagrafica_azienda
      SET ultimo_numero_ddt = ultimo_numero_ddt + 1
      WHERE company_id = p_company_id
      RETURNING ultimo_numero_ddt INTO v_contatore;
    WHEN 'preventivo' THEN
      v_prefisso := COALESCE(v_ana.prefisso_preventivo, 'PRV');
      UPDATE public.anagrafica_azienda
      SET ultimo_numero_preventivo = ultimo_numero_preventivo + 1
      WHERE company_id = p_company_id
      RETURNING ultimo_numero_preventivo INTO v_contatore;
    ELSE
      v_prefisso := 'DOC';
      v_contatore := 1;
  END CASE;

  RETURN v_prefisso || '-' || p_anno || '-' || LPAD(v_contatore::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql
SET search_path = public;
