-- Ruolo dedicato per l'area Produttore (portale white-label rivenditori).
-- In migration separata: un nuovo valore enum NON è usabile nella stessa
-- transazione in cui viene aggiunto. Idempotente. NON applicata (modalità locale).
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'produttore_admin';
