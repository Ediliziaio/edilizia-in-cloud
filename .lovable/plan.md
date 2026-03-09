# Stato Progetto — Aggiornato

## AI Agents — Modulo Completo ✅
- ✅ **Struttura modulo**: `src/modules/ai-agents/` con lazy loading, sidebar, routing
- ✅ **21 componenti**: Editor 10-tab, wizard creazione, analytics, KB, widget, crediti
- ✅ **7 pagine**: Lista, Editor, KB globale, Crediti, Telefoni, WhatsApp, Impostazioni
- ✅ **6 hooks**: useAgents, useAgentCredits, useElevenLabsProxy, useAISubscription, etc.
- ✅ **Integrazione ElevenLabs**: proxy, webhook, knowledge base sync, crediti atomici

---

## Gestione Utenti — Completamento 100% ✅
- ✅ Database + Security, Edge Functions, UI Core, Policy Sicurezza — tutto completato

---

## Stripe Billing Completo ✅
- ✅ Tabella `stripe_events_log` con idempotenza, RLS super_admin
- ✅ Colonne dunning su `companies`
- ✅ **stripe-webhook** refactored con handler modulari, dunning automatico, `invoice.payment_failed`
- ✅ **customer-portal** edge function per Stripe Customer Portal
- ✅ **AdminDunning** con query real-time + **CompanySubscriptionTab** stato dunning

---

## 2FA TOTP ✅
- ✅ Tabelle `totp_secrets` + `totp_backup_codes` con RLS
- ✅ **manage-totp** edge function: setup (QR), verify, validate, validate_backup, disable, status
- ✅ **TwoFactorSetup** componente: configurazione con QR, verifica codice, backup codes, disattivazione
- ✅ **TwoFactorVerify** componente: verifica TOTP o codice backup al login
- ✅ **LoginForm** aggiornato con step 2FA dopo autenticazione
- ✅ **SettingsSecurity** aggiornato con tab 2FA per tutti gli utenti

---

## Health Score Engine ✅
- ✅ Tabella `company_health_scores` con RLS super_admin
- ✅ **compute-health-scores** edge function: calcolo score multi-dimensionale (login, ordini, features, team, engagement)
- ✅ Churn risk + signals automatici (no_recent_login, declining_orders, trial_expiring_soon, etc.)
- ✅ **useHealthScores** + **useCompanyHealthScore** hooks
- ✅ **CompanyOverviewTab** card con breakdown score dettagliato e progress bars

---

## Support Migliorato ✅
- ✅ **support_canned_responses** tabella con RLS
- ✅ **CannedResponsesPicker** componente: CRUD risposte rapide, inserimento nel chat
- ✅ **AdminSupportChatSheet** integrato con picker risposte rapide
- ✅ **SLA tracking**: campi `sla_response_due_at`, `sla_resolution_due_at`, `first_response_at`, breached flags su `support_conversations`
- ✅ **SLA per piano**: `sla_response_hours`, `sla_resolution_hours` su `subscription_plans`
- ✅ **Assegnazione ticket**: campo `assigned_to` su `support_conversations`

---

## ⏳ Funzionalità Rimanenti

- ⬜ Customer Success Platform (P1) — onboarding checklist, CS tasks, NPS
- ⬜ API Platform per Aziende (P2)
- ⬜ GDPR & Compliance Tools (P2)
- ⬜ White-Label (P3)
- ⬜ Partner Portal Referrer (P3)
- ⬜ Round-robin assegnazione team
- ⬜ KPI per team nella dashboard
- ⬜ Drag & Drop utenti tra team
