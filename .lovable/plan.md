

## Sidebar UX Enhancement Plan

The project already has subcategories and the collapsible hook implemented. The uploaded prompt's requirements are partially met. Here's what needs to change:

### 1. Update active item style (CompanyLayout.tsx)
Replace all `activeClassName="bg-muted text-foreground font-medium"` in the **main sidebar** (non-settings) nav items with:
```
activeClassName="bg-primary/10 text-primary font-semibold border-l-2 border-primary"
```
This affects lines 518 (internal items) and the equivalent marketing items. Also add `border-l-2 border-primary` to the Cruscotto nav item (line 476).

### 2. Change default subcategory state (useSidebarSections.ts)
Change `DEFAULT_STATE` values from `false` to `true` so all subcategories are expanded on first visit (lines 8-16).

### 3. Files to modify
- `src/hooks/useSidebarSections.ts` — flip defaults to `true`
- `src/components/layouts/CompanyLayout.tsx` — update `activeClassName` on ~3 locations (internal items, marketing items, cruscotto)

No new files needed -- `SidebarSubcategory` and `useSidebarSections` already exist and match the prompt's intent.

