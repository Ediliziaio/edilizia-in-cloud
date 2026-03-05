

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
│  RLS ATTIVO con policy granulari su tutte le tabelle ✅      │
│  ~40+ tabelle · ~15 DB functions · ~10 triggers               │
│  Performance indexes su company_id (15 tabelle) ✅            │
│  Helper function get_my_company_id() ✅                       │
└──────────────────────────────────────────────────────────────┘
```

---

## B. STATO SICUREZZA — Aggiornamento

### ✅ RISOLTI
- **RLS Policies**: Tutte le 15+ tabelle business-critical hanno policy granulari (2-5 policy per tabella)
- **Tenant Isolation**: Ogni tabella è scoped per company_id con eccezione super_admin
- **Performance Indexes**: 15 indici su company_id per ottimizzare le query RLS
- **Helper Function**: `get_my_company_id()` SECURITY DEFINER per lookup efficiente
- **Solo 1 tabella senza policy**: `edge_function_rate_limits` (tabella di sistema interna, non contiene dati sensibili)

### ⚠️ RESIDUI
1. **Leaked Password Protection**: Disabilitata (richiede configurazione manuale)
2. **`SUPA_rls_enabled_no_policy`**: Riguarda solo `edge_function_rate_limits` (info, non critico)

---

## C. FINDINGS — Console & Code Quality

### Console Warnings
- `forwardRef` warning su `AlertDialogContent` in `OrdersTable.tsx`

### Code Quality
- 1 `TODO` esplicito: `DashboardSalesTable.tsx` usa `as any` per tabella `sales_targets`

---

## D. INTERVENTI COMPLETATI

| # | Intervento | Stato |
|---|-----------|-------|
| 1 | RLS policies su tutte le tabelle | ✅ Già presenti |
| 2 | Performance indexes (15 tabelle) | ✅ Migrazione completata |
| 3 | Helper function `get_my_company_id()` | ✅ Creata |

## E. INTERVENTI RESIDUI

| Priorità | Intervento | Effort |
|----------|-----------|--------|
| **P0** | Leaked Password Protection | Config manuale |
| **P1** | Fix forwardRef warning in OrdersTable | 1 file |
| **P1** | Rimuovere `as any` in DashboardSalesTable | 1 file |
| **P2** | Alert observability | Basso |

---

## F. DICHIARAZIONE

**QUASI PRONTO PER PRODUZIONE**. Le RLS policies sono complete e gli indici di performance sono stati aggiunti. Rimane da abilitare manualmente la Leaked Password Protection per raggiungere lo standard enterprise completo.

Backup & Restore: gestiti automaticamente da Lovable Cloud con Point-in-Time Recovery (PITR).
