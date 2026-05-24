-- Allinea fv_template_pdf al modello editor dei serramenti:
-- cover configurabile, pagine PDF riordinabili e copy commerciale per pagina.

ALTER TABLE public.fv_template_pdf
  ADD COLUMN IF NOT EXISTS pdf_cover_hero text,
  ADD COLUMN IF NOT EXISTS pdf_cover_subhero text,
  ADD COLUMN IF NOT EXISTS pdf_cover_subhero_template text,
  ADD COLUMN IF NOT EXISTS pdf_cover_eyebrow text,
  ADD COLUMN IF NOT EXISTS pdf_cover_image_url text,
  ADD COLUMN IF NOT EXISTS pdf_cover_overlay_opacity smallint,
  ADD COLUMN IF NOT EXISTS pdf_cover_bg_color text,
  ADD COLUMN IF NOT EXISTS pdf_cover_text_color text,
  ADD COLUMN IF NOT EXISTS pdf_cover_show_client_card boolean,
  ADD COLUMN IF NOT EXISTS pdf_cover_text_align text
    CHECK (pdf_cover_text_align IS NULL OR pdf_cover_text_align IN ('left', 'center')),
  ADD COLUMN IF NOT EXISTS pdf_cover_logo_position text
    CHECK (
      pdf_cover_logo_position IS NULL
      OR pdf_cover_logo_position IN ('top_left', 'top_right', 'top_center', 'hidden')
    ),
  ADD COLUMN IF NOT EXISTS pdf_pages_order jsonb,
  ADD COLUMN IF NOT EXISTS chi_siamo_titolo text,
  ADD COLUMN IF NOT EXISTS render_disclaimer text,
  ADD COLUMN IF NOT EXISTS percorso_cliente_intro text,
  ADD COLUMN IF NOT EXISTS consulente_descrizione_default text,
  ADD COLUMN IF NOT EXISTS pdf_cta_finale_titolo text,
  ADD COLUMN IF NOT EXISTS pdf_cta_finale_testo text;

COMMENT ON COLUMN public.fv_template_pdf.pdf_cover_hero IS
  'Titolo principale della cover del preventivo fotovoltaico.';
COMMENT ON COLUMN public.fv_template_pdf.pdf_cover_subhero_template IS
  'Sottotitolo dinamico cover FV. Placeholder: {cliente_nome}, {potenza_kwp}, {accumulo_kwh}, {indirizzo}, {comune}, {numero_pannelli}.';
COMMENT ON COLUMN public.fv_template_pdf.pdf_pages_order IS
  'Array JSONB con ordine e visibilita delle pagine PDF FV. La cover resta fissa.';
COMMENT ON COLUMN public.fv_template_pdf.percorso_cliente_intro IS
  'Copy introduttivo della pagina percorso cliente/iter pratiche del PDF FV.';
COMMENT ON COLUMN public.fv_template_pdf.pdf_cta_finale_testo IS
  'Copy personalizzato della pagina CTA/firma finale del PDF FV.';
