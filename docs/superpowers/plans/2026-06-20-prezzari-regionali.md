# Libreria Prezzari Regionali — Implementation Plan

> **For agentic workers:** esecuzione via subagent-driven-development. Vincolo: SOLO LOCALE (commit locali OK; migrazioni come file, applicate via MCP solo in "pubblica"). Gate = `npx eslint` (0 nuovi) + `npx vite build` (exit 0) + `deno check` (edge) + `npx vitest run` (lib pure). NON il tsc completo.

**Goal:** Libreria centrale condivisa dei prezzari regionali, adottabile per copia+margine nel computo Ristrutturazione.

**Architettura:** vedi `docs/superpowers/specs/2026-06-20-prezzari-regionali-design.md`.

---

## Fase A — Fondamenta (schema + contratto tipi + motore)

### Task A1 — Migrazione schema (LOCALE)
- Create: `supabase/migrations/<ts>_prezzari_regionali.sql` (ts > 20271021010000).
- 4 tabelle (`prezzario_fonte`, `prezzario_capitolo`, `prezzario_voce`, `manodopera_tariffa`) come da spec, idempotenti (`CREATE TABLE IF NOT EXISTS`).
- RLS: `ENABLE ROW LEVEL SECURITY` su tutte; SELECT pubblicato per autenticati + tutto per super_admin; write solo super_admin (riusa helper `is_super_admin()` se esiste, altrimenti `EXISTS user_roles role='super_admin'`).
- FTS: colonna `search tsvector` generata da `descrizione||codice` + indice GIN; indici `(fonte_id, codice)`, `(fonte_id, capitolo_id)`.
- NON applicare.

### Task A2 — Tipi contratto
- Create: `src/lib/prezzario/tipi.ts` — interfacce `PrezzarioFonte`, `PrezzarioCapitolo`, `PrezzarioVoce`, `ManodoperaTariffa`, `StatoFonte`. Hand-written (non dai tipi generati). Questo è il CONTRATTO per tutti i task a valle.

### Task A3 — Motore ingestione (puro + test)
- Create: `src/lib/prezzario/import.ts` — `parsePrezzarioRegionale(matrix, opts)` che estende il pattern di `src/lib/tariffe/prezziarioImport.ts`:
  - riusa `parseItalianNumber`, alias header, `normHeader`;
  - riconosce colonne: codice, descrizione, UM, prezzo, **incidenza_manodopera (%)**, capitolo/super-categoria;
  - ricostruisce la **gerarchia capitoli** dal codice (es. `01`, `01.A`, `01.A.05`) o da colonna capitolo;
  - output: `{ capitoli: ParsedCapitolo[], voci: ParsedVoce[], detectedColumns, globalErrors }`.
- Create: `src/lib/prezzario/adapters.ts` — `REGION_ADAPTERS: Record<regione, ColumnPreset>` (mappa header→campo per le regioni note) + `pickAdapter(regione?)` con fallback autodetect.
- Test: `src/lib/prezzario/import.test.ts` — matrice di esempio (con gerarchia + incidenza) → capitoli/voci attesi; numeri IT; righe invalide.

### Task A4 — Queries
- Create: `src/lib/prezzario/queries.ts` (react-query): `usePrezzarioFonti()` (pubblicate), `usePrezzarioVoci(fonteId, search)` (FTS), `usePrezzarioCapitoli(fonteId)`, `useAdottaPrezzario()` (copia voci selezionate in `rst_listino_voci` con margine % param).

## Fase B — Ingestione lato super-admin

### Task B1 — Edge import
- Create: `supabase/functions/prezzario-import/index.ts` — `requireAuth` + gate super_admin; body `{ fonte, capitoli, voci }`; upsert fonte (per regione+anno+versione), bulk insert capitoli+voci idempotente; ritorna conteggi. `deno check`.

### Task B2 — UI super-admin
- Create: `src/pages/admin/PrezzariRegionali.tsx` — upload Excel/CSV (riusa `parsePrezzarioFile`-style) → scelta regione/anno/versione + preset → anteprima (capitoli/voci, errori) → "Pubblica" (chiama edge). Lista fonti esistenti con stato.
- Route + voce nav nell'area admin (cerca il pattern delle altre pagine admin).

## Fase C — Adozione lato azienda

### Task C1 — Adozione nel wizard Ristrutturazione
- Nel wizard (StepListino/computo): blocco "Importa da prezzario regionale" → `usePrezzarioFonti` → scegli fonte → scegli capitoli/voci → `useAdottaPrezzario` (margine default configurabile) → copia in `rst_listino_voci`. Conserva `fonte_riferimento` testuale sulla voce copiata.

### Task C2 — Match computo sul prezzario centrale
- Estendi il matching del computo (`src/lib/computo/quoteItemMapping.ts` / RPC match) per cercare anche in `prezzario_voce` (FTS) oltre al listino azienda; risultati marcati "da prezzario regionale".

### Task C3 — Citazione fonte nel PDF/preventivo
- Dove il computo/preventivo mostra le voci, esponi "Fonte: <nome fonte>" quando presente.

---

## Note esecuzione
- A1+A2 prima (contratto), poi A3/A4 e B/C in parallelo dove i file sono disgiunti.
- Senza i file Excel reali delle regioni, la v1 si verifica con una **matrice di esempio** nei test; il caricamento dati reale avviene via UI (B2) quando si hanno i file.
- Verifica per ogni task: eslint 0 nuovi + (vitest per lib / deno check per edge / vite build per UI).
