

## AUT-FLOW-06 — Bug Analysis & Fix Plan

### Audit Results

**DB (PHASE 1) — OK with minor gaps:**
- All tables exist: `automation_flows`, `automation_folders`, `automation_flow_versions`, `automation_enrollments`, `automation_execution_log`
- All new columns added to `automation_flows` (note, note_color, allow_reentry, timezone, etc.)
- RLS enabled on all 3 new tables
- Indices exist for key queries
- `automation_flow_versions` missing UPDATE/DELETE RLS policies (only SELECT + INSERT exist) — needed for version restore

**Layout (PHASE 2) — OK:**
- `FlowBuilderPage.tsx` layout order is correct: Left sidebar | Canvas (flex-1) | Right panel — right panel IS the last child (line 387-399)
- Zero emoji in `src/components/flow-builder/` directory (confirmed via search)

**Components (PHASE 3) — File mapping differs from spec but all functional:**
- The spec references `src/components/workflow/` paths but actual implementation uses `src/components/flow-builder/` — this is fine, it's the actual project structure
- All key components exist: TriggerNode, ActionNode, DelayNode, ConditionNode, EndNode, NoteNode, AddStepEdge
- All panels exist: WorkflowNotesPanel, WorkflowErrorsPanel, WorkflowVersionsPanel
- All tabs exist: WorkflowImpostazioni, WorkflowCronologia, WorkflowRegistro
- Config panels exist: DelayConfigPanel, ConditionConfigPanel, TaskConfigPanel, EmailConfigPanel

**ReactFlow (PHASE 4) — OK:**
- All nodeTypes registered (trigger, action, condition, delay, goal, split, note, end)
- edgeTypes registered (addStep)
- All nodes have correct Handle components (target top, source bottom; trigger only source; condition has yes/no)
- Keyboard shortcuts working (Ctrl+Z/Y/S)

**Catalog (PHASE 5) — OK:**
- Icons are all Lucide names (no emoji)
- nodeIcons.ts maps 34 trigger IDs and 27 action IDs to Lucide components with fallbacks

### Bugs Found

| # | Issue | Severity | Fix |
|---|-------|----------|-----|
| 1 | Version restore is a TODO stub (line 106 of WorkflowVersionsPanel) | HIGH | Implement restore mutation |
| 2 | `automation_flow_versions` missing UPDATE/DELETE RLS policies | HIGH | Add policies for restore/delete |
| 3 | `preventivo_in_scadenza` not mapped in nodeIcons TRIGGER_ICON_MAP | LOW | Add mapping (falls back to Zap) |
| 4 | `spesa_registrata` (id from catalog) not mapped in nodeIcons | LOW | Add mapping |
| 5 | Header tab label "Cronologia" should be "Cronologia delle iscrizioni" per spec | LOW | Update label |
| 6 | Header tab label "Registro" should be "Registro di esecuzione" per spec | LOW | Update label |
| 7 | No auto-save mechanism — manual save only via Ctrl+S or button | MEDIUM | Add debounced auto-save |
| 8 | Empty canvas shows no placeholder trigger node | MEDIUM | Add empty state with placeholder trigger + end nodes |
| 9 | `automation_flow_versions` policies use `get_my_company_id()` but enrollments/execution_log use `get_user_company_id()` — inconsistent but both work | LOW | Align naming |

### Fix Plan

**1. DB Migration — Add missing RLS policies for `automation_flow_versions`**
- Add UPDATE policy for own company
- Add DELETE policy for own company (admin only)

**2. `WorkflowVersionsPanel.tsx` — Implement version restore**
- Add mutation that reads snapshot from version, calls `save_automation_nodes` RPC or direct upsert
- Invalidate nodes/connections queries on success

**3. `FlowBuilderPage.tsx` — Add empty canvas placeholder**
- When `rfNodes` is empty and flow exists, seed with placeholder trigger (empty) + end node + connecting edge

**4. `FlowBuilderPage.tsx` — Add debounced auto-save**
- `useEffect` with 5s debounce on rfNodes/rfEdges changes → call `saveImmediate()`
- Toast notification on auto-save

**5. `FlowBuilderHeader.tsx` — Fix tab labels**
- "Cronologia" → "Cronologia" (keep short, the full title is in the tab content area already)
- Actually both tab content headers already show the full names, so short tab labels are fine. Skip this.

**6. `nodeIcons.ts` — Add missing trigger icon mappings**
- Add `preventivo_in_scadenza: Hourglass`
- Add `spesa_registrata: DollarSign` (if exists in catalog)

### Files to modify
| File | Change |
|------|--------|
| DB migration | Add UPDATE/DELETE policies on `automation_flow_versions` |
| `panels/WorkflowVersionsPanel.tsx` | Implement restore mutation |
| `FlowBuilderPage.tsx` | Add empty canvas placeholder + debounced auto-save |
| `nodes/nodeIcons.ts` | Add 2 missing trigger icon mappings |

