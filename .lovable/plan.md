

# Paginazione tabelle del Previsionale di Cassa

## Analisi

Il modulo carica dati da 6+ tabelle diverse (installments, external teams, commissions, supplier items, company costs) e li trasforma/unisce lato client. Una paginazione server-side pura richiederebbe una RPC/view che faccia UNION di tutte le sorgenti — complesso e fragile.

L'approccio pragmatico e ad alto impatto: **paginazione lato rendering** con un hook riutilizzabile. I dati sono già caricati (max 10K per query), il collo di bottiglia reale è il rendering DOM di migliaia di righe.

## Piano

### 1. Creare hook `usePagination`
**File**: `src/hooks/usePagination.ts`

Hook generico che accetta un array di items e ritorna:
- `paginatedItems` — slice corrente
- `currentPage`, `totalPages`, `pageSize`
- `setPage`, `setPageSize`
- `goNext`, `goPrev`

### 2. Creare componente `TablePagination`
**File**: `src/components/ui/table-pagination.tsx`

Componente UI con: bottoni prev/next, indicatore pagina, selettore righe per pagina (25/50/100), conteggio totale items.

### 3. Integrare nei tab

- **CollectedTab**: paginare `sortedCollected` nella tabella "Già incassato"
- **CashForecastTab**: paginare `sortedTransactions`
- **CostsForecastTab**: paginare le righe dentro ogni `CostSection`
- **TreasuryTab**: paginare la tabella movimenti

Ogni tabella mostra 50 righe di default con navigazione in basso.

### 4. Dettaglio implementazione

Il flusso rimane: fetch → transform → filter → sort → **paginate** → render.
La paginazione si resetta a pagina 1 quando cambiano filtri, ricerca o ordinamento.

