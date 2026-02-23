
# Fix Canvas Panning

## Problema
Quando si clicca sullo sfondo del canvas, il `mousedown` handler controlla se `e.target === canvasRef.current` oppure se l'elemento ha `data-canvas="true"`. Ma il click colpisce il `div` interno (il container con transform) o l'SVG, che non hanno `data-canvas="true"`. Quindi `isPanning` non viene mai impostato a `true` e il pan non funziona.

## Soluzione
Aggiungere `data-canvas="true"` al div interno di transform (linea 113) e all'SVG (linea 125) in `AutomationCanvas.tsx`. In questo modo qualsiasi click sullo sfondo (che non sia un nodo) attivera correttamente il panning.

## Dettaglio tecnico

**File: `src/components/marketing/automations/AutomationCanvas.tsx`**

Due modifiche minime:

1. **Linea 113** - Aggiungere `data-canvas="true"` al div interno transform:
```tsx
<div
  data-canvas="true"
  style={{
    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
    ...
  }}
>
```

2. **Linea 125** - Aggiungere `data-canvas="true"` all'SVG e rimuovere `pointer-events-none` (altrimenti il click non arriva all'SVG):
```tsx
<svg data-canvas="true" className="absolute inset-0 w-full h-full" style={{ overflow: "visible" }}>
```

Nessun altro file modificato. Nessuna modifica al database.
