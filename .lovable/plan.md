

# Fix: Resize handle attiva il drag invece del resize

## Problema

In `DraggableAppointment.tsx`, le prop `{...listeners}` di dnd-kit sono applicate sul div radice che contiene **tutto**, incluso il resize handle. Quando clicchi sul resize handle, dnd-kit cattura l'evento prima che il `handleResizeStart` possa agire, attivando il drag invece del resize.

## Fix

Separare le aree di interazione:

1. **Root div**: solo `ref={setNodeRef}` e `{...attributes}` (necessari per dnd-kit), ma **senza** `{...listeners}`
2. **Content area** (children): wrappato in un div con `{...listeners}` — qui si attiva il drag
3. **Resize handle**: resta separato, senza listeners di drag — qui si attiva solo il resize

```text
Prima (bug):
┌─ div root {...listeners} {...attributes} ─────┐
│  [contenuto appuntamento]                      │
│  [═══ resize handle ═══]  ← anche qui drag!    │
└────────────────────────────────────────────────┘

Dopo (fix):
┌─ div root {...attributes} (NO listeners) ──────┐
│  ┌─ div drag-area {...listeners} ────────────┐ │
│  │  [contenuto appuntamento]                 │ │
│  └───────────────────────────────────────────┘ │
│  [═══ resize handle ═══]  ← solo resize        │
└────────────────────────────────────────────────┘
```

## File coinvolto

| File | Modifica |
|------|----------|
| `src/components/marketing/DraggableAppointment.tsx` | Spostare `{...listeners}` dal root div a un wrapper interno che avvolge solo `{children}` |

Un singolo file, una modifica chirurgica.

