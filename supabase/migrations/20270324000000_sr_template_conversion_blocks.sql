-- Aggiunge a sr_template_pdf i campi per gli elementi di alta conversione
-- (CRO playbook: trust signals + urgency + value stacking + obiezioni anticipate).
--
-- Tutti i campi sono opzionali (l'azienda decide cosa attivare nel PDF):
--   - garanzie: 5 garanzie con icona + titolo + descrizione
--   - urgenza: messaggio scadenza prezzo + early bird sconto
--   - confronto_prima_dopo: tabella numerica serramenti attuali vs nuovi
--   - certificazioni: loghi ISO/CE/UNI/CasaClima
--   - bonus_aggiuntivi: bonus tangibili con valore €
--   - faq_items: domande frequenti con risposte
--   - brand_footer_testo: dati legali azienda
--   - condizioni_legali_testo: T&C contrattuali
--
-- Idempotente.

ALTER TABLE public.sr_template_pdf
  -- Garanzie: array di { icona, titolo, descrizione }
  ADD COLUMN IF NOT EXISTS garanzie JSONB,
  -- Urgenza: messaggio scadenza prezzo + early bird sconto
  ADD COLUMN IF NOT EXISTS urgenza_attiva BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS urgenza_titolo TEXT,
  ADD COLUMN IF NOT EXISTS urgenza_descrizione TEXT,
  ADD COLUMN IF NOT EXISTS early_bird_attivo BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS early_bird_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS early_bird_giorni INTEGER,
  -- Confronto Prima/Dopo numerico
  ADD COLUMN IF NOT EXISTS confronto_attivo BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS confronto_titolo TEXT,
  ADD COLUMN IF NOT EXISTS confronto_righe JSONB,
  -- Certificazioni e marchi qualità
  ADD COLUMN IF NOT EXISTS certificazioni JSONB,
  -- Bonus aggiuntivi
  ADD COLUMN IF NOT EXISTS bonus_aggiuntivi JSONB,
  -- FAQ pagina dedicata
  ADD COLUMN IF NOT EXISTS faq_items JSONB,
  -- Brand legitimacy footer (dati legali)
  ADD COLUMN IF NOT EXISTS brand_footer_attivo BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS brand_footer_testo TEXT,
  -- Condizioni e disclaimer legali
  ADD COLUMN IF NOT EXISTS condizioni_legali_attivo BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS condizioni_legali_testo TEXT;

COMMENT ON COLUMN public.sr_template_pdf.garanzie IS
  'Array { icona, titolo, descrizione } per pagina dedicata "Le nostre garanzie".';
COMMENT ON COLUMN public.sr_template_pdf.urgenza_attiva IS
  'Mostra box urgenza/validità prezzo nel PDF (cover + investimento).';
COMMENT ON COLUMN public.sr_template_pdf.confronto_attivo IS
  'Mostra tabella confronto numerico Prima/Dopo (serramento attuale vs nuovo).';
COMMENT ON COLUMN public.sr_template_pdf.confronto_righe IS
  'Array { parametro, prima, dopo, delta } — righe della tabella confronto.';
COMMENT ON COLUMN public.sr_template_pdf.certificazioni IS
  'Array { nome, logo_url? } — loghi certificazioni mostrate in chi siamo.';
COMMENT ON COLUMN public.sr_template_pdf.bonus_aggiuntivi IS
  'Array { icona, titolo, valore_eur } — bonus regalo per value stacking.';
COMMENT ON COLUMN public.sr_template_pdf.faq_items IS
  'Array { domanda, risposta } per pagina FAQ obiezioni anticipate.';

NOTIFY pgrst, 'reload schema';
