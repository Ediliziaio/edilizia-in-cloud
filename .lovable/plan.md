

# FIX 1: MarketingAiAgent — Enhance with Agent List + Recent Conversations

## Current State
The page is NOT empty — it already has stat cards (agents count, credit balance, knowledge base), a blocked-calls banner, and quick action buttons. The user's request claims it's empty, which is incorrect. However, it IS missing:
- A list of agents with direct edit links
- A "recent conversations" section
- A "Gestisci tutti gli agenti" button

## What to Change

**File**: `src/pages/azienda/marketing/MarketingAiAgent.tsx`

Keep existing functionality (stats cards, blocked banner, quick actions) and ADD:

1. **Agent list section** — Use existing `useAgents()` hook data (already loaded) to show active agents in a card list with name, status badge, and "Configura" button linking to `/azienda/marketing/agente-ai/{id}`

2. **Recent conversations query** — Add a `useQuery` fetching last 5 rows from `ai_agent_conversations` (columns: `id, agent_id, duration_seconds, status, started_at`). Join agent names from the already-loaded agents data. Note: the table has NO `summary` or `created_at` column — use `started_at` instead.

3. **"Gestisci tutti gli agenti" button** — Add in the header next to the title, navigating to `/azienda/marketing/agente-ai`

4. **Conversations section** — Show last 5 conversations with agent name, duration formatted as mm:ss, status badge, and relative date

## Adaptation Notes
The user-provided code references `agent_type`, `is_active`, `summary`, `balance` fields that don't exist in the actual schema. The implementation will use the real schema: `status` (not `is_active`), `started_at` (not `created_at`), `balance_eur` (not `balance`), and no `summary` field.

## No Database Changes Required
All tables and RLS policies already exist.

