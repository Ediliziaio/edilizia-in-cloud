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
