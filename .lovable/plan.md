

## AUT-FLOW-03 — Node System GHL-Style

### Current State
- 4 node components: `TriggerNode`, `ActionNode` (reused for delay/goal/split), `ConditionNode`, `NoteNode`
- All use `NODE_KIND_STYLES` from `flow-node-catalog.ts` for basic coloring
- `nodeTypes` map in `nodes/index.ts` registers: trigger, action, condition, delay, goal, split, note
- Existing nodes are minimal cards with generic icons (Zap, Play, GitBranch) — no GHL styling
- Catalog has `icon` field as emoji strings (not Lucide names)
- `FlowBuilderPage` handles drop, connect, node click, config panel

### Plan

**No DB changes needed.** All changes are UI component rewrites.

### Files to create/modify

#### 1. `src/components/flow-builder/nodes/nodeStyles.ts` (NEW)
- Color map per action category (`AZIONE_COLORI`): email, sms, whatsapp, task, tag, delay, condition, etc.
- Each entry: `{ bg, iconBg, text, border }` Tailwind classes
- Helper `getNodeColors(itemId)` that maps catalog item IDs to color entries

#### 2. `src/components/flow-builder/nodes/nodeIcons.ts` (NEW)
- `getTriggerIcon(itemId)` — maps trigger catalog IDs to Lucide components (UserPlus, Tag, Calendar, Mail, etc.)
- `getActionIcon(itemId)` — maps action catalog IDs to Lucide components (Mail, MessageSquare, Phone, Tag, etc.)
- Replaces emoji `icon` field usage throughout

#### 3. `src/components/flow-builder/nodes/TriggerNode.tsx` (REWRITE)
- **Empty state**: dashed blue border card with "+" icon and "Aggiungi nuovo trigger" text
- **Populated state**: white card with colored icon badge, trigger label, "..." menu
- Uses `getTriggerIcon()` instead of hardcoded `Zap`
- Source handle at bottom

#### 4. `src/components/flow-builder/nodes/ActionNode.tsx` (REWRITE)
- White card with category-colored icon badge on left
- Label + optional `configPreview` subtitle
- "..." menu button with context menu (duplicate, delete)
- Error indicator (warning icon) when `data.hasError`
- Uses `getActionIcon()` and `AZIONE_COLORI`
- Target handle top, source handle bottom

#### 5. `src/components/flow-builder/nodes/DelayNode.tsx` (NEW)
- Horizontal pill/chip style (not a full card) — purple theme
- Clock icon + duration label ("5 min", "2 ore", "Fino a 09:00")
- "..." menu on hover
- Registered as separate node type instead of reusing ActionNode

#### 6. `src/components/flow-builder/nodes/ConditionNode.tsx` (REWRITE)
- White card with amber icon badge
- Shows condition preview text ("campo operatore valore")
- Two labeled output branches: green "Si" (left handle at 30%) / red "No" (right handle at 70%)
- Logic badge (AND/OR)

#### 7. `src/components/flow-builder/nodes/EndNode.tsx` (NEW)
- Small gray pill with Flag icon + "Fine" text
- Target handle only (no source)

#### 8. `src/components/flow-builder/nodes/AddStepEdge.tsx` (NEW)
- Custom edge type for ReactFlow — smooth step path with centered "+" button
- Click triggers `data.onAddStep(edgeId)` to open action catalog
- Registered as custom edge type in FlowBuilderPage

#### 9. `src/components/flow-builder/nodes/index.ts` (UPDATE)
- Add `delay: DelayNode`, `end: EndNode` to nodeTypes
- Export `edgeTypes` with `addStep: AddStepEdge`

#### 10. `src/components/flow-builder/FlowBuilderPage.tsx` (UPDATE)
- Import and pass `edgeTypes` to ReactFlow
- When creating edges, use `type: "addStep"` with `data.onAddStep` callback
- Remove reuse of ActionNode for delay type

#### 11. `src/lib/flow-node-catalog.ts` (UPDATE)
- Add `end` to `FlowNodeKind` type and `NODE_KIND_STYLES`
- No other catalog changes needed (icon field stays as-is, nodeIcons.ts handles mapping)

### Node visual summary
```text
TriggerNode:  [Zap icon] "Trigger label"     — green accent, dashed if empty
ActionNode:   [Cat icon] "Action label"       — white card, colored icon badge
DelayNode:    [Clock] "5 min"                 — purple horizontal pill
ConditionNode:[Branch] "If condition" [Si|No] — amber card, two outputs
EndNode:      [Flag] "Fine"                   — gray pill
AddStepEdge:  ----[+]----                     — edge with centered plus button
```

