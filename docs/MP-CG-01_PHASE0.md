# FASE 0 — MP-CG-01 (Schema DB Controllo di Gestione)

Branch: `feat/controllo-gestione-mp1`
Data: 2026-05-03

## 1. File esistenti rilevanti
Nessun modulo "controllo di gestione" pre-esistente. Aree adiacenti:

- `src/pages/azienda/CruscottoAziendale.tsx` (~660 righe) — KPI direzionali
- `src/pages/azienda/CompanyDashboard.tsx` (~1100) — gestione operativa
- `src/pages/azienda/Tesoreria*.tsx` — cassa/banche
- `src/components/cruscotto/*` — alert, salute, semaforo
- `supabase/migrations/*company_costs*`, `*bank_transactions*`, `*prima_nota*` — esistenti

## 2. Helper / funzioni DB già presenti
| Atteso dal prompt | Vero nel DB | Sostituzione |
|---|---|---|
| `auth_company_id()` | NON esiste | `get_my_company_id()` (stessa firma `RETURNS uuid STABLE SECURITY DEFINER`) |
| `auth_has_role('admin')` | NON esiste | `has_role(auth.uid(), 'company_admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)` |
| `set_updated_at()` | esiste | OK |

## 3. Tabelle riferite (mapping schema reale)
| Atteso | Reale | Note |
|---|---|---|
| `companies` | OK | |
| `sedi` | OK | |
| `company_costs.data_competenza` | `paid_date` (fallback `due_date`) | |
| `company_costs.categoria` | `category` | |
| `company_costs.deleted_at` | non esiste | skip filtro |
| `bank_transactions.transaction_date` | `value_date` | |
| `bank_transactions.categoria_auto` | `category` | |
| `bank_transactions.status='booked'` | da non filtrare strettamente; usiamo `amount < 0` per uscite | |
| `bank_reconciliations.transaction_id` | OK | |
| `invoices.invoice_date` | `issue_date` | |
| `invoices.iva_amount` | `tax_amount` | |
| `invoices.total_amount` | `total` | |
| `invoices.invoice_type` | `document_type` | |
| `invoices.is_active` | non esiste | usiamo `status NOT IN ('cancelled','draft')` |
| `prima_nota` | `prima_nota_entries` (`entry_date`, `direction`, `category`, `amount`) | |

## 4. Decisioni architetturali

1. **Naming RLS helpers**: tutte le policy useranno `get_my_company_id()` invece di `auth_company_id()` per coerenza con il resto del codebase.
2. **Ruolo "admin"**: il prompt dice "auth_has_role('admin')". Mappiamo a `company_admin` (admin di azienda) **OR** `super_admin` (admin piattaforma) — entrambi possono fare DELETE.
3. **Schema viste**: adattate ai nomi reali dei campi (`issue_date`, `tax_amount`, `total`, `category`, `value_date`, `entry_date`, `direction`).
4. **Feature flag**: `controllo_gestione_v1` registrato in `platform_feature_flags` (default `OFF`); attivazione via `company_feature_overrides` per singola azienda. Sblocco esplicito per Demo Azienda S.r.l. tramite migration di seed.
5. **Filtri di esclusione viste**: `v_cg_costi_classificati` esclude i bank_transactions già riconciliati con invoices (per non doppiare ricavi/costi); `v_cg_ricavi_classificati` esclude `cancelled/draft`.

## 5. Conflitti potenziali
Nessun componente UI esistente fa già il CE Riclassificato / SP rating / Piano Industriale. Le tabelle `company_costs`, `bank_transactions`, `invoices`, `prima_nota_entries` sono già usate ma in modo read-only dalle dashboard correnti; il modulo CG le legge tramite viste, senza scriverci.
