

# Audit Tecnico Completo + Piano Ottimizzazioni P2/P3

## Stato Attuale (AS-IS)

### Architettura
- **Frontend**: React 18 + Vite, ~60 pagine lazy-loaded, TanStack Query, Radix UI + shadcn/ui
- **Backend**: Supabase (PostgreSQL + RLS + Edge Functions)
- **Auth**: 6 ruoli gerarchici, impersonazione Super Admin via Edge Function
- **Multi-tenancy**: company_id su tutte le entità, RLS + filtri applicativi

### Problemi Rilevati

#### P0 — Sicurezza Critica
| # | Problema | Impatto |
|---|----------|---------|
| 1 | **Leaked Password Protection disabilitata** | Password compromesse accettate dal sistema |
| 2 | **Tabella `profiles` leggibile pubblicamente** | Dati personali (email, telefono, indirizzi) esposti senza autenticazione |
| 3 | **Tabella `order_salespeople` leggibile pubblicamente** | Commissioni e dati compensi esposti |
| 4 | **Tabella `article_templates` leggibile pubblicamente** | Template prodotti/servizi esposti |

#### P1 — Bug / Warning Console
| # | Problema | File |
|---|----------|------|
| 1 | Warning React: "Function components cannot be given refs" su `SubscriptionPlans` Dialog | `SubscriptionPlans.tsx` — il componente Dialog riceve un ref su un function component non wrappato in `forwardRef` |

#### P2 — Performance (gia' completati nella sessione precedente)
- Quick Login Popover: limite 50 + ricerca server-side con debounce ✅
- Admin Stat Cards: click handler per navigazione rapida ✅
- DB functions aggregate (`get_total_orders_value`, `get_company_order_stats`, `get_company_user_counts`) ✅

#### P2 — Ottimizzazioni Residue
| # | Problema | File |
|---|----------|------|
| 1 | **AdminSidebar carica TUTTE le aziende** senza `.limit()` | `AdminLayout.tsx` riga 79 — query senza limit, `.slice(0, 20)` client-side |
| 2 | **SubscriptionPlans carica tutte le companies** per conteggio piani | `SubscriptionPlans.tsx` riga 81 — `.select("subscription_plan_id")` senza aggregazione |

---

## Piano Interventi

### Fase 1 — Sicurezza P0

**1a. Leaked Password Protection**
- Azione: abilitare manualmente dal pannello backend (Authentication → Settings → Security). Non configurabile via codice.
- Questo e' l'unico warning del linter Supabase.

**1b. RLS su `profiles`, `order_salespeople`, `article_templates`**
- Verificare le policy RLS esistenti su queste tabelle. Il security scan indica che sono "publicly readable" — potrebbe essere un problema di policy troppo permissive (es. SELECT con `true`) o assenza di policy specifiche.
- Correzione: restringere le policy SELECT per richiedere autenticazione e appartenenza alla stessa company.

### Fase 2 — Bug Fix

**2a. Warning "Function components cannot be given refs" in SubscriptionPlans**
- Il Dialog di Radix UI passa un ref al componente figlio. Se il figlio e' un function component senza `forwardRef`, React genera un warning.
- Correzione: verificare quale componente nel Dialog non usa `forwardRef` e wrapparlo correttamente. Probabile causa: il `DialogContent` wrappa un componente custom senza ref forwarding.

### Fase 3 — Performance P2

**3a. AdminSidebar — limitare query aziende**
- File: `src/components/layouts/AdminLayout.tsx` righe 77-88
- Aggiungere `.limit(50)` alla query e implementare ricerca server-side con `.ilike()` quando `companySearch` ha valore, eliminando il `.slice(0, 20)` client-side

**3b. SubscriptionPlans — aggregare conteggio piani**
- File: `src/pages/admin/SubscriptionPlans.tsx` righe 78-94
- Sostituire il caricamento di tutte le companies con una query aggregata:
  ```sql
  SELECT subscription_plan_id, COUNT(*) as count
  FROM companies
  WHERE subscription_plan_id IS NOT NULL
  GROUP BY subscription_plan_id
  ```
- Oppure creare una RPC function dedicata per evitare il caricamento di tutte le righe.

### Fase 4 — Verifica End-to-End

Navigare manualmente tutte le sezioni admin dopo le modifiche:
- Dashboard (`/admin`)
- Lista Aziende (`/admin/aziende`)
- Impostazioni (`/admin/impostazioni`) — tutte le 5 tab
- Assistenza (`/admin/ticket`)
- Piani (`/admin/piani`)
- Referral (`/admin/referral`)
- Implementazioni (`/admin/implementazioni`)

---

## File da Modificare

| File | Modifica | Priorita' |
|------|----------|-----------|
| RLS policies (migration SQL) | Restringere SELECT su `profiles`, `order_salespeople`, `article_templates` | P0 |
| `src/components/layouts/AdminLayout.tsx` | `.limit(50)` + ricerca server-side su sidebar companies | P2 |
| `src/pages/admin/SubscriptionPlans.tsx` | Query aggregata per conteggio piani | P2 |

## Impatto Stimato

- **Sicurezza**: eliminazione di 3 finding critici (dati pubblici) + 1 warning (leaked password)
- **Performance**: riduzione payload sidebar da N aziende a max 50; riduzione payload piani da N companies a conteggio aggregato
- **Stabilita'**: eliminazione warning console su SubscriptionPlans
- **Rischio regressione**: basso — le modifiche sono additive e le policy RLS vanno verificate contro i flussi esistenti prima dell'applicazione

