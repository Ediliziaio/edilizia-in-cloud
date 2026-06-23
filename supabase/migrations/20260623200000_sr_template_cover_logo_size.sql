-- Dimensione (scala %) del logo in copertina del template PDF preventivo serramenti.
-- NULL = 100% (dimensione base hardcoded nel PDF). Range UI consigliato 60–160.
alter table public.sr_template_pdf
  add column if not exists pdf_cover_logo_size integer;
