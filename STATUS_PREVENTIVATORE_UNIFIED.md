# STATUS — Sprint Preventivatore Unificato

**Ultima sessione**: 2026-04-20
**Branch**: feat/preventivatore-unificato
**Step corrente**: 1 (in corso)

## Completato
- [x] Step 1 — Feature flag & bootstrap
- [ ] Step 2 — useCatalogCategories
- [ ] Step 3 — Migration posa_linked + parent_item_id
- [ ] Step 4 — useCatalogItems
- [ ] Step 5 — CategoryGrid
- [ ] Step 6 — ProductPicker
- [ ] Step 7 — ProductConfigurator (Family+Article)
- [ ] Step 8 — Integrazione QuoteBuilder
- [ ] Step 9 — Posa linked logic
- [ ] Step 10 — Settings catalog toggle
- [ ] Step 11 — Test E2E

## Blocker attivi
Nessuno.

## Decisioni prese in sessione
- [2026-04-20] `quote_items.parent_item_id` esiste già nello schema: Step 3 riduce al solo `posa_linked` su `article_families` / `article_templates` + index su `parent_item_id` se mancante.
- [2026-04-20] `listino_categorie` NON ha colonna `attiva`: il filtro dell'hook `useCatalogCategories` lavora solo sul `total > 0`.
- [2026-04-20] Feature flag `PREVENTIVATORE_UNIFIED_V1` letto da env `VITE_FF_*` in OR con `company.feature_flags` (se presente).
- [2026-04-20] `articoli_native` (tabella per fatturazione) ≠ `article_templates` (catalogo listino): il Preventivatore usa `article_templates`.
- [2026-04-20] TypeScript STRICT zero `any`: tutti i nuovi file applicano la regola §8 del masterprompt SuperAdmin v2.

## Prossima sessione parte da
Step 2 — creazione `src/hooks/useCatalogCategories.ts`.
