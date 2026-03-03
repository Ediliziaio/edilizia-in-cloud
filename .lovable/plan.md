

# Dashboard Marketing — Code Audit & Hardening Report

## A) Issues Found

### 1. Duplicated Code (DRY violation)
- `formatValue()` is duplicated identically in `DashboardStrategicKPI.tsx` and `DashboardKPICards.tsx`
- `calcDelta()` is duplicated identically in the same two files
- `fmt()` / `fmtCur()` formatters are duplicated across `DashboardSalesTable.tsx`, `DashboardSourcesTable.tsx`, `DashboardCallCenter.tsx`, `DashboardForecast.tsx`
- **Fix**: Extract shared formatters into `src/components/marketing/dashboard/utils.ts`

### 2. `SalesTargetsDialog` — Missing `useCallback` dep + loads ALL profiles
- `loadData` is defined inside component but referenced in `useEffect` without stable reference — causes ESLint warning
- Fetches ALL profiles for company (no limit) — potential performance issue for large teams
- Targets with all-zero values are excluded from upsert, but existing targets can never be "cleared" (set to 0)
- **Fix**: Wrap `loadData` with `useCallback`, add `.limit(100)` to profiles query, include zero-target rows in upsert for already-existing targets

### 3. `DashboardSalesTable` — `sales_targets` typed as `any`
- Uses `from("sales_targets" as any)` which bypasses TypeScript safety
- Same issue in `SalesTargetsDialog`
- **Fix**: Since the table exists in types, remove `as any` casts (if type generation has occurred). If types are stale, keep cast but add a `// TODO` comment

### 4. `DashboardFilters` — Sources query fetches all rows
- `marketing_contacts` query at line 54 selects ALL contacts just to extract distinct sources — no `.limit()` and no server-side distinct
- **Fix**: Use a raw RPC or add `.limit(500)` as safety net + deduplicate client-side (already done, but the unbounded fetch is risky)

### 5. `DashboardInsights` — Potential crash with empty `alerts`
- Line 119: `alerts || {} as AlertsData` — casting empty object to `AlertsData` means all numeric fields will be `undefined`, but `generateInsights` accesses `.stale_leads` directly
- Already handled with `?? 0` on line 95, so no crash — but the pattern is fragile
- **Fix**: Provide proper default AlertsData object

### 6. `DashboardTrendChart` — `parseISO` can throw on malformed dates
- If RPC returns unexpected date format, `parseISO` throws and breaks the entire dashboard
- **Fix**: Wrap in try-catch or validate before parse

### 7. No `React.memo` on heavy child components
- All 10 dashboard widgets re-render when any filter changes, even if their data hasn't changed
- **Fix**: Wrap pure display components (`DashboardFunnel`, `DashboardCallCenter`, `DashboardSourcesTable`, `DashboardTrendChart`) in `React.memo`

### 8. `DashboardStrategicKPI` — Hardcoded targets
- Line 26-31: Targets are hardcoded (50000, 10, 30, 75) instead of using the `sales_targets` table data
- **Fix**: Accept optional `targets` prop to override hardcoded defaults

### 9. Missing error state handling in `MarketingDashboard`
- `useMarketingDashboard` returns `error` but it's never used in the page component
- If RPC fails, dashboard shows loading skeletons forever
- **Fix**: Add error state UI with retry button

## B) No-Breaking Improvements

### Performance
- Extract shared formatters to reduce bundle duplication
- Add `React.memo` to 4 pure display components
- Add `.limit(500)` safety to sources query in filters
- Add `.limit(100)` to profiles query in SalesTargetsDialog

### UX
- Add error state with retry CTA when RPC fails
- Add empty dashboard state when no company is selected

### Stability
- Safe date parsing in TrendChart
- Proper default for AlertsData
- Remove `as any` casts where possible

## C) Files to Modify

| File | Changes |
|------|---------|
| **New**: `src/components/marketing/dashboard/utils.ts` | Shared `formatValue`, `calcDelta`, `fmt`, `fmtCur` |
| `DashboardStrategicKPI.tsx` | Import from utils, remove duplicates |
| `DashboardKPICards.tsx` | Import from utils, remove duplicates |
| `DashboardSalesTable.tsx` | Import from utils, remove `as any` |
| `DashboardSourcesTable.tsx` | Import from utils, wrap in `React.memo` |
| `DashboardCallCenter.tsx` | Import from utils, wrap in `React.memo` |
| `DashboardFunnel.tsx` | Wrap in `React.memo` |
| `DashboardTrendChart.tsx` | Safe date parsing, wrap in `React.memo` |
| `DashboardForecast.tsx` | Import from utils |
| `DashboardInsights.tsx` | Proper AlertsData default |
| `DashboardFilters.tsx` | Add `.limit(500)` to sources query |
| `SalesTargetsDialog.tsx` | `useCallback` for loadData, `.limit(100)` |
| `MarketingDashboard.tsx` | Add error state UI |

No functional behavior changes. All improvements are stability, performance, and code quality focused.

