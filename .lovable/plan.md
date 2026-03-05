

# Drag-and-Drop per Documenti Ordine

## Intervento

Aggiungere supporto drag-and-drop nativo (HTML5 Drag Events) ai due componenti di upload documenti: `PendingFilesUpload.tsx` (creazione ordine) e `OrderAttachments.tsx` (dettaglio ordine). Non servono librerie esterne — basta `onDragOver`, `onDragLeave`, `onDrop`.

## Modifiche

### 1. `PendingFilesUpload.tsx`
- Aggiungere stato `isDragging` per evidenziare la drop zone
- Wrappare il `CardContent` con handler `onDragOver`, `onDragLeave`, `onDrop`
- Nel `onDrop`, riutilizzare la stessa logica di validazione esistente (MIME, size, limite file)
- Quando non ci sono file e non si sta trascinando: messaggio attuale + hint "oppure trascina qui"
- Quando si trascina: overlay visivo con bordo tratteggiato e icona Upload
- La drop zone copre l'intera Card

### 2. `OrderAttachments.tsx`
- Stessa logica drag-and-drop nel `CardContent` del componente principale (solo quando `editable = true`)
- Il drop attiva direttamente l'upload (stessa logica di `handleFileUpload` ma per array di file)
- Overlay visivo durante il drag

### UI della drop zone
- Bordo tratteggiato `border-dashed border-2 border-primary/50`
- Sfondo `bg-primary/5`
- Icona Upload centrata con testo "Trascina i file qui"
- Transizione fluida con `transition-colors`

### File modificati
| File | Modifica |
|------|----------|
| `PendingFilesUpload.tsx` | Drop zone + stato drag + validazione drop |
| `OrderAttachments.tsx` | Drop zone + upload diretto da drop |

