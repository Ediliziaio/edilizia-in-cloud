-- ════════════════════════════════════════════════════════════════════════════
-- Cleanup post-refactor 20270513200000 — drop tabelle/RPC inutilizzate
-- ────────────────────────────────────────────────────────────────────────────
-- Dopo aver collassato la gerarchia listino a 2 livelli (macro → articolo),
-- queste risorse non hanno più consumatori nel codice:
--
--   • public.vertical_subcategorie_templates  (tabella seed subcategorie)
--   • public.apply_subcategorie_template(...)  (RPC bulk-insert subcategorie)
--   • public.touch_vertical_subcategorie_templates_updated_at()  (trigger fn)
--
-- Sono state introdotte dalla migration 20270513140000 e dismesse subito
-- con il refactor 20270513200000. Dropping in modo idempotente.
--
-- NOTA: listino_categorie + article_families.categoria_id NON vengono
-- droppate qui — sono ancora consumate da features legacy (settings
-- ArticleCatalog + SettingsMargini per margine target per categoria).
-- Il cleanup completo richiede prima la migrazione di quelle feature
-- o la decisione esplicita di smantellarle.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) RPC bulk-insert subcategorie standard
DROP FUNCTION IF EXISTS public.apply_subcategorie_template(UUID, UUID[]);

-- 2) Tabella template subcategorie (CASCADE drop di indici/policy/trigger)
DROP TABLE IF EXISTS public.vertical_subcategorie_templates CASCADE;

-- 3) Trigger function (orfana dopo il DROP TABLE CASCADE, ma droppata
--    esplicitamente per non lasciare residui nel namespace public)
DROP FUNCTION IF EXISTS public.touch_vertical_subcategorie_templates_updated_at();

NOTIFY pgrst, 'reload schema';
