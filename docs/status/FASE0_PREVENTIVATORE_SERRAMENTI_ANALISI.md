# FASE 0 — Analisi preliminare Preventivatore Verticalizzato Serramentisti

**Branch:** `feat/preventivatore-serramentisti`
**Data analisi:** 2026-04-17
**Commit gate:** `chore: phase 0 analysis preventivatore verticalizzato serramenti`
**Stato:** ✅ Analisi completata — autorizzato a procedere con FASE 1

---

## 0. TL;DR executive

| Dimensione | Valore |
|---|---|
| File frontend core | 5 (`QuoteBuilder.tsx` 2622 righe, `Preventivi.tsx` 730, `ArticleCatalog.tsx` 1137, `usePreventivoCosti.ts` 534, `AIQuotePanel.tsx` 508) |
| Edge functions coinvolte | 2 (`ai-genera-preventivo-v2` 206 righe, `computo-ai-extract` 766 righe) |
| Migration `preventivo_pro_v2_*` | 29 file (parti 1–29) + 13 collaterali |
| Tabelle già esistenti rilevanti | 13/13 tutte presenti |
| pgvector disponibile | ❌ **NO** — va aggiunta migration in FASE 8 |
| Campo "vertical" in `companies` | ✅ `sector` enum esistente con valore `'serramenti'` — **riusare, non duplicare** |
| Bug P0 confermati | 3/3 individuati con file:riga |

---

## 1. Inventario tabelle rilevanti

Tutte le tabelle previste dal masterprompt esistono. Di seguito colonne chiave rilevanti per il preventivatore verticale.

### 1.1 `article_templates` — `20260206190233_*.sql` + ~29 ALTER via `preventivo_pro_v2_part*`
- **CREATE iniziale:** `id, company_id, name, created_at, UNIQUE(company_id, name)`
- **ALTER aggiunti (usati in app):** `sku, marca, modello, category, categoria_id, modalita_prezzo, prezzo_vendita, prezzo_acquisto_netto, margine_minimo_percentuale, ha_montaggio, montaggio_tipo, montaggio_tariffa_id, attivo, immagine_url, pdf_scheda_url, description, vat_rate, unit_of_measure, sort_order`
- **Valori `modalita_prezzo`:** `pz | mq | misura_libera | griglia`
- **Note:** Non eliminare. Si estende con `family_id UUID NULL` in FASE 2 per coesistenza legacy/nuovi modelli.

### 1.2 `listino_griglia` — `20260324200015_preventivo_pro_v2_part15.sql`
- Colonne: `id, company_id, prodotto_id → article_templates, valore_x INT, valore_y INT, prezzo_vendita NUMERIC(12,4), prezzo_acquisto NUMERIC(12,4), note, created_at, UNIQUE(prodotto_id, valore_x, valore_y)`
- Estensione richiesta FASE 2: aggiungere `family_id UUID NULL → article_families`.

### 1.3 `listino_categorie` — `20260324200001_preventivo_pro_v2_part1.sql`
- Colonne: `id, company_id, nome, colore, icona, margine_target_percentuale NUMERIC(5,2) DEFAULT 25, sort_order, created_at, UNIQUE(company_id, nome)`
- Usato per raggruppare famiglie prodotto. Nessuna estensione richiesta.

### 1.4 `tariffe_aziendali` — `20260324200006_preventivo_pro_v2_part6.sql`
- Colonne: `id, company_id, tipo CHECK(posa|trasporto|tiro_piano|smaltimento|nolo|pratica|altro), nome, descrizione, unita CHECK(pz|mq|ml|h|piano|km|mc|fisso), prezzo_costo, prezzo_vendita, categoria_prodotto, piano_base INT, prezzo_piano_aggiuntivo, attiva, sort_order, created_at`
- **Osservazione:** UM già flessibili a livello DB. FASE 6 deve solo cablare UM nel motore e nella UI editor famiglie.

### 1.5 `preventivo_impostazioni` — `20260324200021_preventivo_pro_v2_part21.sql`
- Colonne complete (17 flag/parametri configurazione preventivo per azienda). Unica per `company_id`.
- Nessuna estensione richiesta per MVP serramentisti.

### 1.6 `bundle_prodotti` / `bundle_voci` / `sconti_quantita` — `20260708000000_sconti_quantita_bundle.sql`
- `bundle_prodotti(id, company_id, nome, descrizione, sconto_bundle_pct, attivo, created_at)`
- `bundle_voci(id, bundle_id, prodotto_id, tariffa_id, quantita, sort_order, CHECK prodotto OR tariffa)`
- `sconti_quantita(id, company_id, prodotto_id NULL, da_quantita, sconto_pct CHECK(0<pct≤100), descrizione, attivo, created_at)`
- **Infrastruttura DB completa.** Mancante: suggerimenti UI (P0.3).

### 1.7 `quotes` — `20260309104033_*_part16.sql`
- Colonne base: `id, company_id, quote_number, status, contact_id, client_*, title, description, notes, internal_notes, terms_and_conditions, validity_days, expires_at, subtotal, vat_amount, total, discount_percent, discount_amount, pdf_storage_path, pdf_generated_at, signature_token, sent_at, viewed_at, signed_at, signed_by_*, refused_*, opportunity_id, created_by, assigned_to, created_at, updated_at`
- ALTER `20260915000001_computo_metrico_ai.sql`: `+ source TEXT DEFAULT 'manual', + computo_upload_id UUID → computo_uploads`

### 1.8 `quote_items` — `20260309104045_*_part28.sql`
- Colonne base: `id, quote_id, company_id, item_type, name, description, quantity, unit_price, discount_percent, vat_rate, line_total, unit_of_measure, image_url, article_template_id, sort_order, created_at`
- ALTER successivi: `+ computo_voce_id, + codice_prezzario`
- Estensioni richieste FASE 2: `misure_x_mm NUMERIC, misure_y_mm NUMERIC, valori_assi JSONB, family_id UUID NULL`.

### 1.9 Computo metrico (`computo_uploads`, `computo_voci_estratte`, `prezzari`, `prezzario_voci`) — `20260915000001_computo_metrico_ai.sql`
- Tabelle complete e funzionanti. `prezzari` multi-regione multi-anno, `prezzario_voci` con `codice/descrizione/prezzo`. Pronte per retrieval semantico (FASE 8) una volta aggiunto pgvector.

---

## 2. Conflitti potenziali

### 2.1 ⚠️ `companies.sector` (ENUM) vs nuovo `companies.vertical`
- L'ENUM `public.company_sector` esiste (vedi `20260206104619_*.sql`) con valori: `'serramenti','infissi','bagni','tetti','fotovoltaico','pittura','ristrutturazioni','altro'`.
- Il masterprompt richiede di NON duplicare. **Decisione FASE 1:** usare il valore esistente `'serramenti'` (equivalente a "serramentisti"). Se serve differenziare infissi/serramenti granularmente, valutare un valore `'serramentisti'` via `ALTER TYPE ... ADD VALUE`. Nessuna nuova colonna `vertical` necessaria.

### 2.2 ⚠️ `MargineSemaforo` duplicato
- Definito due volte: `QuoteBuilder.tsx:114` e `ArticleCatalog.tsx:79`.
- Durante FASE 4 va estratto in un componente condiviso `src/components/shared/MargineSemaforo.tsx` (non-blocking; lo gestiamo cosmetic cleanup mentre toccheremo i due file).

### 2.3 ⚠️ `modalita_prezzo` su `article_templates` vs nuovo default su `article_families`
- La nuova `article_families` avrà `modalita_prezzo_default`. Regola di precedenza: se `quote_item.family_id IS NOT NULL` → leggi modalita dalla famiglia; altrimenti → legacy `article_templates.modalita_prezzo`.

### 2.4 ✅ Nessun conflitto di nome
- Nomi proposti in masterprompt (`article_families, article_family_axes, article_family_axis_values, article_family_griglia_pivot`) non collidono con nulla di esistente.

### 2.5 ⚠️ Extension pgvector non installata
- Nessuna migration contiene `CREATE EXTENSION ... vector`. Extension presenti: `pg_cron, pg_net, pgcrypto`.
- **Azione FASE 8:** migration `2026MMDDhhmmss_serramenti_06_embeddings.sql` con `CREATE EXTENSION IF NOT EXISTS vector` (richiede disponibilità lato Supabase — da verificare via MCP prima della migration).

---

## 3. Lista file toccati per fase (best effort)

### FASE 1 — Vertical + onboarding
- `supabase/migrations/2026MMDDhhmmss_serramenti_01_vertical.sql` *(new — eventuale `ALTER TYPE company_sector ADD VALUE 'serramentisti'`, o nessuna migration se riusiamo `'serramenti'`)*
- `src/pages/auth/OnboardingAzienda.tsx` (o equivalente) — scelta vertical
- `src/hooks/useAuth.ts` — esposizione `sector` nel contesto se non già presente

### FASE 2 — Data model famiglie/assi/posa
- `supabase/migrations/2026MMDDhhmmss_serramenti_02_families.sql` *(new)*
  - `article_families, article_family_axes, article_family_axis_values`
  - `article_family_griglia_pivot` (FK griglia ↔ famiglia)
  - ALTER `article_templates` + `family_id UUID NULL`
  - ALTER `listino_griglia` + `family_id UUID NULL`
  - ALTER `quote_items` + `misure_x_mm, misure_y_mm, valori_assi JSONB, family_id`
  - RLS + indici
- `supabase/functions/_shared/types.ts` (o equivalente)
- `src/integrations/supabase/types.ts` — rigenerazione tipi

### FASE 3 — Seed categorie + listini base
- `supabase/migrations/2026MMDDhhmmss_serramenti_03_seed.sql` *(new, function/seed onboarding serramentista)*
- `src/lib/serramenti/seedDefaults.ts` *(new)*

### FASE 4 — Editor UI famiglie + assi
- `src/components/settings/ArticleFamilyEditor.tsx` *(new)*
- `src/components/settings/ArticleFamilyAxisEditor.tsx` *(new)*
- `src/components/settings/ArticleCatalog.tsx` — aggiungere tab "Famiglie"
- `src/components/shared/MargineSemaforo.tsx` *(new — estrazione)*
- `src/pages/azienda/settings/SettingsQuoteMaterials.tsx` — link alla nuova tab

### FASE 5 — Motore calcolo prezzo
- `src/lib/pricing/calcolaPrezzoFamiglia.ts` *(new, funzione pura)*
- `src/lib/pricing/nearestGriglia.ts` *(new)*
- `src/hooks/usePreventivoCosti.ts` — integrazione motore
- `src/test/logic/calcolaPrezzoFamiglia.test.ts` *(new)*
- `src/test/logic/nearestGriglia.test.ts` *(new)*

### FASE 6 — Manodopera UM flessibili
- `src/components/settings/TariffeAziendaliEditor.tsx` (esistente — da verificare path)
- `src/lib/pricing/calcolaManodopera.ts` *(new)*
- `src/test/logic/calcolaManodopera.test.ts` *(new)*

### FASE 7 — Fix 3 bug P0
- `supabase/functions/ai-genera-preventivo-v2/index.ts` (rebuild enrichment + rimozione LIMIT 60 provvisoria in attesa di FASE 8)
- `src/pages/azienda/marketing/QuoteBuilder.tsx` (useEffect sconti_quantita + bundle suggestion)
- `src/test/logic/aiEnrichment.test.ts` *(new)*

### FASE 8 — AI verticalizzata + pgvector
- `supabase/migrations/2026MMDDhhmmss_serramenti_06_embeddings.sql` *(new — pgvector + ivfflat)*
- `supabase/migrations/2026MMDDhhmmss_serramenti_07_semantic_search_rpc.sql` *(new — RPC per similarity search)*
- `supabase/functions/ai-embed-article/index.ts` *(new)*
- `supabase/functions/ai-genera-preventivo-v2/index.ts` — swap LIMIT→retrieval semantico + system prompt per vertical
- `supabase/functions/_shared/embeddings.ts` *(new helper OpenAI)*

### FASE 9 — Wizard preventivo serramentista
- `src/pages/azienda/marketing/QuoteWizardSerramenti.tsx` *(new)*
- `src/components/quotes/SerramentoPickerDialog.tsx` *(new)*
- `src/pages/azienda/marketing/QuoteBuilder.tsx` — inserimento CTA "Nuovo wizard"

### FASE 10 — Bundle pacchetti
- `src/components/quotes/BundleSelector.tsx` (esistente) — estensione con suggestion engine
- `src/pages/azienda/marketing/QuoteBuilder.tsx` — useEffect suggerimenti bundle
- `src/test/logic/bundleSuggestion.test.ts` *(new)*

### FASE 11 — Testing E2E + QA
- `tests/e2e/preventivatore-serramenti/*.spec.ts` *(new — 3 scenari)*

---

## 4. Bug P0 — riferimenti file:riga

### 🔴 P0.1 — `unit_price` non calcolato per `mq` e `griglia`
- **File:** `supabase/functions/ai-genera-preventivo-v2/index.ts`
- **Righe:** 161–188 (blocco "Enrich righe with unit_price")
- **Riga chiave:** `index.ts:168-169`
  ```ts
  const prod = prodottiMap.get(riga.article_template_id) as any;
  riga.unit_price = prod?.prezzo_vendita ?? null;
  ```
- **Impatto:** Per prodotti `modalita_prezzo='mq'` l'anteprima mostra `prezzo_vendita` invece di `prezzo_vendita × mq`. Per `'griglia'` manca il lookup in `listino_griglia` con nearest neighbor. Totali preview errati → UX incoerente + rischio sottostima/sovrastima quando utente invia senza aprire dialog riga.
- **Severità:** P0 (calcolo monetario sbagliato visibile all'utente).

### 🔴 P0.2 — Hardcoded `LIMIT 60` sui prodotti passati all'AI
- **File:** `supabase/functions/ai-genera-preventivo-v2/index.ts`
- **Righe:**
  - `index.ts:47` → `const PRODUCT_LIMIT = 60;`
  - `index.ts:55` → `.limit(PRODUCT_LIMIT);`
  - `index.ts:192` → avvertenza quando il catalogo è più grande del limite
- **Impatto:** Aziende con >60 articoli vedono l'AI ignorare silenziosamente prodotti rilevanti. Fix corretto richiede retrieval semantico (FASE 8) — in FASE 7 si alza temporaneamente il cap e si logga.
- **Severità:** P0 (perdita di dati di dominio visibili all'AI).

### 🔴 P0.3 — Nessun cablaggio di `sconti_quantita` / bundle suggestion in `QuoteBuilder`
- **File:** `src/pages/azienda/marketing/QuoteBuilder.tsx`
- **Prova dell'assenza:**
  - `grep "calcolaScontoQuantita"` in tutto `src/` → unica occorrenza: `src/hooks/usePreventivoCosti.ts:168` (definizione). Nessun consumer.
  - `grep "useScontiQuantita"` in `QuoteBuilder.tsx` → 0 match.
  - 10 `useEffect` esistenti (`QuoteBuilder.tsx:295, 307, 638, 662, 749, 785, 812, 819, 1168, 1176`): tutti su hydration/autosave/guard, nessuno su `items` → suggerimento sconti/bundle.
- **BundleSelector** importato a `QuoteBuilder.tsx:24` ma usato solo in modal manuale (`L2613`). Nessun suggerimento automatico.
- **Impatto:** Infrastruttura DB + logica pura esistono ma sono morte: utente non vede mai lo sconto a scaglioni applicabile né il bundle disponibile. Perdita di valore commerciale diretto.
- **Severità:** P0 (feature già pagata/sviluppata lato DB+logic ma non esposta).

---

## 5. Stima rischio per fase

| Fase | Rischio | Motivazione |
|---|---|---|
| **FASE 1** — Vertical + onboarding | 🟢 **BASSO** | `company_sector` enum esiste già con `'serramenti'`. Migration minimale (aggiunta eventuale `'serramentisti'`) + wire in onboarding. Zero data migration. |
| **FASE 2** — Data model famiglie/assi | 🟡 **MEDIO** | 3 nuove tabelle + 3 ALTER su tabelle live (`article_templates`, `listino_griglia`, `quote_items`). Tutti i `family_id` sono NULLABLE → zero impatto legacy. RLS/indici standard. Rischio solo da rigenerazione tipi TS. |
| **FASE 3** — Seed categorie | 🟢 **BASSO** | Solo INSERT idempotenti (ON CONFLICT DO NOTHING). Scope: categorie default serramentista. |
| **FASE 4** — Editor UI | 🔴 **ALTO** | Tocca `ArticleCatalog.tsx` (1137 righe) e potenzialmente `QuoteBuilder.tsx` (2622 righe). Nuova tab "Famiglie" + editor assi/valori. Rischio regressione UX alto → richiede testing manuale strutturato. |
| **FASE 5** — Motore calcolo prezzo | 🔴 **ALTO** | Logica critica di pricing. Deve essere 100% corretta su: `pz`, `mq`, `griglia` con nearest neighbor, `misura_libera`, maggiorazioni `percentuale/fisso_pz/fisso_mq/fisso_ml/fisso_mc`. Copertura test obbligatoria: ≥10 scenari (casi base, edge, combo). |
| **FASE 6** — Manodopera UM | 🟡 **MEDIO** | DB già supporta `unita CHECK(pz|mq|ml|h|piano|km|mc|fisso)`. Rischio: motore deve convertire correttamente misure riga → UM tariffa. Test edge: tariffe `h` per prodotti `mq`. |
| **FASE 7** — Fix 3 P0 bug | 🔴 **ALTO** | Aziende già live → qualsiasi regressione sui totali preview AI è visibile subito. Mandatorio: test unitari + smoke test manuale con 3 modalità prezzo prima del merge. |
| **FASE 8** — AI + pgvector | 🔴 **ALTO** | Nuova extension (verificare disponibilità Supabase), embeddings OpenAI (costo + rate limits), cambio paradigma da "catalogo filtrato" a "retrieval semantico". Dipende da `OPENAI_API_KEY` → check in edge function env. |
| **FASE 9** — Wizard serramenti | 🟡 **MEDIO** | Nuovo flow su infrastruttura esistente. Rischio: divergenza dallo stato `items[]` di QuoteBuilder (fonte di verità unica da mantenere). |
| **FASE 10** — Bundle + suggerimenti | 🟢 **BASSO** | `bundle_prodotti` + `espondiBundle()` già esistono; mancano solo useEffect di suggerimento e banner UX. |
| **FASE 11** — Testing E2E | 🟡 **MEDIO** | 3 scenari full (creazione famiglia, preventivo con griglia+sconti, preventivo AI verticalizzato). Rischio solo da flakiness Playwright, non logica. |

---

## 6. Note operative (vincoli masterprompt)

- ✅ `TypeScript`: zero `any`. Uso di `unknown` + narrowing.
- ✅ `Lingua`: UI italiana; colonne DB: italiano per dominio italiano (`posa_tariffa_default_id`, `valori_assi`), inglese per meta (`created_at`, `sort_order`).
- ✅ `Formati`: `Intl.NumberFormat('it-IT')` per currency, `dd/MM/yyyy` per date.
- ✅ `DB`: RLS obbligatoria su nuove tabelle. Helper `current_company_id()` già presente.
- ✅ `UI`: solo shadcn/ui. Zod + react-hook-form. AlertDialog per azioni distruttive. Skeleton + empty state obbligatori. Toast Sonner su salvataggi.
- ✅ `Commit`: un commit per sotto-fase con prefix conventional.
- ✅ `Testing`: `src/test/logic/` per ogni funzione pura del motore prezzo.

---

## 7. Pre-flight verifica vincoli (check-list FASE 0)

- [x] Leggi `QuoteBuilder.tsx`, `Preventivi.tsx`, `usePreventivoCosti.ts`, `ArticleCatalog.tsx`, `AIQuotePanel.tsx`
- [x] Leggi `ai-genera-preventivo-v2/index.ts`, `computo-ai-extract/index.ts`
- [x] Mappa migration `preventivo_pro_v2_*` (29 file) + `computo_metrico` (2 file)
- [x] Inventario 13 tabelle rilevanti
- [x] Verifica `companies`: campo vertical esistente = `sector` enum con `'serramenti'` → riuso
- [x] Verifica pgvector disponibile → **NO** (da installare in FASE 8)
- [x] Identificazione conflitti (`MargineSemaforo` dup, ENUM sector, modalità precedenza)
- [x] File toccati per fase (lista best-effort)
- [x] Bug P0 con file:riga (3/3)
- [x] Stima rischio per fase (bassa/media/alta)
- [ ] **Verifica `OPENAI_API_KEY` nelle Edge Functions** → da confermare via dashboard Supabase prima di FASE 8 (non-blocking per FASE 1–7).

---

## 8. Prossimo step

Commit: `chore: phase 0 analysis preventivatore verticalizzato serramenti`
Poi procedere con **FASE 1 — Vertical + onboarding serramentista**.
