

## AUT-FLOW-02 — Builder Shell GHL-Style

### Current State
- `FlowBuilderPage.tsx` — full-screen layout with `FlowBuilderHeader` (back + save + publish), `FlowBuilderSidebar` (260px LEFT, drag-based catalog with tabs Trigger/Azioni/Condizioni), `FlowBuilderConfigPanel` (300px RIGHT on node select)
- Uses `useAutomationBuilder` hook for all state management (nodes, connections, undo/redo, save, publish)
- Routes at `/azienda/marketing/automazioni/:id` via `MarketingAutomationBuilder` wrapper
- ReactFlow `@xyflow/react` with custom node types: trigger, action, condition, note, delay, goal, split

### Plan

**1. Rewrite `FlowBuilderPage.tsx`** — New GHL shell layout:
- **Top bar**: Back link + inline-editable name + 4 tab buttons (Builder, Impostazioni, Cronologia, Registro) + right actions (Undo/Redo, Test, Save, Draft/Publish toggle, Archive)
- **Body**: flex row with left sidebar + canvas + right panel
- Keep existing `useAutomationBuilder` hook — all state management stays the same
- Tab state controls which content shows in center area (builder = ReactFlow, others = placeholder panels)

**2. Replace `FlowBuilderHeader.tsx`** — Inline into the new top bar (no separate component needed, or rewrite it)

**3. Replace `FlowBuilderSidebar.tsx`** — New `WorkflowLeftSidebar.tsx`:
- Narrow icon-only bar (~48px) with 6-7 icons: Notes, Errors, Versions, Details, History, Stats, AI
- Click toggles a sliding panel (280px) next to the icon bar
- Panels are placeholder components initially (just title + close)

**4. New `WorkflowRightPanel.tsx`** — replaces `FlowBuilderConfigPanel`:
- Opens on node click OR "Add" button from canvas
- Two modes: `triggers` (trigger catalog) and `actions` (action catalog)
- When a node is selected, shows config form (reuse existing ConfigField logic)
- Search + category grouping from current sidebar, but displayed on the RIGHT
- Tabs: "Nativi" / "App" (App tab is placeholder)

**5. Canvas changes in `FlowBuilderPage`**:
- Keep ReactFlow with existing node types, drag/drop, connect logic
- Node click opens right panel in config mode
- Pane click closes right panel
- Add "+" buttons between nodes (future, not this ticket)

**6. Tab content placeholders**:
- `WorkflowImpostazioni` — settings form placeholder
- `WorkflowCronologia` — enrollment history placeholder  
- `WorkflowRegistro` — execution log placeholder

### Files to create/modify

| File | Action |
|------|--------|
| `src/components/flow-builder/FlowBuilderPage.tsx` | Rewrite — new shell layout |
| `src/components/flow-builder/FlowBuilderHeader.tsx` | Rewrite — inline top bar with tabs |
| `src/components/flow-builder/FlowBuilderSidebar.tsx` | Rewrite → icon-only left sidebar with sliding panels |
| `src/components/flow-builder/FlowBuilderConfigPanel.tsx` | Keep — used inside right panel |
| `src/components/flow-builder/WorkflowRightPanel.tsx` | New — right panel with catalog + config |
| `src/components/flow-builder/panels/WorkflowNotesPanel.tsx` | New — placeholder |
| `src/components/flow-builder/panels/WorkflowErrorsPanel.tsx` | New — placeholder |
| `src/components/flow-builder/panels/WorkflowStatsPanel.tsx` | New — placeholder |
| `src/components/flow-builder/tabs/WorkflowImpostazioni.tsx` | New — placeholder |
| `src/components/flow-builder/tabs/WorkflowCronologia.tsx` | New — placeholder |
| `src/components/flow-builder/tabs/WorkflowRegistro.tsx` | New — placeholder |

### Layout
```text
┌────────────────────────────────────────────────────────────────┐
│ ← Flussi  │ Nome ✎ │ [Builder][Impost][Cron][Log] │ ↩↪ Test Save Pubblica │
├──┬─────────────────────────────────────────────┬───────────────┤
│  │                                             │               │
│ 📝│         ReactFlow Canvas                    │  Right Panel  │
│ ⚠│         (existing nodes/edges)              │  (catalog or  │
│ 🕐│                                             │   config)     │
│ 📊│                                             │   ~320px      │
│  │                                             │               │
│48│                                             │               │
└──┴─────────────────────────────────────────────┴───────────────┘
```

No DB changes needed. Zero emoji in code — all Lucide icons.

