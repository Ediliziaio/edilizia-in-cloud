-- MP-preventivi-v2 — Impostazioni PDF per-quote + ampliamento flag.
--
-- Aggiunge colonne su `quotes` per persistere override PDF a livello
-- singolo preventivo. I valori di default provengono comunque da
-- `preventivo_impostazioni` (company-level), ma l'admin puo` override-ar-li
-- per singolo quote nel builder.
--
-- Aggiunge nuovi flag che ampliano il dettaglio renderizzato nel PDF
-- (misure, attributi, note cliente, condizioni, watermark).

BEGIN;

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS pdf_mostra_prezzi_per_riga BOOLEAN,
  ADD COLUMN IF NOT EXISTS pdf_mostra_solo_totale BOOLEAN,
  ADD COLUMN IF NOT EXISTS pdf_mostra_sconti BOOLEAN,
  ADD COLUMN IF NOT EXISTS pdf_mostra_immagini BOOLEAN,
  ADD COLUMN IF NOT EXISTS pdf_includi_schede_tecniche BOOLEAN,
  ADD COLUMN IF NOT EXISTS pdf_mostra_misure BOOLEAN,
  ADD COLUMN IF NOT EXISTS pdf_mostra_attributi BOOLEAN,
  ADD COLUMN IF NOT EXISTS pdf_mostra_note_cliente BOOLEAN,
  ADD COLUMN IF NOT EXISTS pdf_mostra_condizioni BOOLEAN,
  ADD COLUMN IF NOT EXISTS pdf_watermark_text TEXT,
  ADD COLUMN IF NOT EXISTS pdf_copia_destinatario TEXT;

-- Estendi anche preventivo_impostazioni (company-level default) con i nuovi flag.
ALTER TABLE public.preventivo_impostazioni
  ADD COLUMN IF NOT EXISTS pdf_mostra_misure BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS pdf_mostra_attributi BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS pdf_mostra_note_cliente BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS pdf_mostra_condizioni BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS pdf_watermark_text TEXT,
  ADD COLUMN IF NOT EXISTS pdf_copia_destinatario TEXT DEFAULT 'cliente';

COMMENT ON COLUMN public.quotes.pdf_mostra_misure IS
  'Mostra misure L x H mm sotto il nome riga (se presenti). Override di preventivo_impostazioni.';
COMMENT ON COLUMN public.quotes.pdf_mostra_attributi IS
  'Mostra attributi/assi (es. Colore: Bianco). Override per-quote.';
COMMENT ON COLUMN public.quotes.pdf_mostra_note_cliente IS
  'Stampa le note visibili al cliente in fondo al PDF.';
COMMENT ON COLUMN public.quotes.pdf_mostra_condizioni IS
  'Stampa terms_and_conditions in pagina finale.';
COMMENT ON COLUMN public.quotes.pdf_watermark_text IS
  'Testo watermark diagonale (es. "BOZZA", "RISERVATO"). Vuoto = no watermark.';
COMMENT ON COLUMN public.quotes.pdf_copia_destinatario IS
  'Etichetta copia: "cliente" | "archivio" | "commerciale" | NULL.';

COMMIT;
