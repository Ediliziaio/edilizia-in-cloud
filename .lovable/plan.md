

## Analisi Bug Critici — Sistema Fatturazione Nativa

Ho esaminato il codice in dettaglio e ho trovato **4 bug critici** e **2 problemi minori**.

---

### BUG 1 (Critico): `mapRow` non mappa campi usati nella lista

Il mapper in `useDocumentiFiscali.ts` (righe 23-72) non include `data_validita`, `ddt_fattura_id`, `ddt_fatturato`. Questi campi vengono letti nella lista documenti con `(doc as any).ddt_fattura_id` — il cast `as any` maschera il problema ma i valori sono sempre `undefined`.

**Risultato**: La colonna "Fattura Collegata" dei DDT è sempre "—". La colonna "Valido fino al" dei Preventivi è sempre "—". Il badge "Fatturato/Da fatturare" è sempre "Da fatturare".

**Fix**: Aggiungere a `mapRow` i campi mancanti:
```
data_validita, ddt_fattura_id, ddt_fatturato, documento_correlato_id (già mappato),
note_interne, ddt_causale_trasporto, oggetto (se presente)
```

---

### BUG 2 (Critico): Note di Credito falliscono la validazione

`noteCredito.ts` crea righe con `quantita` negativa (`quantita: Math.abs(r.quantita) * -1`). Ma `validateDocumento` in `calcoli.ts` riga 162 controlla `r.quantita <= 0` e genera un errore di validazione. Questo blocca l'emissione delle NC con "Riga X: quantità deve essere > 0".

**Fix**: Escludere il check `quantita <= 0` per documenti di tipo `nota_credito`, oppure usare quantità positive con prezzi negativi.

---

### BUG 3 (Medio): Il Cestino non è mai popolato

Il tab "Cestino" filtra per `stato: "annullata"`. Ma:
- L'azione "Elimina" nel menu azioni chiama `deleteMutation` che fa un `DELETE` fisico e funziona solo su bozze
- Non esiste un'azione "Sposta nel cestino" che cambi lo stato a "annullata" per documenti emessi
- Solo `convertiProformaInFattura` imposta stato "annullata"

**Fix**: Per documenti non-bozza, l'azione "Elimina" dovrebbe fare un soft-delete (`stato → annullata`) invece di un `DELETE`. Per le bozze, il DELETE fisico va bene.

---

### BUG 4 (Medio): Ricerca JSONB potrebbe fallire

Il filtro `.or()` usa la sintassi `cliente_snapshot->>ragione_sociale.ilike.%...%`. PostgREST richiede la sintassi corretta per campi JSONB — se il campo `cliente_snapshot` è NULL per qualche documento, la query potrebbe escludere risultati validi o generare errori.

**Fix**: Verificare che la sintassi sia corretta per PostgREST e gestire i casi null.

---

### Problema minore 1: Autosave non include `data_validita`

Il `useEditorState.ts` non salva `data_validita` nel ciclo di autosave (né nel serialized né nel mutate). Se l'utente modifica la data validità di un preventivo, non viene salvata.

### Problema minore 2: Console error — Refresh Token

L'errore `Invalid Refresh Token` è un problema di sessione scaduta, non un bug del codice. L'utente deve ri-effettuare il login.

---

### Piano di fix

**File 1: `src/hooks/useDocumentiFiscali.ts`** — Aggiungere a `mapRow` i campi mancanti (`data_validita`, `ddt_fattura_id`, `ddt_fatturato`, `note_interne`, `ddt_causale_trasporto`).

**File 2: `src/lib/fatturazione/calcoli.ts`** — Nella funzione `validateDocumento`, saltare il check `quantita <= 0` se il tipo documento è `nota_credito`.

**File 3: `src/pages/azienda/fatturazione/DocumentiFiscaliList.tsx`** — Modificare l'azione "delete" per documenti non-bozza: invece di eliminare fisicamente, aggiornare lo stato a "annullata" (soft delete). Aggiungere azione "restore" che riporta a "bozza".

**File 4: `src/pages/azienda/fatturazione/editor/useEditorState.ts`** — Aggiungere `data_validita` sia alla serializzazione che al payload di autosave.

