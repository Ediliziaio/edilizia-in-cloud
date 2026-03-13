

## ATT-05 · Motore Automazioni Task — Piano di Implementazione

### Situazione attuale

- Esiste già una tabella `automations` con campi: `name`, `trigger_type`, `trigger_config`, `conditions`, `actions`, `is_active`, `company_id`, `created_by` — usata dalla pagina `/azienda/automazioni-legacy` (`AutomationsConfig`). Questa gestisce automazioni per commesse (ordini).
- Esiste un sistema di automazioni marketing separato (`internal_automation_flows`, `AutomationBuilder.tsx`) — completamente diverso.
- **Non esiste** una tabella `task_automation_rules` specifica per la creazione automatica di task da eventi CRM/cantiere.
- Le tabelle reali sono: `marketing_contacts` (con `first_name`, `last_name`, `source`, `assigned_to`), `marketing_opportunities` (con `name`, `stage_id`, `assigned_to`, `value`, `source`), `appointments` (con `status`, `is_completed`, `assigned_to`, `contact_id`).
- La tabella `tasks` usa campi inglesi: `title`, `status`, `priority`, `category`, `due_date`, `assigned_to`, `created_by`, `contact_id`, `opportunity_id`, `order_id`.

### Adattamento allo schema reale

Il prompt ATT-05 assume campi italiani (`titolo`, `stato`, `priorita`, `fonte`, etc.) che non esistono. Adatteremo tutto ai campi reali inglesi della tabella `tasks`. Allo stesso modo, le tabelle trigger usano nomi reali (`marketing_contacts`, `marketing_opportunities`, `appointments`).

Non creeremo una nuova tabella `task_automation_rules` — **estenderemo la tabella `automations` esistente** con nuovi `trigger_type` e azioni specifiche per task, oppure creeremo una tabella dedicata se più pulito. Data la differenza semantica (la tabella `automations` esistente gestisce commesse), creeremo una **nuova tabella `task_automation_rules`**.

---

### Piano

#### 1. Migrazione DB — Nuove tabelle

**`task_automation_rules`**:
- `id`, `company_id` (FK companies), `name`, `description`, `is_active` (default true)
- `trigger_type` TEXT — valori: `contact_created`, `opportunity_created`, `opportunity_stage_changed`, `appointment_confirmed`, `appointment_completed`
- `trigger_config` JSONB (es. `{ "from_stage_id": "...", "to_stage_id": "..." }` per stage changes)
- `conditions` JSONB (array di `{ field, operator, value }`)
- Campi azione (per creare task): `action_title`, `action_notes`, `action_priority` (default 'normale'), `action_assign_to` (default 'entity_assignee' — valori: `entity_assignee`, `creator`, `user:<uuid>`), `action_due_days` INTEGER (default 1), `action_category` (default 'generale')
- `executions_count` INTEGER default 0, `last_executed_at` TIMESTAMPTZ
- `created_at`, `updated_at`, `created_by` (FK profiles)
- RLS: company_id scoped via `get_my_company_id()`

**`task_automation_log`**:
- `id`, `rule_id` (FK task_automation_rules ON DELETE CASCADE), `task_created_id` (FK tasks), `trigger_data` JSONB, `success` BOOLEAN, `error` TEXT, `created_at`
- RLS: select via join on rule.company_id

#### 2. Edge Function `task-automation-trigger`

Receives database webhook payloads from `marketing_contacts`, `marketing_opportunities`, `appointments`. Maps events to trigger types, fetches matching active rules, evaluates conditions, and creates tasks via direct INSERT into `tasks` table (using service role).

Template variables in `action_title`: `{{contact_name}}`, `{{opportunity_name}}`, `{{appointment_title}}`.

Config in `config.toml`: `verify_jwt = false` (called by DB webhooks internally).

Database webhooks will be created via migration SQL using `supabase_functions.http_request` (pg_net):
- `marketing_contacts` INSERT → trigger function
- `marketing_opportunities` INSERT, UPDATE → trigger function  
- `appointments` UPDATE → trigger function

#### 3. UI — Page + Form

**Modify existing `src/pages/azienda/Automations.tsx`** — or create a new page at `/azienda/automazioni-task` and add route. Better: create a **new tab** in the existing Automations page, or a dedicated page. Given the existing `/azienda/automazioni` route already points to `InternalAutomations`, we'll add a new route `/azienda/automazioni-task` → `TaskAutomationsPage`.

New files:
| File | Purpose |
|------|---------|
| `src/pages/azienda/TaskAutomationsPage.tsx` | List of task automation rules with toggle, edit, delete, preset suggestions |
| `src/components/automazioni/TaskAutomationFormDialog.tsx` | Dialog to create/edit a rule |

Add route in `companyRoutes.tsx` and sidebar entry in `sidebarConfig.ts`.

#### 4. File creati/modificati

| File | Azione |
|------|--------|
| Migration SQL | New tables `task_automation_rules`, `task_automation_log` with RLS |
| `supabase/functions/task-automation-trigger/index.ts` | **Nuovo** — Edge Function |
| `supabase/config.toml` | Add `[functions.task-automation-trigger]` |
| `src/pages/azienda/TaskAutomationsPage.tsx` | **Nuovo** |
| `src/components/automazioni/TaskAutomationFormDialog.tsx` | **Nuovo** |
| `src/routes/companyRoutes.tsx` | Add route |
| `src/lib/sidebarConfig.ts` | Add sidebar entry |

