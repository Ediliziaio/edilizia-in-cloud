

## Plan: Add dashed divider lines between items inside subcategories

### Change
**`src/components/layouts/CompanyLayout.tsx`** — Add `divide-y divide-dashed divide-border/40` to the `<SidebarMenu>` wrapper inside each `SidebarSubcategory` (appears in ~2 locations: internal items around line 510 and marketing items around line 560+).

This uses Tailwind's built-in divide utilities to add a dashed horizontal line between each `<SidebarMenuItem>`.

### Locations
1. Line 510: `<SidebarMenu>` → `<SidebarMenu className="divide-y divide-dashed divide-border/40">`
2. The equivalent `<SidebarMenu>` in the marketing subcategories section (~line 561+)

Two small edits, one file.

