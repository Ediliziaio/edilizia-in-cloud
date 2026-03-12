

# Fix All Bugs and Critical Issues — Native Billing Module (F0-F5)

## Fixes

### 1. CRITICAL — NC prefilled data lost in EditorDocumento
**File**: `src/pages/azienda/fatturazione/EditorDocumento.tsx`
**Bug**: `creaNotaCredito` returns prefilled data passed via `navigate(..., { state: { prefilled } })`, but the editor ignores `location.state.prefilled` and always creates empty doc.
**Fix**: Read `location.state?.prefilled` and pass extra fields into `createMutation.mutate({ tipo: tipoParam, ...prefilled })` so the insert includes righe, cliente, documento_correlato_id, etc.

### 2. CRITICAL — DDT XML field mismatch
**File**: `src/lib/fatturazione/fatturazioneAvanzata.ts` line 42-46
**Bug**: Creates `riferimenti_ddt` with keys `{ numero, data, id }` but `generateXML.ts` expects `{ NumeroDDT, DataDDT }`.
**Fix**: Change keys in `fatturazioneAvanzata.ts` to `{ NumeroDDT: ddt.numero, DataDDT: ddt.data_emissione, id: ddt.id }`.

### 3. HIGH — Search doesn't match cliente name
**File**: `src/hooks/useDocumentiFiscali.ts` line 110
**Bug**: `.or("numero.ilike..., note_documento.ilike...")` misses `cliente_snapshot->>'ragione_sociale'`.
**Fix**: Add `cliente_snapshot->>ragione_sociale.ilike.%${filters.search}%` to the or clause.

### 4. HIGH — KPI cards are pagination placeholders
**File**: `src/pages/azienda/fatturazione/DocumentiFiscaliList.tsx` lines 171-176
**Bug**: Shows "Documenti totali / In questa pagina / Pagina / Per pagina" instead of financial KPIs.
**Fix**: Add a separate unfiltered query to compute real KPIs (Fatturato mese, Da incassare, Scadute count, Bozze count) using aggregate sums from the DB.

### 5. MEDIUM — `arrotondamento` missing from autosave serialization
**File**: `src/pages/azienda/fatturazione/editor/useEditorState.ts`
**Bug**: `arrotondamento` is used in `recalculate` but not included in the serialization object (line 171-198) or the save payload (line 205-243).
**Fix**: Add `arrotondamento` to both the serialization JSON and the mutation payload.

### 6. MEDIUM — Saldo netto KPI is logically wrong
**File**: `src/pages/azienda/fatturazione/RegistroIncassi.tsx` line 64
**Bug**: `saldo = daIncassare - scaduto` is meaningless since scaduto is a subset of daIncassare.
**Fix**: Change to `saldo = incassatoMese - scaduto` or rename to "Non scaduto" = `daIncassare - scaduto`.

### 7. MEDIUM — AnagraficaDetail loads ALL movimenti, filters client-side
**File**: `src/pages/azienda/fatturazione/AnagraficaDetail.tsx` lines 29-32
**Bug**: `useMovimentiCassa({ documento_id: undefined })` fetches up to 500 movimenti then filters by docIds in JS.
**Fix**: Since we can't filter by anagrafica_id on movimenti_cassa_native directly, pass the list of documento IDs to filter. Alternatively, skip movimenti query until documenti are loaded, then pass IDs.

## Files to modify

| File | Changes |
|------|---------|
| `EditorDocumento.tsx` | Read `location.state?.prefilled`, pass to createMutation |
| `fatturazioneAvanzata.ts` | Fix DDT reference keys to `NumeroDDT`/`DataDDT` |
| `useDocumentiFiscali.ts` | Add JSONB cliente search to `.or()` |
| `DocumentiFiscaliList.tsx` | Replace placeholder KPIs with real aggregate queries |
| `useEditorState.ts` | Add `arrotondamento` to serialization + save payload |
| `RegistroIncassi.tsx` | Fix saldo netto calculation |
| `AnagraficaDetail.tsx` | Defer movimenti query until doc IDs available |

