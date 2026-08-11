-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Ristrutturazione · migliorie: incentivi con massimale di spesa, calcolatore
-- superfici da vani, computo per ambiente. ADDITIVA/IDEMPOTENTE su tabelle
-- GIA PUBBLICATE (solo ADD COLUMN IF NOT EXISTS -> nessun rischio sui dati esistenti).

ALTER TABLE public.rst_progetti
  ADD COLUMN IF NOT EXISTS massimale_detrazione numeric,
  ADD COLUMN IF NOT EXISTS numero_vani int,
  ADD COLUMN IF NOT EXISTS altezza_media_m numeric;

-- Dimensione "ambiente" (stanza) per il computo: opzionale, NULL = non assegnato.
ALTER TABLE public.rst_computo_voci ADD COLUMN IF NOT EXISTS ambiente text;
