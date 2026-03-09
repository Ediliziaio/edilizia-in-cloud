# Stato Progetto — Aggiornato

## AI Agents — Modulo Completo ✅
- ✅ **Struttura modulo**: `src/modules/ai-agents/` con lazy loading, sidebar, routing
- ✅ **21 componenti**: Editor 10-tab, wizard creazione, analytics, KB, widget, crediti
- ✅ **7 pagine**: Lista, Editor, KB globale, Crediti, Telefoni, WhatsApp, Impostazioni
- ✅ **6 hooks**: useAgents, useAgentCredits, useElevenLabsProxy, useAISubscription, etc.
- ✅ **Integrazione ElevenLabs**: proxy, webhook, knowledge base sync, crediti atomici

---

## Gestione Utenti — Completamento 100% ✅

### Database + Security ✅
- ✅ 6 tabelle + `password_history`, 20+ colonne security, 9 permessi granulari, RLS completo
- ✅ Colonne complexity: `password_min_length`, `password_require_uppercase/numbers/special`
- ✅ Colonne policy: `lockout_duration_minutes`, `enforce_2fa_roles`, `security_notifications`

### Edge Functions ✅
- ✅ track-user-session, revoke-user-session, manage-permission-template, get-security-report
- ✅ **check-login-security**: IP allowlist, brute force con durata blocco configurabile
- ✅ **cleanup-sessions**: cron giornaliero (03:00) per eliminare sessioni > 30 giorni

### UI Core ✅
- ✅ Security Dashboard, Team Management, CreateUserWizard, Tabella utenti arricchita
- ✅ Session Tracking integrato in AuthContext, Unlock Account
- ✅ **3 Tab Dettaglio Utente**: Sessioni, Log Attività, Sicurezza
- ✅ **Filtri Avanzati**: Stato + Ruolo + Ricerca + Team
- ✅ **Colonna "Sessioni Attive"** separata con badge count
- ✅ **Import/Export utenti CSV**

### Policy Sicurezza ✅
- ✅ **CompanySecuritySettings** completo
- ✅ **ChangePasswordForm** con validazione complessità in tempo reale
- ✅ **PermissionTemplatesManager**: CRUD + "Applica a Utente"
- ✅ **Password History** (tabella DB pronta, RLS bloccato lato client)

---

## Stripe Billing Completo ✅

### Database ✅
- ✅ Tabella `stripe_events_log` con idempotenza, RLS super_admin
- ✅ Colonne `companies`: `stripe_subscription_status`, `payment_failure_count`, `dunning_status`, `last_payment_failure_at`, `dunning_started_at`

### Edge Functions ✅
- ✅ **stripe-webhook** refactored: idempotenza via `stripe_events_log`, handler modulari, gestione `invoice.payment_failed` con dunning automatico (warning → escalated → critical), `customer.subscription.updated`
- ✅ **customer-portal**: Stripe Customer Portal per self-service gestione abbonamenti

### UI ✅
- ✅ **AdminDunning** arricchito: query real-time aziende in dunning dal DB, conteggio fallimenti, badge status
- ✅ **CompanySubscriptionTab**: mostra stato dunning e conteggio fallimenti pagamento

---

## ⏳ Funzionalità Rimanenti (Priorità Bassa)

- ⬜ Round-robin assegnazione team
- ⬜ KPI per team nella dashboard
- ⬜ Drag & Drop utenti tra team
- ⬜ 2FA TOTP + Secure Impersonation (P1)
- ⬜ Health Score Engine pg_cron (P1)
- ⬜ Customer Success Platform (P1)
- ⬜ API Platform per Aziende (P2)
- ⬜ GDPR & Compliance Tools (P2)
- ⬜ White-Label (P3)
- ⬜ Partner Portal Referrer (P3)
