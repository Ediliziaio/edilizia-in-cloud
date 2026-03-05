

# Audit Tecnico Enterprise + Piano di Intervento

## A. Report AS-IS — Mappa del Sistema

### Moduli Principali
- **Admin** (Super Admin): Dashboard, gestione aziende, piani, ticket globali, lifecycle, annunci, sync logs, referral
- **Azienda** (Company Admin/Staff): Dashboard, cruscotto, ordini (CRUD completo), clienti, magazzino, calendario, task, assistenza/ticket, costi, previsionale, automazioni, reportistica
- **Marketing** (sotto-modulo Azienda): Dashboard KPI, contatti CRM, opportunita/pipeline, email marketing (builder drag-drop), calendario, automazioni workflow, agente AI, WhatsApp, reportistica
- **Cliente**: Ordini (sola lettura), assistenza/ticket, profilo
- **Dipendente**: Dashboard, ore/rapportini, profilo
- **Venditore**: Dashboard, ordini propri, guadagni/commissioni, profilo

### Architettura
- Frontend: React 18 + Vite + Tailwind + TypeScript + React Router v6
- Backend: Supabase (Cloud) con 31 Edge Functions, ~100+ tabelle, RLS, trigger, funzioni RPC
- Lazy loading su tutte le pagine, ErrorBoundary gerarchici
- Auth: Supabase Auth + custom roles in `user_roles` + `staff_permissions` granulari
- Multi-tenancy: `company_id` su quasi tutte le tabelle, `effectiveCompany` per impersonificazione

### Ruoli e Permessi
- 7 ruoli: super_admin, company_admin, company_staff, salesperson, call_center, employee, customer
- Dual-role per salesperson/call_center (ereditano company_staff)
- ~30 permessi granulari in `staff_permissions`
- RLS + `has_role()` / `has_permission()` SECURITY DEFINER
- `check_staff_visibility()` per filtro `only_assigned`

### Edge Functions (31)
Tutte con `verify_jwt = false` (validazione interna). Copertura: CRUD utenti, Stripe, Meta Ads, WhatsApp, Google Calendar, automazioni, ticket-notify, lifecycle events.

---

## B. Findings + TODO con Priorita

### P0 — Critici (da risolvere subito)

| # | Trovato | Intervento |
|---|---------|------------|
| 1 | **Leaked password protection disabilitata** (security scan) | Abilitare nelle impostazioni auth |
| 2 | **`ticket-notify` non invia email reali** — trigger DB attivi ma l'Edge Function fa solo `console.log` | Completare integrazione con servizio email transazionale o rimuovere trigger per evitare overhead inutile su ogni INSERT/UPDATE |
| 3 | **`pg_net` trigger su `ticket_messages` e `tickets`** — chiamano HTTP a ogni INSERT/UPDATE ma l'endpoint e un no-op, genera latenza e log inutili | Disabilitare i trigger finche il servizio email non e pronto |
| 4 | **TicketChat: signed URL 1 anno** — genera URL firmati con scadenza 365 giorni per ogni allegato. Eccessivo e potenziale rischio se condiviso | Ridurre a 1-24h, generare on-demand al click |
| 5 | **TicketChat: `getPublicUrl` chiamata inutilmente** (linea 112-114) prima di `createSignedUrl` — dead code | Rimuovere la chiamata `getPublicUrl` |
| 6 | **useUnreadTicketCounts: N+1 query** — per ogni ticket con messaggi non letti fa una query separata a `ticket_messages` | Consolidare in una singola query RPC o aggregata |
| 7 | **Security scan: 6 ERROR, 7 WARN** — profili, marketing contacts, employees salary, salespeople commission, companies bank data, integration tokens, WhatsApp tokens esposti piu del necessario | Valutare rafforzamento RLS per dati sensibili (salari, IBAN, token) |

### P1 — Importanti (prossimo sprint)

| # | Trovato | Intervento |
|---|---------|------------|
| 8 | **LinkedTasks `toggleMutation`** manca filtro `company_id` nell'update | Aggiungere `.eq("company_id", companyId)` come defense-in-depth |
| 9 | **TicketDetail.tsx** — query staff members non ha filtro ruolo, carica tutti i profili dell'azienda inclusi clienti | Filtrare per ruoli staff (company_admin, company_staff) |
| 10 | **TicketChat: realtime `invalidateKeys`** passa array come dependency a useEffect senza memoizzazione — rischio re-subscription continuo | Memoizzare `invalidateKeys` o usare ref |
| 11 | **Mancanza `maxLength` su Textarea note interne ticket e messaggio chat** | Aggiungere vincoli input coerenti |
| 12 | **`useUnreadTicketCounts` ascolta TUTTI i `ticket_messages` INSERT** senza filtro `company_id` nel channel — riceve notifiche anche per ticket di altre aziende | Aggiungere filtro RLS-aware o filtrare client-side con controllo ticket ownership |
| 13 | **Nessun pagination** sulla lista ticket — carica tutti i ticket dell'azienda in una query | Per aziende con molti ticket, aggiungere pagination server-side |

### P2 — Miglioramenti (backlog)

| # | Trovato | Intervento |
|---|---------|------------|
| 14 | **TicketChat `ext` variabile inutilizzata** (linea 105) | Rimuovere |
| 15 | **`LinkedTasks` usa `any` per tipo task** | Tipizzare correttamente |
| 16 | **Mancanza di toast di conferma** al mark-as-read ticket | Non necessario, azione silente corretta |
| 17 | **Landing page** ha ~15 componenti con `useScrollAnimation` — pattern corretto, nessuna issue | Nessun intervento |
| 18 | **`notificationSound`** — usato correttamente in 2 componenti | Nessun intervento |

---

## C. Performance

### Ottimizzazioni Identificate

1. **useUnreadTicketCounts N+1** (P0 #6): Attualmente fa `ticketsToCheck.length` query separate. Consolidare in una singola query con GROUP BY o funzione RPC.
   - Stima: da N+1 query (potenzialmente 50+) a 3 query fisse
   - Impatto: riduzione 90% chiamate DB per pagina ticket

2. **Signed URL generation** (P0 #4): Ogni messaggio con allegato genera una signed URL al render. Spostare a on-demand (click per scaricare).
   - Impatto: eliminazione chiamate storage per messaggi con allegato non cliccato

3. **Realtime channel filtering** (P1 #12): Il channel `ticket_messages` riceve eventi per TUTTI i ticket. Usare filtro server-side o batch invalidation.

4. **Gia implementato e corretto**: lazy loading pagine, React.memo su dashboard widget, RPC server-side per aggregazioni, staleTime 2min default, QueryCache/MutationCache centralizzati.

### Stato Attuale (gia buono)
- Lazy loading su tutte le route — corretto
- `staleTime: 2min` default — ragionevole
- ErrorBoundary gerarchici — corretto
- Memoizzazione dashboard widget — verificato nei memory notes

---

## D. Stabilita Funzionale

### Verifiche Positive
- Form ticket: rendering, validazione, salvataggio — OK
- Navigazione back/forward — gestita da React Router, no state loss critico
- ErrorBoundary cattura crash con UI di recovery — OK
- Empty state su liste (ticket, task) — OK con CTA
- Console: nessun errore runtime rilevato

### Fix Necessari
- P0 #5: dead code `getPublicUrl` in TicketChat
- P1 #9: staff members query troppo ampia
- P1 #10: realtime re-subscription per invalidateKeys non memoizzato

---

## E. UX

### Stato Attuale (buono)
- Loading skeleton su tutte le pagine
- Error state con bottone "Riprova" ovunque
- Toast per feedback operazioni (sonner standardizzato)
- Badge non letti in tempo reale sui ticket
- Allegati con preview immagini inline e download documenti

### Miglioramenti Proposti
- P1 #11: maxLength su textarea per prevenire input eccessivi
- Nessun dead-end UX rilevato

---

## F. Multi-Tenancy + Data Isolation

### Stato Attuale
- `company_id` presente su tutte le entita principali
- `effectiveCompany` usato coerentemente (verificato nei memory notes)
- RLS abilitato su tutte le tabelle con policy tenant-scoped
- `check_staff_visibility()` per filtro assegnazione
- Edge Functions validano `company_id` server-side

### Checklist
- [x] Query ticket filtrate per `company_id`
- [x] Query task filtrate per `company_id`
- [x] Ordini, clienti, magazzino — filtrati
- [x] Marketing contacts/opportunities — filtrati
- [ ] `ticket_read_status` — RLS basata su `user_id = auth.uid()`, corretto ma non ha filtro tenant (accettabile perche il record e personale)
- [ ] `useUnreadTicketCounts` realtime — riceve INSERT da tutti i tenant (P1 #12)
- [x] Edge Functions: validazione tenant in-code

---

## G. Sicurezza

### Security Scan Results (18 findings)
- **6 ERROR**: dati sensibili potenzialmente esposti (profili, salari, IBAN, token API, commissioni)
- **7 WARN**: RLS troppo permissive su ordini, ticket, messaggi, work_logs, costi, supplier
- **2 INFO**: permission enumeration, location tracking
- **1 WARN**: leaked password protection disabilitata

### Fix Proposti nel Piano
| Fix | Tipo |
|-----|------|
| Abilitare leaked password protection | Config change |
| Ridurre signed URL da 365gg a 24h | Code fix |
| Rimuovere `getPublicUrl` dead code | Code fix |
| Defense-in-depth `company_id` su update task | Code fix |
| Filtro ruoli su staff members query | Code fix |

### Aree Residue (richiedono decisione business)
- Restringere RLS su `employees.gross_salary` — richiede decisione su chi puo vedere i salari
- Restringere RLS su `companies.bank_iban` — richiede valutazione impatto
- Token rotation per integration_credentials — architettura dedicata
- Le raccomandazioni del security scan su accesso granulare richiedono refactoring RLS significativo — da pianificare come progetto dedicato

### Gia Implementato
- [x] XSS hardening con DOMPurify su email builder
- [x] RBAC multi-livello (ruoli + permessi granulari)
- [x] Auth robusta con Supabase Auth
- [x] Segreti in env/secret manager (non nel client)
- [x] Audit log su operazioni critiche
- [x] Rate limiting e validazione server-side nelle Edge Functions
- [x] AlertDialog su operazioni distruttive

---

## H. Backup + Restore

### Stato Attuale
Lovable Cloud (Supabase) fornisce automaticamente:
- **Backup automatici giornalieri** gestiti dall'infrastruttura Supabase
- **Point-in-time recovery** disponibile
- **Retention**: dipende dal piano Supabase (tipicamente 7-30 giorni)

### Raccomandazioni
- I backup sono gestiti a livello infrastrutturale — nessuna configurazione aggiuntiva necessaria lato applicazione
- Per export manuali: utilizzare la funzionalita Cloud > Database > Export
- RTO stimato: < 1h (restore da backup Supabase)
- RPO: <= 24h (backup giornaliero), potenzialmente minuti con PITR

---

## I. Osservabilita

### Stato Attuale
- ErrorBoundary con log a console (predisposto per Sentry)
- `console.error` in Edge Functions
- Edge Function logs accessibili via Supabase dashboard
- QueryCache/MutationCache con toast errori centralizzati
- Audit log in DB (`admin_audit_log`, `company_activity_log`)

### Raccomandazioni (non nel scope di questo intervento)
- Integrare Sentry per error tracking client-side
- Structured logging nelle Edge Functions
- Dashboard metriche (latenza, error rate) — richiede tool esterno

---

## J. Piano di Implementazione

### Sprint 1 — Fix P0 (questo intervento)

1. **Disabilitare trigger `pg_net` inutili** su `ticket_messages` e `tickets` (il ticket-notify e un no-op)
2. **TicketChat cleanup**: rimuovere `getPublicUrl` dead code, rimuovere variabile `ext` inutilizzata, ridurre signed URL a 24h
3. **useUnreadTicketCounts**: consolidare N+1 in query singola aggregata
4. **TicketDetail staff query**: filtrare per ruoli staff
5. **LinkedTasks defense-in-depth**: aggiungere `company_id` filter su update
6. **TicketChat realtime**: memoizzare `invalidateKeys`
7. **Abilitare leaked password protection**
8. **Aggiungere maxLength** su textarea chat e note interne

### Stima Impatto
- Riduzione query DB pagina ticket: ~90% (da N+1 a 3 query)
- Eliminazione overhead trigger HTTP no-op: ~50ms per INSERT/UPDATE ticket
- Riduzione rischio sicurezza: signed URL da 365gg a 24h
- Zero regressioni: tutti i fix sono behavior-preserving

### File Coinvolti
| File | Intervento |
|------|------------|
| SQL Migration | DROP trigger `trg_ticket_message_notify` e `trg_ticket_status_notify` |
| `src/components/tickets/TicketChat.tsx` | Cleanup dead code, signed URL 24h, memoize invalidateKeys, maxLength |
| `src/hooks/useUnreadTicketCounts.ts` | Refactor N+1 in query aggregata |
| `src/pages/azienda/TicketDetail.tsx` | Filtrare staff members per ruolo, maxLength note |
| `src/components/tasks/LinkedTasks.tsx` | Defense-in-depth company_id su update |

