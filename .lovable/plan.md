

# Batch 3 — Two-Way Reconciliation + Google Synced Badge

## Overview

Two deliverables:
1. **Two-way reconciliation** in the `google-calendar-sync` edge function — pull events from Google's primary calendar, detect changes via etag comparison, and create/update CRM appointments accordingly. Anti-loop logic prevents infinite sync cycles.
2. **"Google Synced" badge** on appointment events in CalendarMonthView and CalendarWeekView — a small icon indicating sync status.

---

## Architecture

```text
full-sync (two_way mode)
  ├─ pullBusySlots()         [existing — conflict calendars]
  └─ reconcilePrimary()      [NEW — primary calendar]
       │
       ├─ For each Google event on primary calendar:
       │    ├─ Has mapping with same etag? → skip (no change)
       │    ├─ Has mapping with different etag?
       │    │    ├─ last_updated_by = "crm"? → CRM wins, push to Google
       │    │    └─ last_updated_by = "google" or null? → Google wins, update CRM appointment
       │    └─ No mapping + has crm_sync=true in description? → skip (CRM-originated, already mapped)
       │    └─ No mapping + no crm_sync marker? → create CRM appointment + mapping (source="google")
       │
       ├─ For each mapping with no matching Google event:
       │    → Mark appointment as cancelled or delete mapping
       │
       └─ Anti-loop: after updating CRM appointment, set last_updated_by="google" in mapping
```

---

## File Changes

### 1. `supabase/functions/google-calendar-sync/index.ts` — Add `reconcilePrimary` action

New function `reconcilePrimary(userId, companyId)`:
- Only runs if user's `sync_mode === "two_way"` AND platform setting `google_calendar_allow_two_way` is enabled
- Reads events from `primary_calendar_id` (not conflict calendars)
- For each Google event:
  - Check if description contains `crm_appointment_id=...` AND `crm_sync=true` → this is a CRM-originated event
  - Look up existing mapping by `google_event_id`
  - **Mapped + same etag**: skip
  - **Mapped + different etag + last_updated_by="crm"**: CRM was updated more recently, push CRM→Google (call existing `updateEvent` logic), update etag
  - **Mapped + different etag + last_updated_by="google"/null**: Google was updated, parse event and update CRM appointment fields (title, date, time, description, location), set `last_updated_by="google"`
  - **Not mapped + CRM-originated** (has `crm_appointment_id` in description): re-link mapping (edge case: mapping was lost)
  - **Not mapped + NOT CRM-originated**: create new CRM appointment with `source="google"`, create mapping
- For mappings pointing to events no longer in Google: delete mapping (optionally mark appointment)
- Check platform policy `google_calendar_allow_google_to_crm_import` before creating new CRM appointments from Google events

Update `fullSync` to call `reconcilePrimary` after `pullBusySlots` when sync_mode is two_way.

Helper functions:
- `parseGoogleEventToCrmFields(event)` → extracts title, date, time, end_time, description, location
- `isCrmOriginated(event)` → checks for `crm_sync=true` in description
- `extractCrmAppointmentId(event)` → parses `crm_appointment_id=UUID` from description

### 2. `src/hooks/useGoogleCalendarSync.ts` — Add `reconcile` action support

- Add `reconcileSync()` method that calls `syncToGoogle("reconcile")`  
- Expose `syncMode` from settings query

### 3. `src/pages/azienda/Calendar.tsx` — Fetch event mappings for badge

- Add query for `google_calendar_event_map` to get all appointment IDs that have a Google mapping
- Pass `syncedAppointmentIds: Set<string>` to CalendarMonthView and CalendarWeekView

### 4. `src/components/calendar/CalendarMonthView.tsx` — Google Synced badge

- Accept new prop `syncedAppointmentIds?: Set<string>`
- For appointment events: if appointment ID is in the set, show a small green checkmark icon (or Google icon) in the tooltip content
- Subtle visual indicator: tiny dot or icon overlay on the appointment pill

### 5. `src/components/calendar/CalendarWeekView.tsx` — Google Synced badge

- Same as MonthView: accept `syncedAppointmentIds` prop
- Show sync indicator on appointment cards

### 6. `src/types/calendar.ts` — No changes needed (existing types sufficient)

---

## Anti-Loop Strategy

The system uses three mechanisms to prevent infinite sync loops:

| Mechanism | Where | How |
|-----------|-------|-----|
| `last_updated_by` field | `google_calendar_event_map` | Set to `"crm"` when CRM pushes, `"google"` when reconcile pulls. Determines conflict winner. |
| `crm_sync=true` marker | Google event description | Identifies CRM-originated events so reconcile doesn't re-import them as new |
| `etag` comparison | `google_calendar_event_map` | Skips events that haven't changed since last sync |

Flow:
1. CRM creates appointment → pushes to Google → mapping created with `last_updated_by="crm"`, etag saved
2. Reconcile runs → finds event → same etag → **skip** (no loop)
3. User edits on Google → etag changes → reconcile detects → `last_updated_by` was "crm" but etag differs → Google wins (user intentionally edited on Google) → updates CRM → sets `last_updated_by="google"`
4. Next CRM edit → pushes to Google → sets `last_updated_by="crm"` → no loop

## Conflict Resolution Rules

| Scenario | Winner | Rationale |
|----------|--------|-----------|
| Both sides changed since last sync | **Google wins** | Google is the "source of truth" for external changes; CRM changes can be re-applied |
| Only CRM changed | CRM wins | Normal push flow |
| Only Google changed | Google wins | Normal pull/reconcile flow |
| Event deleted on Google | Mapping removed | Appointment kept in CRM but unlinked |

---

## Riepilogo file

| File | Azione |
|------|--------|
| `supabase/functions/google-calendar-sync/index.ts` | **Modifica** — add `reconcilePrimary`, update `fullSync` |
| `src/hooks/useGoogleCalendarSync.ts` | **Modifica** — expose `syncMode`, add `reconcileSync` |
| `src/pages/azienda/Calendar.tsx` | **Modifica** — query event_map, pass syncedIds |
| `src/components/calendar/CalendarMonthView.tsx` | **Modifica** — add synced badge |
| `src/components/calendar/CalendarWeekView.tsx` | **Modifica** — add synced badge |

