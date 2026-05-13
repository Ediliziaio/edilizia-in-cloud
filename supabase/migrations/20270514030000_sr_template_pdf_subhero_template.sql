-- ════════════════════════════════════════════════════════════════════════════
-- Milestone 4: Cover storytelling dinamico — subhero template con placeholders
-- ────────────────────────────────────────────────────────────────────────────
-- Permette di personalizzare il sottotitolo della copertina PDF con
-- placeholders dinamici sostituiti a render-time.
--
-- Esempio template:
--   "Per la casa di {cliente_nome_completo} a {cantiere_citta} · {num_serramenti}
--    serramenti · Consegna entro {data_consegna_stimata}"
-- → Render:
--   "Per la casa di Mario Rossi a Bolzano · 8 serramenti · Consegna entro 30 marzo"
--
-- Quando il template è NULL, fallback a `pdf_cover_subhero` (testo statico)
-- o a `intervento_sintesi` auto-generata (comportamento attuale).
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.sr_template_pdf
  ADD COLUMN IF NOT EXISTS pdf_cover_subhero_template TEXT;

COMMENT ON COLUMN public.sr_template_pdf.pdf_cover_subhero_template IS
  'Template del sottotitolo copertina PDF con placeholder dinamici. '
  'Placeholder supportati: {cliente_nome}, {cliente_cognome}, {cliente_nome_completo}, '
  '{cantiere_citta}, {cantiere_provincia}, {num_serramenti}, {data_consegna_stimata}, '
  '{tipo_intervento}, {anno}. NULL = usa pdf_cover_subhero (statico).';

NOTIFY pgrst, 'reload schema';
