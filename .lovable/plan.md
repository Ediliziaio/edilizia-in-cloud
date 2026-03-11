

# Audit Area Azienda (company_admin) — Piano di Implementazione

## Analisi Completata

Ho analizzato 50+ file nell'area azienda. La codebase e gia ben strutturata: `onError` con toast presente su tutte le mutations, `AlertDialog` per delete, `effectiveCompany` usato ovunque, `queryKeys` factory applicata, `staleTime`/`gcTime` configurati, skeleton loader presenti. Di seguito i fix residui da applicare.

---

## Batch 1 — Currency: eliminare `fmtEur` e `€` inline (8 file)

Sostituire funzioni locali `fmtEur` e template literals `€${...}` con `formatCurrency` / `formatCurrencyCompact` gia presenti in `src/lib/formatters.ts`.

| File | Problema |
|------|----------|
| `src/pages/azienda/PrimaNota.tsx` | `fmtEur` locale + `€${(v/1000)}k` axis |
| `src/pages/azienda/GlobalErrors.tsx` | `fmt` locale + `€${v}` axis |
| `src/pages/azienda/PurchaseOrdersList.tsx` | `fmtEur` locale |
| `src/pages/azienda/Suppliers.tsx` | `fmtEur` locale + `€${(v/1000)}k` axis |
| `src/pages/azienda/billing/InvoiceDetail.tsx` | `fmtEur` locale |
| `src/pages/azienda/billing/InvoicesList.tsx` | `fmtEur` locale |
| `src/components/opportunities/OpportunityCard.tsx` | inline `€ ${...}` |
| `src/components/opportunities/OpportunityQuotesTab.tsx` | `fmt` locale + inline `€ ${...}` |

Pattern:
- `fmtEur(n)` / `fmt(n)` → `formatCurrency(n)`
- `tickFormatter={(v) => \`€\${...}\`}` → `tickFormatter={formatCurrencyCompact}`
- Rimuovere dichiarazione `const fmtEur = ...`

Anche chart axes in:
- `src/components/forecast/WaterfallChart.tsx` — `€${(v/1000)}k`
- `src/components/forecast/MarginTab.tsx` — `€${(v/1000)}k`
- `src/components/forecast/CostsForecastTab.tsx` — `€${(v/1000)}k`
- `src/components/admin/dashboard/AdminMrrChart.tsx` — `€${v}`
- `src/components/admin/dashboard/AdminRevenueBySector.tsx` — `€${v}`
- `src/components/admin/dashboard/AdminDunning.tsx` — `€${...}`

**Totale: ~14 file**

## Batch 2 — Logger: console.error residui (4 file)

| File | Linea |
|------|-------|
| `src/components/settings/ChangePasswordForm.tsx` | `console.error("Error changing password:", error)` |
| `src/components/orders/CreateCustomerDialog.tsx` | `console.error("Create customer error:", error)` |
| `src/components/warehouse/WarehouseStockTab.tsx` | `console.error("Error inserting cost:", error)` |
| `src/components/marketing/automations/TriggerConditionBuilder.tsx` | `console.error("Error loading custom fields:", ...)` |

Pattern: `console.error(msg, err)` → `logger.error(msg, err)`

## Batch 3 — Type Safety: `as any` ad alto impatto (6 file)

Molti `as any` sono necessari per tabelle non in types.ts (es. `order_installments`, `scadenza_alert_prefs`, `internal_automation_*`). Questi non possono essere rimossi senza DB migration che aggiorni i tipi.

Fix applicabili senza migration:

| File | Fix |
|------|-----|
| `src/hooks/useCompanyDashboardData.ts` | `data as any` → tipo inline per il risultato RPC |
| `src/pages/azienda/CustomersList.tsx` | `rpcParams as any` → tipizzare params + `data as unknown as PaginatedResult` gia ok |
| `src/components/settings/CompanySecuritySettings.tsx` | `return data as any` → tipo inline |
| `src/components/settings/UsersConfig.tsx` | `(u.permissions as any)?.must_change_password` → optional chaining con tipo |
| `src/pages/azienda/marketing/MarketingContacts.tsx` | `(editingContact as any).city` → estendere interfaccia locale |
| `src/components/opportunities/OpportunityStatsStrip.tsx` | `fmt` locale → `formatCurrency` |

Per i rimanenti (`order_installments`, `internal_automation_*`, `scadenza_alert_prefs`, ecc.) aggiungere commento `// TODO: add to Supabase types` dove mancante.

## Batch 4 — UX: missing feedback e guard (3 file)

1. **`src/components/orders/OrdersFilters.tsx`** — Inline `€${amountMin}` nel badge filtro importo → `formatCurrency`

2. **`src/pages/azienda/CompanyDashboard.tsx`** — `WarehouseAlerts` usa `urgentItems: any[]` → creare interfaccia `UrgentWarehouseItem` inline

3. **`src/components/settings/ChangePasswordForm.tsx`** — Migrare `console.error` + confermare che il bottone ha `disabled={isLoading}`

---

## Riepilogo Impatto

| Categoria | File | Occorrenze stimate |
|-----------|------|--------------------|
| Currency refactor | 14 | ~30 occorrenze |
| Logger migration | 4 | 4 occorrenze |
| Type safety | 6 | ~12 `as any` rimossi |
| UX polish | 3 | 3 fix |
| **Totale** | **~25 file** | |

## Non necessario (gia implementato)

- `onError` toast su tutte le mutations ✓
- `AlertDialog` su delete ✓
- `effectiveCompany` usato ovunque (mai `company` diretto) ✓
- `queryKeys` factory ✓
- Skeleton loaders ✓
- `staleTime`/`gcTime` configurati ✓
- Debounce su ricerche ✓
- Empty states ✓
- `isPending` su submit buttons ✓

