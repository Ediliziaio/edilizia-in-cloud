

## AUT-FLOW-04 — Catalogo Completo + Config Panels GHL-Style

### Current State
- `WorkflowRightPanel.tsx` has two modes: `catalog` (flat list with drag) and `config` (delegates to `FlowBuilderConfigPanel`)
- `flow-node-catalog.ts` has 1483 lines with full TRIGGER_CATALOG (34 triggers), ACTION_CATALOG (22 actions), CONDITION_CATALOG (2 conditions) — all with emoji icons
- Categories are flat strings (`crm`, `marketing`, `ordini`, etc.) grouped via `CATEGORY_LABELS` map
- `FlowBuilderConfigPanel` renders dynamic fields from `configSchema` using generic `ConfigField` component
- `nodeIcons.ts` already maps catalog IDs to Lucide icons (created in AUT-FLOW-03)

### What Needs to Change

The user's request creates a **new catalog presentation layer** on top of the existing `flow-node-catalog.ts` data. Rather than duplicating all catalog data, we build GHL-style collapsible category panels that consume the existing `TRIGGERS_BY_CATEGORY`, `ACTIONS_BY_CATEGORY`, and Lucide icon mappings.

### Plan

**1. `src/components/flow-builder/WorkflowRightPanel.tsx`** — Rewrite catalog mode:
- Replace flat grouped list with **collapsible accordion categories** (chevron open/close)
- Add "Recenti" section at top (stored in local state, persisted to localStorage)
- Each trigger/action item shows: colored icon badge + label + description + chevron arrow
- Click on item = add node to canvas (not just drag) via new `onSelectItem` prop
- Keep drag-and-drop as secondary interaction
- Keep config mode delegation to `FlowBuilderConfigPanel` unchanged
- Keep Nativi/App sub-tabs

**2. `src/components/flow-builder/catalog/TriggerCatalogList.tsx`** — New component:
- Consumes `TRIGGERS_BY_CATEGORY` from `flow-node-catalog.ts`
- Uses `getTriggerIcon()` from `nodeIcons.ts` for Lucide icons
- Renders categories as collapsible sections with count badges
- Search filtering across label + description
- "Recenti" section with last 5 used triggers

**3. `src/components/flow-builder/catalog/ActionCatalogList.tsx`** — New component:
- Consumes `ACTIONS_BY_CATEGORY` + `CONDITION_CATALOG` from `flow-node-catalog.ts`
- Uses `getActionIcon()` from `nodeIcons.ts`
- Same accordion pattern as triggers
- Includes flow control items (delay, condition) in a "Controllo Flusso" category

**4. `src/components/flow-builder/catalog/CatalogItemRow.tsx`** — Shared row component:
- Icon badge (colored by category), label, description, chevron
- Draggable + clickable
- Hover highlight (blue-50)

**5. `src/components/flow-builder/config-panels/DelayConfigPanel.tsx`** — New:
- Type selector (attendi/fino_a) with visual buttons
- Duration inputs (number + unit select)
- Day-of-week picker (7 circular buttons)
- Specific time input for "fino_a" mode

**6. `src/components/flow-builder/config-panels/ConditionConfigPanel.tsx`** — New:
- AND/OR logic toggle
- Dynamic condition rows (field select + operator select + value input)
- Add/remove condition buttons
- Field options from predefined list (contatto, opportunita, appuntamento fields)
- Operator options (uguale, diverso, contiene, maggiore, etc.)

**7. `src/components/flow-builder/config-panels/TaskConfigPanel.tsx`** — New:
- Title (with variable support), description, deadline days, priority select, assignee select

**8. `src/components/flow-builder/config-panels/EmailConfigPanel.tsx`** — New:
- Sender name/email, subject with variable chips, body textarea, variable insertion buttons, send delay

**9. `src/components/flow-builder/FlowBuilderConfigPanel.tsx`** — Update:
- Detect node type (`itemId`) and render specialized config panel when available (delay, condition, task, email)
- Fall back to generic `ConfigField` rendering for other types

**10. `src/lib/flow-node-catalog.ts`** — Update icons:
- Replace all emoji `icon` strings with Lucide icon name strings (e.g., `'UserPlus'`, `'Mail'`, `'Clock'`)
- This aligns with the `nodeIcons.ts` mapping and removes all emoji from the catalog

### Category color mapping (for icon badges)
Uses safe Tailwind classes (not dynamic):
- `crm` → blue-100/blue-600
- `marketing` → green-100/green-600  
- `ordini` → orange-100/orange-600
- `fatturazione` → emerald-100/emerald-600
- `preventivi` → cyan-100/cyan-600
- `assistenza` → rose-100/rose-600
- `magazzino` → amber-100/amber-600
- `hr` → violet-100/violet-600
- `cantieri` → stone-100/stone-600
- `task` → yellow-100/yellow-600
- `comunicazione` → sky-100/sky-600
- `generale` → gray-100/gray-600

### Integration with FlowBuilderPage
- Add `onSelectItem` callback prop to `WorkflowRightPanel` that creates a node at canvas center (same logic as current `onDrop` but with auto-position)
- No changes to ReactFlow setup or node types

### Files summary
| File | Action |
|------|--------|
| `WorkflowRightPanel.tsx` | Rewrite catalog rendering |
| `catalog/TriggerCatalogList.tsx` | New |
| `catalog/ActionCatalogList.tsx` | New |
| `catalog/CatalogItemRow.tsx` | New |
| `config-panels/DelayConfigPanel.tsx` | New |
| `config-panels/ConditionConfigPanel.tsx` | New |
| `config-panels/TaskConfigPanel.tsx` | New |
| `config-panels/EmailConfigPanel.tsx` | New |
| `FlowBuilderConfigPanel.tsx` | Update — specialized panel routing |
| `flow-node-catalog.ts` | Update — replace emoji icons with Lucide names |
| `FlowBuilderPage.tsx` | Minor — add `onSelectItem` handler |

No DB changes needed. Zero emoji in final code.

