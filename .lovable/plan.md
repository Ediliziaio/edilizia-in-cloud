

# Fix: Altezza visiva dell'appuntamento non corrisponde alla durata reale

## Problema

Il contenitore dell'appuntamento ha la giusta altezza (es. 112px per 11:00–12:45), ma il div interno con `{...listeners}` usa `pb-3` (padding-bottom 12px). Questo padding "mangia" ~12px dalla zona visibile colorata, facendo sembrare l'appuntamento più corto di quanto dovrebbe — circa 11 minuti in meno (con slot da 30min).

```text
Stato attuale:
┌─ root (height: 112px, corretto) ─────────┐
│  ┌─ listeners (h-full, pb-3 = 12px) ────┐│
│  │  ┌─ children (colorato) ────────────┐ ││
│  │  │  11:00 appuntamento...           │ ││  ← finisce qui (100px ≈ 12:34)
│  │  └──────────────────────────────────┘ ││
│  │  [12px padding vuoto]                 ││  ← spazio perso
│  └───────────────────────────────────────┘│
│  [handle resize sovrapposto]              │
└───────────────────────────────────────────┘

Dopo il fix:
┌─ root (height: 112px) ───────────────────┐
│  ┌─ listeners (h-full, NO padding) ─────┐│
│  │  ┌─ children (colorato, h-full) ────┐ ││
│  │  │  11:00 appuntamento...           │ ││  ← arriva fino in fondo (112px = 12:45)
│  │  └──────────────────────────────────┘ ││
│  └───────────────────────────────────────┘│
│  [handle resize sovrapposto assoluto]     │
└───────────────────────────────────────────┘
```

## Fix

### File: `src/components/marketing/DraggableAppointment.tsx`

1. **Rimuovere `pb-3`** dal div `{...listeners}` — il padding non serve più perché il resize handle è già posizionato in modo assoluto (`absolute bottom-0`).

2. Cambiare la riga 129 da:
   ```tsx
   <div {...listeners} className="h-full pb-3" style={{ touchAction: "none" }}>
   ```
   a:
   ```tsx
   <div {...listeners} className="h-full" style={{ touchAction: "none" }}>
   ```

Un singolo cambiamento: rimuovere `pb-3`. Il resize handle è già `absolute bottom-0` quindi non ha bisogno di spazio riservato nel flusso del layout.

## Riepilogo

| File | Modifica |
|------|----------|
| `DraggableAppointment.tsx` | Rimuovere `pb-3` dal div listeners |

