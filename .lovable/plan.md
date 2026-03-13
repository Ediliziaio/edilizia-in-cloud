

## CALL-REP-01 — Call Center Reporting: Schema DB + Tab + Hook + Components

### Database Schema Discovery

**Real tables and fields:**

| Placeholder | Real value |
|---|---|
| `{CONTACTS}` | `marketing_contacts` |
| `{ACTIVITIES}` / `{CALLS}` | `call_logs` (dedicated call table, not generic activities) |
| `{APPOINTMENTS}` | `appointments` |
| `{AGENT_FIELD}` (calls) | `call_logs.user_id` |
| `{CONTACT_FIELD}` (calls) | `call_logs.contact_id` |
| `{COMPANY_FIELD}` | `company_id` (on all tables) |
| `{CONTACT_SOURCE_FIELD}` | `marketing_contacts.source` |
| `{ESITO_FIELD}` | `call_logs.outcome` |
| `{DURATA_FIELD}` | `call_logs.duration_sec` (integer, seconds) |
| `{APT_AGENT_FIELD}` | `appointments.created_by` |
| `{APT_STATUS_FIELD}` | `appointments.status` |
| `{APT_SHOWED_VALUE}` | `'confermato'` (only status found) |
| Contact assigned_to | `marketing_contacts.assigned_to` |

**Key observation:** `call_logs` is a dedicated calls table (not a generic activities table). No `type` field needed — every row IS a call. The `outcome` column has no data yet (empty table), so we'll define expected values: `'answered'`, `'no_answer'`, `'voicemail'`, `'busy'`.

**Important:** `duration_sec` is in seconds (not minutes) — SQL needs `/60.0`.

---

### Plan

#### Step 1 — Database Migration (4 objects)

Create view `callcenter_lead_journey` and 4 RPC functions, adapted to actual schema:

- **View `callcenter_lead_journey`**: joins `marketing_contacts` ← `call_logs` ← `appointments` to compute per-lead: speed-to-lead, nr_tentativi, fu_contattato, durata_media, appuntamenti_fissati/show_up
- **`get_callcenter_kpi_per_operatore()`**: aggregates view data per operator with all KPIs (lead_assegnati, tasso_contatto, speed_to_lead, appuntamenti, show_up, produttività)
- **`get_callcenter_speed_to_lead_distribuzione()`**: histogram buckets for speed-to-lead
- **`get_callcenter_trend_giornaliero()`**: daily trend of calls/contacts/appointments
- **`get_callcenter_fonte_lead_performance()`**: performance by lead source

All functions use `SECURITY DEFINER` + `SET search_path = public`, take `p_company_id` for RLS isolation.

Key adaptations from template:
- `call_logs` has no `tipo` field — all rows are calls
- `duration_sec` / 60.0 for minutes conversion
- `outcome = 'answered'` for successful contact
- `appointments.status = 'confermato'` for show-up
- User info from `auth.users` (id, raw_user_meta_data->>'full_name', email)

#### Step 2 — Hook: `src/hooks/useCallCenterReport.ts`

- TypeScript interfaces for all 4 return types
- 4 hooks using `useQuery` + `supabase.rpc()` with `as any` cast (RPC not in generated types yet)
- Reuses `useEffectiveCompanyId` (not `useCompanyId` which doesn't exist) and `usePeriodoDate` from `useVendorReport`
- Uses `date-fns` format for date params

#### Step 3 — Tab in Reportistica

Update `src/pages/azienda/ReportisticaPage.tsx`:
- Add `"calls"` to `IMPLEMENTED_TABS`
- Import and mount `CallCenterReport` component in the existing `"calls"` tab content
- The tab trigger already exists ("Report sulle chiamate")

#### Step 4 — Container Component: `CallCenterReport.tsx`

Create `src/components/reporting/callcenter/CallCenterReport.tsx`:
- Operator selector + period selector (reuses `PeriodoVendor` type)
- Sub-tabs: Panoramica, Speed to Lead, Trend, Fonti Lead
- Aggregates team-level KPIs when "tutti" selected

#### Step 5 — Sub-components (4 files)

1. **`CallCenterKPISection.tsx`**: 8 KPI cards with semaphore colors (speed-to-lead, tasso contatto, tasso app, volume chiamate, etc.)
2. **`SpeedToLeadChart.tsx`**: Horizontal bar chart of speed buckets with color coding
3. **`CallCenterTrendChart.tsx`**: Daily ComposedChart (calls, contacts, appointments) + table
4. **`FonteLeadTable.tsx`**: Table showing lead source performance with quality badges

