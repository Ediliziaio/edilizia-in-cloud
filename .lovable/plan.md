

# Audit Tecnico Enterprise — Report AS-IS e Piano TO-DO

Questo audit copre l'intera codebase (~350 componenti, ~30 hook, ~32 Edge Function, 6 layout, 5 ruoli utente) analizzando architettura, sicurezza, performance, multi-tenancy, UX e osservabilita.

---

## A. REPORT AS-IS — Mappa del Sistema

### Moduli Principali
| Modulo | File/Componenti | Stato |
|--------|----------------|-------|
| Auth + RBAC | AuthContext, ProtectedRoute, usePermissions, 7 ruoli | Solido |
| Ordini | ~25 componenti, CreateOrder, EditOrder, OrderDetail | Complesso ma funzionale |
| Marketing CRM | Contatti, Opportunita, Pipeline, Automazioni, Email, WhatsApp | Maturo |
| Ticket/Assistenza | TicketChat, TicketAttachments, LinkedTasks | Funzionale |
| Dashboard | CompanyDashboard, CruscottoAziendale, AdminDashboard, MarketingDashboard | Ottimizzate con RPC |
| Magazzino | Warehouse, movimenti, stock | Funzionale |
| Dipendenti | Employees, TimeEntry, WorkLogs | Funzionale |
| Landing Page | ~20 componenti con scroll animation | Funzionale |
| Integrazioni | Meta Lead Ads (OAuth, webhook, proxy), Google Calendar, Stripe, WhatsApp | Mature |
| Admin (Super) | Aziende, Piani, Lifecycle, Implementazioni, Impersonation | Maturo |

### Architettura
- **Frontend**: React 18 + Vite + TailwindCSS + shadcn/ui, lazy loading su tutte le pagine
- **State**: React Query con staleTime 2min, QueryCache/MutationCache globali con toast
- **Backend**: 32 Edge Functions Deno, rate limiting condiviso, encryption condivisa
- **DB**: Funzioni RPC per aggregazioni, trigger per audit/automazioni, RLS con `has_role()` e `has_permission()` security definer
- **Multi-tenancy**: `effectiveCompany` pattern per impersonation, `company_id` su entita principali

### Punti di Forza Esistenti
- Lazy loading completo su tutte le pagine
- ErrorBoundary a ogni livello di routing
- Rate limiting centralizzato su Edge Functions
- DOMPurify su tutti i `dangerouslySetInnerHTML`
- Query RPC per aggregazioni pesanti (dashboard)
- Memoizzazione dashboard (da audit precedente)
- Audit log su operazioni critiche
- Encryption per token Google Calendar
- RBAC granulare con 35+ permessi

---

## B. LISTA INTERVENTI TO-DO

### P0 — Critico (Sicurezza / Data Integrity)

| # | Intervento | Area | Dettaglio |
|---|-----------|------|-----------|
| 1 | **Encryption token Meta debole** | Security | `meta-api-proxy` usa `atob()` per "decifrare" i token — semplice base64, non encryption. Allineare a `_shared/encryption.ts` con XOR+key |
| 2 | **Validazione input server-side mancante** | Security | Le Edge Function che accettano body JSON (es. `meta-api-proxy`, `create-company`) non validano tipi/lunghezze dei campi. Aggiungere schema validation con Zod |
| 3 | **`getClaims` non standard** | Auth | `meta-api-proxy` usa `supabase.auth.getClaims(token)` che non e un metodo SDK standard. Verificare se e un wrapper custom o sostituire con `getUser()` |
| 4 | **XOR encryption debole** | Security | `_shared/encryption.ts` usa XOR — crittograficamente fragile. Per token sensibili (Google OAuth), migrare a AES-GCM via Web Crypto API |

### P1 — Importante (Performance / Stabilita)

| # | Intervento | Area | Dettaglio |
|---|-----------|------|-----------|
| 5 | **CompanyDashboard 763 righe** | Refactor | Pagina monolitica con logica inline. Estrarre hook `useCompanyDashboardData` e widget in componenti separati |
| 6 | **TicketDetail query senza company_id filter** | Multi-tenant | La query ticket filtra solo per `id` senza `company_id`. Aggiungere filtro esplicito defense-in-depth |
| 7 | **Console.error in pagine** | Cleanup | ~60 `console.error` in pagine — legittimi per debug ma da sostituire con logging strutturato in produzione |
| 8 | **Employees.tsx riusato via SettingsStaff** | Refactor | Pattern anti: una pagina importata come componente da un'altra pagina. Estrarre logica in componente condiviso |
| 9 | **Indici DB per query frequenti** | Performance | Verificare indici su: `tickets(company_id, status)`, `orders(company_id, created_at)`, `marketing_contacts(company_id, source)`, `automation_trigger_events(company_id, processed)` |
| 10 | **Edge Function token validation inconsistente** | Security | Alcune function verificano JWT, altre no. Standardizzare: tutte con `verify_jwt = false` + validazione in-code |

### P2 — Migliorativo (UX / Code Quality)

| # | Intervento | Area | Dettaglio |
|---|-----------|------|-----------|
| 11 | **Toast duplicato** | UX | `useToast` (radix) e `sonner` usati in parallelo. Standardizzare su `sonner` unico |
| 12 | **Pagination mancante** | UX/Perf | Liste grandi (ordini, contatti, ticket) senza paginazione server-side rischiano il limite 1000 righe |
| 13 | **Loading state inconsistenti** | UX | Alcune pagine mostrano Skeleton, altre Loader2, altre nulla durante il caricamento |
| 14 | **Mobile UX ticket detail** | UX | Layout a 2 colonne non collassa su mobile — sidebar e chat competono per spazio |
| 15 | **Backup/Restore** | DevOps | Lovable Cloud gestisce backup automatici — documentare RTO/RPO e procedura restore |
| 16 | **Osservabilita** | DevOps | Nessun error tracking centralizzato (Sentry/equivalente). ErrorBoundary cattura ma non invia |

---

## C. PIANO DI ESECUZIONE PROPOSTO

Data la dimensione dell'audit, propongo di procedere in **3 sprint incrementali**, ciascuno behavior-preserving:

### Sprint 1 — Sicurezza + Multi-tenant (P0)
1. Rafforzare encryption token Meta (allineare a `encrypt/decrypt` condiviso)
2. Aggiungere validazione Zod sulle Edge Function critiche
3. Aggiungere filtro `company_id` defense-in-depth su tutte le query ticket
4. Verificare e documentare indici DB

### Sprint 2 — Performance + Refactor (P1)
5. Estrarre `useCompanyDashboardData` da CompanyDashboard.tsx
6. Standardizzare toast su sonner
7. Aggiungere paginazione server-side su liste critiche
8. Pulire console.error ridondanti

### Sprint 3 — UX + Osservabilita (P2)
9. Uniformare loading state (Skeleton pattern)
10. Mobile-responsive ticket detail
11. Documentare backup/restore Lovable Cloud
12. Aggiungere error reporting centralizzato in ErrorBoundary

### Checklist Multi-Tenant (gia verificata)
- [x] `effectiveCompany` usato per tenant context
- [x] `company_id` presente su entita principali
- [x] RLS con `has_role()` security definer
- [x] Edge Function validano tenant via auth
- [ ] Query ticket da aggiungere filtro company_id (P1 #6)

### Checklist Sicurezza
- [x] DOMPurify su tutti dangerouslySetInnerHTML
- [x] Rate limiting su Edge Function
- [x] RBAC granulare con 35+ permessi
- [x] No secrets nel client
- [x] Auth token validation su Edge Function
- [ ] Encryption token Meta da rafforzare (P0 #1)
- [ ] Input validation server-side da aggiungere (P0 #2)
- [ ] XOR encryption da migrare a AES-GCM (P0 #4)

---

**Quale sprint vuoi che esegua per primo?** Consiglio di partire dallo Sprint 1 (Sicurezza) dato che contiene i fix P0.

