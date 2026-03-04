

# Audit Ruoli: Bug Critici P0 + Hardening

## Bug P0: `usePermissions` ignora `salesperson` e `call_center`

Il bug piu critico: `src/hooks/usePermissions.ts` controlla `role === "company_staff"` (righe 129 e 139). Con la nuova logica di priorita nell'AuthContext, un venditore ha `role = "salesperson"`, non `"company_staff"`. Risultato: **zero permessi**, utente bloccato senza vedere nulla.

**Fix**: Estendere le condizioni a `["company_staff", "salesperson", "call_center"].includes(role)`.

## Bug P0: `has_permission()` DB function

La funzione database `has_permission` (riga 10) verifica solo `has_role(_user_id, 'company_staff')`. Per utenti con ruolo effettivo `salesperson` o `call_center`, la funzione ritorna `false` anche se hanno `company_staff` come ruolo secondario. Questo e corretto nel caso attuale (dual-role inserisce `company_staff`), ma va verificato che la query RLS funzioni.

**Status**: Non e un bug perche il dual-role inserisce sempre `company_staff` nella tabella `user_roles`. La funzione DB continua a funzionare. Nessun intervento necessario.

## Bug P1: Dropdown "Assegna a" escludono venditori e call center

In 7 file, i dropdown di assegnazione filtrano solo `company_admin` + `company_staff`, escludendo venditori e call center che ora hanno ruoli separati nella tabella `user_roles`:

| File | Dropdown |
|------|----------|
| `AssignedToSelect.tsx` | Assegna ordine |
| `TaskDialog.tsx` | Assegna attivita |
| `AppointmentDialog.tsx` | Assegna appuntamento |
| `AutomationDialog.tsx` | Assegna automazione |
| `CalendarDialog.tsx` | Assegna calendario |
| `MarketingCalendar.tsx` | Filtro utenti calendario |
| `MarketingContactDetail.tsx` (riga 362, 424) | Follower contatto |
| `useOpportunitiesData.ts` (riga 267) | Staff generico |

**Fix**: In tutti questi file, aggiungere `"salesperson"` e `"call_center"` al filtro ruoli. I venditori e call center hanno anche `company_staff` nel DB, ma il filtro confronta stringhe esatte nella colonna `role`, quindi deve includere tutti i valori possibili.

**Nota**: In realta, poiche il sistema dual-role inserisce SEMPRE `company_staff` accanto a `salesperson`/`call_center`, questi utenti verranno comunque trovati dal filtro attuale. Tuttavia, per robustezza e correttezza semantica, e meglio essere espliciti.

## Piano Interventi

### 1. `src/hooks/usePermissions.ts` (P0 - CRITICO)

- Riga 129: `enabled: role === "company_staff"` → `enabled: ["company_staff", "salesperson", "call_center"].includes(role || "")`
- Riga 139: `if (role === "company_staff")` → `if (["company_staff", "salesperson", "call_center"].includes(role || ""))`

### 2. Dropdown assegnazione (P1 - 7 file)

Per sicurezza e robustezza, aggiungere `"salesperson"` e `"call_center"` ai filtri ruolo in:
- `src/components/orders/AssignedToSelect.tsx` (riga 41)
- `src/components/tasks/TaskDialog.tsx` (riga 139)
- `src/components/appointments/AppointmentDialog.tsx` (riga 127)
- `src/components/settings/AutomationDialog.tsx` (riga 116)
- `src/components/settings/CalendarDialog.tsx` (riga 125)
- `src/pages/azienda/marketing/MarketingCalendar.tsx` (riga 106)
- `src/pages/azienda/marketing/MarketingContactDetail.tsx` (righe 362, 424)
- `src/hooks/useOpportunitiesData.ts` (riga 267)

Pattern: `.filter((r) => r.role === "company_admin" || r.role === "company_staff")` → `.filter((r) => ["company_admin", "company_staff", "salesperson", "call_center"].includes(r.role))`

### Note sull'audit enterprise

L'audit completo (A-J) e un programma a lungo termine. Questa sessione si concentra sui **bug critici legati ai ruoli** che impediscono il funzionamento base. Gli altri punti (performance, sicurezza, backup) sono gia in buono stato come documentato nelle sessioni precedenti.

