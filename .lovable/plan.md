

# Criticita' attive nel sistema

## Errori in produzione (400 errors visibili ora)

### 1. RPC `get_mrr_movements_monthly` -- ROTTA (Criticita': ALTA)
**Errore**: `column sl.started_at does not exist`

La funzione RPC referenzia `sl.started_at` ma la tabella `subscription_logs` ha solo `created_at`. Inoltre referenzia `sp.price` ma `subscription_plans` ha `price_monthly`.

**Fix**: Migration SQL per ricreare la funzione sostituendo:
- `sl.started_at` → `sl.created_at`
- `sp.price` → `sp.price_monthly`
- `prev_sp.price` → `prev_sp.price_monthly`
- `sl.status` → `sl.new_status` (la tabella non ha colonna `status`)

### 2. AdminPulseBar query `last_login` -- ROTTA (Criticita': ALTA)
**Errore**: Query su `profiles` filtra per `last_login` ma la colonna si chiama `last_login_at`.

**Fix** in `src/components/admin/dashboard/AdminPulseBar.tsx` riga 25:
- `.gte("last_login", last24h)` → `.gte("last_login_at", last24h)`

### 3. Warning forwardRef su CompanyQuickActions (Criticita': BASSA)
**Errore**: `Function components cannot be given refs` su `AlertDialog` dentro `CompanyQuickActions`.

Il componente `CompanyQuickActions` viene usato come child di un contesto che tenta di passare un ref. Non blocca il funzionamento ma inquina la console.

**Fix**: Non necessario in questa iterazione (il warning non impedisce il funzionamento).

---

## Riepilogo

| # | Criticita' | Problema | File | Effort |
|---|-----------|----------|------|--------|
| 1 | **ALTA** | RPC `get_mrr_movements_monthly` usa colonne inesistenti | Migration SQL | Basso |
| 2 | **ALTA** | PulseBar usa `last_login` invece di `last_login_at` | `AdminPulseBar.tsx` | Basso |
| 3 | **BASSA** | forwardRef warning | `CompanyQuickActions.tsx` | Basso |

### Implementazione

1. **Migration SQL**: Ricreare `get_mrr_movements_monthly` con i nomi colonna corretti (`created_at`, `price_monthly`, `new_status`)
2. **AdminPulseBar.tsx**: Correggere il nome colonna da `last_login` a `last_login_at` (riga 25)

