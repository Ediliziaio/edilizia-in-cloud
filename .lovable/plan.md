

# Sidebar Accordion Sub-categories

## Current State

`CompanyLayout.tsx` renders two flat `Collapsible` macro-sections ("Gestione Interna" with 15 items, "Marketing e Vendita" with 11 items). Items come from `sidebarConfig.ts` with actual routes.

## Plan

### 1. Add `subcategory` field to `sidebarConfig.ts`

Add a `subcategory` string to each `NavItem` in both `internalNavItems` and `marketingNavItems`:

**Gestione Interna** subcategories:
- `gi_operazioni` (Operazioni): Dashboard `/azienda`, Ordini, Magazzino, Calendario
- `gi_supporto` (Clienti & Supporto): Clienti, Ticket Clienti
- `gi_finanza` (Finanza): Previsionale, Costi, Tesoreria
- `gi_team` (Team): Attività, Errori, Messaggistica (BETA), Chat Interna
- `gi_automation` (Automazione & AI): Automazioni, Agenti AI Interni

**Marketing e Vendita** subcategories:
- `mkt_crm` (CRM): Dashboard, Contatti, Opportunità, Preventivi, Attività, Appuntamenti
- `mkt_comunicazione` (Comunicazione): Email Marketing, WhatsApp
- `mkt_automation` (Automazione & AI): Automazioni, Agenti AI
- `mkt_analisi` (Analisi): Reportistica

### 2. Create `useSidebarSections` hook

`src/hooks/useSidebarSections.ts`

- Loads/saves open/closed state per subcategory ID in `localStorage` key `sidebar_sections_state`
- Default: all subcategories open
- Auto-expands the subcategory containing the active route (based on `useLocation`)
- Provides `toggle(id)` and `isOpen(id)` functions

### 3. Create `SidebarSubcategory` component

`src/components/layouts/SidebarSubcategory.tsx`

- Renders a clickable header: uppercase 10px label + ChevronDown icon (rotates on open)
- Animated content area using CSS `grid-template-rows: 0fr → 1fr` transition (200ms)
- Hover: `bg-muted/50` on header
- Children rendered with slight left indent (`pl-2`)

### 4. Update `CompanyLayout.tsx` sidebar rendering

Replace the flat item loops inside both Collapsible sections with grouped rendering:

```
For each macro-section:
  1. Group visibleItems by subcategory
  2. Render each group inside <SidebarSubcategory>
  3. Skip empty groups (items filtered by permissions)
```

The existing `Collapsible` wrappers for macro-sections remain unchanged. NavLink styling, badges, active states all preserved exactly as-is.

### Files

| File | Change |
|------|--------|
| `src/lib/sidebarConfig.ts` | Add `subcategory` field to NavItem + all items |
| `src/hooks/useSidebarSections.ts` | New hook for accordion state |
| `src/components/layouts/SidebarSubcategory.tsx` | New component |
| `src/components/layouts/CompanyLayout.tsx` | Use grouped rendering in both sections |

