

# Audit Tecnico Completo — Edilizia in Cloud

## FASE 1: Report Problemi Identificati

### CRITICI (P0)

| # | Area | Problema | Impatto |
|---|------|----------|---------|
| 1 | **Lockfile duplicati** | Presenti sia `bun.lock`, `bun.lockb` che `package-lock.json` — rischio di dipendenze incoerenti tra ambienti | Build instabile |
| 2 | **Global Search: query sequenziali** | `useGlobalSearch.ts` esegue 4 query Supabase in sequenza (orders → profiles → contacts → tickets) invece che in parallelo | Latenza 4x |
| 3 | **Query keys non centralizzate** | ~31 hook usano `queryKey: ["string-inline"]` invece di `queryKeys.*` dalla factory. Es: `useAdminDashboardData`, `useMarginData` (6 query), `useCruscottoData` (5 query), `usePrimaNota`, `useWarehouseSections`, `usePurchaseOrders`, `useHealthScores`, `useAdminRevenueData`, `useBrandSettings` | Invalidazione cache incoerente, rischio refetch duplicati |
| 4 | **`select("*")` diffusi** | 135 file con 1053 occorrenze di `select("*")` — 23 solo in `/src/hooks/`. Payload eccessivi specialmente su tabelle grandi (`company_costs`, `notifications`, `suppliers`) | Bandwidth/memoria |

### MEDI (P1)

| # | Area | Problema |
|---|------|----------|
| 5 | **`getDateRange` duplicato 3 volte** | Stessa funzione identica in `useCompanyDashboardData`, `useMarketingDashboard`, `useCruscottoData` (+ variante in `Scadenzario.tsx`) |
| 6 | **`as never` pattern** | 776 occorrenze in 40 file — usato come workaround per tabelle non presenti nel type schema auto-generato. Non è un bug ma degrada la type safety |
| 7 | **`any` pervasivo negli hook** | 814 occorrenze in 29 hook — casting forzati (`data as any`, `err: any`, `Record<string, any>`) che mascherano errori a compile-time |
| 8 | **`useCashFlowData` monolitico** | 570 righe, 14 query separate, 14 flag `isLoading` concatenati. Già usa RPC per summary ma mantiene molte query raw parallele |
| 9 | **`useCruscottoData` dipendenza cascata** | `opsData` e `weeklyData` dipendono da `paymentsData` (cascading queries) — genera 2 waterfall round-trip |
| 10 | **`@types/dompurify` in dependencies** | Dovrebbe essere in `devDependencies` |
| 11 | **App.tsx: 512 righe** | File monolitico con ~160 lazy import + tutte le route. Funziona ma è poco manutenibile |

### PULIZIA CODICE (P2)

| # | Area | Problema |
|---|------|----------|
| 12 | **`safeNumber` definito in hook** | Utility pura (`safeNumber`) definita in `useCruscottoData.ts` e importata da componenti — dovrebbe stare in `src/lib/` |
| 13 | **`useAdminDashboardData` calcola MRR client-side** | Scarica TUTTE le companies con join su piani e calcola MRR trend 6 mesi in un loop O(n*6). Con molte aziende diventa costoso |
| 14 | **`updateFilters` duplicato** | Pattern identico (callback con `getDateRange` + spread) in 3 hook dashboard |

---

## FASE 2: Piano Interventi (priorità per impatto/sicurezza)

### Task 1: Parallelizzare Global Search
- Convertire le 4 query sequenziali in `useGlobalSearch.ts` in `Promise.all`
- Riduzione latenza: da ~4x a ~1x RTT

### Task 2: Estrarre `getDateRange` e `safeNumber` in utility condivise
- Creare `src/lib/dateRangeUtils.ts` con `getDateRange` generico (unione dei 3 preset types)
- Spostare `safeNumber` da `useCruscottoData` a `src/lib/numberUtils.ts`
- Aggiornare import in tutti i consumer (4+ file)

### Task 3: Migrare query keys inline alla factory centralizzata
- Aggiornare i ~15 hook più importanti per usare `queryKeys.*`
- Aggiungere entry mancanti alla factory: `margin`, `primaNota` (already exists ma non usata), `warehouseSections`, `purchaseOrders`, `healthScores`, `adminRevenue`, `brandSettings`, `internalAutomations`
- Aggiornare anche le `invalidateQueries` corrispondenti

### Task 4: Ridurre `select("*")` nei hook critici
- Sostituire con select espliciti nei hook ad alto traffico: `useNotifications`, `useOperationalSuppliers`, `useInternalAutomations`, `useCashFlowData` (company_costs), `useFormBuilder`, `useAutomationBuilder`, `usePermissions`
- Non toccare file a basso traffico (admin settings) per evitare regressioni

### Task 5: Modularizzare App.tsx in route modules
- Estrarre route groups in file separati: `src/routes/adminRoutes.tsx`, `src/routes/companyRoutes.tsx`, `src/routes/customerRoutes.tsx`, `src/routes/employeeRoutes.tsx`, `src/routes/salespersonRoutes.tsx`, `src/routes/partnerRoutes.tsx`, `src/routes/publicRoutes.tsx`
- App.tsx diventa ~80 righe: providers + composizione route modules
- Tutte le route, protezioni, lazy load e layout rimangono identici

### Task 6: Pulire lockfile e dipendenze
- Rimuovere `bun.lock` e `bun.lockb` (il progetto usa npm/`package-lock.json` per Lovable)
- Spostare `@types/dompurify` da `dependencies` a `devDependencies`

### Task 7: Ottimizzare `useAdminDashboardData`
- Usare `queryKeys.admin.dashboard()` dalla factory
- Il calcolo MRR trend lato client è accettabile per ora (poche centinaia di aziende), ma annotare come candidato per RPC futura

### Task 8: Ridurre waterfall in `useCruscottoData`
- Unificare la query `paymentsData` inline nelle query `opsData` e `financeData` dove possibile, oppure rimuovere il `enabled: paymentsData !== undefined` guard facendo il fetch indipendente e usando i dati nel `useMemo`

---

## Cosa NON toccare (rischio regressione > beneficio)

- **`as never` pattern**: richiede rigenerazione dello schema DB, non un refactor frontend
- **`useCashFlowData` splitting**: già funziona e usa RPC per summary; splitting ulteriore richiederebbe riscrittura dei consumer
- **Routing paths**: nessuna modifica a URL, protezioni, o redirect
- **Business logic**: nessun cambiamento a calcoli, formule, o logiche di dominio
- **UI/UX**: zero modifiche visive

## Stima effort
- Task 1: piccolo (1 file)
- Task 2: piccolo (3 file nuovi + 6 import updates)
- Task 3: medio (15+ file, ma meccanico)
- Task 4: medio (7 file, richiede verifica campi usati)
- Task 5: medio (1 file grande → 8 file, refactor strutturale)
- Task 6: piccolo (config only)
- Task 7: piccolo (1 file)
- Task 8: medio (1 file, logica cascading)

