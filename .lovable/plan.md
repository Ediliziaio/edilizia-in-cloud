

# Audit di pulizia, stabilizzazione e UX — Modulo Costi Aziendali

## 1. Codice morto e pulizia

### `CostFormData.periods` — campo vestigiale
Il campo `periods: string` nell'interfaccia `CostFormData` e nel `defaultFormData` (valore `"12"`) non è più impostato da nessuna UI dopo la sostituzione con `end_date`. Resta solo come fallback silenzioso in `useCompanyCostsMutations.ts` riga 128.

**Azione**: Rimuovere `periods` dall'interfaccia `CostFormData`, dal `defaultFormData`, e dai punti dove viene inizializzato (`openEdit`, `openDuplicate` in `CompanyCostsManager.tsx`). Il fallback nella mutation (riga 127-129) diventa codice morto — se `end_date` è vuoto e recurrence non è "once", si produce 1 periodo (già il default corretto).

### Inconsistenza calcolo periodi
`CostFormDialog.tsx` usa `differenceInMonths` di date-fns per il calcolo, ma `useCompanyCostsMutations.ts` usa un calcolo manuale `(end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth())`. Producono risultati identici per date intere, ma è codice duplicato e fragile.

**Azione**: Estrarre una singola funzione `calculatePeriodsFromDates` nel file mutations (o in `forecastTypes.ts`) e importarla in entrambi i file, eliminando la duplicazione.

### Import non utilizzato in `CostFormDialog.tsx`
L'import `useState` è usato, `useCallback` è usato, `useMemo` è usato — tutti attivi. L'icona `Info` da lucide è usata. Nessun import morto trovato in questo file.

### Verifica globale hooks
Tutti i 32 hook in `src/hooks/` sono attivamente importati e usati. Nessun file orfano trovato (confermato dall'audit precedente documentato in memoria).

---

## 2. Bug funzionali

### Bug 1: Calcolo inconsistente periodi tra preview e salvataggio
La preview usa `differenceInMonths` (date-fns) che gestisce edge case come mesi di lunghezza diversa, mentre la mutation usa aritmetica raw sui mesi. Per date come 31 gennaio → 28 febbraio, i risultati possono divergere.

**Fix**: Unificare su `differenceInMonths` di date-fns in entrambi i punti.

### Bug 2: `periods` fallback crea comportamento silenzioso indesiderato
Se un utente crea un costo ricorrente senza `end_date` (campo obbligatorio mancante), il fallback `parseInt(data.periods) || 1` usa il valore di default `"12"`, creando 12 costi silenziosi. Questo non dovrebbe mai accadere perché il bottone è disabilitato senza `due_date`, ma `end_date` non è validato come required.

**Fix**: Aggiungere validazione: se recurrence non è "once" e `end_date` è vuoto, mostrare errore e bloccare il submit. Disabilitare il bottone quando `end_date` è richiesto ma mancante.

### Bug 3: `min` attribute su `end_date` non funziona con valori empty
Riga 316: `min={formData.due_date || undefined}` — corretto. Nessun bug qui.

---

## 3. Miglioramenti UX

### UX 1: Validazione `end_date` come campo required per costi ricorrenti
Attualmente l'utente può tentare di salvare un costo ricorrente senza data fine contratto. Il bottone "Aggiungi" resta abilitato e il fallback crea 1 solo costo (confuso).

**Fix**: Disabilitare il bottone submit quando `recurrence !== "once"` e `end_date` è vuoto. Mostrare un hint sotto il campo.

### UX 2: Feedback visivo sulla preview periodi
La preview "Verranno creati N costi da X a Y" è buona ma appare solo dopo aver compilato entrambe le date. Aggiungere un messaggio placeholder tipo "Seleziona la data fine contratto" quando `due_date` è presente ma `end_date` manca.

### UX 3: Reset `end_date` quando si cambia ricorrenza a "Una tantum"
Se l'utente seleziona "mensile", inserisce un `end_date`, poi cambia a "una tantum", il valore `end_date` resta in memoria. Aggiungere un reset automatico.

---

## 4. Piano implementativo (file coinvolti)

### `src/hooks/useCompanyCostsMutations.ts`
- Rimuovere `periods` da `CostFormData` e `defaultFormData`
- Importare `differenceInMonths` da date-fns
- Sostituire il calcolo manuale dei periodi (righe 122-129) con la stessa logica di `calculatePeriodsFromDates`
- Rimuovere il fallback `periods`

### `src/components/forecast/CostFormDialog.tsx`
- Spostare `calculatePeriodsFromDates` in un file condiviso o lasciarlo qui e importarlo nella mutation
- Aggiungere validazione: disabilitare submit se ricorrente senza `end_date`
- Aggiungere hint "Seleziona la data fine contratto" quando manca
- Reset `end_date` quando ricorrenza cambia a "once"

### `src/components/forecast/CompanyCostsManager.tsx`
- Rimuovere `periods: "1"` da `openEdit` e `openDuplicate`

---

## Riepilogo deliverable

| Tipo | Dettaglio |
|------|-----------|
| Rimosso | Campo `periods` da interfaccia, default e inizializzazioni |
| Rimosso | Fallback silenzioso `parseInt(data.periods)` |
| Rimosso | Calcolo manuale duplicato periodi nella mutation |
| Fix | Unificazione calcolo periodi (date-fns `differenceInMonths`) |
| Fix | Validazione `end_date` come required per costi ricorrenti |
| UX | Hint placeholder per `end_date` mancante |
| UX | Reset automatico `end_date` su cambio ricorrenza a "once" |
| UX | Bottone submit disabilitato correttamente |

