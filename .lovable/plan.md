
## AUT-FLOW-05 — Advanced Features: Notes, Errors, Versions, Settings, Cronologia, Log

### Current State
- **Left sidebar** (`FlowBuilderSidebar.tsx`): 6 icon buttons with placeholder text panels (Notes, Errors, Versions, History, Stats, AI)
- **Tabs** (`WorkflowImpostazioni`, `WorkflowCronologia`, `WorkflowRegistro`): All empty placeholders with just an icon + description
- **DB tables already exist**: `automation_flows` (no note/settings columns), `automation_enrollments` (entity_id, entity_type, status, flow_version), `automation_execution_log` (node_id, node_type, input/output_json, error_message, status), `flow_execution_runs` (steps_log, trigger_data, duration_ms, nodes_executed)
- **No version history table** exists yet
- `useAutomationBuilder` hook manages all flow CRUD via `automation_flows`, `automation_nodes`, `automation_connections`

### DB Changes Required

**Migration 1 — Add columns to `automation_flows`:**
```sql
ALTER TABLE automation_flows
  ADD COLUMN IF NOT EXISTS note TEXT,
  ADD COLUMN IF NOT EXISTS note_color TEXT,
  ADD COLUMN IF NOT EXISTS allow_reentry BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS allow_multiple_opportunities BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS stop_on_reply BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'account',
  ADD COLUMN IF NOT EXISTS time_window_active BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS time_window_from TEXT DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS time_window_to TEXT DEFAULT '18:00',
  ADD COLUMN IF NOT EXISTS sender_name TEXT,
  ADD COLUMN IF NOT EXISTS sender_email TEXT;
```

**Migration 2 — Create `automation_flow_versions` table:**
```sql
CREATE TABLE automation_flow_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES automation_flows(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id),
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft',
  nodes_snapshot JSONB NOT NULL DEFAULT '[]',
  connections_snapshot JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  created_by_name TEXT,
  version_note TEXT
);
ALTER TABLE automation_flow_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own company versions"
  ON automation_flow_versions FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id());
CREATE POLICY "Users can insert own company versions"
  ON automation_flow_versions FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id());
```

### UI Implementation

#### 1. `FlowBuilderSidebar.tsx` — Update to render real panels
- Pass `flowId` prop through from `FlowBuilderPage`
- Replace `PanelPlaceholder` with actual panel components per panel type
- Pass `flowId` to Notes and Versions panels

#### 2. `src/components/flow-builder/panels/WorkflowNotesPanel.tsx` — NEW
- Text area for workflow-level note (saved to `automation_flows.note`)
- Color palette picker (10 pastel colors) saved to `automation_flows.note_color`
- Character counter (5000 max)
- Save button with "Salvato!" feedback
- Uses `supabase.from('automation_flows').update()`

#### 3. `src/components/flow-builder/panels/WorkflowErrorsPanel.tsx` — NEW
- Receives `errors` array as prop (computed in FlowBuilderPage from node validation)
- Zero-error state: green checkmark circle + "0 errori / Sei a posto"
- Error/warning cards with colored backgrounds (red/amber)
- Summary badges showing error/warning counts

#### 4. `src/components/flow-builder/panels/WorkflowVersionsPanel.tsx` — NEW
- Queries `automation_flow_versions` for current flow
- Shows current version card + previous versions list
- Restore button with confirmation dialog
- Restore writes nodes/connections snapshots back to `automation_nodes`/`automation_connections`

#### 5. `src/components/flow-builder/tabs/WorkflowImpostazioni.tsx` — REWRITE
- Receives `flowId` prop
- Three toggle settings: allow_reentry, allow_multiple_opportunities, stop_on_reply
- Timezone selector, time window toggle with from/to inputs
- Sender name/email fields
- Save button with dirty tracking

#### 6. `src/components/flow-builder/tabs/WorkflowCronologia.tsx` — REWRITE
- Receives `flowId` prop
- Queries `automation_enrollments` filtered by `flow_id`
- Joins entity info (entity_id, entity_type)
- Date range filters, status filter, search
- Table with status badges (colored), timestamps

#### 7. `src/components/flow-builder/tabs/WorkflowRegistro.tsx` — REWRITE
- Receives `flowId` prop
- Queries `automation_execution_log` + `flow_execution_runs` filtered by `flow_id`
- Date range, activity type, and status filters
- Table with status icons (CheckCircle/XCircle/Clock), node type, timestamps

#### 8. `FlowBuilderPage.tsx` — UPDATE
- Pass `flowId` to sidebar, tab components
- Compute validation errors from rfNodes and pass to sidebar
- Pass `flow` data to settings tab

### Files Summary

| File | Action |
|------|--------|
| `FlowBuilderSidebar.tsx` | Update — render real panels, accept flowId |
| `panels/WorkflowNotesPanel.tsx` | New |
| `panels/WorkflowErrorsPanel.tsx` | New |
| `panels/WorkflowVersionsPanel.tsx` | New |
| `tabs/WorkflowImpostazioni.tsx` | Rewrite |
| `tabs/WorkflowCronologia.tsx` | Rewrite |
| `tabs/WorkflowRegistro.tsx` | Rewrite |
| `FlowBuilderPage.tsx` | Update — pass flowId/errors to children |
| DB migration | Add columns to automation_flows + create automation_flow_versions |
