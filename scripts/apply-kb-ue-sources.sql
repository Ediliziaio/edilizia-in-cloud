-- ════════════════════════════════════════════════════════════════════════════
-- MP-COMP-02 — Apply seed UE/normative aggiuntivo
-- ────────────────────────────────────────────────────────────────────────────
-- Da incollare nel SQL Editor di Supabase Studio (project rsbrguhkodgnqfomrevo)
-- una sola volta. Aggiunge 5 fonti normative UE/ANAC/UNI/ENEA al seed esistente.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

INSERT INTO public.ai_kb_external_sources (
  name, description, url, scrape_strategy, scrape_config, frequency_hours,
  target_language, target_scope, target_category_path
)
VALUES
  -- ─── UE ──────────────────────────────────────────────────────────────────
  (
    'EUR-Lex — Atti UE recenti edilizia/ambiente',
    'Pagina ricerca EUR-Lex per atti UE pubblicati ultimi 30gg sul tema costruzioni/ambiente.',
    'https://eur-lex.europa.eu/search.html?lang=it&qid=construction&type=quick&scope=EURLEX&sortOneOrder=desc&sortOne=DD',
    'http_selector',
    jsonb_build_object('selector', 'main', 'title', 'EUR-Lex — Atti UE Costruzioni'),
    72,
    'it', 'universal', 'normativa/ue/eur_lex'
  ),
  (
    'Gazzetta UE — Serie L (legislazione)',
    'Feed RSS della Gazzetta Ufficiale dell''Unione Europea, serie L (legislazione vincolante).',
    'https://eur-lex.europa.eu/oj/direct-access.html?locale=it',
    'http_selector',
    jsonb_build_object('selector', 'main', 'title', 'Gazzetta UE — Serie L Legislazione'),
    24,
    'it', 'universal', 'normativa/ue/gazzetta_oj_l'
  ),

  -- ─── ANAC ───────────────────────────────────────────────────────────────
  (
    'ANAC — Atti Presidente / Delibere recenti',
    'Pagina con gli atti più recenti del Presidente ANAC (impatto diretto su gare e appalti).',
    'https://www.anticorruzione.it/-/atti-del-presidente',
    'http_selector',
    jsonb_build_object('selector', 'main', 'title', 'ANAC — Atti del Presidente'),
    168,
    'it', 'universal', 'normativa/anac/atti_presidente'
  ),

  -- ─── UNI ────────────────────────────────────────────────────────────────
  (
    'UNI — News norme tecniche edilizia',
    'News pubblicate da UNI sulle norme tecniche del settore costruzioni (UNI EN 1090, UNI EN ISO, ecc.)',
    'https://www.uni.com/index.php?option=com_news&view=elenconews&Itemid=2566',
    'http_selector',
    jsonb_build_object('selector', 'main', 'title', 'UNI — News Costruzioni'),
    168,
    'it', 'universal', 'tecnica/uni/news_costruzioni'
  ),

  -- ─── ENEA ───────────────────────────────────────────────────────────────
  (
    'ENEA — Detrazioni Ecobonus / Sismabonus',
    'Pagina ENEA con aggiornamenti su Ecobonus, Sismabonus e detrazioni edilizie.',
    'https://www.efficienzaenergetica.enea.it/detrazioni-fiscali.html',
    'http_selector',
    jsonb_build_object('selector', 'main', 'title', 'ENEA — Detrazioni Edilizie'),
    168,
    'it', 'universal', 'fiscale/detrazioni/ecobonus_sismabonus'
  )
ON CONFLICT DO NOTHING;

-- Track migration
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20260509220000', 'kb_seed_external_sources_ue', ARRAY[]::text[])
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- Verifica
SELECT
  COUNT(*) AS total_sources,
  COUNT(*) FILTER (WHERE target_category_path LIKE 'normativa/ue/%') AS ue_sources,
  COUNT(*) FILTER (WHERE target_category_path LIKE 'normativa/anac/%') AS anac_sources,
  COUNT(*) FILTER (WHERE target_category_path LIKE 'tecnica/uni/%') AS uni_sources,
  COUNT(*) FILTER (WHERE target_category_path LIKE 'fiscale/detrazioni/%') AS detrazioni_sources
FROM public.ai_kb_external_sources;
