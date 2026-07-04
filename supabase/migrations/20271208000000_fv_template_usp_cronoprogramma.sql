-- FV template PDF: USP (punti di forza) + cronoprogramma personalizzabile.
-- Stessi shape jsonb degli altri verticali:
--   usp            = [{titolo, descrizione}]
--   cronoprogramma = [{fase, durata, descrizione}]
ALTER TABLE public.fv_template_pdf
  ADD COLUMN IF NOT EXISTS usp jsonb,
  ADD COLUMN IF NOT EXISTS cronoprogramma jsonb;
