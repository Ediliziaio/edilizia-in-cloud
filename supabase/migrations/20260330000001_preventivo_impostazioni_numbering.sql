-- T5: Numerazione preventivi con formato personalizzabile
-- T3: Condizioni pagamento/consegna/banca per quote_templates

ALTER TABLE preventivo_impostazioni
  ADD COLUMN IF NOT EXISTS numero_prefisso TEXT DEFAULT 'OFF',
  ADD COLUMN IF NOT EXISTS numero_formato  TEXT DEFAULT '{PREFIX}-{YYYY}-{NNN}';

ALTER TABLE quote_templates
  ADD COLUMN IF NOT EXISTS payment_terms_text  TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS delivery_terms_text TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS bank_details        TEXT DEFAULT '';

-- Colonna firma digitale su quotes (se non applicata da migrazione precedente)
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS firma_digitale_abilitata BOOLEAN DEFAULT true;

-- Colonna template_layout_override su quotes
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS template_layout_override TEXT DEFAULT NULL;

-- Valori di default per template esistenti
UPDATE quote_templates
SET
  payment_terms_text  = 'Acconto del 30% alla firma del contratto. Saldo alla consegna.',
  delivery_terms_text = '3-4 settimane dalla conferma ordine.'
WHERE payment_terms_text IS NULL OR payment_terms_text = '';
