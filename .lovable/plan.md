

# Fix Visibilita Limitata: Bug nella Creazione Record

## Bug Trovato

### Problema Critico: Staff con "Solo elementi assegnati" non puo creare nulla

La funzione RLS `check_staff_visibility` verifica che `assigned_to = user_id` quando `only_assigned` e attivo. Ma nei form di creazione (ordini, attivita, appuntamenti), il campo `assigned_to` di default e vuoto/null. Questo significa:

- `NULL = user_id` restituisce `NULL` (falsy) in PostgreSQL
- L'INSERT viene **bloccato** dalla policy RLS
- Lo staff con visibilita limitata non puo creare ordini, attivita o appuntamenti

### Verifica RLS (tutto corretto a livello DB)

| Tabella | Policy SELECT | Policy ALL (INSERT/UPDATE/DELETE) |
|---------|---------------|-----------------------------------|
| orders | `check_staff_visibility` applicato | `check_staff_visibility` applicato |
| tasks | `check_staff_visibility` applicato | `check_staff_visibility` applicato |
| appointments | `check_staff_visibility` applicato | `check_staff_visibility` applicato |

Le policy RLS funzionano correttamente per filtrare i dati in lettura. Il problema e solo nella creazione.

## Fix Necessari

### 1. CreateOrder.tsx - Auto-assegnazione

Importare `usePermissions` e, se `onlyAssigned` e true, pre-impostare `assignedTo` all'ID dell'utente corrente e rendere il campo non modificabile (o nasconderlo).

### 2. TaskDialog.tsx - Auto-assegnazione

Stesso approccio: se `onlyAssigned` e true, impostare `assignedTo = user.id` nel `useEffect` di reset e disabilitare il campo select dell'assegnatario.

### 3. AppointmentDialog.tsx - Auto-assegnazione

Stesso approccio: pre-impostare `assignedTo = user.id` quando `onlyAssigned` e true.

### 4. EditOrder.tsx - Protezione modifica assegnazione

Se `onlyAssigned` e true, il campo "Assegnato a" deve essere read-only per evitare che lo staff si de-assegni da un ordine (perdendo accesso).

## Dettagli Tecnici

In ciascun file, la modifica e minima:

```text
// In ogni form di creazione:
import { usePermissions } from "@/hooks/usePermissions";

const { onlyAssigned } = usePermissions();

// Nel useEffect di reset (quando non si sta editando):
if (onlyAssigned && user?.id) {
  setAssignedTo(user.id);
}

// Nel JSX del campo AssignedTo / Select assegnatario:
disabled={onlyAssigned}
```

### File da Modificare

| File | Modifica |
|------|----------|
| `src/pages/azienda/CreateOrder.tsx` | Auto-set `assignedTo = user.id` se `onlyAssigned`, campo disabilitato |
| `src/pages/azienda/EditOrder.tsx` | Campo `assignedTo` read-only se `onlyAssigned` |
| `src/components/tasks/TaskDialog.tsx` | Auto-set `assignedTo = user.id` se `onlyAssigned`, campo disabilitato |
| `src/components/appointments/AppointmentDialog.tsx` | Auto-set `assignedTo = user.id` se `onlyAssigned`, campo disabilitato |

Nessuna modifica al database o alle RLS policies -- sono gia corrette.
