

# Analisi Documento vs Implementazione — Gap Analysis

## Struttura del Documento

Il documento "Analisi SuperAdmin SaaS" (18 pagine) definisce **11 macro-aree** con una roadmap da P0 a P3. Analizziamo punto per punto cosa è stato implementato e cosa manca.

---

## 1. Scorecard Esecutiva (Pag. 2-3) — Stato Verificato

| Area del Documento | Stato nel Codice | Note |
|---|---|---|
| Routing & Layout separato | ✅ Implementato | `/admin/*` vs `/azienda/*` con layout separati |
| Separazione subdomain | ❌ NON IMPLEMENTATO | Il doc richiede `admin.ediliziaincloud.it` vs `app.ediliziaincloud.it` con build Vite separate. La SPA resta unica |
| Protezione route (super_admin) | ✅ Implementato | `ProtectedRoute` con `allowedRoles` |
| Permissions granulari | ✅ Implementato | 6 permessi in `super_admin_permissions` |
| Company Management | ✅ Implementato | 7+ tab, impersonation, quick actions |
| Impersonation system | ⚠️ PARZIALE | Il doc segnala XSS risk via sessionStorage. Il codice ora usa stato in-memory (`useState`) — il rischio sessionStorage è stato risolto. MA il doc richiede **JWT temporaneo via edge function con cookie HttpOnly** → NON implementato |
| Billing & Stripe | ✅ Implementato | Webhook, dunning, customer portal |
| Analytics & MRR | ✅ Implementato | MRR, ARR, NRR, LTV, cohort, forecast, health |
| Feature flags / rollout | ✅ Implementato | Tabelle `platform_feature_flags` + `company_feature_overrides`, UI admin, hook |
| Bulk operations | ✅ Implementato | `BulkActionsBar` in `CompaniesList`, checkbox, azioni bulk |
| 2FA Super Admin | ✅ Implementato | TOTP con `manage-totp` edge function, QR, backup codes |
| Audit log | ✅ Implementato | `admin_audit_log` + `company_activity_log` |
| GDPR tools | ✅ Implementato | Export, cancellazione, consensi, audit GDPR |
| API marketplace / webhook UI | ✅ Implementato | `api-gateway`, API keys, usage, docs |
| Referral system | ✅ Implementato | Partner Portal, ruolo referrer, RLS |
| Helpdesk integrato | ✅ Implementato | SLA tracking, canned responses, assegnazione |

---

## 2. Separazione Subdomain (Pag. 4-6) — Prompt 1

| Requisito | Stato |
|---|---|
| Variabile `VITE_APP_MODE` in vite.config.ts | ❌ Non implementato |
| Build scripts separati (build:app / build:admin) | ❌ Non implementato |
| Route condizionali basate su `__APP_MODE__` | ❌ Non implementato |
| AdminLoginPage separata | ❌ Non implementato |
| Cloudflare Worker per sicurezza admin | ❌ Non implementato (infrastruttura esterna) |

**Nota**: Questa è una funzionalità di **infrastruttura/deployment** che Lovable non può implementare completamente (richiede configurazione Cloudflare esterna). Si può implementare la parte Vite + route condizionali ma non il deployment multi-dominio.

---

## 3. Prompt 2 — Stripe Billing Completo ✅ FATTO

Tutti i requisiti del documento sono implementati: webhook, dunning, customer portal, `stripe_events_log`.

---

## 4. Prompt 3 — Feature Flags System ✅ FATTO

Tabelle, hook `useFeatureFlags`, pagina admin `FeatureFlags.tsx`, override per azienda — tutto implementato.

---

## 5. Prompt 4 — Bulk Operations + Export ✅ FATTO

`BulkActionsBar`, checkbox nella lista aziende, export CSV — implementato in `CompaniesList.tsx`.

---

## 6. Prompt 5 — 2FA + Secure Impersonation ⚠️ PARZIALE

| Requisito | Stato |
|---|---|
| 2FA TOTP per Super Admin | ✅ Implementato |
| Backup codes | ✅ Implementato |
| Login flow 2FA (step 2) | ✅ Implementato |
| Secure Impersonation via JWT + HttpOnly cookie | ❌ NON implementato |
| Edge function `secure-impersonation` | ❌ NON implementato |
| Tabella `active_impersonations` | ❌ NON implementato |

L'impersonation usa `useState` in-memory (meglio di sessionStorage) ma **non** il JWT sicuro con cookie HttpOnly richiesto dal documento.

---

## 7. Health Score Engine (Pag. 11) ✅ FATTO

Edge function `compute-health-scores`, tabella `company_health_scores`, hooks, UI.

---

## 8. Customer Success Platform (Pag. 11) ✅ FATTO

Onboarding templates, CS tasks, checklist widget — tutto implementato.

---

## 9. Security Avanzata (Pag. 11-12)

| Requisito | Stato |
|---|---|
| 2FA TOTP | ✅ |
| Login attempt rate limiting | ✅ `check-login-security` edge function con lockout |
| IP Allowlist per admin panel | ⚠️ Solo per aziende (campo `allowed_ips` su companies), NON per il pannello super admin |
| Secure Impersonation (JWT HttpOnly) | ❌ |
| Session management UI (vedi sessioni, forza logout) | ⚠️ Presente per aziende (`get-security-report`), non specifico per super admin panel |
| Audit log con IP, user agent, geolocation | ⚠️ Parziale — login_attempts ha IP, ma non tutte le azioni admin |

---

## 10. API Platform (Pag. 12) ✅ FATTO

---

## 11. GDPR & Compliance (Pag. 12) ✅ FATTO

---

## 12. White-Label & Branding (Pag. 12) ✅ FATTO

---

## 13. Bug & Technical Debt (Pag. 9)

| Problema segnalato | Stato |
|---|---|
| sessionStorage per impersonation (XSS) | ✅ Risolto — ora usa `useState` in-memory |
| Trial extension hardcoded (+7/+14/+30) | ⚠️ Da verificare se ora è configurabile |
| Implementations solo 1 toggle hardcoded | ✅ Risolto — sostituito con Feature Flags |
| SyncLogs page vuota/incompleta | ⚠️ La pagina esiste (`SyncLogs.tsx`) ma sembra rudimentale |
| allowed_company_ids non enforced | ⚠️ Da verificare nel `CompaniesList.tsx` |
| Nessun confirm dialog su azioni destructive | ⚠️ Da verificare |

---

## RIEPILOGO GAP RIMANENTI

### Non implementati (richiedono lavoro):
1. **Secure Impersonation via JWT + HttpOnly cookie** — Edge function + tabella `active_impersonations`
2. **Separazione Subdomain** — Build multi-target Vite (parte implementabile), Cloudflare (infrastruttura esterna)
3. **IP Allowlist specifico per pannello super admin** — Non solo per aziende
4. **AdminLoginPage separata** — Login dedicato per super admin

### Parziali / Da Verificare:
5. SyncLogs page — potrebbe necessitare miglioramento
6. `allowed_company_ids` enforcement nel `CompaniesList`
7. Alert Slack/email su System Health threshold
8. NPS survey automatica (menzionata in Customer Success ma non verificata)
9. Data retention policies configurabili (GDPR)
10. Playbook automatici Customer Success

### Non implementabili in Lovable:
- Cloudflare Workers / Pages deployment
- Custom domain DNS configuration
- pg_cron scheduling (Cloud non lo supporta nativamente)

---

## Piano di Implementazione Suggerito

Se vuoi procedere con i gap, in ordine di priorità:

1. **Secure Impersonation** (P1) — Edge function JWT + active_impersonations table
2. **AdminLoginPage separata** (P0) — Pagina login dedicata per super admin
3. **IP Allowlist super admin** (P1) — Protezione aggiuntiva pannello admin
4. **Build multi-target Vite** (P0) — `VITE_APP_MODE` + route condizionali
5. **Fix tecnici minori** — SyncLogs, allowed_company_ids enforcement, confirm dialogs

