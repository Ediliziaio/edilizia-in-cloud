

# Pulizia, Fix e Stabilizzazione Opportunita

## 1. Bug Fix: Errore Console "Function components cannot be given refs"

**Problema**: `OpportunityCard` e wrappato con `memo` ma `@dnd-kit/sortable` v10 tenta di passare un ref al componente. Questo genera un warning ripetuto in console.

**Soluzione**: Wrappare `OpportunityCard` con `React.forwardRef` oltre a `memo`, in modo che il ref venga accettato correttamente (anche se non viene utilizzato direttamente, dato che `useSortable` gestisce il proprio `setNodeRef`).

**File**: `src/components/opportunities/OpportunityCard.tsx`

---

## 2. Pulizia Import Inutilizzati

**File e import da rimuovere**:

- `src/components/settings/PipelinesConfig.tsx`: rimuovere `GripVertical` (importato ma mai usato)

---

## 3. Fix UX: `confirm()` nativo sostituito con AlertDialog

**Problema**: In `OpportunityDetailDialog.tsx`, la funzione `handleDelete` usa `window.confirm()`, che e un popup nativo del browser, inconsistente con il resto della UI che usa `AlertDialog` di Radix.

**Soluzione**: Aggiungere uno stato `confirmDelete` e usare `AlertDialog` come gia fatto in `OpportunityCard.tsx`.

**File**: `src/components/opportunities/OpportunityDetailDialog.tsx`

---

## 4. Fix: `handleSave` chiude il dialog prima che le mutations completino

**Problema**: In `OpportunityDetailDialog.tsx`, `handleSave` chiama `updateOpp.mutate()` (fire-and-forget) e poi subito `toast.success` + `onOpenChange(false)`. Se la mutation fallisce, l'utente vede comunque "success".

**Soluzione**: Usare il callback `onSuccess` della mutation principale per chiudere il dialog e mostrare il toast di successo.

**File**: `src/components/opportunities/OpportunityDetailDialog.tsx`

---

## 5. Fix: OpportunityDialog - auto_status non applicato alla creazione

**Problema**: Quando si crea un'opportunita e si seleziona una fase con `auto_status`, lo stato non viene aggiornato automaticamente (il campo status resta sempre "open").

**Soluzione**: Aggiungere logica nel `onValueChange` del Select "Fase" per leggere l'`auto_status` e aggiornare il campo status automaticamente, come gia fatto in `OpportunityDetailDialog`.

**File**: `src/components/opportunities/OpportunityDialog.tsx`
- Le props `stages` devono includere `auto_status` (aggiornare l'interfaccia)

---

## Riepilogo file modificati (4)

| File | Tipo modifica |
|------|--------------|
| `OpportunityCard.tsx` | Fix forwardRef per eliminare warning console |
| `PipelinesConfig.tsx` | Rimozione import `GripVertical` inutilizzato |
| `OpportunityDetailDialog.tsx` | Fix confirm nativo -> AlertDialog, fix handleSave fire-and-forget |
| `OpportunityDialog.tsx` | Auto-status alla creazione quando si seleziona una fase |

## Cosa NON viene modificato

- Nessun comportamento funzionale cambiato
- Nessun layout/design modificato
- Nessuna tabella DB toccata

