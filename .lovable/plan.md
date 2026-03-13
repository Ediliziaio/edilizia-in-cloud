

## Fix Plan: Catalog UX + Click Bugs

### Issues Found

1. **Text truncation** — `CatalogItemRow` uses `truncate` (single line cutoff) on descriptions. Fix: use `line-clamp-2` to allow wrapping to two lines.

2. **Placeholder trigger click does nothing** — The empty `TriggerNode` has no click handler to open the trigger catalog. Fix: pass `openCatalog` function through node data and wire it up.

3. **Catalog item click silently fails** — `addNodeFromItem` has a guard `if (!flowId || !effectiveCompany || !user) return;` that silently exits. After a new flow is created and the URL changes, these should be set. However, for newly created flows the `flowId` derived from `useParams` may be briefly undefined during navigation. Fix: add a toast warning when the guard fails (so we can debug), and also handle the case where placeholder nodes need to be replaced when a trigger is selected from catalog.

### Changes

**`CatalogItemRow.tsx`** — Allow description to wrap to 2 lines:
- Change description from `truncate` to `line-clamp-2` and remove `truncate` class
- This lets long descriptions show on two lines instead of being cut off

**`TriggerNode.tsx`** — Add click handler for empty state:
- When `isEmpty` and `data.onOpenCatalog` exists, call it on click
- This opens the trigger catalog panel when clicking the placeholder

**`FlowBuilderPage.tsx`** — Two fixes:
- Pass `onOpenCatalog: () => openCatalog("trigger")` in the placeholder trigger node data
- Also pass it in `addNodeFromItem` for new trigger nodes
- Add a toast error in `addNodeFromItem` when guard fails, so the issue is visible
- When a trigger is selected from catalog and a placeholder trigger exists, replace the placeholder instead of adding a new node

### Files

| File | Change |
|------|--------|
| `CatalogItemRow.tsx` | `truncate` → `line-clamp-2` on description |
| `TriggerNode.tsx` | Add onClick → `data.onOpenCatalog?.()` for empty state |
| `FlowBuilderPage.tsx` | Pass `onOpenCatalog` in placeholder data; add guard toast; replace placeholder on trigger select |

