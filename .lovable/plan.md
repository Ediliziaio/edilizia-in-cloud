

## Piano: Fix errore "Objects are not valid as a React child"

### Problema identificato
Due query usano la **stessa cache key** `["cost-categories", companyId]` ma restituiscono **formati diversi**:

- `SettingsCostCategories.tsx` → restituisce oggetti completi `{id, company_id, name, color, created_at}`
- `useCompanyCostsData.ts` → restituisce solo `string[]` (mappando `.name`)

React Query condivide la cache per chiavi identiche. Se la pagina Impostazioni viene visitata prima, la cache contiene oggetti completi. Quando poi si apre `/azienda/costi`, `useCompanyCostsData` riceve oggetti invece di stringhe e tenta di renderizzarli come React children, causando il crash.

### Soluzione
Cambiare la query key in **uno dei due file** per differenziarle:

**`src/hooks/useCompanyCostsData.ts`** — rinominare la query key da `["cost-categories", companyId]` a `["cost-category-names", companyId]` (linea 380).

Questo è l'unico cambiamento necessario. Un singolo file, una singola riga.

