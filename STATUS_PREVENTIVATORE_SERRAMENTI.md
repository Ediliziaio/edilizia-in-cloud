# STATUS — Preventivatore Verticalizzato Serramentisti

File di tracciamento multi-sessione. Aggiornato a ogni commit di sotto-fase.

**Branch:** `feat/preventivatore-serramentisti`
**Start date:** 2026-04-17

---

## Progress tracker

| Fase | Stato | Sotto-fasi | Commit | Note |
|---|---|---|---|---|
| FASE 0 — Analisi preliminare | 🟡 IN CORSO | Analisi + 2 MD | *(pending `chore: phase 0 analysis preventivatore verticalizzato serramenti`)* | Commit gate |
| FASE 1 — Vertical + onboarding | ⚪ TODO | — | — | Valutare `ALTER TYPE ... ADD VALUE 'serramentisti'` o riuso `'serramenti'` |
| FASE 2 — Data model famiglie/assi | ⚪ TODO | 2.1–2.x | — | 3 nuove tabelle + 3 ALTER |
| FASE 3 — Seed categorie | ⚪ TODO | — | — | INSERT idempotenti |
| FASE 4 — Editor UI famiglie/assi | ⚪ TODO | — | — | Tocca ArticleCatalog 1137L |
| FASE 5 — Motore calcolo prezzo | ⚪ TODO | — | — | Test unitari obbligatori |
| FASE 6 — Manodopera UM flessibili | ⚪ TODO | — | — | DB già supporta UM |
| FASE 7 — Fix 3 P0 bug | ⚪ TODO | 7.1 unit_price, 7.2 LIMIT 60, 7.3 sconti/bundle | — | Copertura regressione aziende live |
| FASE 8 — AI + pgvector | ⚪ TODO | migration + embeddings + RPC + edge fn | — | Verifica disponibilità `vector` ext Supabase |
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
- ⏳ **Next:** commit gate `chore: phase 0 analysis preventivatore verticalizzato serramenti` → FASE 1.

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
