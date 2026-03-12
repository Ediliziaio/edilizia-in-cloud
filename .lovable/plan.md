

## Analisi Bug e Miglioramenti - Modulo HR

### Bug Trovati

#### 1. `useUpdateHrProfilo` invia campi non modificabili
Il mutation invia TUTTI i campi ricevuti inclusi `id`, `created_at`, `company_id`, `employee_id` che non dovrebbero essere aggiornati. Anche se il fix precedente rimuove `children`/`depth`, restano campi come `created_at` e `company_id` nel payload PATCH (visibile nel network log).

**Fix**: In `useOrganigramma.ts`, nel `useUpdateHrProfilo`, rimuovere esplicitamente i campi immutabili (`id`, `created_at`, `company_id`, `employee_id`) prima dell'update.

#### 2. `responsabile_id` si imposta a stringa vuota invece di null
In `HrProfiloSheet.tsx`, il `<select>` per il responsabile ha `<option value="">` ma react-hook-form invierà `""` invece di `null`, causando un potenziale errore di foreign key.

**Fix**: Nel `onSubmit`, convertire `responsabile_id: ""` in `null`.

#### 3. Warning React: "Function components cannot be given refs"
Il componente `HrProfiloSheet` viene usato direttamente ma `Sheet`/`SheetContent` tenta di passare un ref. Questo e' un warning non bloccante ma fastidioso nella console.

**Fix**: Non critico, il warning viene da Radix internamente.

#### 4. `TabPresenze` - date con timezone offset
`date.toISOString().slice(0, 10)` puo' generare la data sbagliata in fusi orari negativi (es. UTC-1, la mezzanotte locale diventa il giorno prima in UTC).

**Fix**: Usare un formatter locale per generare `YYYY-MM-DD` senza conversione UTC.

#### 5. Filtro reparto non disponibile se nessun profilo ha un reparto assegnato
Il dropdown "Tutti i reparti" appare ma e' vuoto perche' nessun profilo ha `reparto` valorizzato (dai dati nel DB tutti hanno `reparto: null`). Non e' un bug ma la UX e' confusa.

### Miglioramenti

#### A. Sanitizzazione robusta in `useUpdateHrProfilo`
Whitelist dei campi aggiornabili invece di inviare tutto. Questo previene errori futuri con qualsiasi campo aggiuntivo.

#### B. Conversione valori vuoti in null nel submit
Campi come `data_nascita: ""`, `email: ""`, `sede_id: ""` vengono inviati come stringhe vuote. Supabase puo' rifiutare stringhe vuote per campi UUID o date.

**Fix**: Nel `onSubmit` di `HrProfiloSheet`, convertire tutte le stringhe vuote in `null` per i campi nullable.

#### C. Date locali sicure in TabPresenze
Sostituire `toISOString().slice(0,10)` con una funzione che usa `getFullYear()/getMonth()/getDate()`.

---

### Piano di Implementazione

**File: `src/hooks/useOrganigramma.ts`**
- Nel `useUpdateHrProfilo`, aggiungere whitelist dei campi aggiornabili oppure rimuovere `id`, `created_at`, `company_id`, `employee_id` dal payload.

**File: `src/components/hr/HrProfiloSheet.tsx`**
- Nel `onSubmit`: convertire stringhe vuote in `null` per campi nullable (date, email, telefono, UUID, etc.)
- Convertire `responsabile_id: ""` in `null`

**File: `src/pages/azienda/personale/tabs/TabPresenze.tsx`**
- Sostituire `toISOString().slice(0,10)` con una funzione timezone-safe usando `getFullYear()`/`getMonth()`/`getDate()`

