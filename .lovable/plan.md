

## Fix: Wider right panel + remove App tab

Two issues to fix:

**1. Text truncation** — The panel is `w-[300px]` which is too narrow for the item labels + descriptions. Widen to `w-[340px]` and adjust the `CatalogItemRow` to give more room to text (reduce left padding, tighten grip icon spacing).

**2. Remove App sub-tab** — Delete the entire Nativi/App sub-tab section from `WorkflowRightPanel.tsx` and always render the native content directly. Remove the `AppWindow` import and `subTab` state.

### Files to change

| File | Change |
|------|--------|
| `WorkflowRightPanel.tsx` | Widen to `w-[340px]`, remove App/Nativi sub-tabs + subTab state, render catalog items directly |
| `CatalogItemRow.tsx` | Reduce `pl-7` to `pl-4`, remove grip icon to reclaim horizontal space |

