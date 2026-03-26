-- ═══════════════════════════════════════════════════════════════
-- PREVENTIVO PRO v2 — Fondamenta DB
-- 8 blocchi indipendenti: se uno fallisce gli altri continuano.
-- Tutte le tabelle e colonne necessarie per il motore costi completo.
--
-- NOTA: item_type (esistente, sempre='product') e item_category (nuovo,
-- valori dettagliati) coesistono. Il nuovo codice usa item_category.
-- ═══════════════════════════════════════════════════════════════

-- ━━━ BLOCCO A: ESTENDI article_templates ━━━
-- Modalità prezzo: IMMUTABILE una volta impostata (il codice applicativo
-- impedisce la modifica dopo il primo utilizzo in un preventivo).
ALTER TABLE public.article_templates
  ADD COLUMN IF NOT EXISTS modalita_prezzo TEXT NOT NULL DEFAULT 'pz'
    CHECK (modalita_prezzo IN ('pz','mq','misura_libera','griglia')),
  ADD COLUMN IF NOT EXISTS prezzo_acquisto_netto NUMERIC(12,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prezzo_vendita NUMERIC(12,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS margine_minimo_percentuale NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sconto_max_cliente_percentuale NUMERIC(5,2) DEFAULT 30,
  ADD COLUMN IF NOT EXISTS immagine_url TEXT,
  ADD COLUMN IF NOT EXISTS pdf_scheda_url TEXT,
  ADD COLUMN IF NOT EXISTS attivo BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS note_interne TEXT,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS custom_field_values JSONB DEFAULT '{}',
  -- Montaggio collegato
  ADD COLUMN IF NOT EXISTS ha_montaggio BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS montaggio_tipo TEXT DEFAULT 'non_applicabile'
    CHECK (montaggio_tipo IN ('incluso','separato','escluso','non_applicabile')),
  -- FK a tariffe_aziendali: colonna aggiunta ora, vincolo aggiunto dopo CREATE TABLE
  ADD COLUMN IF NOT EXISTS montaggio_tariffa_id UUID,
  -- Per modalita=griglia: etichette degli assi della matrice
  ADD COLUMN IF NOT EXISTS griglia_descrizione TEXT,
  ADD COLUMN IF NOT EXISTS griglia_unita_x TEXT DEFAULT 'larghezza_mm',
  ADD COLUMN IF NOT EXISTS griglia_unita_y TEXT DEFAULT 'altezza_mm';

-- ━━━ BLOCCO B: CATEGORIE LISTINO ━━━
-- Creata prima di tariffe_aziendali (nessuna FK verso nuove tabelle)
CREATE TABLE IF NOT EXISTS public.listino_categorie (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  colore TEXT DEFAULT '#6b7280',
  icona TEXT DEFAULT 'Package',
  margine_target_percentuale NUMERIC(5,2) DEFAULT 25,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (company_id, nome)
);
ALTER TABLE public.listino_categorie ENABLE ROW LEVEL SECURITY;
-- Utenti autenticati della stessa azienda (admin e staff)
CREATE POLICY "lcat_company" ON public.listino_categorie FOR ALL
  USING (company_id = public.get_my_company_id());
-- Super admin: accesso completo a tutti i dati
CREATE POLICY "lcat_super_admin" ON public.listino_categorie FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'));
CREATE INDEX IF NOT EXISTS idx_lcat_company ON public.listino_categorie(company_id);

-- ━━━ BLOCCO C: TARIFFE AZIENDALI ━━━
-- Ogni voce è una tariffa applicabile durante la preventivazione.
-- Il cliente NON vede prezzo_costo — vede solo prezzo_vendita nel PDF.
CREATE TABLE IF NOT EXISTS public.tariffe_aziendali (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN (
    'posa',        -- manodopera / montaggio
    'trasporto',   -- trasporto al cantiere
    'tiro_piano',  -- supplemento per piano di installazione
    'smaltimento', -- rimozione materiale vecchio
    'nolo',        -- attrezzatura noleggiata
    'pratica',     -- pratiche burocratiche / permessi
    'altro'
  )),
  nome TEXT NOT NULL,
  descrizione TEXT,
  -- Unità di misura della tariffa
  unita TEXT NOT NULL DEFAULT 'pz' CHECK (unita IN (
    'pz',    -- per pezzo
    'mq',    -- per metro quadro
    'ml',    -- per metro lineare
    'h',     -- per ora
    'piano', -- per piano (tiro al piano)
    'km',    -- per km (trasporto)
    'mc',    -- per metro cubo (smaltimento)
    'fisso'  -- importo fisso per intervento
  )),
  prezzo_costo    NUMERIC(12,4) DEFAULT 0,   -- costo interno (solo admin vede)
  prezzo_vendita  NUMERIC(12,4) DEFAULT 0,   -- prezzo applicato al cliente
  -- A quale categoria di prodotti si applica (NULL = tutte le categorie)
  categoria_prodotto TEXT,
  -- Per tiro_piano: logica a scaglioni
  piano_base              INTEGER       DEFAULT 0,
  prezzo_piano_aggiuntivo NUMERIC(12,4) DEFAULT 0,
  attiva     BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.tariffe_aziendali ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ta_company" ON public.tariffe_aziendali FOR ALL
  USING (company_id = public.get_my_company_id());
CREATE POLICY "ta_super_admin" ON public.tariffe_aziendali FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'));
CREATE INDEX IF NOT EXISTS idx_ta_company ON public.tariffe_aziendali(company_id, tipo);
CREATE INDEX IF NOT EXISTS idx_ta_attiva ON public.tariffe_aziendali(company_id, attiva);

-- FK da article_templates verso tariffe_aziendali (ora esiste)
-- DROP + ADD garantisce idempotenza su ri-applicazioni della migration
ALTER TABLE public.article_templates
  DROP CONSTRAINT IF EXISTS fk_at_montaggio_tariffa;
ALTER TABLE public.article_templates
  ADD CONSTRAINT fk_at_montaggio_tariffa
    FOREIGN KEY (montaggio_tariffa_id)
    REFERENCES public.tariffe_aziendali(id)
    ON DELETE SET NULL
    NOT VALID; -- NOT VALID: salta la verifica delle righe esistenti (tutte NULL)

-- Indice per lookup inverso: "quali prodotti usano questa tariffa di montaggio?"
CREATE INDEX IF NOT EXISTS idx_at_montaggio_tariffa
  ON public.article_templates(montaggio_tariffa_id)
  WHERE montaggio_tariffa_id IS NOT NULL;

-- ━━━ BLOCCO D: GRIGLIA PREZZI ━━━
-- Usata SOLO per prodotti con modalita_prezzo = 'griglia'
-- Ogni riga è una cella della matrice dimensioni → prezzo
CREATE TABLE IF NOT EXISTS public.listino_griglia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  prodotto_id UUID NOT NULL REFERENCES public.article_templates(id) ON DELETE CASCADE,
  -- Dimensioni in mm (interi per evitare problemi float nei confronti)
  valore_x INTEGER NOT NULL,  -- es: larghezza 1000 = 1000mm
  valore_y INTEGER NOT NULL,  -- es: altezza 1200 = 1200mm
  prezzo_vendita  NUMERIC(12,4) NOT NULL,
  prezzo_acquisto NUMERIC(12,4) DEFAULT 0,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (prodotto_id, valore_x, valore_y)
);
ALTER TABLE public.listino_griglia ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lg_company" ON public.listino_griglia FOR ALL
  USING (company_id = public.get_my_company_id());
CREATE POLICY "lg_super_admin" ON public.listino_griglia FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'));
-- Indice primario per lookup griglia (prodotto + dimensioni)
CREATE INDEX IF NOT EXISTS idx_lg_prodotto ON public.listino_griglia(prodotto_id);
-- Indice per ricerca nearest-neighbor (trovaPrezzoGriglia nel hook P03)
CREATE INDEX IF NOT EXISTS idx_lg_prodotto_xy ON public.listino_griglia(prodotto_id, valore_x, valore_y);

-- ━━━ BLOCCO E: IMPOSTAZIONI PREVENTIVO ━━━
-- Una riga per company (UNIQUE company_id). Creata al primo accesso (upsert).
CREATE TABLE IF NOT EXISTS public.preventivo_impostazioni (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  -- Visibilità margini per i commerciali (non admin)
  visibilita_margini TEXT DEFAULT 'nessuno'
    CHECK (visibilita_margini IN ('tutti','nessuno','sopra_soglia','solo_semaforo')),
  soglia_margine_visibile NUMERIC(5,2) DEFAULT 20,
  -- Margini target per categoria (JSONB: {"categoria_nome": percentuale})
  margini_target_categorie JSONB DEFAULT '{}',
  margine_target_default NUMERIC(5,2) DEFAULT 25,
  overhead_percentuale NUMERIC(5,2) DEFAULT 8,  -- spese generali applicate a tutto
  -- Comportamento automatico nel preventivo
  aggiungi_posa_automatica    BOOLEAN DEFAULT true,
  chiedi_piano_installazione  BOOLEAN DEFAULT true,
  chiedi_smaltimento          BOOLEAN DEFAULT true,
  chiedi_trasporto            BOOLEAN DEFAULT false,
  -- Opzioni PDF (override per singolo preventivo possibile in P03)
  pdf_mostra_prezzi_per_riga  BOOLEAN DEFAULT true,
  pdf_mostra_solo_totale      BOOLEAN DEFAULT false,
  pdf_mostra_sconti           BOOLEAN DEFAULT false,
  pdf_mostra_immagini         BOOLEAN DEFAULT true,
  pdf_includi_schede_tecniche BOOLEAN DEFAULT false,
  -- Firma digitale
  firma_digitale_abilitata BOOLEAN DEFAULT true,
  firma_richiede_nome      BOOLEAN DEFAULT true,
  UNIQUE (company_id)
);
ALTER TABLE public.preventivo_impostazioni ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pi_company" ON public.preventivo_impostazioni FOR ALL
  USING (company_id = public.get_my_company_id());
CREATE POLICY "pi_super_admin" ON public.preventivo_impostazioni FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'));

-- ━━━ BLOCCO F: ESTENDI quote_items ━━━
-- item_category: classificazione dettagliata della riga preventivo.
-- Coesiste con item_type (legacy, sempre='product') — il nuovo codice usa item_category.
ALTER TABLE public.quote_items
  ADD COLUMN IF NOT EXISTS item_category TEXT DEFAULT 'prodotto'
    CHECK (item_category IN (
      'prodotto','posa','trasporto','tiro_piano',
      'smaltimento','nolo','pratica','sconto','nota','subtotale'
    )),
  ADD COLUMN IF NOT EXISTS tariffa_id UUID
    REFERENCES public.tariffe_aziendali(id) ON DELETE SET NULL,
  -- parent_item_id: collega righe posa/smaltimento al prodotto padre
  ADD COLUMN IF NOT EXISTS parent_item_id UUID
    REFERENCES public.quote_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS prezzo_acquisto    NUMERIC(12,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overhead_importo   NUMERIC(12,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS margine_percentuale NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mostra_nel_pdf     BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_optional        BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_field_values JSONB DEFAULT '{}',
  -- Per prodotti a griglia: dimensioni inserite dall'utente nel QuoteBuilder
  ADD COLUMN IF NOT EXISTS misura_x INTEGER,  -- larghezza in mm
  ADD COLUMN IF NOT EXISTS misura_y INTEGER;  -- altezza in mm

CREATE INDEX IF NOT EXISTS idx_qi_tariffa
  ON public.quote_items(tariffa_id) WHERE tariffa_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_qi_parent
  ON public.quote_items(parent_item_id) WHERE parent_item_id IS NOT NULL;
-- Indice per raggruppamento per categoria nella vista e nei calcoli
CREATE INDEX IF NOT EXISTS idx_qi_category
  ON public.quote_items(quote_id, item_category);

-- ━━━ BLOCCO G: ESTENDI quotes ━━━
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS tipo_lavoro TEXT,
  ADD COLUMN IF NOT EXISTS indirizzo_lavori TEXT,
  ADD COLUMN IF NOT EXISTS piano_installazione INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS km_cantiere NUMERIC(8,1) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS custom_field_values JSONB DEFAULT '{}',
  -- Totali costo interno — visibili solo agli admin nel QuoteBuilder
  ADD COLUMN IF NOT EXISTS totale_costo_interno    NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS totale_overhead         NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS margine_totale_percentuale NUMERIC(5,2) DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_quotes_tipo
  ON public.quotes(company_id, tipo_lavoro) WHERE tipo_lavoro IS NOT NULL;

-- ━━━ BLOCCO H: VISTA PER ANALISI AI ━━━
-- Usata dal modulo AI analisi preventivi (Prompt 04).
-- security_invoker = true: la RLS delle tabelle sottostanti si applica
-- al chiamante, non al proprietario della vista.
CREATE OR REPLACE VIEW public.v_preventivo_analisi
  WITH (security_invoker = true) AS
SELECT
  q.id                            AS quote_id,
  q.company_id,
  q.quote_number,
  q.status,
  q.tipo_lavoro,
  q.total                         AS ricavo_totale,
  q.totale_costo_interno          AS costo_totale,
  q.totale_overhead               AS overhead,
  q.margine_totale_percentuale    AS margine_pct,
  q.created_at,
  q.signed_at,
  -- Breakdown ricavi per categoria
  SUM(CASE WHEN qi.item_category = 'prodotto' THEN qi.line_total ELSE 0 END) AS ricavo_prodotti,
  SUM(CASE WHEN qi.item_category = 'posa'     THEN qi.line_total ELSE 0 END) AS ricavo_posa,
  -- Breakdown costi per categoria
  SUM(CASE WHEN qi.item_category = 'prodotto'
    THEN COALESCE(qi.prezzo_acquisto, 0) * COALESCE(qi.quantity, 0) ELSE 0 END) AS costo_prodotti,
  SUM(CASE WHEN qi.item_category = 'posa'
    THEN COALESCE(qi.prezzo_acquisto, 0) * COALESCE(qi.quantity, 0) ELSE 0 END) AS costo_posa,
  COUNT(DISTINCT qi.article_template_id)
    FILTER (WHERE qi.article_template_id IS NOT NULL)                          AS num_prodotti_distinti
FROM public.quotes q
LEFT JOIN public.quote_items qi ON qi.quote_id = q.id
-- WHERE ridondante con RLS (security_invoker), ma utile come defense-in-depth
WHERE q.company_id = public.get_my_company_id()
-- GROUP BY su PK: PostgreSQL consente di omettere le altre colonne di q
-- ma le elenchiamo esplicitamente per chiarezza e portabilità
GROUP BY
  q.id,
  q.company_id,
  q.quote_number,
  q.status,
  q.tipo_lavoro,
  q.total,
  q.totale_costo_interno,
  q.totale_overhead,
  q.margine_totale_percentuale,
  q.created_at,
  q.signed_at;

COMMENT ON VIEW public.v_preventivo_analisi IS
  'Vista aggregata preventivi per analisi AI: ricavi, costi e margini disaggregati per categoria item.';
