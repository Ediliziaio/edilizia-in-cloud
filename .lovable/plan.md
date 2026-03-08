

# Analisi Documento "Gestione Interna" — Stato Implementazione

## Riepilogo Scorecard

| # | Fix/Feature | Stato | Note |
|---|-------------|-------|------|
| **P0** | Dashboard RPC aggregata (15 query → 1) | **FATTO** | `get_dashboard_kpis` creata e corretta (3 migration). Hook `useCompanyDashboardData` già usa RPC. staleTime 10min. |
| **P0** | Storage allegati: bucket private + signed URLs | **FATTO** | Migration esiste: bucket reso private, RLS per company, signed URLs. |
| **P0** | Magazzino: server-side filtering | **PARZIALE** | `supplierMap` memoizzata (FATTO). Ma **nessuna virtualizzazione** (`react-virtual` non installato), filtri ancora parzialmente client-side, nessun `useInfiniteQuery`. |
| **P1** | Supplier Map memoizzata (N+1 fix) | **FATTO** | `useWarehouseData.ts` usa `useMemo` con `Map`. |
| **P1** | staleTime dashboard 2min → 10min | **FATTO** | Impostato a `10 * 60 * 1000`. |
| **P1** | Duplica ordine | **FATTO** | Edge function `duplicate-order` + dialog in `OrderDetail.tsx`. |
| **P1** | Vista settimanale calendario | **FATTO** | `CalendarWeekView.tsx` con toggle nel calendario. |
| **P1** | Unificazione sistema pagamenti | **PARZIALE** | VIEW `order_payment_summary` creata, ma i componenti legacy probabilmente ancora leggono le colonne vecchie. Da verificare utilizzo effettivo della VIEW. |
| **P2** | Grafico waterfall cash flow | **FATTO** | `WaterfallChart.tsx` integrato in `CashForecastTab.tsx`. |
| **P2** | Alert soglia cash flow negativo | **FATTO** | Alert in dashboard + previsionale + edge function `check-scheduled-triggers` con notifica email. |
| **P2** | Conflict detection calendario | **FATTO** | `useConflictDetection.ts` + integrato in `Calendar.tsx`. |
| **P2** | Reminder automatici eventi calendario | **NON FATTO** | Nessun campo `reminder_at`, nessuna UI reminder nel calendario gestione interna. |
| **P2** | generate-recurring-costs: bulk insert | **FATTO** | Usa `upsert` con `onConflict` e `ignoreDuplicates`. |
| **P3** | React.memo su row components | **PARZIALE** | Solo su `WeeklyDeadlines`, `DashboardCeoStrip`, `CompanyExpandedRow`. Manca su `OrderItemRow`, `WarehouseItemRow`. |
| **P3** | CreateOrder: react-hook-form + Zod | **FATTO** | `CreateOrder.tsx` usa `useForm` + `zodResolver`. |

---

## Da Implementare (priorità decrescente)

### 1. Magazzino: virtualizzazione liste (P0 residuo)
- Installare `@tanstack/react-virtual`
- Aggiungere `useVirtualizer` in `WarehouseListView.tsx` per liste 500+ item
- Spostare filtri restanti server-side nella query Supabase

### 2. Reminder automatici eventi calendario (P2)
- Aggiungere colonna `reminder_at` e `reminder_hours` su tabella `appointments`
- UI dropdown "Reminder" nel form appuntamento/posa (1h, 2h, 24h, nessuno)
- Integrare check nella edge function `check-scheduled-triggers`
- Invio email/notifica al responsabile

### 3. React.memo su row components (P3)
- Wrappare `OrderItemRow` e `WarehouseItemRow` con `React.memo`

### 4. Unificazione pagamenti — completare migrazione (P1 residuo)
- Verificare e aggiornare tutti i componenti che leggono `deposit_amount`/`balance_amount` per usare `order_payment_summary`

---

## Dashboard — Stato attuale
La RPC `get_dashboard_kpis` è stata creata e corretta con 3 migration successive (fix `company_id`, fix `::date` cast, fix `status::text` enum). Il frontend la chiama correttamente. Se la dashboard ancora non carica, serve verificare l'errore attuale dalla console del browser.

