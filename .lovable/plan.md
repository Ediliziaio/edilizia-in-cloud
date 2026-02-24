

# Piano: Fix altezza appuntamenti + resize handle

## Problemi identificati

### 1. Appuntamento non copre lo spazio corretto (12:00–13:00)
**Causa**: Il `DroppableSlot` ha un'altezza fissa (`h-8` per slot 30min). L'appuntamento che dura 1 ora (2 slot) prova a impostare `height: 64px` via inline style, ma il slot genitore lo taglia perché ha `h-8` (32px) e nessun `overflow-visible`. Il contenuto viene troncato.

**Fix**: 
- Rendere il `DroppableSlot` `overflow-visible` quando contiene appuntamenti multi-slot
- L'appuntamento multi-slot deve essere `position: absolute`, `top: 0`, `left: 0`, `right: 0` con la giusta `height` calcolata, e un `z-index` per sovrapporsi agli slot sottostanti
- Il `DroppableSlot` deve avere `position: relative` (già presente)

### 2. Resize handle non funziona / posizionato male
**Causa**: Il resize handle è posizionato con `absolute bottom-0` sul wrapper `DraggableAppointment`, ma il wrapper non ha un'altezza esplicita — è il figlio interno che ha `height: spanHeight`. Quindi il handle finisce in fondo al wrapper (1 slot), non in fondo all'appuntamento visivo (N slot).

**Fix**:
- Spostare il `data-resize-id` e l'altezza esplicita sul wrapper `DraggableAppointment` stesso, non sul figlio interno
- Il `DraggableAppointment` deve ricevere la `spanHeight` come prop e applicarla come stile inline sul suo div radice
- Così il resize handle `absolute bottom-0` si posiziona correttamente alla fine dell'appuntamento espanso

## Interventi

### File: `src/components/marketing/DraggableAppointment.tsx`
- Aggiungere prop `spanHeight?: number`
- Applicare `style={{ height: spanHeight, zIndex: 5 }}` sul div radice quando `spanHeight` è definito
- Il resize handle (già `absolute bottom-0`) funzionerà correttamente perché il wrapper ha l'altezza giusta

### File: `src/components/marketing/MarketingCalendarDayView.tsx`
- Rimuovere `style={{ height: spanHeight }}` dal div figlio interno e passarlo come prop `spanHeight` a `DraggableAppointment`
- Aggiungere `overflow-visible` ai `DroppableSlot` per permettere agli appuntamenti multi-slot di espandersi oltre il bordo dello slot
- Il div interno dell'appuntamento diventa `h-full` per riempire il wrapper

### File: `src/components/marketing/MarketingCalendarWeekView.tsx`
- Stesse modifiche: passare `spanHeight` a `DraggableAppointment`, aggiungere `overflow-visible` ai slot

### File: `src/components/marketing/DroppableSlot.tsx`
- Aggiungere `overflow-visible` come classe di default (gli appuntamenti multi-slot devono poter fuoriuscire dallo slot)

## Dettaglio visivo atteso

```text
Prima (bug):
  12:00  ▏ [12:00 apt...] ← troncato a 32px, resize handle invisibile
  12:30  ▏ (vuoto)
  13:00  ▏ (vuoto)

Dopo (fix):
  12:00  ▏ ┌─ 12:00 appuntamento ──┐ ← 64px, sovrappone il 12:30
  12:30  ▏ └──── ═══ resize ───────┘ ← handle visibile in fondo
  13:00  ▏ (vuoto)
```

## File coinvolti

| File | Azione |
|------|--------|
| `src/components/marketing/DraggableAppointment.tsx` | Nuova prop `spanHeight`, altezza sul wrapper |
| `src/components/marketing/MarketingCalendarDayView.tsx` | Passaggio `spanHeight` come prop, rimozione height dal div interno |
| `src/components/marketing/MarketingCalendarWeekView.tsx` | Stesse modifiche |
| `src/components/marketing/DroppableSlot.tsx` | Aggiunta `overflow-visible` |

Nessuna modifica DB. Nessuna modifica backend.

