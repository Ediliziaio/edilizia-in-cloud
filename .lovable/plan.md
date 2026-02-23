

# Pulizia, Fix e Stabilizzazione - Marketing Calendar

## Analisi completata

Ho analizzato il codebase della sezione Marketing Calendar e identificato i seguenti problemi:

---

## 1. Bug da correggere

### Console Warning: "Function components cannot be given refs"
Nel tab "Tempo bloccato" del `MarketingAppointmentDialog.tsx` (riga 424), il `Popover` per la selezione data non chiude dopo la selezione e non ha lo state gestito (a differenza del tab Appuntamento che usa `datePickerOpen`). Il `PopoverTrigger` wrappa un `Button` ma la mancanza di stato controllato causa il warning.

**Fix**: Riutilizzare lo stesso state `datePickerOpen` per il Popover nel tab blocked, con chiusura automatica alla selezione della data.

### Date picker nel tab "Tempo bloccato" non si chiude
La `Calendar` nel tab blocked (riga 435) chiama `setAppointmentDate` direttamente ma non chiude il popover. Il tab Appuntamento invece lo chiude correttamente (riga 324).

**Fix**: Allineare il comportamento: `onSelect={(d) => { setAppointmentDate(d); setDatePickerOpen(false); }}`

---

## 2. Pulizia codice

### Import non utilizzati
- `MarketingAppointmentDialog.tsx`: l'import della vecchia `MarketingAppointmentData` type nel file precedente `MarketingAppointmentDialog` (in `components/marketing/`) - gia verificato, nessun conflitto con il vecchio dialog generico.
- Nessun file orfano trovato: il vecchio `AppointmentDialog` e ancora usato dal Calendario Lavori interno (3 file lo importano correttamente).

### Codice legacy
- Nessuna struttura legacy identificata in questa sezione. Il refactoring precedente ha gia separato correttamente marketing da gestione interna.

---

## 3. Miglioramenti UX

### Footer dialog: layout migliorato
Quando si edita un appuntamento, il pulsante "Elimina" e il selettore "Stato" possono sovrapporsi su mobile. Ottimizzare con layout responsive.

### Feedback salvataggio
Il pulsante mostra "Salvataggio..." ma non c'e un loading spinner visivo. Aggiungere spinner al pulsante durante il salvataggio.

---

## Riepilogo modifiche

| File | Azione |
|------|--------|
| `src/components/marketing/MarketingAppointmentDialog.tsx` | Fix: Popover blocked tab usa state controllato, chiusura automatica, fix ref warning, spinner loading |

### Dettagli tecnici

**File: `MarketingAppointmentDialog.tsx`**

1. **Riga 424-440** (Tab Blocked - Popover Data): Sostituire il `<Popover>` senza stato con `<Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>` e aggiungere la chiusura automatica su `onSelect`

2. **Riga 490** (Button Salva): Aggiungere una classe `disabled:opacity-50` e icona loader durante il salvataggio

### Cosa NON viene modificato
- `AppointmentDialog.tsx` (gestione interna) - rimane invariato
- `MarketingCalendar.tsx` - gia corretto nelle iterazioni precedenti
- Schema database - nessuna modifica necessaria
- Nessun file rimosso (tutto il codice e attualmente in uso)

