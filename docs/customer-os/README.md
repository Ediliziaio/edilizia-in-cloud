# Customer OS — Architettura

Sistema agentico post-acquisizione per EdiliziaInCloud. 6 personas che
osservano, capiscono, suggeriscono e (con approval) agiscono per il
customer success.

## 6 Personas

| Persona | Job (1 frase) | Trigger principale | Cost/mese stimato @ 50 clienti |
|---------|---------------|--------------------|--------------------------------|
| **Sofia Onboarding** | Da signup a first-value in 30 giorni | event + cron daily | $20 |
| **Giorgio Support** | Risponde o prepara bozza per ticket | event ticket.created | $60 |
| **Elena CS** | Health scoring + at-risk alerts | cron 06:00 daily | $85 |
| **Tommaso Insight** | Pattern usage + upsell signals | cron daily + weekly | $110 |
| **Beatrice CFO** | KPI brief + anomaly detection | cron 06:30 + events billing | $30 |
| **Marco Sales-Enable** | Post-demo followup + proposte | event demo.completed + manual | $15 |

## 6 Layer

```
┌─ Layer 6: Founder Cockpit (UI Florin) ──────────────────┐
│  /admin/cs?tab=cockpit                                   │
│  /admin/aziende/:id → tab AI Cockpit                     │
└──────────────────────────────────────────────────────────┘
                            ▲
┌─ Layer 5: Action Layer ──────────────────────────────────┐
│  silvio_action_queue · approval gate · audit · cost cap  │
└──────────────────────────────────────────────────────────┘
                            ▲
┌─ Layer 4: Agent Cognitive Layer ─────────────────────────┐
│  6 edge functions (Sofia/Giorgio/Elena/Tommaso/Beatrice/Marco) │
│  Anthropic Sonnet via OpenRouter                         │
└──────────────────────────────────────────────────────────┘
                            ▲
┌─ Layer 3: Knowledge Graph ───────────────────────────────┐
│  customer_profile VIEW · customer_health_history ·       │
│  customer_onboarding · kb_documents                      │
└──────────────────────────────────────────────────────────┘
                            ▲
┌─ Layer 2: Activity Brain ────────────────────────────────┐
│  product_events · customer_interactions ·                │
│  customer_usage_daily · nps_responses                    │
└──────────────────────────────────────────────────────────┘
                            ▲
┌─ Layer 1: Data Sources ──────────────────────────────────┐
│  EiC app · Stripe · email OAuth · WhatsApp · in-app chat │
└──────────────────────────────────────────────────────────┘
```

## File mappa

### Database (3 migration)

- `supabase/migrations/20270526200000_customer_os_data_layer.sql`
  - product_events, customer_interactions, customer_health_history,
    customer_onboarding, customer_usage_daily, nps_responses
  - VIEW customer_profile (50+ campi aggregati)
  - RPC get_customer_context()
  - Trigger bootstrap onboarding

- `supabase/migrations/20270526210000_customer_os_workflows.sql`
  - customer_workflows (registry)
  - customer_workflow_runs (execution log)
  - 14 workflow seedati
  - RPC enqueue_customer_workflow() + complete_workflow_run()
  - VIEW customer_workflow_daily_stats

### Edge Functions (7)

- `supabase/functions/_customer_os_shared/index.ts` (helpers comuni)
- `supabase/functions/sofia-onboarding/index.ts`
- `supabase/functions/giorgio-support-triage/index.ts`
- `supabase/functions/elena-cs-health-daily/index.ts`
- `supabase/functions/tommaso-insight-daily/index.ts`
- `supabase/functions/beatrice-cfo-daily/index.ts`
- `supabase/functions/marco-sales-postdemo/index.ts`

### Client helpers TS

- `src/lib/customer-os/trackEvent.ts` — log eventi prodotto (fire-and-forget)
- `src/lib/customer-os/customerProfile.ts` — hooks React Query
- `src/lib/customer-os/healthScore.ts` — formula deterministica health
- `src/lib/customer-os/interactionLog.ts` — log omnichannel
- `src/lib/customer-os/workflowRunner.ts` — enqueue workflow

### UI

- `src/pages/admin/cs/CockpitTab.tsx` — Founder daily cockpit
- `src/components/admin/company/CompanyAICockpit.tsx` — per-customer drawer

### Knowledge Base

- `kb/customer-os/README.md`
- `kb/customer-os/florin-voice.md` — tone reference per agenti
- `kb/customer-os/eic-features-current.md` — capabilities whitelist anti-hallucination
- `kb/customer-os/ticket-templates-faq.md` — FAQ matchabili da Giorgio
- `kb/customer-os/onboarding-playbook.md` — Sofia sequence
- `kb/customer-os/upsell-signals.md` — Tommaso catalog
- `kb/customer-os/case-studies.md` — Marco proof points
- `kb/customer-os/objection-handlers.md` — Marco objection map

## Deploy checklist

1. **Migration SQL** (in ordine):
   - `20270526200000_customer_os_data_layer.sql` → SQL Editor Supabase
   - `20270526210000_customer_os_workflows.sql` → SQL Editor Supabase

2. **Edge functions deploy**:
   ```bash
   supabase functions deploy sofia-onboarding
   supabase functions deploy giorgio-support-triage
   supabase functions deploy elena-cs-health-daily
   supabase functions deploy tommaso-insight-daily
   supabase functions deploy beatrice-cfo-daily
   supabase functions deploy marco-sales-postdemo
   ```
   (Le edge function importano da `_customer_os_shared/` — il path è relativo,
   il bundler CLI le include automaticamente.)

3. **Environment variables Supabase Edge**:
   - `OPENROUTER_API_KEY` (per chiamare Sonnet/gpt-4o-mini)
   - `SUPABASE_URL` (auto-set)
   - `SUPABASE_SERVICE_ROLE_KEY` (auto-set)

4. **Cron schedules** — da configurare in Supabase pg_cron o esterno:
   - `0 6 * * *` → POST /sofia-onboarding {workflow_key: onboarding.day_3_check}
     (e altri scaglionati day_7, day_21)
   - `0 6 * * *` → POST /elena-cs-health-daily
   - `0 7 * * *` → POST /tommaso-insight-daily {workflow_key: insight.daily_usage_report}
   - `0 8 * * 1` → POST /tommaso-insight-daily {workflow_key: insight.upsell_signal}
   - `30 6 * * *` → POST /beatrice-cfo-daily {workflow_key: cfo.daily_kpi_brief}

5. **Event-driven triggers** — da aggiungere come Supabase Database Webhooks
   o trigger SQL che chiamano `enqueue_customer_workflow`:
   - `companies INSERT` → enqueue `onboarding.kickoff_email`
   - `support_tickets INSERT` → enqueue `support.ticket_triage`
   - Stripe webhook payment.failed → enqueue `cfo.payment_failed_alert`
   - `demo_completed` event (manual da Calendly webhook) → enqueue `sales.post_demo_followup`

6. **KB content** — Florin deve riempire i 7 file `kb/customer-os/*.md` con
   contenuti reali (voice, features, FAQ, ecc.). Senza, gli agenti sono generici.

7. **Action policies** — verificare in `silvio_action_policies` che ogni
   action_type degli agenti abbia mode appropriato:
   - `email.outbound.onboarding` → `auto_notify`
   - `ticket.auto_reply` → `auto` se FAQ confidence ≥ 0.9
   - `ticket.reply_draft` → `approval_required`
   - `sales.proposal` → `approval_required` (SEMPRE)
   - `sales.followup_email` → `approval_required`

8. **Instrumentation client EiC** — aggiungere chiamate `trackEvent()` nei
   punti chiave dell'app azienda:
   - Login success → `trackEvent("login.success", "login")`
   - Creazione commessa → `trackEvent("commesse.created", "feature")`
   - Apertura modulo → `trackEvent("module.view", "feature", { module: "marginalita" })`
   - Errore visto utente → `trackEvent("error.seen", "error", { error_code: ... })`

## Cost model

A regime con 50 clienti attivi:

| Voce | $/mese |
|------|--------|
| AI tokens (Sonnet + gpt-4o-mini mix) | ~$370 |
| OpenRouter routing fees | $30 |
| Supabase scale (storage events) | +$50 |
| **TOTAL** | **~$450/mese** |

3% cost ratio @ €15K MRR. 0.9% @ €50K MRR. Eccellente.

## Le 12 difficoltà già mitigate nel design

1. **Data plumbing** → `product_events` schema + `trackEvent()` helper sanitized
2. **Knowledge graph** → `customer_profile` VIEW + `get_customer_context` RPC
3. **Sentiment italiano** → tool dedicato `update_interaction_sentiment` + classifier gpt-4o-mini
4. **Hallucination** → KB `eic-features-current.md` whitelist per Marco
5. **Approval fatigue** → 3 mode (auto/auto_notify/approval_required) per action_type
6. **Multichannel chaos** → `customer_interactions` unified table
7. **Onboarding non statico** → `customer_onboarding` adaptive phase tracking
8. **Voice Florin** → KB `florin-voice.md` in system prompt agenti
9. **Cost AI** → cost_usd tracking per workflow + max_cost_usd_per_run guard
10. **Signal-to-noise** → notifications type + `recipient_role` filtering
11. **Single source truth** → Supabase = canonical, no fragmentation
12. **Drift agenti vs prodotto** → KB versioning + cron review settimanale

## Step successivi (post Sprint 1)

- Embeddings su `kb_documents` per RAG semantico (oggi: full-text lookup)
- Cron self-improvement loop su `customer_workflow_runs` (impara da successi/falliti)
- Mobile push notifications via Capacitor per Florin (high priority alerts)
- Voice agent (Twilio) per chiamate cold di follow-up
- A/B testing automatico hook email (Marco varia tono → measure reply rate)
