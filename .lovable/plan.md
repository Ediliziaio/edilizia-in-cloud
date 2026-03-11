

# Piano Audit Super Admin — Implementazione

Dopo un'analisi approfondita del codice, molte delle problematiche ipotizzate nel prompt sono gia gestite correttamente. Di seguito il piano con i fix effettivi da applicare, organizzati per priorita.

---

## Stato Attuale — Gia Implementato Correttamente

- `useSuperAdminPermissions` ha gia bootstrap logic (ALL_TRUE solo se adminCount === 1, altrimenti NO_ACCESS)
- `CompaniesList` applica gia `allowed_company_ids` filtering (linea 118-123)
- `AuditLogTab` ha gia filtri per data, azione e ricerca con debounce
- `FeatureFlags` ha gia `AlertDialog` per bulk enable con conferma
- `AdminSupportChatList` ha gia `agingHours` calcolato e filtri per status/priorita
- `CompanyLifecycle` ha gia `TrialExtensionButton` con contatore estensioni e AlertDialog
- RPC admin chiamate gia in parallelo con `Promise.all` in `useAdminDashboardData` e `useAdminRevenueData`
- Impersonation gia loggata via edge function `sign-in-as-user` / `secure-impersonation`
- `SuperAdminPermissionsDialog` ha gia debounce sulla ricerca aziende

---

## Fix da Applicare (15 interventi)

### Batch 1 — Type Safety e `as any` Cleanup (4 file)

**1. Creare `src/types/adminRpc.ts`** con interfacce tipizzate per le RPC:
- `CompanyOrderStats`, `CompanyHealthData`, `TotalOrdersValue`

**2. `src/hooks/useAdminDashboardData.ts`** — Rimuovere `as any` (linee 80, 140, 150):
- `(ordersAggRes.data as any)?.[0]` → tipo esplicito `TotalOrdersValue`
- `(order: any)` e `(ticket: any)` → tipi inline dalle select

**3. `src/hooks/useAdminRevenueData.ts`** — Rimuovere `as any` (linee 103-104, 167-168):
- `calculateHealthScore(company: any, healthData: any)` → tipi espliciti
- `healthDataMap = new Map<string, any>` → `Map<string, CompanyHealthData>`
- `(healthRes.data || []).forEach((h: any)` → tipo `CompanyHealthData`

**4. `src/pages/admin/CompaniesList.tsx`** — Rimuovere `as any` nelle linee 120, 131, 149, 165, 189, 204, 621-622:
- Tipizzare i risultati delle RPC `get_company_order_stats`, `get_company_user_counts`, `get_company_health_data`, `get_company_last_access`

### Batch 2 — Security Hardening (3 file)

**5. `src/hooks/useSuperAdminPermissions.ts`** — Aumentare `staleTime` a 30 minuti:
- Cambiare `staleTime: 5 * 60 * 1000` → `staleTime: 30 * 60 * 1000` (permessi cambiano raramente)

**6. `src/components/admin/settings/SuperAdminPermissionsDialog.tsx`** — Bloccare self-edit:
- Aggiungere check `isSelf = adminId === user?.id`
- Se `isSelf`, disabilitare tutti i toggle e mostrare nota "Non puoi modificare i tuoi permessi"

**7. `src/pages/admin/SubscriptionPlans.tsx`** — Warning modifica piano attivo:
- Prima di salvare un piano con aziende associate, mostrare AlertDialog:
  "Questo piano e usato da N aziende. Le modifiche avranno effetto immediato."

### Batch 3 — UX e Resilienza (5 file)

**8. `src/components/admin/dashboard/AdminRevenueForecast.tsx`** — Forecast gia clampato a 0 (linea 484 in hook). Nessun fix necessario.

**9. `src/components/admin/dashboard/AdminCohortAnalysis.tsx`** — Le label gia usano `format(cohortMonth, "MMM yy", { locale: it })` nel hook. Nessun fix necessario.

**10. `src/pages/admin/SyncLogs.tsx`** — Aggiungere KPI cards aggregate in cima:
- Sync completati (24h), falliti (24h), % successo — calcolati dai dati gia fetchati

**11. `src/components/admin/support/AdminSupportChatList.tsx`** — Aggiungere badge SLA visivo:
- Usare `agingHours` gia calcolato per mostrare badge colorato (verde ≤4h, giallo ≤24h, rosso >24h)

**12. `src/components/admin/settings/AuditLogTab.tsx`** — Aggiungere export CSV:
- Bottone "Esporta CSV" che serializza i log visibili con date, admin, azione, dettaglio

### Batch 4 — Miglioramenti Minori (3 file)

**13. `src/pages/admin/FeatureFlags.tsx`** — Aggiungere audit log su toggle singolo:
- In `toggleOverrideMutation.onSuccess`, inserire record in `admin_audit_log`

**14. `src/components/admin/QuickLoginReturnBanner.tsx`** — Verificare sticky positioning:
- Aggiungere `sticky top-0 z-50` se non presente

**15. `src/components/admin/QuickLoginPopover.tsx`** — Loading state gia presente (linea 95 `loading` state + spinner linea 224-228). Nessun fix necessario.

---

## File che verranno creati
- `src/types/adminRpc.ts`

## File che verranno modificati
- `src/hooks/useAdminDashboardData.ts` (type safety)
- `src/hooks/useAdminRevenueData.ts` (type safety)
- `src/pages/admin/CompaniesList.tsx` (type safety)
- `src/hooks/useSuperAdminPermissions.ts` (staleTime)
- `src/components/admin/settings/SuperAdminPermissionsDialog.tsx` (self-edit block)
- `src/pages/admin/SubscriptionPlans.tsx` (warning piano attivo)
- `src/pages/admin/SyncLogs.tsx` (KPI cards)
- `src/components/admin/settings/AuditLogTab.tsx` (export CSV)
- `src/pages/admin/FeatureFlags.tsx` (audit log toggle)
- `src/components/admin/QuickLoginReturnBanner.tsx` (sticky)

## Scope escluso (gia implementato)
- Bootstrap permissions (gia deny-by-default con fallback single-admin)
- allowed_company_ids filtering (gia in CompaniesList)
- Impersonation audit (gia via edge function)
- Bulk enable AlertDialog (gia in FeatureFlags)
- Trial extension limit (gia in CompanyLifecycle)
- Debounce ricerca (gia ovunque)
- Promise.all per RPC (gia presente)

