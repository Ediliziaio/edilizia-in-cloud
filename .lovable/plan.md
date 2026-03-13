

## Fix: Empty canvas placeholder not showing

### Root Cause

When navigating to `/azienda/marketing/automazioni/nuova`:
1. `flowId` is `undefined` (line 39: `id === "nuova" ? undefined : id`)
2. The placeholder condition on line 71 requires `flowId && !isLoading` -- this is **never true** because `flowId` is undefined
3. A new flow is created asynchronously, then `navigate(replace)` fires to the real ID
4. After navigation, `initializedRef.current` is still `false`, but `isLoading` is `true` while the new flow's data loads
5. When loading finishes, `builder.nodes.length === 0` is true, but only if the timing is right

The fix: show the placeholder when `id === "nuova"` OR when `flowId` exists and nodes are empty after loading.

### Changes

**`FlowBuilderPage.tsx`** -- Fix placeholder logic:

1. Change the `useEffect` condition to also trigger for `id === "nuova"`:
   - Replace `else if (flowId && !isLoading && builder.nodes.length === 0)` with `else if (!isLoading && builder.nodes.length === 0 && (flowId || id === "nuova"))`
   - This ensures the placeholder appears immediately when creating a new flow

2. The `openCatalog` reference in the placeholder data uses a closure, so it will work regardless of whether `flowId` is set yet -- the catalog panel opens independently of the flow ID.

3. Also reset `initializedRef.current = false` when `flowId` changes (on navigation from `/nuova` to `/{realId}`) so the effect can re-evaluate.

| File | Change |
|------|--------|
| `FlowBuilderPage.tsx` | Fix placeholder condition to work with `id === "nuova"`; reset `initializedRef` on flowId change |

