

# Audit Enterprise & Piano di Intervento — Report AS-IS e TO-DO

---

## A. MAPPA ARCHITETTURALE AS-IS

```text
┌──────────────────────────────────────────────────────────────┐
│  FRONTEND (React + Vite + Tailwind + shadcn/ui)             │
│  ~350 componenti · 30 hook · 9 tipi · 6 layout              │
│                                                              │
│  Ruoli UI: super_admin → /admin                              │
│            company_admin/staff/call_center → /azienda         │
│            customer → /cliente                                │
│            employee → /dipendente                             │
│            salesperson → /venditore                           │
│                                                              │
│  Auth: AuthContext → ProtectedRoute + RoleBasedRedirect      │
│  State: React Query (staleTime 2m, retry 1)                  │
│  Error: ErrorBoundary → system_health_metrics                │
│  Lazy loading: tutte le pagine                               │
├──────────────────────────────────────────────────────────────┤
│  BACKEND (32 Edge Functions + DB Functions + Triggers)        │
│  Rate limiting: _shared/rateLimit.ts                          │
│  Health metrics: _shared/healthMetrics.ts                     │
│  Encryption: _shared/encryption.ts (AES-256-GCM)             │
│  Automazioni: pg_cron → process-automation                    │
├──────────────────────────────────────────────────────────────┤
│  DATABASE (Supabase/PostgreSQL)                               │
│  Multi-tenant via company_id su tutte le entità               │
│  RLS attivo ma MANCANO POLICY su molte tabelle critiche!     │
│  ~40+ tabelle · ~15 DB functions · ~10 triggers               │
└──────────────────────────────────────────────────────────────┘
```

---

## B. FINDINGS CRITICI — Security Scan (22 findings)

### P0 — CRITICI (14 errori RLS)

Le seguenti tabelle hanno RLS abilitato ma **nessuna policy** o policy insufficiente, rendendo i dati leggibili pubblicamente:

| # | Tabella | Dati esposti |
|---|---------|-------------|
| 1 | `profiles` | Email, telefono, indirizzo, codice fiscale |
| 2 | `referrers` | Nomi, email, telefoni, commissioni |
| 3 | `salespeople` | Contatti, strutture commissioni |
| 4 | `employees` | Contatti, stipendi lordi/netti |
| 5 | `marketing_contacts` | Database lead completo |
| 6 | `suppliers` | Nomi, P.IVA, contatti, pagamenti |
| 7 | `external_teams` | Nomi contractor, contatti |
| 8 | `orders` | Importi, pagamenti, clienti |
| 9 | `order_items` | Prezzi acquisto, margini, fornitori |
| 10 | `company_costs` | Costi, importi, scadenze |
| 11 | `warehouse_stock` | Quantità, costi unitari |
| 12 | `marketing_opportunities` | Pipeline vendita, valori deal |
| 13 | `tickets` | Oggetti supporto, note interne |
| 14 | `companies` | P.IVA, IBAN, PEC, indirizzi |
| 15 | `appointments` | Titoli, indirizzi, coordinate GPS |

### P0 — AUTH
- Leaked Password Protection: **disabilitata**

### P1 — WARNING (5)
- `integration_credentials`: protezione inadeguata
- `messaging_whatsapp_config`: token potenzialmente esposti
- `order_salespeople`: commissioni visibili a tutto lo staff
- `work_logs`: ore lavoro visibili a staff non autorizzato
- `staff_permissions`: enumerazione permessi visibile

---

## C. FINDINGS — Console & Code Quality

### Console Warnings
- `forwardRef` warning su `AlertDialogContent` in `OrdersTable.tsx` — componente non wrappato con `React.forwardRef`

### Code Quality
- 1 `TODO` esplicito: `DashboardSalesTable.tsx` usa `as any` per tabella `sales_targets`
- ~220 file con `any` (molti legittimi nei catch, ma alcuni evitabili)
- Nessun `console.log` stray (pulito)
- Nessun dead code significativo (audit precedente ha già pulito)

---

## D. PIANO TO-DO PRIORITIZZATO

### FASE 1 — P0: RLS Policies (SICUREZZA CRITICA)

Creare policy RLS per tutte le 15 tabelle esposte. Pattern standard per ogni tabella:

```sql
-- Company-scoped: solo utenti della stessa company possono leggere
CREATE POLICY "company_isolation_select" ON public.<table>
FOR SELECT TO authenticated
USING (
  company_id IN (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'super_admin')
);

-- INSERT/UPDATE/DELETE: stesse restrizioni + permessi granulari
```

Tabelle specifiche:
- `profiles`: utente vede solo il proprio profilo + admin/staff vedono profili della company
- `companies`: solo membri della company + super_admin
- `referrers`: solo super_admin
- Ogni tabella segue il pattern tenant-scoped con eccezione super_admin

**Stima**: ~15 migrazioni SQL, 0 file di codice modificati.

### FASE 2 — P0: Auth Hardening

1. Abilitare Leaked Password Protection
2. Verificare che tutti gli edge function sensibili usino `getClaims()` correttamente

### FASE 3 — P1: Fix Console Warnings

1. Wrappare il componente in `OrdersTable.tsx` che causa il warning `forwardRef` su AlertDialog
2. Rimuovere `as any` in `DashboardSalesTable.tsx` (rigenerare tipi o aggiungere tabella al type file)

### FASE 4 — P1: Tenant Isolation Audit

Verificare che ogni query client-side filtri per `company_id`:
- Tutte le query in hooks (`useCompanyDashboardData`, `useCashFlowData`, `useMarginData`, etc.)
- Tutti gli edge function che accettano `company_id` dal client devono validarlo server-side

### FASE 5 — P2: Performance

Architettura già buona:
- Lazy loading su tutte le pagine
- React Query con staleTime 2min
- DB aggregation functions (RPC) per dashboard
- Memoizzazione sui widget

Interventi residui:
- Audit indici DB sulle query più frequenti (orders, profiles, marketing_contacts per company_id)
- Verificare che non ci siano N+1 nei dettagli ordine

### FASE 6 — P2: Observability

Già implementato:
- ErrorBoundary → system_health_metrics
- Rate limiting shared utility
- Health metrics recording

Da aggiungere:
- Alert su error rate (configurabile via pg_cron + notifica)

### FASE 7 — Backup & Restore

Lovable Cloud gestisce backup automatici giornalieri con Point-in-Time Recovery (PITR). Non è necessario implementare backup custom. La retention e il restore sono gestiti dall'infrastruttura Cloud.

---

## E. RIEPILOGO PRIORITÀ

| Priorità | Intervento | Effort | Impatto |
|----------|-----------|--------|---------|
| **P0** | RLS policies su 15 tabelle | Alto (15 migrazioni) | **Critico** — dati esposti |
| **P0** | Leaked Password Protection | Basso (1 config) | Alto |
| **P1** | Fix forwardRef warning | Basso (1 file) | Medio |
| **P1** | Tenant isolation audit edge fn | Medio | Alto |
| **P2** | Indici DB | Basso | Medio |
| **P2** | Alert observability | Basso | Basso |

---

## F. DICHIARAZIONE

**NON PRONTO PER PRODUZIONE** fino alla risoluzione dei 14 finding P0 (RLS). I dati di tutte le tabelle business-critical sono attualmente leggibili da chiunque abbia l'URL dell'API e la anon key (pubblica).

**Raccomandazione**: procedere immediatamente con la Fase 1 (RLS policies). Posso implementare tutte le 15 migrazioni in sequenza. Vuoi procedere?

