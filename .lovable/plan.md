

# Fix Drag & Drop nella Pipeline Ordini

## Problemi identificati

1. **Warning React**: `OrdersPipelineCard` non usa `forwardRef`, causando problemi con `DragOverlay`
2. **Collision detection sbagliata**: `closestCenter` non funziona bene per il drag tra colonne — va usato `closestCorners` (come nella Kanban Opportunità che funziona)
3. **Touch support mancante**: Non c'è il `TouchSensor`, quindi il drag non funziona su mobile

## Fix

### OrdersPipelineView.tsx
- Cambiare `closestCenter` → `closestCorners`
- Aggiungere `TouchSensor` ai sensors
- Il `handleDragEnd` deve anche gestire il caso in cui si droppa su un'altra card (estrarre lo status dalla card target, come fa OpportunityKanbanView)

### OrdersPipelineCard.tsx
- Nessuna modifica strutturale necessaria — il `useDraggable` è già configurato correttamente

### OrdersPipelineColumn.tsx  
- Verificare che il `useDroppable` usi l'`id` corretto (già OK, usa `status.id`)

## Dettaglio tecnico

Il fix principale è nella collision detection e nella logica `handleDragEnd`: quando l'utente droppa una card su un'altra card (non direttamente sulla colonna), `over.id` sarà l'id dell'ordine, non dello stato. Bisogna risalire allo stato della colonna target. Cambio:

```typescript
// handleDragEnd: gestire drop su card oltre che su colonna
let targetStatusId = over.id as string;
const overOrder = orders.find(o => o.id === over.id);
if (overOrder) {
  targetStatusId = overOrder.current_status_id || "";
}
```

Due file da modificare: `OrdersPipelineView.tsx` (collision + sensors + drag end logic).

