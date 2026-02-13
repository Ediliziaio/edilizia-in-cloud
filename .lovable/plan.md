
# Piano: Miglioramento Flag Pagamento con Data e Duplicazione Costi

## Situazione attuale

La funzionalita di duplicazione costi ricorrenti esiste gia con selezione multi-periodo. Il problema principale e nel flusso di pagamento: quando si clicca "Segna come pagato", il sistema imposta automaticamente la data odierna senza chiedere nulla. Questo non va bene perche spesso si registra un pagamento avvenuto in una data diversa.

## Modifiche

### 1. Dialog di pagamento con data personalizzabile

**File**: `src/components/forecast/CompanyCostsManager.tsx`

Sostituire l'`AlertDialog` di conferma pagamento (righe 949-963) con un `Dialog` completo che include:
- Titolo "Registra Pagamento"
- Un campo data pre-compilato con la data odierna, modificabile dall'utente
- Pulsante "Conferma Pagamento" e "Annulla"

Modifiche tecniche:
- Aggiungere uno stato `paymentDate` (stringa, default data odierna)
- Quando si clicca il check verde, si apre il dialog e si pre-compila `paymentDate` con oggi
- Aggiornare `markPaidMutation` per usare la data selezionata invece di `new Date()`
- Aggiungere anche la possibilita di "togliere" il flag pagato (toggle): se il costo e gia pagato, un clic riporta a "non pagato"

### 2. Toggle Pagato/Non Pagato nella tabella

Nella colonna Azioni della tabella, aggiungere:
- Se il costo NON e pagato: icona check verde che apre il dialog con data
- Se il costo E pagato: icona "X" o "undo" che riporta a non pagato (con conferma rapida)
- Mostrare la data di pagamento nel badge "Pagato" (es. "Pagato il 15/01/2026")

### 3. Verifica duplicazione

La funzionalita di duplicazione multi-periodo e gia implementata e funzionante. Nessuna modifica necessaria.

---

## Riepilogo tecnico

| Modifica | Dettaglio |
|----------|-----------|
| Stato `paymentDate` | Nuovo state per la data selezionata nel dialog |
| Dialog pagamento | Sostituisce AlertDialog con Dialog + campo data |
| `markPaidMutation` | Accetta oggetto `{id, date}` invece di solo `id` |
| Nuovo `markUnpaidMutation` | Riporta `is_paid = false, paid_date = null` |
| Badge "Pagato" | Mostra la data di pagamento effettiva |
| Toggle in tabella | Check verde (non pagato -> dialog) / Undo (pagato -> non pagato) |

Nessuna migrazione database necessaria.
