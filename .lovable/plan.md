
# Date Picker + Vista Giorno/Settimana/Mese per Calendario Marketing

## Panoramica

Aggiungere due funzionalita ispirate a GHL:

1. **Date picker popup**: cliccando sul range date (es. "22 – 28 feb 2026") si apre un mini calendario mensile per saltare rapidamente a una settimana specifica
2. **Selettore vista**: dropdown "Visualizza..." a destra delle frecce di navigazione, con opzioni Giorno / Settimana / Mese

---

## Modifiche tecniche

### File: `src/pages/azienda/marketing/MarketingCalendar.tsx`

**Nuovo stato:**
- `calendarView`: `"day" | "week" | "month"` (default `"week"`)
- `datePickerOpen`: boolean per il popover del mini calendario
- `currentDate`: Date per la vista giorno e mese (derivata da `weekStart` per settimana)

**Barra navigazione aggiornata:**
- Bottone "Oggi"
- Frecce avanti/indietro (adattano in base alla vista: +/-1 giorno, +/-1 settimana, +/-1 mese)
- **Label data cliccabile** dentro un `Popover` che apre un mini `Calendar` (componente UI gia esistente). Al click su un giorno, si aggiorna la settimana/giorno/mese corrispondente e si chiude il popover
- **Select "Visualizzazione per..."** con 3 opzioni: Giorno, Settimana, Mese

**Rendering condizionale:**
- `view === "week"` -> `MarketingCalendarWeekView` (esistente)
- `view === "day"` -> `MarketingCalendarDayView` (nuovo)
- `view === "month"` -> `MarketingCalendarMonthView` (nuovo)

### Nuovo file: `src/components/marketing/MarketingCalendarDayView.tsx`

Vista giornaliera:
- Griglia oraria verticale 08:00-21:00 (come la settimana ma una sola colonna)
- Header con data completa (es. "sabato 22 febbraio 2026")
- Stessi blocchi appuntamenti colorati per calendario
- Click su slot vuoto -> crea appuntamento
- Click su appuntamento -> modifica

### Nuovo file: `src/components/marketing/MarketingCalendarMonthView.tsx`

Vista mensile (come nello screenshot GHL):
- Griglia 7 colonne (dom-sab) con header giorni abbreviati
- Righe per le settimane del mese
- Ogni cella mostra il numero del giorno + appuntamenti come blocchi colorati (troncati con ellipsis)
- Giorni fuori dal mese corrente mostrati con opacita ridotta
- Click su cella -> crea appuntamento per quel giorno
- Click su appuntamento -> modifica

### File: `src/components/marketing/MarketingCalendarWeekView.tsx`

Nessuna modifica funzionale, solo eventuale refactor dell'interfaccia Props per allineamento.

---

## Dettaglio navigazione per vista

| Vista | "Oggi" | Frecce | Label |
|-------|--------|--------|-------|
| Giorno | Vai a oggi | +/- 1 giorno | "22 febbraio 2026" |
| Settimana | Vai a settimana corrente | +/- 1 settimana | "22 - 28 feb 2026" |
| Mese | Vai a mese corrente | +/- 1 mese | "febbraio 2026" |

---

## Date Picker (Popover)

- Si usa il componente `Popover` + `Calendar` gia presenti in `@/components/ui`
- Al click sulla label della data si apre il popover
- Selezionando un giorno nel mini calendario:
  - Vista giorno: imposta quel giorno
  - Vista settimana: imposta la settimana che contiene quel giorno
  - Vista mese: imposta il mese che contiene quel giorno
- Il popover si chiude automaticamente dopo la selezione

---

## Selettore Vista

- Componente `Select` posizionato dopo le frecce di navigazione
- Opzioni: "Visualizzazione per giorno" / "Visualizzazione per settimana" / "Visualizzazione per mese"
- Testo abbreviato nel trigger: "Giorno" / "Settimana" / "Mese"
- Icona ingranaggio accanto (come in GHL)

---

## Nessuna modifica al database

## File modificati/creati: 4

1. `src/pages/azienda/marketing/MarketingCalendar.tsx` - Aggiunta date picker, selettore vista, rendering condizionale
2. `src/components/marketing/MarketingCalendarDayView.tsx` - Nuovo componente vista giorno
3. `src/components/marketing/MarketingCalendarMonthView.tsx` - Nuovo componente vista mese
4. `src/components/marketing/MarketingCalendarFilters.tsx` - Aggiunta sezione "Visualizza per Tipo" (Tutto / Appuntamenti / Fasce orarie bloccate) + link "Rimuovi tutto" per i filtri, come in GHL
