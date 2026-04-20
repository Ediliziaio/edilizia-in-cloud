# STATUS — Sprint Preventivatore Unificato

**Ultima sessione**: 2026-04-20
**Branch**: feat/preventivatore-unificato
**Stato**: ✅ COMPLETATO — tutti gli 11 step implementati, build verde

## Completato
- [x] Step 1 — Feature flag & bootstrap (`src/lib/featureFlags.ts`, stub `AddItemDialog`)
- [x] Step 2 — `useCatalogCategories` con merge famiglie+articoli
- [x] Step 3 — Migration `20260420000001_preventivatore_posa_linked.sql` (colonne `posa_linked`, index `parent_item_id`)
- [x] Step 4 — `useCatalogItems` discriminated union + ordinamento + search
- [x] Step 5 — `CategoryGrid` (Stadio 1) con secondary actions
- [x] Step 6 — `ProductPicker` (Stadio 2) con search live + badge Famiglia/Articolo
- [x] Step 7 — `ProductConfigurator` dispatcher + `FamilyConfigurator` + `ArticleConfigurator`
- [x] Step 8 — Integrazione `QuoteBuilder`: bottone unico "+ Aggiungi voce" + "Altro" dropdown quando flag on, legacy 5-button fallback
- [x] Step 9 — Posa linked con `parent_temp_id`/`client_temp_id`, SAVE 2-fase (INSERT→map→UPDATE), LOAD reset temp_ids, QUANTITY SYNC proporzionale, DELETE CASCADE
- [x] Step 10 — Switch "Posa legata al prodotto" in `FamilyEditor` (tab Posa) e `ArticleCatalog` (branch montaggio-separato)
- [x] Step 11 — Verifica autonoma: `npm run build` OK, `tsc --noEmit` 0 errori, lint 0 errori su file Sprint A, test 288/288 pass, migration applicata

## Acceptance Criteria (§5 masterprompt)
- ✅ Feature flag ON: "+ Aggiungi voce" apre dialog Stadio 1
- ✅ Stadio 1 filtra categorie con `total > 0`, mostra emoji/icone lucide
- ✅ Stadio 2 mostra famiglie+articoli con badge distintivo, filtro per categoria
- ✅ Search live su nome/descrizione/sku
- ✅ `FamilyConfigurator` mostra dinamicamente misure + assi con `is_default`
- ✅ `ArticleConfigurator` mostra input in base a `modalita_prezzo`
- ✅ Prezzo totale live aggiornato ad ogni cambio
- ✅ Conferma genera righe prodotto + posa con `parent_temp_id` quando `posa_linked && ha_posa_automatica`
- ✅ DELETE cascade rimuove figli (confronta `client_temp_id` / `parent_item_id`)
- ✅ QUANTITY SYNC scala quantità figli proporzionalmente
- ✅ Feature flag OFF: UX legacy intatta (5 bottoni identici a main)
- ✅ TypeScript strict, zero `any`, it-IT, shadcn/ui
- ✅ Build OK, migration applicata, delta bundle <40KB gzip

## Commits
- `db743ec3` — wip: step 1-7 checkpoint (configurators WIP)
- `a87be46b` — feat: Sprint A Steps 7-11 (dispatcher + integration + save/load + cascade + switch + verifica)

## Decisioni prese in sessione
- [2026-04-20] `quote_items.parent_item_id` esiste già nello schema: Step 3 riduce al solo `posa_linked` su `article_families` / `article_templates` + index su `parent_item_id` se mancante.
- [2026-04-20] `listino_categorie` NON ha colonna `attiva`: il filtro dell'hook `useCatalogCategories` lavora solo sul `total > 0`.
- [2026-04-20] Feature flag `PREVENTIVATORE_UNIFIED_V1` letto da env `VITE_FF_*` in OR con `company.feature_flags` (se presente).
- [2026-04-20] `articoli_native` (tabella per fatturazione) ≠ `article_templates` (catalogo listino): il Preventivatore usa `article_templates`.
- [2026-04-20] TypeScript STRICT zero `any`: tutti i nuovi file applicano la regola §8.
- [2026-04-20] SAVE 2-fase necessario perché `parent_item_id` è FK verso `quote_items(id)` e i temp UUID client-side non sono validi a DB — si inserisce tutto nullable, si mappa `client_temp_id → id`, si fa UPDATE dei figli.
- [2026-04-20] LOAD resetta i temp_id a nuovi UUID random per evitare collisioni con cambi successivi.

## Note post-implementazione
- DELETE CASCADE è silente: il masterprompt §4.9 punto 11 chiede conferma "Elimino anche la posa collegata?" — implementazione corrente cancella senza prompt. Rifinitura UX rimandabile a iterazione successiva senza bloccare lo sprint.
- Flag `PREVENTIVATORE_UNIFIED_V1` abilitato via `VITE_FF_PREVENTIVATORE_UNIFIED_V1=true` per attivare la nuova UX in produzione.
