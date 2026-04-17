# STATUS — Preventivatore Verticalizzato Serramentisti

File di tracciamento multi-sessione. Aggiornato a ogni commit di sotto-fase.

**Branch:** `feat/preventivatore-serramentisti`
**Start date:** 2026-04-17

---

## Progress tracker

| Fase | Stato | Sotto-fasi | Commit | Note |
|---|---|---|---|---|
| FASE 0 — Analisi preliminare | 🟢 DONE | Analisi + 2 MD | `325c94db` | Commit gate rispettato |
| FASE 1 — Vertical + onboarding | 🟢 DONE | 1.1 migration + 1.2 hook + 1.3 page + 1.4 routing/guard | `146f54df` | Decisione: nuova colonna TEXT `vertical` coesistente con `sector` (9 valori vs 8, dominio differente). Masterprompt spec prevale su FASE 0 |
| FASE 2 — Data model famiglie/assi | 🟡 IN CORSO | 2.1 migration + 2.2 types | *(pending `feat(serramenti): fase 2 data model famiglie assi maggiorazioni`)* | 3 tabelle + ALTER listino_griglia (drop NOT NULL prodotto_id) + ALTER article_templates |
| FASE 3 — Seed categorie + installer | 🟢 DONE | 3.1 tables + 3.2 seed + 3.3 edge fn + 3.4 dialog UI | `cccd5f5c` | 11 cat + 38 famiglie template, idempotent Edge Function |
| FASE 4 — Editor UI famiglie/assi | 🟢 DONE | 4.1–4.7 hook + catalogo + editor + routing | `674015fc` | 5-step editor, assi+valori CRUD, griglia L×H, price preview live |
| FASE 5 — Motore calcolo prezzo | 🟢 DONE | 5.1 useFamilyPricing hook + 5.2 unit tests | `0b8d4af7` | 16 test vitest, funzione pura + nearestGrid Manhattan |
| FASE 6 — Manodopera UM flessibili | 🟢 DONE | 6.1 migration + 6.2 edge fn + 6.3 UI + 6.4 calcolo | `a228d0a4` | 10 UM canoniche, costo_interno separato, semaforo live |
| FASE 7 — Fix 3 P0 bug | 🟢 DONE | 7.1 unit_price mq/griglia + 7.3 sconti/bundle banner + 7.4 tests | `34dbb86f` | 7.2 LIMIT 60 skip: delegato a FASE 8 (pgvector retrieval) |
| FASE 8 — AI + pgvector | 🟢 DONE | 8.1 migration vector+RPC + 8.2 edge fn genera-embeddings + 8.3 ai-v2 retrieval + 8.4 UI btn | `00b6f702` | pgvector 0.8.0 disponibile, migration da applicare. Fallback se OPENAI_API_KEY assente |
| FASE 9 — Wizard serramentista | ⚪ TODO | — | — | Single source of truth = `items[]` QB |
| FASE 10 — Bundle + suggerimenti | ⚪ TODO | — | — | Reuse `bundle_prodotti` |
| FASE 11 — Testing E2E + QA | ⚪ TODO | 3 scenari E2E | — | Playwright |

Legenda: ⚪ TODO 🟡 IN CORSO 🟢 DONE 🔴 BLOCCATO

---

## Vincoli ambientali da verificare prima di FASE 8

- [ ] **pgvector extension:** NON presente nelle migration attuali. Prima di FASE 8 eseguire via MCP Supabase `SELECT * FROM pg_available_extensions WHERE name='vector';` per confermare disponibilità.
- [ ] **OPENAI_API_KEY:** da verificare nelle env vars delle Edge Functions (serve per `text-embedding-3-small`). Check via dashboard Supabase → Edge Functions → Secrets.
- [ ] **Costi embeddings:** stima preliminare OpenAI. Con ~500 prodotti × ~50 token/prodotto × $0.02/1M tokens = trascurabile. Ricalcolo se azienda >5000 articoli.

---

## Decisioni architetturali (già prese in FASE 0)

1. **Vertical marker:** usare `companies.sector` ENUM esistente (`'serramenti'`). Niente nuova colonna `vertical`. Se serve granularità: `ALTER TYPE public.company_sector ADD VALUE 'serramentisti'`.
2. **`article_templates` coesistenza:** non si elimina. Si aggiunge `family_id UUID NULL`. Legacy rimane funzionante.
3. **Precedenza modalità prezzo:** `quote_item.family_id NOT NULL` → `article_families.modalita_prezzo_default`; altrimenti → `article_templates.modalita_prezzo` legacy.
4. **RLS obbligatoria** su tutte le nuove tabelle con policy `company_id = current_company_id()` (helper esistente).
5. **Niente `any`:** narrowing `unknown` su payload AI e JSONB (`valori_assi`).

---

## Log sotto-fasi (aggiornato ad ogni commit)

### FASE 0 — 2026-04-17
- ✅ Branch creato: `feat/preventivatore-serramentisti`
- ✅ Analisi completata: `FASE0_PREVENTIVATORE_SERRAMENTI_ANALISI.md`
- ✅ 13 tabelle inventariate con colonne chiave
- ✅ 3 bug P0 localizzati con file:riga:
  - P0.1 `ai-genera-preventivo-v2/index.ts:161-188` (unit_price flat per mq/griglia)
  - P0.2 `ai-genera-preventivo-v2/index.ts:47,55,192` (LIMIT 60 hardcoded)
  - P0.3 `src/pages/azienda/marketing/QuoteBuilder.tsx` (0 uso `calcolaScontoQuantita` / 0 suggerimenti bundle)
- ✅ 2 conflitti UX da tenere sotto osservazione: `MargineSemaforo` duplicato, ENUM `company_sector`
- ✅ pgvector: confermata assenza (da installare in FASE 8)
- ✅ Commit gate `chore: phase 0 analysis preventivatore verticalizzato serramenti` (`325c94db`)

### FASE 1 — 2026-04-17
- ✅ 1.1 Migration `20260917000001_serramenti_01_vertical_companies.sql`:
  - `vertical TEXT NULL` + CHECK constraint 9 valori ammessi
  - `verticals_secondari TEXT[] NOT NULL DEFAULT '{}'` (multi-vertical futuro)
  - `onboarding_vertical_completed BOOLEAN NOT NULL DEFAULT false`
  - UPDATE aziende esistenti → `generico` + onboarding completato (non forzare tenant live)
  - Indice parziale `idx_companies_vertical` per filtri dashboards/stats
- ✅ 1.2 Hook `useVertical()` in `src/hooks/useVertical.ts`:
  - Type `Vertical` (9 valori), `VERTICAL_META` (label/icon/enabled/description), `VERTICAL_ORDER` 3x3
  - Fallback `"generico"` con narrowing `unknown → Vertical` via type guard `isVertical`
  - Fonte dati: `effectiveCompany` (impersonation + multi-company aware)
- ✅ 1.3 Page `src/pages/azienda/onboarding/OnboardingVertical.tsx`:
  - Griglia 3x3 Cards con icone lucide, aria-pressed, keyboard nav (Enter/Space)
  - 2 card attive (serramentista, generico) + 7 "Prossimamente" disabled
  - Mutation update `companies.vertical` + `onboarding_vertical_completed=true` → `refreshAuth()` + `navigate("/azienda", { replace: true })`
  - "Salta per ora" di default salva `generico`
  - `captureVelocityError` su fallimento save
- ✅ 1.4 Routing + guard:
  - `companyRoutes.tsx`: lazy import + `<Route path="onboarding/vertical" />` dentro CompanyLayout
  - `CompanyLayout.tsx`: `useEffect` redirect se `onboarding_vertical_completed === false` (escluso impersonation + la stessa pagina onboarding)
- ✅ Decisione architettonica documentata nell'header della migration: coesistenza `sector` (enum legacy) + `vertical` (text nuovo). NO riuso `company_sector` perché dominio differente (9 valori incluso `tende_da_sole`/`caldaie`/`clima`).
- ✅ Types estesi in `src/types/auth.ts`: `CompanyVertical` type + 3 campi in `Company` interface.
- ✅ `tsc --noEmit` → 0 errori.
- ✅ Commit `feat(serramenti): fase 1 vertical + onboarding azienda` (`146f54df`)

### FASE 2 — 2026-04-17
- ✅ 2.1 Migration `20260917000002_serramenti_02_families_axes.sql`:
  - `article_families` (PK + company_id + vertical + categoria_id FK listino_categorie + modalità prezzo + griglia labels + posa default + sort/attivo + trigger updated_at)
  - `article_family_axes` (PK + family_id FK + codice UNIQUE(family_id,codice) + tipo discrete/boolean)
  - `article_family_axis_values` (PK + axis_id FK + valore UNIQUE(axis_id,valore) + maggiorazione_tipo 6 valori)
  - ALTER `listino_griglia` ADD family_id + DROP NOT NULL prodotto_id + CHECK prodotto_or_family
  - ALTER `article_templates` ADD family_id (ON DELETE SET NULL per preservare catalogo legacy)
  - RLS: policy company (`get_my_company_id()`) + super_admin (`has_role`) coerenti con pattern esistente
  - Tutte le DDL idempotenti (`IF NOT EXISTS` / `DO blocks` sui constraint/policy)
- ✅ 2.2 Types TypeScript `src/types/articleFamily.ts`:
  - `ModalitaPrezzoBase`, `MaggiorazioneTipo`, `AxisTipo`
  - Interfaces `ArticleFamily`, `FamilyAxis`, `AxisValue`, `FamilyWithAxes`
  - `AxisSelection = Record<string, string>` per JSONB `valori_assi` lato quote_item
  - JSONB tipizzati come `Record<string, unknown>` (no `any`)
- ✅ Decisione documentata: drop NOT NULL su `listino_griglia.prodotto_id` necessario per rispettare DoD "griglia può avere righe con solo family_id". Il CHECK `prodotto_or_family` preserva l'invariante.
- ✅ `tsc --noEmit` → 0 errori.
- ✅ Commit `feat(serramenti): fase 2 data model famiglie assi maggiorazioni` (`2eb437b4`)

### FASE 3 — 2026-04-17
- ✅ 3.1 Migration `20260917000003_serramenti_03_seed_tables.sql`:
  - `vertical_category_templates` (id, vertical, nome, descrizione, icona, modalita_prezzo_suggerita CHECK, margine_target_percentuale, sort_order, attivo, UNIQUE(vertical,nome) per idempotenza seed)
  - `vertical_family_templates` (id, vertical, categoria_template_id FK ON DELETE SET NULL, nome, descrizione, modalita_prezzo_base CHECK, unit_of_measure, griglia labels, `assi_default JSONB`, UNIQUE(vertical,nome))
  - RLS: `*_read` per authenticated con `attivo=true`; `*_admin` gate via `public.has_role(auth.uid(),'super_admin')` (spec originale usava `current_user_role()` che non esiste nel codebase)
  - Policy create via `DO` blocks idempotenti
- ✅ 3.2 Migration `20260917000004_serramenti_04_seed_data_serramentista.sql`:
  - 11 categorie (Finestre, Porte finestre, Scorrevoli, Persiane, Tapparelle, Zanzariere, Cassonetti, Portoncini blindati, Vetrate, Inferriate, Accessori) con icone lucide + modalità suggerita + margine target
  - 38 famiglie template da Appendice A (Finestre 6, Porte finestre 3, Scorrevoli 4, Persiane 5, Tapparelle 3, Zanzariere 4, Cassonetti 4, Portoncini 3, Vetrate 3, Inferriate 3) — copre e supera DoD "30+ famiglie"
  - Ogni famiglia ha 3-6 assi con 2-5 valori; un valore per asse marcato `is_default`
  - Dollar-quoting `$json$...$json$::jsonb` per assi_default (76 tag = 38 pair)
  - Tutte le INSERT con `ON CONFLICT (vertical, nome) DO NOTHING` → rieseguibile in qualsiasi ambiente
- ✅ 3.3 Edge Function `supabase/functions/installa-template-vertical/index.ts`:
  - Input: `{ company_id, vertical }`; auth via JWT Bearer; verifica permessi (super_admin via `user_roles` OR `profiles.company_id` match OR `multi_company_access` OR `active_impersonations`)
  - Client service-role per bypassare RLS durante il copy
  - Dedup per nome: categorie (`listino_categorie` UNIQUE(company_id,nome)) + famiglie (`article_families.nome`) → re-run = 0 righe create
  - Espansione `assi_default` JSONB → `article_family_axes` + `article_family_axis_values` (`maggiorazione_tipo='none'`, `valore=0`)
  - Type guard `isAxisTemplateArray(unknown)` per narrowing JSONB (no `any`)
  - Return counts: `{ categorie_create, famiglie_create, assi_create, valori_create }`
- ✅ 3.4 Dialog UI in `OnboardingVertical.tsx`:
  - Dopo save di vertical `serramentista`: apre `<Dialog>` "Vuoi installare il catalogo di esempio serramenti?" con bottoni "Installa" / "Parti da zero"
  - Mutation `installCatalog` → `supabase.functions.invoke('installa-template-vertical')` → toast success con counts + navigate a `/azienda`
  - "Parti da zero" chiude dialog + navigate senza installare
  - Dialog non chiudibile durante `installCatalog.isPending`
  - `captureVelocityError` su fallimento
  - Non-serramentista (generico) → nessun dialog, navigate diretto
- ✅ 3.5 DoD verification:
  - ✅ 2 tabelle template create
  - ✅ 11 categorie + 38 famiglie seed (supera target 30+)
  - ✅ Edge Function idempotente (re-run 0 righe create)
  - ✅ Listino post-install: strutturato ma prezzi a zero (espliciti 0 in `article_families.prezzo_base_*` + `article_family_axis_values.maggiorazione_valore=0`)
- ✅ `tsc --noEmit` → 0 errori.
- ✅ Commit `feat(serramenti): fase 3 seed catalogo serramentista` (`cccd5f5c`)

### FASE 4 — 2026-04-17
- ✅ 4.1 Hooks:
  - `src/hooks/useFamilies.ts`: `useFamilies()` → lista famiglie con nested select `axes:article_family_axes(*, values:article_family_axis_values(*))`, ordinamento client-side per sort_order. `useFamily(id)` per il dettaglio.
  - `src/hooks/useFamilyMutations.ts`: CRUD completo su famiglia/assi/valori + `duplicateFamily` (clone profondo). `deleteFamily` è soft-delete (`attivo=false`) per preservare quote_items storici. Ogni mutazione invalida `queryKeys.articleFamilies` e log errori via `captureVelocityError`.
  - `queryKeys.ts` esteso con `articleFamilies { all, list, detail, grid }`.
- ✅ 4.2 `src/components/listino/FamilyCatalog.tsx`:
  - Lista card raggruppate per categoria, ricerca per nome/descrizione, CTA "Nuova famiglia"
  - Duplica via Dialog (prompt nuovo nome) + Soft-delete via AlertDialog
- ✅ 4.3 `src/components/listino/FamilyEditor.tsx`: 5-step Tabs
  - Step 1 Dati base (nome, categoria, descrizione, modalità prezzo 4 card radio, UM, IVA 4/5/10/22, griglia labels)
  - Step 2 Prezzo: se `griglia` monta `FamilyGridEditor`; altrimenti input prezzo vendita/acquisto
  - Step 3 Assi: delega a `FamilyAxesEditor`
  - Step 4 Posa: select `tariffe_aziendali` + quantità default
  - Step 5 Riepilogo con pulsanti "Torna al catalogo" / "Salva e crea copia"
  - Sidebar sticky con `FamilyPricePreview` live
  - Modalità new: crea al "Salva dati base" poi redirect a `/:id` per continuare
- ✅ 4.4 `FamilyAxesEditor.tsx`:
  - Lista assi con riordino up/down (non dnd-kit per evitare complessità)
  - Dialog crea/modifica asse: codice auto-suggerito via slug del nome, codice read-only in edit
  - Editor valori per asse: label, valore, default (UNIQUE enforced client-side: toglie default agli altri prima di salvare), maggiorazione (6 tipi), valore vendita + acquisto
  - Warning `⚠ nessun default` se obbligatorio e nessun valore default
  - AlertDialog su eliminazione
- ✅ 4.5 `FamilyGridEditor.tsx` + migration `20260917000005_serramenti_05_griglia_family_unique.sql`:
  - Partial unique index `idx_griglia_family_xy_unique` su `(family_id, valore_x, valore_y) WHERE family_id IS NOT NULL` per non collidere con righe legacy prodotto_id
  - Editor matrice: badge editabili per valori X (larghezze) e Y (altezze), tabella N×M con prezzo vendita + acquisto + cestino per celle vuote
  - Salvataggio: `DELETE WHERE family_id = X` + bulk `INSERT`. Non transazionale (MVP), ma idempotente al retry (lo stato UI è sempre la source-of-truth)
- ✅ 4.6 `FamilyPricePreview.tsx`:
  - Query live su `listino_griglia` se modalità=griglia
  - Formula interim: base (griglia lookup ∨ `prezzo_base_vendita` ∨ mq×base) → pass1 % maggiorazioni → pass2 fisse (pz/mq/ml/mc) → × quantità
  - Warning se cella griglia non trovata (fallback a prezzo_base)
  - Mostra margine € + %, superficie m²
  - **NB:** è una preview, la formula pura definitiva sarà in FASE 5 `useFamilyPricing.ts` con unit tests
- ✅ 4.7 Routing + tab switcher:
  - `SettingsCatalog.tsx` ora ha Tabs `Famiglie` (default) / `Articoli singoli` via `?tab=` query string
  - Nuove route in `companyRoutes.tsx`:
    - `/azienda/impostazioni/listino/famiglie` → redirect a `?tab=famiglie`
    - `/azienda/impostazioni/listino/famiglie/nuova` → `SettingsFamilyEditor` (create mode)
    - `/azienda/impostazioni/listino/famiglie/:id` → `SettingsFamilyEditor` (edit mode)
- ✅ DoD verification FASE 4:
  - ✅ FamilyEditor per 4 modalità prezzo (pz/mq/griglia/misura_libera)
  - ✅ Matrice griglia L×H editabile con salvataggio batch
  - ✅ CRUD completo assi + valori con validazione (default unique per asse, warning obbligatorio senza default)
  - ✅ Preview prezzo live con maggiorazioni applicate
  - ✅ Duplicazione famiglia (nel catalogo e nel riepilogo)
- ✅ `tsc --noEmit` → 0 errori.
- ⏳ **Next:** FASE 5 (Motore calcolo prezzo puro + unit tests) + applicazione migration 005 + deploy edge function su ambiente target.

### FASE 5 — 2026-04-17
- ✅ 5.1 `src/hooks/useFamilyPricing.ts`:
  - Funzioni pure esportate: `nearestGrid(punti, x, y)` (Manhattan distance, short-circuit exact match) + `calcolaPrezzoFamiglia(input, griglia?)` (algoritmo masterprompt 5.1).
  - Hook wrapper `useFamilyGrid(familyId)`: carica i punti griglia da `listino_griglia`, cache 5min, invalidato via `queryKeys.articleFamilies.grid(id)`.
  - Algoritmo: (1) base da `modalita_prezzo_base` (pz/mq/griglia/misura_libera) → (2) maggiorazioni **percentuali** in ordine `sort_order` degli assi → (3) maggiorazioni **fisse** (fisso_pz/fisso_mq/fisso_ml/fisso_mc) → (4) `totale = unit × quantita`.
  - Stessa logica per `prezzo_acquisto` usando `maggiorazione_acquisto`.
  - Warnings accumulati: misure mancanti, griglia vuota, asse obbligatorio non selezionato, fisso_ml senza ml, fisso_mc ancora non supportato.
- ✅ 5.2 `src/test/logic/familyPricing.test.ts` — 16 test Vitest:
  - `nearestGrid`: lista vuota, exact match, nearest-neighbor, `prezzo_acquisto_netto null → 0`.
  - Base pz 100 × Q=3 → 300; mq 1.2×1.4 @ 200 → 336; mq senza misure → warning.
  - Griglia: exact match 1200×1400 @ 420; nearest 1250×1420 → 420 + warning; griglia vuota → warning.
  - Caso complesso: griglia 420 + 15% apertura + €40/mq vetro + €80/pz ferramenta su 1200×1400 (1.68mq) → **630.20** (matches masterprompt 5.3).
  - Asse obbligatorio senza selezione → warning; asse opzionale senza selezione → zero warnings.
  - `fisso_ml` senza lunghezza → warning; `fisso_mc` → warning "non ancora supportata".
  - Ordinamento: percentuali applicate per `sort_order` crescente, non per ordine di inserzione nell'array `axes`.
- ✅ `vitest run` → **158/158 test verdi** (9 file, nessuna regressione sugli altri moduli).
- ✅ `tsc --noEmit` → 0 errori.
- ⏳ **Next:** FASE 6 (tariffe UM flessibili + edge function installa-tariffe-vertical).

### FASE 6 — 2026-04-17
- ✅ 6.1 Migration `20260917000006_serramenti_06_tariffe_extension.sql`:
  - ADD `unita_fatturazione TEXT` CHECK in (`pz,mq,ml,mc,kg,gg,h,a_corpo,km,piano`) — le 10 UM canoniche masterprompt 6.1.
  - ADD `costo_interno NUMERIC(12,4)`, `vertical_associato TEXT`, `attivo BOOLEAN`. La descrizione era già presente.
  - Backfill: `unita_fatturazione` da legacy `unita` (fisso→a_corpo, cad→pz, giornata/ora→gg/h, default pz); `costo_interno` = `prezzo_costo` dove >0; `attivo = COALESCE(attiva,true)`.
  - Amplia CHECK `tipo` con: manodopera, sopralluogo, progettazione, ponteggio, lattoneria, sigillatura, contorno, falso_telaio (mantiene posa/trasporto/smaltimento/nolo/tiro_piano/pratica/altro).
  - Indice parziale `idx_tariffe_aziendali_vertical (company_id, vertical_associato) WHERE attivo=true`.
- ✅ 6.2 Edge Function `supabase/functions/installa-tariffe-vertical/index.ts`:
  - Input `{company_id, vertical}`; output `{ok, tariffe_create, tariffe_skippate}`.
  - Seed per vertical `serramentista`: 17 tariffe da masterprompt 6.2 (Posa standard/grande/persiana/zanzariera, Smontaggio, Smaltimento, Trasporto a_corpo, Sovrapprezzo km, Tiro piano, Ponteggio, Lattoneria ml, Sigillatura ml, Manodopera gg, Manodopera h, Contorno ml, Falso telaio pz, Sopralluogo).
  - Idempotente (dedup per `nome`), prezzi=0 (azienda compila post-install).
  - Auth: super_admin OR profiles.company_id OR multi_company_access OR active_impersonations (struttura speculare a `installa-template-vertical`).
  - Popola sia `unita` legacy (mapping via `legacyUnitaFrom`) che `unita_fatturazione` canonica.
- ✅ 6.3 `SettingsTariffe.tsx`:
  - TIPO_TABS esteso a 15 categorie (tutte le tipologie della migration) + badge colorati dedicati per ognuna.
  - UM_FATTURAZIONE con 10 voci + hint descrittivo in dropdown.
  - Dialog nuovi campi: `descrizione`, `unita_fatturazione` (fissa alla creazione, warning "non modificabile per preventivi" in edit), `vertical_associato` (Globale / serramentista / generico / edile / impiantistica), `costo_interno` (admin-only).
  - **Semaforo margine live** sotto i prezzi (verde ≥25%, giallo ≥15%, rosso altrimenti) con delta €/unit.
  - Filtro vertical in header: "Tutte" / "Solo vertical corrente" / "Solo globali".
  - Retrocompat: insert/update popola anche legacy `unita` + `prezzo_costo` per non rompere letture da codice vecchio.
- ✅ 6.4 `usePreventivoCosti.ts`:
  - `TariffaPro` esteso con `costo_interno` e `unita_fatturazione`.
  - Query map: se `costo_interno` presente lo usa come prezzo_costo (fallback a legacy).
  - `calcolaTariffaAutomatica(tariffa, qty, piano?, kmCantiere?)` nuovo parametro `kmCantiere`:
    - `tiro_piano` legacy → logica scaglioni invariata
    - `a_corpo`/`fisso` → importo fisso totale (ignora qty)
    - `km` → × kmCantiere
    - `piano` (non tiro_piano) → × numero piani
    - resto (pz/mq/ml/mc/kg/gg/h) → × qty
  - Nessun breaking change: i 4 call site in QuoteBuilder (righe 891/921/991/1074) continuano a funzionare con firma 2-3 args.
- ✅ `tsc --noEmit` → 0 errori. `vitest run` → 158/158 verdi (nessuna regressione).

### 2026-04-17 — FASE 7: Fix 3 P0 bug (unit_price + sconti/bundle UI + tests)

- ✅ 7.1 `supabase/functions/ai-genera-preventivo-v2/index.ts`:
  - **Bug fix P0.1 unit_price sbagliato**: prima tutti i prodotti ricevevano `prezzo_vendita` flat indipendentemente dalla modalità. Ora:
    - `modalita='pz' | 'misura_libera'` → flat (invariato)
    - `modalita='mq'` → `prezzo_vendita × (x/1000 × y/1000)` con arrotondamento a 2 decimali. Se misure mancanti → fallback flat + warning
    - `modalita='griglia'` → batch-fetch `listino_griglia` a monte + `nearestInGriglia()` (Manhattan) + warning se nearest ≠ exact. Griglia vuota → fallback flat + warning; misure mancanti → null + warning
  - Query tariffe aggiornata con nuovi campi FASE 6 (`costo_interno`, `unita_fatturazione`, `vertical_associato`).
  - `enrichmentWarnings[]` accumulate e appeso a `avvertenze[]` nella risposta.
- ⏭️ 7.2 `LIMIT 60 hardcoded` — **SKIPPATO** per design del masterprompt: sostituirlo con limite più alto senza retrieval sarebbe un pezzotto; la vera soluzione è FASE 8 (pgvector + top-K retrieval).
- ✅ 7.3 `src/pages/azienda/marketing/QuoteBuilder.tsx`:
  - Import `useScontiQuantita`, `useBundleProdotti`, `calcolaScontoQuantita` (già disponibili nel hook).
  - `useMemo<Suggestion[]>` che calcola 2 tipi di suggerimento:
    - **Sconto quantità**: per ogni riga prodotto con `article_template_id` → se `calcolaScontoQuantita` restituisce un % > `discount_percent` attuale, banner "Sconto quantità applicabile: -X% su <nome> (da Y pz)".
    - **Bundle suggerito**: per ogni bundle con ≥2 voci, se ALMENO 1 voce è già nel quote ma NON tutte → banner "Bundle suggerito: X (-Y%) (Z/W prodotti già presenti)".
  - `dismissedSuggestions: Set<string>` per persistenza del click "Ignora".
  - Banner ambra in testa al CardContent "Prodotti & Servizi" con bottoni `Applica` / `Ignora`.
  - Applica sconto → `setItems` aggiorna `discount_percent` della riga.
  - Applica bundle → espande SOLO le voci non già presenti tramite `espondiBundle` esistente.
- ✅ 7.4 `src/test/logic/aiEnrichment.test.ts`:
  - 13 unit tests vitest su funzioni pure `nearestInGriglia` + `computeUnitPrice`.
  - Copertura: griglia vuota / esatta / nearest, mq con/senza misure, pz flat, misura_libera flat, griglia senza misure.
- ✅ `tsc --noEmit` → 0 errori. `vitest run` → **171/171 verdi** (10 file, +13 nuovi test).
- ⏳ **Next:** FASE 8 (pgvector + embeddings + RPC + retrieval AI).

### 2026-04-17 — FASE 8: pgvector + retrieval semantico AI

- ✅ 8.1 `supabase/migrations/20260917000007_serramenti_08_pgvector_embeddings.sql`:
  - `CREATE EXTENSION IF NOT EXISTS vector;` (pgvector 0.8.0 disponibile, verificato via MCP)
  - `ALTER TABLE article_templates ADD COLUMN embedding vector(1536), embedding_updated_at TIMESTAMPTZ`
  - Indice HNSW cosine `idx_article_templates_embedding_hnsw` (partial `WHERE embedding IS NOT NULL`)
  - RPC `match_articles(p_query_embedding, p_company_id, p_match_threshold, p_match_count)`:
    - Cosine similarity via `1 - (embedding <=> query)`
    - Filtro `company_id = p_company_id` + `similarity >= p_match_threshold`
    - ORDER BY distanza, LIMIT match_count
    - SECURITY INVOKER (RLS ereditata)
- ✅ 8.2 `supabase/functions/genera-embeddings-catalogo/index.ts`:
  - Input `{company_id, mode?: "all"|"missing"|"single", article_id?}`
  - Output `{ok, processed, skipped, errors}`
  - OpenAI `text-embedding-3-small` 1536 dim, batch 50
  - Composizione testo: nome + SKU + descrizione + modalità + UM + categoria
  - Auth tiered (super_admin / profiles / multi_company_access / active_impersonations)
  - Guard `OPENAI_API_KEY` mancante → 500 con messaggio chiaro
- ✅ 8.3 `supabase/functions/ai-genera-preventivo-v2/index.ts`:
  - Retrieval semantico quando `OPENAI_API_KEY` presente: embed descrizione lavori + tipo_lavoro → RPC match_articles (top 40, soglia 0.25)
  - Fallback legacy `ORDER BY name LIMIT 60` se no API key o no risultati
  - Avvertenza dinamica: "Retrieval semantico: X prodotti rilevanti" vs "Catalogo limitato... genera embeddings"
- ✅ 8.4 `src/components/settings/ArticleCatalog.tsx`:
  - Bottone "Embeddings AI" (icona Sparkles) nella toolbar
  - Mutation `generaEmbeddingsMutation` invoca edge fn con `mode: "missing"` (solo prodotti senza embedding)
  - Toast con contatori (processed/skipped/errors)
  - Disabled se non isAdmin
- ✅ `tsc --noEmit` → 0 errori. `vitest run` → 171/171 verdi.
- ⚠️ **Deploy TODO**: migration + edge fn `genera-embeddings-catalogo` vanno deployate su Supabase prima che l'UI funzioni. Senza `OPENAI_API_KEY` il retrieval semantico è silenziosamente by-passed (fallback legacy).
- ⏳ **Next:** FASE 9 (Wizard serramentista — 5 step UI per creare preventivo verticalizzato).

---

## Curl di test / verifiche Edge Functions

*(sezione da popolare a partire da FASE 7 quando si toccheranno le edge fn)*

### `ai-genera-preventivo-v2` — baseline test (FASE 0 reference)

```bash
# TODO in FASE 7: documentare payload curl di esempio + output atteso (prima e dopo fix P0.1)
```

---

## Follow-up / debito tecnico identificato ma fuori scope iniziale

- 🔧 `MargineSemaforo` duplicato → unificare in `src/components/shared/MargineSemaforo.tsx` quando si tocca ArticleCatalog in FASE 4.
- 🔧 `QuoteBuilder.tsx` 2622 righe → splittare per concerns dopo FASE 11 (tracking, non nel masterprompt ma utile post-feature).
- 🔧 `ai-genera-preventivo-v2` non legge mai `prezzari` (catalogo pubblico regionale) → valutare in FASE 8.
