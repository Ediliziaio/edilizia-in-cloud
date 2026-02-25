

# Fix: Resize handle non funziona — ristrutturazione completa stile Google Calendar

## Analisi del problema

Ho analizzato il codice attuale di `DraggableAppointment.tsx` e identificato **due problemi strutturali**:

1. **Il div dei `{...listeners}` (drag) non ha `h-full`** — occupa solo l'altezza del testo, non tutto il blocco appuntamento. L'area vuota tra il testo e il resize handle non è né trascinabile né ridimensionabile.

2. **Il resize handle (`h-2` = 8px) è troppo piccolo** e non visibile — l'utente non riesce a trovarlo e quando lo trova non ha feedback visivo.

```text
Stato attuale (bug):
┌─ root div (height: spanHeight) ──────────┐
│  ┌─ listeners div (altezza auto) ──────┐ │
│  │  "10:00 appuntamento..."            │ │  ← solo qui è cliccabile per drag
│  └─────────────────────────────────────┘ │
│                                          │  ← zona morta: niente funziona
│  [═══ handle 8px invisibile ═══]         │  ← troppo piccolo, non si vede
└──────────────────────────────────────────┘

Dopo il fix (Google Calendar):
┌─ root div (height: spanHeight) ──────────┐
│  ┌─ listeners div (h-full, pb-3) ──────┐ │
│  │  "10:00 appuntamento..."            │ │  ← drag su tutta l'area
│  │                                     │ │
│  └─────────────────────────────────────┘ │
│  [═══ handle 12px, visibile su hover ═] │  ← resize chiaro e accessibile
└──────────────────────────────────────────┘
```

## Piano di implementazione

### File: `src/components/marketing/DraggableAppointment.tsx`

1. **Drag area a tutta altezza**: aggiungere `className="h-full"` e `pb-3` (padding-bottom per lasciare spazio alla handle) al div con `{...listeners}`

2. **Resize handle più grande e visibile su hover**:
   - Da `h-2` a `h-3` (12px) — area di click più ampia
   - Indicatore visivo (la barretta) mostrato solo su hover del blocco appuntamento (non del handle singolo), usando `group-hover` dalla root
   - Aggiungere `className="group"` al div root

3. **Snapping a 15 minuti**: nella logica `handlePointerMove` e `handlePointerUp`, arrotondare il `newEndMin` al multiplo di 15 più vicino:
   ```typescript
   const snapped = Math.round(clamped / 15) * 15;
   ```

4. **Feedback visivo durante il resize**: aggiungere un piccolo indicatore orario che mostra l'ora di fine mentre si trascina (opzionale ma utile)

### File: `src/components/marketing/MarketingCalendarWeekView.tsx` e `MarketingCalendarDayView.tsx`

Nessuna modifica necessaria — il rendering è corretto, il problema è tutto in `DraggableAppointment`.

## Riepilogo modifiche

| File | Modifica |
|------|----------|
| `DraggableAppointment.tsx` | Drag area `h-full` + handle più grande + hover-only + snap 15min |

Un solo file, tre correzioni puntuali.

