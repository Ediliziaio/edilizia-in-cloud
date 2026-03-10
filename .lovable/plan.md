

# Plan: Fix Automazioni + WhatsApp + Agenti AI nel SuperAdmin Marketing

This plan implements the 5 prompts from the uploaded file in sequence. Key insight: the `ai_agents` tables and module already exist in the codebase, so we reuse them via `PlatformCompanyProvider` instead of creating duplicate tables/hooks.

---

## Phase 1: FIX1 — Bug critici Automazioni (code-only)

### BUG 1 — `AutomationEnrollmentsTab.tsx`: add `companyId` prop and filter
- Add `companyId` to Props interface
- Add `.eq("company_id", companyId)` before `.eq("flow_id", flowId)` in query

### BUG 2 — `AutomationLogsTab.tsx`: add `companyId` prop and filter
- Same pattern: add `companyId` prop, add `.eq("company_id", companyId)` to query

### BUG 3 — `AutomationFlowsList.tsx`: stale query key for enrollment counts
- Change queryKey from `["automation-enrollment-counts", effectiveCompany?.id]` to include `statusFilter` and `folderId`

### BUG 4 — `MarketingAutomations.tsx`: fix statusFilter logic
- Replace confusing ternary with clear `getStatusFilter()` function that handles all URL params (`published`, `draft`, `archived`)

### Callers update
- Update `MarketingAutomationBuilder.tsx` (and any other caller) to pass `companyId` to both `AutomationEnrollmentsTab` and `AutomationLogsTab`

---

## Phase 2: FIX2 — Migration (NOT needed)

The tables `automation_enrollments` and `automation_execution_log` **already have** `company_id` as NOT NULL with RLS policies from migration `20260223110014`. No database changes required.

---

## Phase 3: WA1 — WhatsApp nel SuperAdmin Marketing

### Sidebar
- Add WhatsApp entry to `adminMarketingNavItems` in `AdminLayout.tsx`:
  `{ title: "WhatsApp", url: "/admin/marketing/whatsapp", icon: MessageCircle }`

### Route
- Add lazy import + route in `App.tsx`: `marketing/whatsapp`

### Page: `AdminMarketingWhatsApp.tsx`
- Use `PlatformCompanyProvider` pattern (same as other admin marketing pages)
- Wrap the existing `MarketingWhatsApp` component with permission guard + provider
- This reuses the full WhatsApp UI (conversations, broadcast, templates, settings) without code duplication

---

## Phase 4: AI1 — Agenti AI nel SuperAdmin Marketing

### Key decision: Reuse existing `ai-agents` module
The project already has a full `src/modules/ai-agents/` module with agent list, editor, knowledge base, conversations, credits, phone numbers, and WhatsApp pages. Instead of creating duplicate hooks/pages as the prompt suggests, we wrap the existing module with `PlatformCompanyProvider`.

### Sidebar
- Add "Agenti AI" entry to `adminMarketingNavItems` in `AdminLayout.tsx`:
  `{ title: "Agenti AI", url: "/admin/marketing/agenti-ai", icon: Bot }`

### Routes in `App.tsx`
- `marketing/agenti-ai` → `AdminMarketingAgents.tsx`
- `marketing/agenti-ai/:id` → `AdminMarketingAgentDetail.tsx`

### Pages
- `AdminMarketingAgents.tsx`: Permission guard + `PlatformCompanyProvider` wrapping the existing `AgentsListPage` from the ai-agents module
- `AdminMarketingAgentDetail.tsx`: Permission guard + `PlatformCompanyProvider` wrapping the existing `AgentEditorPage`

### No new database tables or hooks needed
The `ai_agents`, `ai_agent_knowledge_docs`, `ai_agent_conversations`, etc. tables already exist with proper RLS. The existing `useAgents` hooks in `src/modules/ai-agents/hooks/` already work with company context.

---

## Files to create
| File | Purpose |
|------|---------|
| `src/pages/admin/marketing/AdminMarketingWhatsApp.tsx` | WhatsApp wrapper |
| `src/pages/admin/marketing/AdminMarketingAgents.tsx` | AI Agents list wrapper |
| `src/pages/admin/marketing/AdminMarketingAgentDetail.tsx` | AI Agent editor wrapper |

## Files to edit
| File | Change |
|------|--------|
| `src/components/marketing/automations/AutomationEnrollmentsTab.tsx` | Add companyId prop + filter |
| `src/components/marketing/automations/AutomationLogsTab.tsx` | Add companyId prop + filter |
| `src/components/marketing/automations/AutomationFlowsList.tsx` | Fix enrollment counts queryKey |
| `src/pages/azienda/marketing/MarketingAutomations.tsx` | Fix statusFilter logic |
| `src/components/layouts/AdminLayout.tsx` | Add WhatsApp + Agenti AI sidebar items |
| `src/App.tsx` | Add 3 new routes |
| Automation builder caller(s) | Pass companyId to Enrollments/Logs tabs |

## Database migrations
None required — all tables already exist with proper schemas and RLS.

