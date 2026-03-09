

## Piano: Prompt 4 — Deduplicazione e Pulizia

Stato attuale dopo analisi del codice:

| Fix | Stato | Intervento |
|-----|-------|-----------|
| 20 | Da fare | `OrdersList.tsx` e `CashFlowForecast.tsx` hanno CSV inline; `useWarehouseData.ts` pure. Tutti e 3 vanno refactorizzati per usare `src/lib/csvExport.ts` già esistente |
| 21 | Già fatto | `useWarehouseData` usa paginazione server-side (PAGE_SIZE=50 con range), nessun `.limit(2000)` hardcoded |
| 22 | Skip | monthFilter/contractDateRange da verificare ma rischio regressione UI |
| 23 | Da fare | Calendar localStorage salva ad ogni cambio di 8 dipendenze — aggiungere debounce 500ms |
| 24 | Skip | Rimozione import inutilizzati — basso impatto, rischio errore |
| 25 | Da fare | 3 query separate (pipelines, tags, listCount) in MarketingContacts → consolidare in un unico `useQuery` con `Promise.all` e `staleTime: 10min` |
| 26 | Già fatto | `handleStatusChange` e `handleBatchStatusChange` sono definite nel hook `useWarehouseData` (non in Warehouse.tsx), dove sono già semplici wrapper su mutation — nessun beneficio da useCallback |

### Modifiche concrete

**1. FIX 20 — Deduplicazione CSV export (3 file)**

- **`OrdersList.tsx`** (righe ~600-634): rimuovere la logica CSV inline, importare e usare `exportToCSV` da `@/lib/csvExport`. Adattare il formato: definire `CsvColumn[]` con le stesse colonne attuali e costruire l'array di `Record<string, string>`.

- **`CashFlowForecast.tsx`** (righe ~55-81): stessa cosa — sostituire la generazione CSV inline con `exportToCSV`.

- **`useWarehouseData.ts`** (righe ~453-477): stessa cosa — sostituire `exportToCSV` locale con import da `@/lib/csvExport`.

Nota: `csvExport.ts` usa `;` come separatore e BOM UTF-8 — stessa convenzione già usata in OrdersList e CashFlowForecast, quindi compatibile.

**2. FIX 23 — Debounce localStorage in Calendar.tsx**

- Aggiungere `useRef` per un timer
- Nel `useEffect` che salva le prefs (riga 64-76), wrappare con `setTimeout(500ms)` e cleanup

**3. FIX 25 — Consolidamento 3 query filtri in MarketingContacts.tsx**

- Sostituire le 3 `useQuery` separate (pipelines riga 264, tags riga 280, listCount riga 296) con un unico `useQuery` che usa `Promise.all`
- Aggiungere `staleTime: 10 * 60 * 1000` (dati di riferimento)
- Destrutturare il risultato: `const { pipelines, availableTags, listCount } = filterData ?? { pipelines: [], availableTags: [], listCount: 0 }`

