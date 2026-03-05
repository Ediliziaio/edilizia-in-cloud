

# Audit, Fix & UX Stabilization Plan

## Findings Summary

### 1. Bugs Found

**BUG-1: QueryKey mismatch in CreateCustomerDialog**
- `CreateCustomerDialog.tsx` line 131 invalidates `["customers", user?.id]`
- But `CreateOrder.tsx` line 209 fetches with `["customers", effectiveCompany?.id]`
- **Impact**: After creating a customer from the order dialog, the customer dropdown does NOT refresh. User must reload the page.
- **Fix**: Change invalidation to `["customers", effectiveCompany?.id]`

**BUG-2: `expectedDate` state has no UI input in CreateOrder**
- `expectedDate` is declared (line 50), saved in draft, and passed to the mutation, but there's NO form field for the user to set it.
- It will always be `null` unless restored from a legacy draft.
- **Fix**: Remove `expectedDate` state entirely from CreateOrder (keep it in the DB mutation as `null` since `expected_date` column exists). Clean draft type too. OR add the missing date picker in the "Tempistiche" card. Since the field already exists in the database schema and is used by Gantt, adding a date picker is the better choice.

### 2. Dead Code / Unused Imports

**DEAD-1**: `CalendarIcon` import in CreateOrder is used (date pickers), `Paperclip` is used (attachments section) -- these are fine.

**DEAD-2**: `useState` imported in `CalendarGanttView.tsx` (line 1) -- checking if used... `useState<GanttZoom>` at line 83 -- it IS used.

**DEAD-3**: `format` and `isSameDay` in `DraggableOrderBar.tsx` -- both used. All clean.

### 3. UX Issues

**UX-1: `maxLength` missing on CreateOrder text inputs**
- `description`, `internalNotes`, `orderCode` have no `maxLength` constraints, inconsistent with the project's input validation standard.
- **Fix**: Add `maxLength` attributes (description: 1000, internalNotes: 1000, orderCode: 50).

**UX-2: No loading feedback on customer dropdown**
- When customers are loading, the Select shows "Seleziona un cliente" with no loading indicator.
- Minor but noticeable with many customers.

**UX-3: `CreateCustomerDialog` uses `useToast` (Radix) while `CreateOrder` uses `toast` from sonner**
- Inconsistent notification system in the same flow.
- **Fix**: Migrate `CreateCustomerDialog` to use `sonner` toast for consistency.

## Changes Planned

### File: `src/components/orders/CreateCustomerDialog.tsx`
1. Fix queryKey: `["customers", effectiveCompany?.id]` instead of `["customers", user?.id]`
2. Replace `useToast` (Radix) with `toast` from `sonner` for consistency
3. Remove `useToast` import, add `toast` from `sonner`

### File: `src/pages/azienda/CreateOrder.tsx`
1. Add `expectedDate` ("Data Prevista") date picker in the "Tempistiche per il Cliente" card as 4th field (4-col grid on desktop)
2. Add `maxLength` to description (1000), internalNotes (1000), orderCode (50)

### File: `src/hooks/useOrderDraft.ts`
- No changes needed (expectedDate already in draft type)

## What is NOT changed
- No functional behavior changes
- No database changes
- No edge function changes
- All existing drag-and-drop, Gantt, calendar, form submission logic stays intact

