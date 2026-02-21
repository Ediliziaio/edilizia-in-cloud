

# Fix: Pulizia Duplicati e Correzione Assegnazione

## Problemi Trovati

### 1. useEffect duplicato in CreateOrder.tsx
Il blocco `useEffect` per l'auto-assegnazione (righe 113-125) appare **due volte identico**. Va rimosso il duplicato.

### 2. Errore HMR in TaskDialog.tsx
L'errore `"Identifier 'isEditing' has already been declared"` e un errore di cache HMR (Hot Module Reload). Il file attuale e corretto, ma serve un refresh per risolvere. Non servono modifiche al codice.

### 3. AssignedToSelect: valore vuoto non valido
Il componente `AssignedToSelect` usa `value=""` per "Nessuna assegnazione", ma Radix UI Select non supporta stringhe vuote come valore. Va corretto usando un valore sentinella come `"none"`.

## Modifiche

### File 1: `src/pages/azienda/CreateOrder.tsx`
- Rimuovere il secondo `useEffect` duplicato (righe 120-125)

### File 2: `src/components/orders/AssignedToSelect.tsx`
- Cambiare `<SelectItem value="">` in `<SelectItem value="none">`
- Aggiornare la logica per trattare `"none"` come valore nullo

### Nessuna modifica necessaria
- `TaskDialog.tsx`: codice corretto, l'errore e solo HMR
- `EditOrder.tsx`: implementazione corretta
- `AppointmentDialog.tsx`: implementazione corretta
- RLS policies: funzionano correttamente
- `usePermissions.ts`: espone `onlyAssigned` correttamente

## Riepilogo Verifica Funzionamento

| Componente | Auto-assegnazione | Campo disabilitato | Stato |
|------------|-------------------|-------------------|-------|
| CreateOrder | OK (con duplicato da rimuovere) | OK | Fix minore |
| EditOrder | Non necessario (carica dati esistenti) | OK | OK |
| TaskDialog | OK | OK | OK |
| AppointmentDialog | OK | OK | OK |
| AssignedToSelect | -- | -- | Fix valore vuoto |

