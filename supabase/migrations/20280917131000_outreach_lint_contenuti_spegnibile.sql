-- Controllo testi del cold: per brand, le regole sul contenuto si possono
-- trasformare in avvisi.
--
-- Il 15/09/2026 il titolare ha scritto da sé le email di Marketing Edile ed
-- Edilizia in Cloud: oggetto «Lavoriamo GRATIS…» (GRATIS voluto, maiuscolo) e
-- testi ben oltre le 120 parole. Con il linter bloccante il dispatcher le
-- avrebbe scartate tutte in silenzio. Con false, parole vietate, parole
-- limitate, frasi da testo generato e lunghezza diventano avvisi; link nei
-- primi contatti, HTML, immagini e caratteri invisibili bloccano comunque.
ALTER TABLE public.outreach_brands
  ADD COLUMN IF NOT EXISTS lint_contenuti_bloccanti boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.outreach_brands.lint_contenuti_bloccanti IS
  'true (default): parole vietate/limitate, frasi da testo generato e lunghezza bloccano l''invio. false: diventano avvisi. Link, HTML, immagini e caratteri invisibili bloccano sempre.';
