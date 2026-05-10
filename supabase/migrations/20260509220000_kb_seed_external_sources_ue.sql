-- ═══════════════════════════════════════════════════════════════════════════
-- MP-COMP-02 — Espansione fonti normative continue (UE + ANAC + UNI)
-- ─────────────────────────────────────────────────────────────────────────
-- Aggiunge 5 fonti normative mancanti al seed iniziale (che copriva solo
-- agenzie italiane). Coverage post-seed:
--
--   IT:  Agenzia Entrate (IVA + F24), Inps, Inail, Gazzetta Ufficiale RSS
--   UE:  EUR-Lex (atti UE recenti), Gazzetta UE (OJ EU)
--   APP: ANAC (delibere appalti pubblici)
--   TEC: UNI (norme tecniche edili — pagina news)
--   SIC: ENEA (efficienza energetica edilizia)
--
-- Tutte le fonti sono pubbliche e scaricabili senza auth.
-- Frequenze tarate sulla velocità di update reale di ogni fonte.
-- ═══════════════════════════════════════════════════════════════════════════

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
    72, -- ogni 3 giorni
    'it', 'universal', 'normativa/ue/eur_lex'
  ),
  (
    'Gazzetta UE — Serie L (legislazione)',
    'Feed RSS della Gazzetta Ufficiale dell''Unione Europea, serie L (legislazione vincolante).',
    'https://eur-lex.europa.eu/oj/direct-access.html?locale=it',
    'http_selector',
    jsonb_build_object('selector', 'main', 'title', 'Gazzetta UE — Serie L Legislazione'),
    24, -- daily
    'it', 'universal', 'normativa/ue/gazzetta_oj_l'
  ),

  -- ─── ANAC (Autorità Nazionale Anticorruzione, gestisce appalti pubblici) ─
  (
    'ANAC — Atti Presidente / Delibere recenti',
    'Pagina con gli atti più recenti del Presidente ANAC (impatto diretto su gare e appalti).',
    'https://www.anticorruzione.it/-/atti-del-presidente',
    'http_selector',
    jsonb_build_object('selector', 'main', 'title', 'ANAC — Atti del Presidente'),
    168, -- settimanale
    'it', 'universal', 'normativa/anac/atti_presidente'
  ),

  -- ─── UNI (Ente Nazionale Italiano di Unificazione) ───────────────────────
  (
    'UNI — News norme tecniche edilizia',
    'News pubblicate da UNI sulle norme tecniche del settore costruzioni (UNI EN 1090, UNI EN ISO, ecc.)',
    'https://www.uni.com/index.php?option=com_news&view=elenconews&Itemid=2566',
    'http_selector',
    jsonb_build_object('selector', 'main', 'title', 'UNI — News Costruzioni'),
    168, -- settimanale (le norme cambiano lentamente)
    'it', 'universal', 'tecnica/uni/news_costruzioni'
  ),

  -- ─── ENEA (Agenzia Nazionale Efficienza Energetica) ─────────────────────
  (
    'ENEA — Detrazioni Ecobonus / Sismabonus',
    'Pagina ENEA con aggiornamenti su Ecobonus, Sismabonus e detrazioni edilizie.',
    'https://www.efficienzaenergetica.enea.it/detrazioni-fiscali.html',
    'http_selector',
    jsonb_build_object('selector', 'main', 'title', 'ENEA — Detrazioni Edilizie'),
    168, -- settimanale
    'it', 'universal', 'fiscale/detrazioni/ecobonus_sismabonus'
  )
ON CONFLICT DO NOTHING;

-- Verifica seed (output via NOTICE)
DO $$
DECLARE
  total_count INT;
  by_category jsonb;
BEGIN
  SELECT COUNT(*)::int INTO total_count FROM public.ai_kb_external_sources;
  SELECT jsonb_object_agg(
    split_part(target_category_path, '/', 1),
    cnt
  ) INTO by_category
  FROM (
    SELECT split_part(target_category_path, '/', 1) AS cat, COUNT(*)::int AS cnt
    FROM public.ai_kb_external_sources
    GROUP BY split_part(target_category_path, '/', 1)
  ) g;
  RAISE NOTICE '[kb_external_sources] Totale fonti: % | Per categoria root: %', total_count, by_category;
END $$;

COMMIT;
