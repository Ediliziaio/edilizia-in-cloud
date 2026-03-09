

## Plan: Add divider line between subcategories

Add a subtle horizontal line at the bottom of each `SidebarSubcategory` component to visually separate subcategories.

### Change
**`src/components/layouts/SidebarSubcategory.tsx`** — Add a `<div>` with a thin border line (`border-b border-border/50`) at the bottom of the outer wrapper, after the collapsible content. This gives a light separator between each subcategory without being too heavy.

The wrapper `div` on line 13 changes from `className="mt-1"` to `className="mt-1 border-b border-border/40 pb-1"`.

One file, one line change.

