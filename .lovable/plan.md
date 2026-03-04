

# Audit Sezione Fornitori (SuppliersConfig)

## Bug e Problemi Trovati

### 1. Toast inconsistente: `useToast` invece di `sonner` (P1)

**File**: `src/components/settings/SuppliersConfig.tsx` (riga 19, 172, 251, 255, 287, 291, 303, 309-312, 315, 342)

Usa `useToast` (Radix) mentre il resto dell'app e stato standardizzato su `sonner`.

**Fix**: Migrare a `import { toast } from "sonner"` e sostituire tutte le chiamate `toast({title, description, variant})` con `toast.success()` / `toast.error()`.

### 2. Mancano `maxLength` sugli input (P1)

Nessun campo ha `maxLength`. Rischio di input eccessivi nel database.

**Fix**:
- Nome: `maxLength={100}`
- P.IVA: `maxLength={20}`
- Codice Fiscale: `maxLength={20}`
- Email: `maxLength={100}`
- Telefono: `maxLength={20}`
- Sito Web: `maxLength={100}`
- Indirizzo: `maxLength={200}`
- Citta: `maxLength={50}`
- Provincia: `maxLength={5}`
- CAP: `maxLength={10}`
- Paese: `maxLength={50}`
- Categoria: `maxLength={50}` (sul search input)
- Note: `maxLength={500}`

### 3. Manca `.trim()` nel salvataggio (P1)

I campi stringa vengono salvati senza `.trim()`, rischiando spazi bianchi nel database. Il campo `name` viene controllato con `.trim()` nella validazione ma non nel payload di insert/update.

**Fix**: Aggiungere `.trim()` su `name` nel payload di `createMutation` e `updateMutation`.

### 4. Update/Delete senza filtro `company_id` (P1 - Sicurezza)

- Update (riga 282): filtra solo per `.eq("id", id)` senza `.eq("company_id", companyId)`
- Delete (riga 298): filtra solo per `.eq("id", id)` senza `.eq("company_id", companyId)`

Defense-in-depth richiede il filtro esplicito.

**Fix**: Aggiungere `.eq("company_id", companyId!)` sia nell'update che nel delete.

### 5. Layout rotto nel form "Dati Fiscali" (P1 - UI Bug)

Righe 535-560: il `grid grid-cols-3` contiene solo P.IVA, e il `</div>` che lo chiude (riga 540) termina troppo presto. Codice Fiscale e Aliquota IVA sono fuori dal grid container. Questo causa un layout visivamente inconsistente.

**Fix**: Ristrutturare il blocco per includere tutti e 3 i campi dentro lo stesso `grid grid-cols-3`.

## Componenti OK

- Query con `staleTime: 5 * 60 * 1000`: buona pratica
- Filtro ricerca client-side: corretto
- Categoria con combobox creabile: ben implementato
- Separazione Italiani/Esteri con Tabs: corretta
- AlertDialog per conferma eliminazione: corretto
- Gestione errore foreign key nel delete: corretta
- `invalidateSuppliers` invalida entrambe le queryKey: corretto

## File da modificare

| File | Intervento |
|------|-----------|
| `src/components/settings/SuppliersConfig.tsx` | sonner + maxLength + trim + company_id su update/delete + fix layout Dati Fiscali |

