

# Fix: Resize handle intercettato dal drag

## Problema

Il resize handle usa `onMouseDown` ma dnd-kit usa `onPointerDown` (che si attiva **prima** di `mousedown`). Quando clicchi sulla barra di resize, il `pointerdown` raggiunge il div con `{...listeners}` sottostante (che è visivamente sovrapposto) prima che `mousedown` del resize possa agire. Risultato: il drag si attiva al posto del resize.

## Fix

In `DraggableAppointment.tsx`:

1. Cambiare il resize handle da `onMouseDown` a `onPointerDown` — così intercetta l'evento allo stesso livello di priorità di dnd-kit
2. Aggiungere `onPointerDown` con `e.stopPropagation()` per bloccare la propagazione
3. Aggiornare corrispondentemente i listener interni da `mousemove/mouseup` a `pointermove/pointerup`
4. Usare `setPointerCapture` per garantire che tutti gli eventi successivi vadano al resize handle, non al drag

## Dettaglio tecnico

```text
Prima (bug):
  pointerdown → colpisce listeners div (dnd-kit drag!) 
  mousedown   → arriva al resize handle (troppo tardi)

Dopo (fix):
  pointerdown → resize handle lo cattura e stoppa propagazione
  dnd-kit     → non riceve mai l'evento
```

| File | Modifica |
|------|----------|
| `DraggableAppointment.tsx` | `onMouseDown` → `onPointerDown` + `stopPropagation` + listener `pointermove/pointerup` + `setPointerCapture` |

