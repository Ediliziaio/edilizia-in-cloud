
Obiettivo approvato: correggere il bug di rendering/resize sugli appuntamenti con orari non allineati allo slot (es. 12:00–13:30, 12:14, 12:40), senza cambiare il comportamento funzionale desiderato.

## 1) Diagnosi precisa (dal codice attuale)

Ho individuato 3 cause principali:

1. **Durata arrotondata per eccesso/difetto a slot interi**
   - In Day/Week viene usato:
   - `Math.round((endMin - startMin) / slotDurationMinutes)`
   - quindi `12:00 → 13:30` con slot da `60` diventa `1.5 → 2 slot` = **2 ore visuali** (bug che stai vedendo).

2. **Posizionamento verticale sempre all’inizio dello slot**
   - L’appuntamento viene messo nello slot che contiene l’orario di inizio, ma senza offset minuti interno.
   - Quindi `12:14` viene disegnato come se fosse `12:00` (non preciso).

3. **Resize legato a delta “in slot” e non “in minuti”**
   - Nel resize si usa `deltaSlots = Math.round(deltaY / slotHeightPx)` e poi `* slotDurationMinutes`.
   - Con slot da 60m non riesci a ottenere facilmente 13:30/13:14 ecc. perché il calcolo salta a blocchi.

---

## 2) Strategia di fix (stabile e coerente UX)

Passo da una logica “a slot interi” a una logica “pixel-per-minute”:

- `pxPerMinute = slotHeightPx / slotDurationMinutes`
- `heightPx = durationMinutes * pxPerMinute` (durata reale, non arrotondata)
- `topOffsetPx = (startMin - slotStartMin) * pxPerMinute` (offset reale nel suo slot)
- resize calcolato in minuti (`deltaMinutes`), non in numero slot.

In questo modo:
- 12:00–13:30 su slot 60 = 96px (1.5h), non 128px
- 12:14 parte 14 minuti sotto l’inizio riga delle 12:00
- 12:40 idem, perfettamente allineato.

```text
Slot 60m (64px)
12:00 ──────────────────────────────
      ↑ start 12:14 (offset ~15px)
      [ appuntamento ... ]
13:00 ──────────────────────────────
      [ continua ... ]
13:30 fine reale (non 14:00)
```

---

## 3) Piano implementativo per file

### A) `src/components/marketing/MarketingCalendarDayView.tsx`
- Sostituisco `getSpanSlots` con funzioni precise:
  - `getDurationMinutes(apt)` (end-start reale)
  - `getTopOffsetPx(apt, slotTime)`
  - `getHeightPx(apt)` con `pxPerMinute`.
- Passo a `DraggableAppointment`:
  - `spanHeight` = altezza reale px
  - **nuova prop** `topOffsetPx` = offset verticale nel primo slot.
- Mantengo rendering in un solo slot di start (comportamento attuale), ma con posizione corretta e overflow già abilitato.

### B) `src/components/marketing/MarketingCalendarWeekView.tsx`
- Stesse modifiche del DayView:
  - niente `Math.round(.../slotDuration)`
  - altezza/offset in pixel basati sui minuti reali.
- Tooltip e click invariati.

### C) `src/components/marketing/DraggableAppointment.tsx`
- Aggiungo prop `topOffsetPx?: number`.
- Applico nello style root:
  - `height: spanHeight`
  - `marginTop: topOffsetPx` (o `top` se absolute, manterrò la soluzione più compatibile col layout attuale)
  - `zIndex` alto durante resize/overlap.
- Resize refactor:
  - da `deltaSlots` a `deltaMinutes` usando `pxPerMinute`.
  - clamp coerente:
    - minimo: `start + minDuration` (minDuration = durata slot)
    - massimo: fine giornata.
  - preview live con altezza in px reali (non quantizzata a slot intero).

### D) `src/components/marketing/DroppableSlot.tsx`
- `overflow-visible` già presente: lo lascio.
- Verifica che non introduca side effects su Month view (dove non ci sono multi-slot alti).

### E) `src/pages/azienda/marketing/MarketingCalendar.tsx`
- Nessun cambio architetturale necessario.
- Verifico solo che `slotDurationMinutes` passi coerentemente e che il salvataggio resize non venga toccato.

---

## 4) Stabilizzazione bug click/drag/resize (hardening)

Per evitare regressioni UX:
- Mantengo `PointerSensor` con `distance: 5`.
- Sul resize handle aggiungo protezione eventi pointer/mouse per impedire drag involontario durante resize.
- Evito flicker e “jump” durante anteprima resize mantenendo aggiornamento stile solo sul nodo corrente.

---

## 5) QA plan obbligatorio (mirato + completo sul flusso calendario)

Eseguirò e documenterò questi test prima di chiudere:

1. **Smoke E2E calendario**
   - apri calendario marketing
   - click rapido su appuntamento apre modifica
   - drag and drop funziona
   - resize funziona e salva.

2. **Test orari reali (edge)**
   - 12:00–13:30 (deve occupare 1h30 reale)
   - 12:14–13:02 (offset e altezza corretti)
   - 12:40–13:10
   - durata nulla/invalida fallback a 1 slot.

3. **Resizing edge**
   - aumenta/riduci durata con slot 60/30/15
   - verifica clamp minimo/massimo
   - verifica persistenza dopo refresh.

4. **Responsive**
   - mobile/tablet/desktop in day+week view
   - nessun overflow rotto o click area persa.

5. **Console & performance base**
   - nessun errore runtime
   - warning critici assenti
   - niente lag evidente durante drag/resize.

---

## 6) Nota su richiesta “pulizia intero codebase”

La richiesta di audit/pulizia completa di **tutto** il repository è molto ampia e separata dal bug attuale.  
Per non bloccare la correzione urgente, la implementazione viene fatta in 2 step:

- **Step 1 (adesso):** fix completo calendario (render + resize + UX interazione) con test end-to-end.
- **Step 2 (subito dopo, se confermato):** audit globale codebase (dead code/import inutili/legacy cleanup) per moduli, con report dettagliato “rimosso/corretto/migliorato”.

---

## 7) Deliverable atteso dopo implementazione

Ti consegnerò:
1. elenco file toccati
2. bug corretti + causa + fix
3. miglioramenti UX applicati
4. report test finale con esito
5. stato finale: **“TUTTO OK”** solo dopo passaggio completo della checklist QA sopra.
