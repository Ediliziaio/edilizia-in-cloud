

# Drag & Drop articoli sulla mappa + toggle visibilità mappa

## Obiettivo
1. Permettere il drag & drop degli articoli dalla tab Giacenze direttamente sulle card della mappa per assegnarli a una sezione
2. Aggiungere un toggle per mostrare/nascondere la mappa magazzino nella pagina principale

## Approccio tecnico

### 1. Drag & Drop sulla mappa (tab Giacenze)

Il progetto usa già `@dnd-kit/core` e `@dnd-kit/sortable`. La mappa e la tabella stock coesistono nella stessa pagina. Il DnD va implementato **solo nella tab Giacenze** (`WarehouseStockTab.tsx`) dove l'utente gestisce gli articoli.

**Modifiche:**

- **`WarehouseStockTab.tsx`**: Wrappare il contenuto in un `DndContext`. Ogni riga della tabella diventa un `Draggable` (usando `useDraggable` di dnd-kit). Aggiungere un `DragOverlay` che mostra il nome dell'articolo trascinato.
- **`WarehouseMapView.tsx`**: Ogni `SectionCard` diventa un `droppable` (usando `useDroppable` di dnd-kit). Aggiungere prop opzionale `droppable?: boolean` per abilitare il comportamento solo quando servito. Visual feedback: evidenziazione della card quando un articolo viene trascinato sopra (bg colorato, ring).
- Al drop: richiamare la `batchMoveMutation` già esistente con l'ID dell'articolo e la sezione target.

### 2. Toggle visibilità mappa

- **`Warehouse.tsx`**: Aggiungere stato `showMap` (default `true`, persistito in `localStorage`). Aggiungere un bottone toggle accanto al titolo "Mappa Magazzino" (icona `Eye`/`EyeOff`). Wrappare il render della mappa in una condizione `showMap`.

## File da modificare

| File | Intervento |
|------|-----------|
| `src/components/warehouse/WarehouseStockTab.tsx` | Aggiungere DndContext, righe draggable, DragOverlay, handler drop |
| `src/components/warehouse/WarehouseMapView.tsx` | Aggiungere `useDroppable` alle SectionCard, prop `droppable`, visual feedback |
| `src/pages/azienda/Warehouse.tsx` | Toggle show/hide mappa con localStorage |

