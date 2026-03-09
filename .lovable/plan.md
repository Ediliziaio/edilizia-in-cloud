

# Internal Automation System — Implementation Plan

## Overview
Build a complete internal automation engine (separate from Marketing Automations) with visual builder, edge function processor, and database triggers. 6 phases, ~20 new files.

## Phase 1 — Database Migration

Single SQL migration creating:

| Object | Purpose |
|--------|---------|
| `internal_automation_flows` | Main flow table with trigger config, run stats |
| `internal_automation_nodes` | Visual builder nodes (trigger/action/condition/delay) |
| `internal_automation_connections` | Node-to-node connections with branch support |
| `internal_automation_enrollments` | Entity enrollment tracking |
| `internal_automation_queue` | Async execution queue |
| `internal_automation_execution_log` | Execution history |
| 10 DB triggers | On orders, tickets, tasks, employees, warehouse_items, company_costs — calling `trigger_internal_automations()` helper |
| `trigger_internal_automations()` | Finds active flows for a trigger type, creates enrollments + queue jobs |

RLS: company-scoped via `get_user_company_id(auth.uid())`. Enrollments/queue/log are read-only for company users (service_role writes).

**Note**: The cost trigger references `costs` table but the actual table is `company_costs` — will adapt column names (`description` → check actual schema, `date` → `cost_date`). Similarly `warehouse_items` vs `warehouse_stock` — will verify and adjust.

## Phase 2 — TypeScript Types

Create `src/types/internalAutomationBuilder.ts` with:
- Full trigger catalog (26 trigger types across 7 categories: Ordini, Ticket, Task, Dipendenti, Magazzino, Costi, Calendario)
- Full action catalog (11 action types: create_task, update_order_status, send_notification, send_email, create_ticket, create_calendar_event, wait_delay, webhook, etc.)
- Type definitions for nodes, connections, flows

## Phase 3 — Edge Function

Create `supabase/functions/process-internal-automation/index.ts`:
- Fetches pending jobs from `internal_automation_queue`
- Routes to action executors (create_task, update_order_status, send_notification, send_email, create_ticket, create_calendar_event, webhook, wait_delay, if_condition)
- Advances enrollment to next node via connections
- Logs execution in `internal_automation_execution_log`
- Template interpolation for `{{order.number}}` style variables

## Phase 4 — Visual Builder Components

Create in `src/components/internalAutomationBuilder/`:

| Component | Purpose |
|-----------|---------|
| `InternalAutomationCanvas.tsx` | Full-screen drag-drop canvas (mirrors marketing AutomationCanvas pattern with green accent) |
| `InternalNodePanel.tsx` | Right sidebar for node config with dynamic form fields and variable insertion |
| `InternalTriggerSelector.tsx` | Modal for choosing trigger type, grouped by category |
| `InternalActionSelector.tsx` | Modal for adding action/condition/delay nodes |
| `InternalAutomationLogDrawer.tsx` | Sheet showing execution log for a flow |

## Phase 5 — Main Page + Hook

Create `src/hooks/useInternalAutomations.ts` — CRUD hook for flows, nodes, connections with react-query.

Create `src/pages/azienda/InternalAutomations.tsx`:
- **List view**: Stats strip (active/total/success rate), category+status filters, flow cards with toggle/edit/log/delete
- **Builder view**: Full-screen canvas with node config panel
- **Log drawer**: Execution history per flow

## Phase 6 — Routing + Data Migration

- Update `App.tsx`: replace `/azienda/automazioni` route to point to `InternalAutomations` (keep old `Automations.tsx` as-is)
- Update sidebar navigation to use new route
- SQL migration to copy existing `automations` table records into `internal_automation_flows` + nodes + connections

## Files Created/Modified

| File | Action |
|------|--------|
| SQL migration | **New** — tables, triggers, functions, data migration |
| `src/types/internalAutomationBuilder.ts` | **New** |
| `supabase/functions/process-internal-automation/index.ts` | **New** |
| `src/hooks/useInternalAutomations.ts` | **New** |
| `src/pages/azienda/InternalAutomations.tsx` | **New** |
| `src/components/internalAutomationBuilder/InternalAutomationCanvas.tsx` | **New** |
| `src/components/internalAutomationBuilder/InternalNodePanel.tsx` | **New** |
| `src/components/internalAutomationBuilder/InternalTriggerSelector.tsx` | **New** |
| `src/components/internalAutomationBuilder/InternalActionSelector.tsx` | **New** |
| `src/components/internalAutomationBuilder/InternalAutomationLogDrawer.tsx` | **New** |
| `src/App.tsx` | Route update |
| `supabase/config.toml` | Add edge function config |

**Not modified**: Marketing automation files, `automationBuilder/` components, `automation_flows` tables.

