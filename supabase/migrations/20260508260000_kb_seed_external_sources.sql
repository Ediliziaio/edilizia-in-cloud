-- ═══════════════════════════════════════════════════════════════════════════
-- SEED — Fonti esterne canoniche italiane per auto-sync KB
-- -----------------------------------------------------------------------
-- Sources prioritarie:
--   • Agenzia Entrate: aliquote IVA + codici tributo F24
--   • Inps:            contributi CCNL edilizia (pagina edilizia)
--   • Inail:           tariffe per attività edili
--   • Gazzetta Ufficiale: bonus edilizi (RSS news)
--
-- NB: gli URL e i selettori sono "best effort" basati sulla struttura
-- attuale dei siti. Se un sito cambia layout, il sync segnerà errore
-- e il super_admin riceve drift_severity='critical' dopo 3 errori
-- consecutivi → deve aggiornare scrape_config dalla UI.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

INSERT INTO public.ai_kb_external_sources (
  name, description, url, scrape_strategy, scrape_config, frequency_hours,
  target_language, target_scope, target_category_path
)
VALUES
  (
    'Agenzia Entrate — Aliquote IVA',
    'Pagina ufficiale aliquote IVA in Italia (4%, 5%, 10%, 22%, casi particolari edilizia).',
    'https://www.agenziaentrate.gov.it/portale/web/guest/schede/agevolazioni/aliquote-iva-agevolata',
    'http_selector',
    jsonb_build_object('selector', 'main', 'title', 'Aliquote IVA — Agenzia Entrate'),
    168,
    'it', 'universal', 'fiscale/iva/aliquote'
  ),
  (
    'Agenzia Entrate — Codici Tributo F24',
    'Tabella codici tributo per modello F24 (aggiornata dall''Agenzia delle Entrate).',
    'https://www.agenziaentrate.gov.it/portale/web/guest/schede/pagamenti/f24-codici-tributo',
    'http_selector',
    jsonb_build_object('selector', 'main', 'title', 'Codici Tributo F24 — Agenzia Entrate'),
    168,
    'it', 'universal', 'fiscale/f24/codici_tributo'
  ),
  (
    'Inps — Contributi CCNL Edilizia',
    'Pagina Inps con aliquote contributive per il settore edile.',
    'https://www.inps.it/it/it/dettaglio-scheda.schede-servizio-strumento.schede-servizi.50057.contributi-edilizia.html',
    'http_selector',
    jsonb_build_object('selector', 'main', 'title', 'Contributi Edilizia — Inps'),
    168,
    'it', 'universal', 'hr/ccnl_edilizia/contributi'
  ),
  (
    'Inail — Tariffe Premi Edilizia',
    'Tariffe Inail per attività del settore costruzioni.',
    'https://www.inail.it/cs/internet/atti-e-documenti/note-e-provvedimenti/tariffe-dei-premi.html',
    'http_selector',
    jsonb_build_object('selector', 'main', 'title', 'Tariffe Inail — Edilizia'),
    720, -- mensile, cambiano raramente
    'it', 'universal', 'sicurezza/inail/tariffe'
  ),
  (
    'Gazzetta Ufficiale — Bonus Edilizi RSS',
    'Feed RSS della Gazzetta Ufficiale per decreti e leggi su bonus edilizi.',
    'https://www.gazzettaufficiale.it/rss/serie_generale.xml',
    'rss',
    jsonb_build_object('max_items', 20, 'fields', jsonb_build_array('title','description','pubDate','link'),
                      'title', 'Gazzetta Ufficiale — Serie Generale (ultime 20 voci)'),
    24,
    'it', 'universal', 'normativa/gazzetta_ufficiale/serie_generale'
  )
ON CONFLICT DO NOTHING;

COMMIT;
