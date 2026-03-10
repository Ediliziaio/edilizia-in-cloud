

# Audit — Marketing Calendar + Marketing Tasks

## Findings

### Bug 1 (P0): Dialog save/delete does NOT invalidate opportunities, future appointments, or marketing dashboard
**File:** `src/pages/azienda/marketing/MarketingCalendar.tsx`, line 681
The `onSaved` callback passed to `MarketingAppointmentDialog` only calls `refetchAppointments()`. When an appointment is created, updated, or deleted via the dialog, the following stay stale:
- `["marketing_opportunities"]` — opportunity cards showing next appointment
- `["contact_future_appointment"]` — contact detail future appointment widget
- `["appointments_for_slot"]` — slot availability in opportunity booking
- `queryKeys.marketing.all` — dashboard KPIs (appointments_set, appointments_done, show_rate)
- `["contact_appointments"]` — contact detail appointments list

The drag/drop and resize handlers correctly invalidate these (lines 500-503, 527-529), but the dialog path does not.

**Fix:** Update the `onSaved` callback on line 681 to also invalidate `["marketing_opportunities"]`, `["contact_future_appointment"]`, `["appointments_for_slot"]`, `queryKeys.marketing.all`, and `["contact_appointments"]`.

### Bug 2 (P1): ContactAppointmentsPanel `onSaved` only invalidates own query
**File:** `src/components/marketing/contacts/ContactAppointmentsPanel.tsx`, line 122
When creating/editing an appointment from the contact detail panel, only `["contact_appointments", contactId]` is invalidated. The calendar view, opportunities, future appointment widget, and marketing dashboard all stay stale.

**Fix:** Add invalidations for `["marketing-appointments"]`, `["marketing_opportunities"]`, `["contact_future_appointment"]`, `["appointments_for_slot"]`, and `queryKeys.marketing.all`.

### Bug 3 (P1): Contacts dropdown in appointment dialog limited to 200
**File:** `src/components/marketing/MarketingAppointmentDialog.tsx`, line 187
The contact lookup query uses `.limit(200)`. Companies with >200 contacts cannot select contacts beyond this limit when booking appointments.

**Fix:** Increase to `.limit(10000)` — this query only fetches `id, first_name, last_name, email` (lightweight columns).

### Bug 4 (P1): Inline query keys not using factory
**File:** `src/pages/azienda/marketing/MarketingCalendar.tsx`
Uses inline keys: `["marketing-appointments"]`, `["marketing-calendars"]`, `["marketing-calendar-users"]`. These are not in the `queryKeys` factory, preventing centralized invalidation from other modules.

**Fix:** Add `marketingCalendar` section to `queryKeys.ts` and use it in `MarketingCalendar.tsx`.

### Bug 5 (P2): MarketingTasks query key uses inline `["tasks", "marketing"]`
**File:** `src/pages/azienda/marketing/MarketingTasks.tsx`, line 70
Tasks use `["tasks", "marketing", companyId]` inline. The `TaskDialog`'s `onSaved` invalidates `["tasks"]` (line 314) which works correctly due to prefix matching. However, `handleToggleComplete` (line 137) also invalidates `["tasks"]` broadly — this is fine but could be scoped. No actual bug here, just noting for consistency. Low priority.

### No bugs found in:
- Task filters (status/priority/category work correctly)
- Task stats calculation (overdue/active/expiring logic is sound)
- Drag/drop appointment handler (correctly preserves duration, validates, and invalidates)
- Resize handler (correctly invalidates)
- Calendar date range computation (correct for day/week/month/list)

---

## Plan

| File | Fix | Type |
|------|-----|------|
| `src/pages/azienda/marketing/MarketingCalendar.tsx` | Add missing invalidations to `onSaved` callback + use `queryKeys` factory | Cache / Standards |
| `src/components/marketing/contacts/ContactAppointmentsPanel.tsx` | Add missing cross-module invalidations to `onSaved` | Cache |
| `src/components/marketing/MarketingAppointmentDialog.tsx` | Increase contacts `.limit(200)` to `.limit(10000)` | Scalability |
| `src/lib/queryKeys.ts` | Add `marketingCalendar` section | Standards |

4 files, 4 bugs fixed. No UX changes. No regressions.

