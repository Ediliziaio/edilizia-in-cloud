

# Audit Sezione Tag

## Analisi Componenti

### TagsConfig.tsx - Ben implementato
- Usa `sonner` correttamente
- Query con filtro `company_id`: OK
- `.trim().toLowerCase()` nell'insert: OK
- AlertDialog per conferma eliminazione: OK
- Gestione duplicati: OK

### TagSelector.tsx - Ben implementato
- Query con filtro `company_id`: OK
- Creazione inline con normalizzazione: OK
- `sonner` per toast: OK
- `shouldFilter={false}` con filtro manuale: OK

### useTagSync.ts - Problemi trovati

## Bug e Problemi

### 1. TagsConfig: manca `maxLength` sull'input (P1)

**File**: `src/components/settings/TagsConfig.tsx` (riga 96-101)

L'input per il nuovo tag non ha `maxLength`, rischiando tag eccessivamente lunghi nel database.

**Fix**: Aggiungere `maxLength={50}` sull'input.

### 2. TagsConfig: delete senza filtro `company_id` (P1 - Sicurezza)

**File**: `src/components/settings/TagsConfig.tsx` (riga 61)

Il delete filtra solo per `.eq("id", id)` senza `.eq("company_id", companyId)`. Defense-in-depth richiede il filtro esplicito.

**Fix**: Aggiungere `.eq("company_id", companyId!)` nel deleteMutation.

### 3. useTagSync: N+1 query pattern (P1 - Performance)

**File**: `src/hooks/useTagSync.ts` (righe 43-51, 90-98)

`syncTagsToOpportunities` e `removeTagFromOpportunities` eseguono un UPDATE per ogni opportunita in un loop `for`. Con molte opportunita collegate, questo genera N query separate.

**Fix**: Non risolvibile senza una DB function, ma possiamo mitigare usando `Promise.all` per parallelizzare gli update invece di eseguirli sequenzialmente.

### 4. useTagSync: errori silenziosi (P2)

**File**: `src/hooks/useTagSync.ts` (tutte le funzioni)

Nessuna funzione gestisce gli errori Supabase. Se un update fallisce, l'errore viene ignorato silenziosamente. Nessun `{ error }` viene controllato dopo gli update.

**Fix**: Controllare `{ error }` dopo ogni operazione Supabase e lanciare l'errore per permettere al chiamante di gestirlo.

### 5. TagSelector: manca `maxLength` sul CommandInput (P2)

**File**: `src/components/marketing/TagSelector.tsx` (riga 103-107)

Il campo di ricerca/creazione non ha limite di lunghezza. Meno critico perche il valore viene normalizzato, ma comunque buona pratica.

**Fix**: Non direttamente supportato da CommandInput. Si puo limitare nel `onValueChange` con un check sulla lunghezza.

## Componenti OK (nessun intervento)

- CompanyTagsCell.tsx: sistema separato per super-admin, ben implementato
- Logica di sincronizzazione bidirezionale: architettura corretta

## File da modificare

| File | Intervento |
|------|-----------|
| `src/components/settings/TagsConfig.tsx` | maxLength + company_id su delete |
| `src/hooks/useTagSync.ts` | Promise.all + error handling |
| `src/components/marketing/TagSelector.tsx` | maxLength su search input |

