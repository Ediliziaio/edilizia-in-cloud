-- ════════════════════════════════════════════════════════════════════════════
-- QUOTE TEMPLATES — Copertina personalizzata + Termini contrattuali/legali
-- ════════════════════════════════════════════════════════════════════════════
-- Estende quote_templates con:
--   • cover_image_url  text  — immagine copertina personalizzata (separata dal logo)
--   • cover_title text       — titolo principale copertina
--   • cover_subtitle text    — sottotitolo / claim
--   • show_cover_image bool  — flag visibilità copertina
--   • contractual_terms_text text  — termini contrattuali estesi (clausole)
--   • legal_terms_text text  — termini legali (privacy, recesso, foro competente)
--   • show_contractual_terms bool
--   • show_legal_terms bool
--
-- Tutti i campi text supportano merge tag {{cliente.nome}}, {{cliente.piva}},
-- {{cliente.ragione_sociale}}, {{commessa.indirizzo}}, ecc. — la sostituzione
-- avviene lato edge function `generate-quote-pdf` al momento della generazione.
--
-- Additive + idempotente. Bucket `quote-template-assets` (gia' esistente per logo)
-- viene riusato per le cover.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.quote_templates
  ADD COLUMN IF NOT EXISTS cover_image_url text,
  ADD COLUMN IF NOT EXISTS cover_title text,
  ADD COLUMN IF NOT EXISTS cover_subtitle text,
  ADD COLUMN IF NOT EXISTS show_cover_image boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS contractual_terms_text text,
  ADD COLUMN IF NOT EXISTS legal_terms_text text,
  ADD COLUMN IF NOT EXISTS show_contractual_terms boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_legal_terms boolean DEFAULT false;

COMMENT ON COLUMN public.quote_templates.cover_image_url IS
  'Path nel bucket quote-template-assets per la copertina personalizzata. NULL = no cover image.';
COMMENT ON COLUMN public.quote_templates.cover_title IS
  'Titolo grande copertina (es. "Offerta personalizzata"). Supporta merge tag {{cliente.nome}}.';
COMMENT ON COLUMN public.quote_templates.cover_subtitle IS
  'Sottotitolo / claim sotto al titolo. Supporta merge tag.';
COMMENT ON COLUMN public.quote_templates.contractual_terms_text IS
  'Termini contrattuali estesi (clausole specifiche oltre a payment/delivery). Supporta merge tag.';
COMMENT ON COLUMN public.quote_templates.legal_terms_text IS
  'Termini legali (privacy GDPR, diritto di recesso, foro competente). Supporta merge tag.';

-- Vista helper: lista merge tag supportati (per UI auto-complete)
CREATE OR REPLACE VIEW public.v_quote_template_merge_tags AS
SELECT * FROM (VALUES
  ('cliente.nome',             'Nome del cliente (persona fisica)'),
  ('cliente.cognome',           'Cognome del cliente'),
  ('cliente.nome_completo',    'Nome + cognome'),
  ('cliente.email',             'Email cliente'),
  ('cliente.telefono',          'Telefono cliente'),
  ('cliente.codice_fiscale',    'Codice fiscale persona fisica'),
  ('cliente.indirizzo',         'Indirizzo di residenza'),
  ('cliente.cap',               'CAP residenza'),
  ('cliente.citta',             'Città residenza'),
  ('cliente.provincia',         'Provincia residenza'),
  ('cliente.ragione_sociale',  'Ragione sociale (per P.IVA)'),
  ('cliente.partita_iva',      'Partita IVA'),
  ('cliente.sede_legale',      'Sede legale (per P.IVA)'),
  ('cliente.legale_rappresentante', 'Nome legale rappresentante (per P.IVA)'),
  ('cliente.pec',               'PEC aziendale'),
  ('cliente.codice_destinatario', 'Codice destinatario SDI'),
  ('cantiere.indirizzo',        'Indirizzo cantiere/installazione'),
  ('cantiere.citta',             'Città cantiere'),
  ('cantiere.note',              'Note specifiche cantiere'),
  ('preventivo.numero',         'Numero preventivo'),
  ('preventivo.data',            'Data preventivo'),
  ('preventivo.scadenza',       'Data scadenza offerta'),
  ('preventivo.totale',         'Totale offerta'),
  ('preventivo.subtotale',      'Subtotale (imponibile)'),
  ('preventivo.iva',             'Importo IVA'),
  ('azienda.ragione_sociale',  'Ragione sociale tua azienda'),
  ('azienda.partita_iva',      'P.IVA azienda'),
  ('azienda.indirizzo',         'Indirizzo azienda'),
  ('azienda.email',             'Email azienda'),
  ('azienda.telefono',          'Telefono azienda'),
  ('data.oggi',                  'Data odierna'),
  ('data.anno',                  'Anno corrente')
) AS t(tag, descrizione);

GRANT SELECT ON public.v_quote_template_merge_tags TO authenticated;

COMMENT ON VIEW public.v_quote_template_merge_tags IS
  'Lista merge tag supportati nei template preventivo. Usato dall''UI per auto-complete + helper.';
