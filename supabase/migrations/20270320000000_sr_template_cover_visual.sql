-- Estende la cover (pagina 1 del PDF) per consentire una vera editabilità visuale
-- come la sezione "Copertina" dei template documentali.
--
-- Nuovi campi:
--   pdf_cover_eyebrow      → testo piccolo sopra il titolo (default: "★ La tua proposta personalizzata")
--   pdf_cover_image_url    → URL immagine di sfondo opzionale per la cover
--   pdf_cover_overlay_opacity → opacità overlay scuro sull'immagine (0..100, default 65)
--   pdf_cover_bg_color     → colore solido cover quando non c'è immagine (default #0F2A2E)
--
-- Idempotente.

ALTER TABLE public.sr_template_pdf
  ADD COLUMN IF NOT EXISTS pdf_cover_eyebrow TEXT,
  ADD COLUMN IF NOT EXISTS pdf_cover_image_url TEXT,
  ADD COLUMN IF NOT EXISTS pdf_cover_overlay_opacity SMALLINT,
  ADD COLUMN IF NOT EXISTS pdf_cover_bg_color TEXT;

COMMENT ON COLUMN public.sr_template_pdf.pdf_cover_eyebrow IS
  'Testo "eyebrow" mostrato sopra il titolo della cover. NULL = usa default IT.';
COMMENT ON COLUMN public.sr_template_pdf.pdf_cover_image_url IS
  'Immagine di sfondo opzionale per la cover (signed URL bucket sr-progetti).';
COMMENT ON COLUMN public.sr_template_pdf.pdf_cover_overlay_opacity IS
  'Opacità overlay scuro sopra l''immagine cover (0..100). Default 65.';
COMMENT ON COLUMN public.sr_template_pdf.pdf_cover_bg_color IS
  'Colore di sfondo cover quando non c''è immagine. Default #0F2A2E.';

NOTIFY pgrst, 'reload schema';
