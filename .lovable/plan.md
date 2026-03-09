

# Internal Automations — Fix Plan

## Root Cause

The system has the processing logic (Edge Function) and helper functions (`trigger_internal_automations`, `trigger_internal_auto_order_status`, etc.) but **zero PostgreSQL triggers are attached to the actual tables**. When you create an order or change a ticket status, nothing fires.

Verified via DB query: `information_schema.triggers WHERE trigger_name LIKE 'internal_auto%'` returns **empty**.

## Current DB Schema (keeping as-is)

The current schema uses `status` (not `is_active`), `config_json` (not `config`), `from_node_id`/`to_node_id` (not `source_node_id`/`target_node_id`). The Edge Function and UI are already aligned with this. No schema rebuild needed.

## Plan

### Phase 1 — Attach DB Triggers (critical fix)

SQL migration to create 10 triggers on actual tables, calling the existing functions:

| Trigger | Table | Event | Function |
|---------|-------|-------|----------|
| `internal_auto_order_created` | `orders` | AFTER INSERT | `trigger_internal_automations('order_created','order')` |
| `internal_auto_order_status` | `orders` | AFTER UPDATE | `trigger_internal_auto_order_status()` |
| `internal_auto_ticket_created` | `tickets` | AFTER INSERT | `trigger_internal_automations('ticket_created','ticket')` |
| `internal_auto_ticket_status` | `tickets` | AFTER UPDATE | `trigger_internal_auto_ticket_events()` |
| `internal_auto_task_created` | `tasks` | AFTER INSERT | `trigger_internal_automations('task_created','task')` |
| `internal_auto_task_completed` | `tasks` | AFTER UPDATE | `trigger_internal_auto_task_events()` |
| `internal_auto_employee_added` | `employees` | AFTER INSERT | `trigger_internal_automations('employee_added','employee')` |
| `internal_auto_warehouse_low` | `warehouse_items` | AFTER UPDATE | `trigger_internal_auto_stock_events()` |
| `internal_auto_cost_added` | `company_costs` | AFTER INSERT | `trigger_internal_automations('cost_added','cost')` |

Also verify and fix the `trigger_internal_auto_*` specific functions to handle columns that exist in each table.

### Phase 2 — Verify pg_cron job

Check if the cron job `process-internal-automation-queue` exists and fires correctly. If not, create it with `net.http_post` to the Edge Function URL.

### Phase 3 — Enhanced types catalog

Replace `src/types/internalAutomationBuilder.ts` with the full catalog from the spec:
- Add `INTERNAL_TRIGGER_CATALOG` with `configFields` and `availableVariables` per trigger (26 triggers across 7 categories)
- Add `INTERNAL_ACTION_CATALOG` with `configFields` including `supportsVariables` flag (12 action types)
- Keep existing `InternalAutomationNode`/`Connection`/`Flow` interfaces aligned with current DB columns (`config_json`, `from_node_id`, etc.)

### Phase 4 — Dynamic NodePanel with variable support

Rewrite `InternalNodePanel.tsx` to:
- Look up the trigger/action definition from the catalog based on `config_json.trigger_type` or `config_json.action_type`
- Render `configFields` dynamically (text, textarea, select, number, multi_select, user_select)
- For fields with `supportsVariables: true`, add a "Insert Variable" dropdown showing `availableVariables` from the trigger definition
- Remove hardcoded per-action form sections

### Phase 5 — Edge Function refinements

Update `process-internal-automation/index.ts`:
- Add missing action handlers: `send_email_to_customer`, `send_email_to_employee`, `assign_employee`, `add_cost_record`
- Fix `markJobFailed` to not use `supabase.rpc("increment_column")` (doesn't exist) — use simple `retry_count: job.attempts + 1`

## Files Modified/Created

| File | Action |
|------|--------|
| SQL migration | **New** — 10 DB triggers |
| `src/types/internalAutomationBuilder.ts` | Rewrite with full catalog |
| `src/components/internalAutomationBuilder/InternalNodePanel.tsx` | Rewrite with dynamic forms |
| `supabase/functions/process-internal-automation/index.ts` | Add missing actions, fix helpers |

