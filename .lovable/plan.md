

# Piano: Refactoring Fase 2 — Query Keys, Select Ottimizzati, Waterfall Fix

## Interventi pianificati

### Task 1: Migrare query keys inline alla factory centralizzata

**File:** `src/hooks/useCruscottoData.ts`
- Sostituire le 7 query key inline (`["cruscotto-marketing", ...]`, `["cruscotto-installments", ...]`, etc.) con le corrispondenti entry da `queryKeys.cruscotto.*` gia definite in `queryKeys.ts`

**File:** `src/hooks/useAdminDashboardData.ts`  
- Sostituire `["admin-dashboard-data"]` con `queryKeys.admin.dashboard()`

**File:** `src/hooks/useMarketingDashboard.ts`
- Sostituire `["marketing-dashboard", ...]` con una nuova entry `queryKeys.marketing.dashboard(...)` da aggiungere alla factory

**File:** `src/lib/queryKeys.ts`
- Aggiungere sezione `marketing` con `dashboard(companyId, ...filters)`

### Task 2: Ridurre `select("*")` nei hook ad alto traffico

**File:** `src/hooks/useNotifications.ts`
- Sostituire `.select("*")` con `.select("id, company_id, user_id, type, title, body, entity_type, entity_id, action_url, is_read, is_dismissed, created_at")` — gia definiti nell'interfaccia `Notification`

**File:** `src/hooks/useAdminDashboardData.ts`
- Sostituire `companies.select("*")` (riga 63, recentCompanies) con `.select("id, name, email, sector, logo_url, created_at")`
- La query allCompanies (riga 76) gia seleziona campi specifici — OK

### Task 3: Rimuovere waterfall in `useCruscottoData`

**File:** `src/hooks/useCruscottoData.ts`
- Il problema: `opsData` e `weeklyData` hanno `enabled: !!companyId && paymentsData !== undefined` — creano 2 round-trip aggiuntivi in cascata
- Soluzione: rimuovere la dipendenza da `paymentsData` nelle query `opsData` e `weeklyData`. Queste query gia fanno le proprie chiamate Supabase; la parte che usa `paymentsData` (calcolo overdue/upcoming) viene spostata in un `useMemo` separato che combina i risultati indipendenti
- Creare `useMemo` per `mergedOpsData` che unisce `rawOpsData` + `paymentsData` senza bloccare il fetch iniziale
- Stesso pattern per `weeklyData`: fetch costi/deliveries/appuntamenti indipendentemente, merge payments in useMemo

### Task 4: Ottimizzare `useAdminDashboardData` — query key + select

**File:** `src/hooks/useAdminDashboardData.ts`
- Usare `queryKeys.admin.dashboard()` 
- Ridurre `select("*")` su recentCompanies

---

## File modificati (totale: 4)

| File | Tipo modifica |
|------|--------------|
| `src/lib/queryKeys.ts` | Aggiunta sezione `marketing` |
| `src/hooks/useCruscottoData.ts` | Query keys factory + waterfall removal |
| `src/hooks/useAdminDashboardData.ts` | Query key factory + select ottimizzato |
| `src/hooks/useMarketingDashboard.ts` | Query key factory |
| `src/hooks/useNotifications.ts` | Select esplicito |

## Rischi e mitigazioni

- **Query keys**: il cambio delle key invalida la cache corrente. Impatto: una sola richiesta aggiuntiva al primo caricamento post-deploy. Nessun impatto funzionale.
- **Waterfall removal**: il merge via `useMemo` mantiene identico l'output. I dati overdue appaiono appena `paymentsData` arriva, ma `opsData.activeOrders/lateOrders/openTickets` sono visibili immediatamente senza attendere payments.
- **Select esplicito notifications**: tutti i campi usati dall'interfaccia `Notification` sono inclusi. Nessun campo mancante.

