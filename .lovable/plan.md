

# Audit Dashboard Interna + Cruscotto Aziendale

## Bug Identificati

### P0: Refresh globale in CompanyDashboard
**File:** `src/pages/azienda/CompanyDashboard.tsx`, riga 119
`queryClient.invalidateQueries()` senza parametri invalida TUTTE le query dell'applicazione (ordini, magazzino, calendario, marketing, ecc.). Deve invalidare solo le query della dashboard.

**Fix:** Sostituire con invalidazione mirata su `queryKeys.dashboard.all`.

### P0: MRR trend storico usa status attuale
**File:** `src/hooks/useAdminDashboardData.ts`, righe 110-118
Il loop che costruisce `mrrChartData` filtra con `c.status === "active"` — che è lo stato **attuale** dell'azienda. Un'azienda oggi "expired" ma attiva 3 mesi fa viene esclusa dal MRR di 3 mesi fa. Il grafico storico è falso.

**Fix:** Senza una tabella di storico stati, il fix più corretto e pragmatico è: considerare un'azienda contribuente al MRR di un mese se era stata creata prima della fine di quel mese E il suo status NON è "expired" OPPURE (se expired) la `trial_ends_at` è successiva alla fine di quel mese. Questo è un'approssimazione migliore. Tuttavia, senza un vero audit trail degli status, la precisione sarà limitata.

Alternativa più robusta: creare una RPC `get_admin_mrr_trend` che calcoli il trend lato DB. Ma dato il vincolo di non over-engineering, propongo di correggere la logica client-side con l'euristica migliorata e aggiungere un commento che segnali il limite architetturale.

### P1: CompanyDashboard staleTime troppo alto per KPI operativi
**File:** `src/hooks/useCompanyDashboardData.ts`, riga 124
`staleTime: 10 * 60 * 1000` (10 min) per la RPC `get_dashboard_kpis` che include ordini recenti, cash flow, alert e scadenze settimanali. KPI operativi restano stale troppo a lungo.

**Fix:** Ridurre a `3 * 60 * 1000` (3 min) — allineato al cruscotto (2 min) e al marketing dashboard (3 min).

### P1: Cruscotto — lateOrders e openTickets ignorano il filtro date
**File:** `src/hooks/useCruscottoData.ts`, righe 134-139
La query `operations` include `dateRange` nella query key (riga 123) ma `lateOrders` e `openTickets` non filtrano per data — restituiscono sempre il totale globale. Il cambio di preset date causa refetch ma restituisce gli stessi numeri. Questo è coerente col significato operativo (ritardi e ticket aperti sono snapshot, non legati al periodo) ma la query key include le date inutilmente, causando refetch senza motivo.

**Fix:** Rimuovere `dateRange.from/to` dalla query key di operations, mantenere solo `statusId`. Così il cambio filtro date non causa refetch inutili per dati che non cambiano.

### P1: Cruscotto — finance non usa statusId
**File:** `src/hooks/useCruscottoData.ts`, righe 170, 181-186
La query key di `finance` non include `statusId`, ma `operations` sì. Se l'utente filtra per stato ordine, vede operazioni filtrate ma finanza non filtrata. Questo è potenzialmente intenzionale (la finanza è globale), ma la mancata inclusione del filtro nella key è un rischio se in futuro si volesse filtrare.

**Decisione:** Questo è un comportamento funzionale legittimo (la finanza non dipende dallo stato ordine singolo). Nessuna modifica, ma documentare.

## Piano Correzioni

### File 1: `src/pages/azienda/CompanyDashboard.tsx`
- Riga 119: sostituire `queryClient.invalidateQueries()` con `queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all })`
- Import `queryKeys` se non già presente

### File 2: `src/hooks/useAdminDashboardData.ts`
- Righe 110-118: correggere la logica MRR trend per non contare come "active" aziende che a quel mese non esistevano ancora o erano già expired
- Euristica migliorata: un'azienda contribuisce al MRR di un mese storico se:
  - `created_at <= monthEnd`
  - AND (`status === "active"` OR (`status === "expired"` AND non ha `trial_ends_at` oppure `trial_ends_at > monthEnd`))

### File 3: `src/hooks/useCompanyDashboardData.ts`
- Riga 124: ridurre `staleTime` da `10 * 60 * 1000` a `3 * 60 * 1000`

### File 4: `src/hooks/useCruscottoData.ts`
- Riga 123: rimuovere `dateRange.from/to` dalla query key di operations, lasciare solo `companyId` e `statusId`

## Riepilogo

| File | Fix | Tipo |
|------|-----|------|
| `CompanyDashboard.tsx` | Refresh mirato | Cache |
| `useAdminDashboardData.ts` | MRR trend storico | Correttezza KPI |
| `useCompanyDashboardData.ts` | staleTime ridotto | Freschezza |
| `useCruscottoData.ts` | Query key operations senza date | Performance |

4 file, 4 fix. Nessun rischio di regressione. Nessun cambio UX.

