

# Drag & Drop per Allegati in Chat e Sezione Allegati

## Piano

Aggiungere supporto drag & drop nativo HTML5 (eventi `dragover`, `dragenter`, `dragleave`, `drop`) in entrambi i componenti. Non serve nessuna libreria aggiuntiva.

### 1. TicketChat.tsx
- Aggiungere stato `isDragging` per mostrare un overlay visivo quando si trascina un file sopra la card
- Gestire eventi `onDragOver`, `onDragEnter`, `onDragLeave`, `onDrop` sulla Card principale
- Al drop, impostare il file selezionato (`setSelectedFile`) con il primo file valido — il flusso di invio esistente gestisce il resto
- Mostrare overlay con icona e testo "Rilascia per allegare"

### 2. TicketAttachments.tsx
- Stessa logica drag & drop sulla Card degli allegati
- Stato `isDragging` + overlay visivo
- Al drop, passare i file direttamente a `uploadMutation.mutate()`
- Overlay con "Rilascia per caricare"

### File da modificare

| File | Modifica |
|------|----------|
| `src/components/tickets/TicketChat.tsx` | Drag & drop con overlay sulla Card |
| `src/components/tickets/TicketAttachments.tsx` | Drag & drop con overlay sulla Card |

Nessuna dipendenza aggiuntiva. Solo eventi HTML5 nativi.

