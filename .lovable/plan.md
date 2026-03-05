

# Filtro "In Corso" per escludere ordini completati

## Cosa cambia
Aggiungere un toggle/bottone nella riga filtri primari che, quando attivo, nasconde gli ordini il cui stato corrente è l'ultimo del Progress Tracker (posizione massima, es. "Posa Completata"). Di default sarà **attivo**, così l'utente vede solo ordini in corso.

## Modifiche tecniche

### 1. `src/pages/azienda/OrdersList.tsx`
- Aggiungere stato `hideCompleted` (default `true`)
- Calcolare `lastStatusId` come lo stato con `position` massima nell'array `statuses`
- Nel filtro `filteredOrders`, se `hideCompleted` è true, escludere ordini con `current_status_id === lastStatusId`
- Aggiornare `hasAnyFilter` e `clearAllFilters` per includere `hideCompleted`
- Aggiornare `filterKey` per includere `hideCompleted`

### 2. `src/components/orders/OrdersFilters.tsx`
- Aggiungere prop `hideCompleted` + `onHideCompletedChange`
- Inserire un bottone toggle nella riga primaria (prima dei filtri avanzati) con icona `CheckCircle2`, label "In Corso" — attivo di default, stile `variant="default"` quando attivo, `variant="outline"` quando spento
- Mostrare un conteggio opzionale degli ordini nascosti

### Logica (stessa del magazzino)
```ts
const lastStatusId = statuses.length > 0 
  ? statuses.reduce((max, s) => s.position > max.position ? s : max, statuses[0]).id 
  : null;

// In filteredOrders:
if (hideCompleted && lastStatusId && order.current_status_id === lastStatusId) return false;
```

