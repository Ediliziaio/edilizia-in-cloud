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
- ✅ **SLA tracking**: campi sla_response_due_at, sla_resolution_due_at, first_response_at, breached flags
- ✅ **SLA per piano**: sla_response_hours, sla_resolution_hours su subscription_plans
- ✅ **Assegnazione ticket**: campo assigned_to su support_conversations

---

## Customer Success Platform ✅
- ✅ **onboarding_templates** + **onboarding_steps**: template configurabili con step, auto-check keys, ordinamento
- ✅ **company_onboarding**: assegnazione template ad azienda, CS manager, stato
- ✅ **company_onboarding_completions**: tracking completamento step per azienda
- ✅ **cs_tasks**: attività CS con priorità, scadenza, assegnazione, stati (open/in_progress/completed)
- ✅ **CustomerSuccess** pagina admin: CRUD template, editor step visuale
- ✅ **AdminCSTasks** pagina admin: gestione task CS con filtri, creazione, cambio stato
- ✅ **OnboardingChecklist** widget: checklist interattiva nella dashboard azienda con progress
- ✅ Sidebar admin aggiornata con link CS Onboarding e CS Tasks

---

## API Platform per Aziende ✅
- ✅ Tabelle `api_keys`, `api_usage_log`, `api_usage_daily` con RLS tenant-scoped
- ✅ **api-gateway** edge function: generate_key (SHA-256 hash), list_keys, revoke_key, update_key, get_usage_stats, validate_api_key
- ✅ **SettingsApiKeys** pagina: gestione chiavi (CRUD), scopes configurabili, rate limiting
- ✅ **ApiUsageChart** componente: grafici utilizzo giornaliero con filtri per chiave e periodo
- ✅ **ApiDocsTab** componente: documentazione API interattiva con endpoint, parametri, esempi cURL
- ✅ Sidebar aziendale aggiornata con link "API Platform"

---

## GDPR & Compliance Tools ✅
- ✅ Tabelle `gdpr_data_requests`, `gdpr_consents`, `gdpr_audit_log` con RLS
- ✅ **gdpr-compliance** edge function: export dati (JSON + storage), richiesta cancellazione, approvazione admin, consent management, audit log
- ✅ **SettingsPrivacy** pagina utente: gestione consensi, export dati, richiesta cancellazione account (Art. 17/20 GDPR)
- ✅ **AdminGDPR** pagina admin: gestione richieste di cancellazione, audit trail GDPR
- ✅ Sidebar aggiornata: "Privacy & GDPR" in impostazioni azienda, "GDPR" in sidebar admin

---

## White-Label & Branding ✅
- ✅ **company_branding** tabella con RLS: logo, favicon, colori HSL, dominio custom, login personalizzato, email branding
- ✅ **Storage bucket** `branding` con policy per upload logo/favicon/email logo
- ✅ **useBranding** hook: fetch branding + applicazione dinamica CSS custom properties + favicon
- ✅ **useBrandingMutation** hook: upsert branding + upload file su storage
- ✅ **SettingsBranding** pagina: gestione completa logo, colori, login, dominio, email, opzioni avanzate
- ✅ **CompanyLayout** sidebar aggiornata con logo da branding + link "White-Label" in impostazioni
- ✅ Rotta `/azienda/impostazioni/branding` configurata in App.tsx

---

## Partner Portal Referrer ✅
- ✅ **Ruolo `referrer`** aggiunto all'enum `app_role` e ai tipi TypeScript
- ✅ **user_id** su tabella `referrers` per collegamento account partner
- ✅ **RLS policies**: referrer self-access su `referrers`, `referral_companies`, `referral_payouts`
- ✅ **PartnerPortal** pagina: dashboard con stats, lista aziende referenziate, storico pagamenti, link referral copiabile
- ✅ **PartnerLayout** layout dedicato con sidebar minima
- ✅ **RoleBasedRedirect** aggiornato con redirect `/partner` per ruolo `referrer`
- ✅ **QuickLoginPopover** aggiornato con labels/colors/redirect per referrer
- ✅ Rotta `/partner` protetta in App.tsx

---

## Team Management Avanzato ✅
- ✅ **Round-robin assegnazione**: funzione DB `assign_round_robin` con tracking index per distribuzione equa
- ✅ **KPI per team**: dashboard con contatori (team, membri totali, leader, media) + KPI bar per card
- ✅ **Drag & Drop utenti**: spostamento membri tra team con dnd-kit, overlay visivo, drop zone evidenziate

---

## ✅ Tutte le funzionalità pianificate sono state completate!
