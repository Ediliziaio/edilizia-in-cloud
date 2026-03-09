

## Piano: Completamento Fix Residui Performance

I 4 prompt sono stati eseguiti ma restano 3 gap da colmare:

### 1. FIX 3 — staleTime mancante in `useOpportunitiesData.ts`

`usePipelines()` (riga 10) e `useOpportunities()` (riga 32) non hanno `staleTime`. I 3 hook helper in basso (righe 274, 308, 341) hanno 5min ma dovrebbero avere 10min (dati di riferimento).

**Intervento:**
- `usePipelines`: aggiungere `staleTime: 10 * 60 * 1000`
- `useOpportunities`: aggiungere `staleTime: 2 * 60 * 1000`
- `useCompanyStaff`, `useCompanySalespeople`, `useCompanyCallCenterUsers`: portare da 5min a 10min

### 2. FIX 12 — `ContactsTable` non wrappato con `React.memo`

Il componente riceve array e callback dal parent e ri-renderizza inutilmente. Aggiungere `memo` wrapper all'export della funzione.

### 3. `gcTime` mancante ovunque

Nessuno dei file toccati nei prompt 1-4 ha `gcTime`. I prompt lo richiedevano esplicitamente. Aggiungere `gcTime` corrispondente a:
- `useCashFlowData.ts` (14 query): `gcTime: 15 * 60 * 1000`
- `useCompanyCostsData.ts` (7 query): `gcTime: 15 * 60 * 1000`
- `useOpportunitiesData.ts`: `gcTime: 30 * 60 * 1000` (pipelines/staff), `gcTime: 10 * 60 * 1000` (opportunities)

---

**File da modificare:** 4 file, nessuna modifica funzionale.

