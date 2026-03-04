

# Audit Catalogo Articoli

## Bug e Problemi Trovati

### 1. Toast inconsistente: `useToast` invece di `sonner` (P1)

**File**: `src/components/settings/ArticleCatalog.tsx` (riga 6, 67, 134, 138, 150, 153)

Usa `useToast` (Radix) mentre il resto dell'app e stato standardizzato su `sonner`. Stesso problema in `SupplierSelect.tsx` (riga 6, 51, 95-98, 101-105).

**Fix**: Migrare entrambi i file a `import { toast } from "sonner"`.

### 2. Mancano `maxLength` sugli input del form (P1)

**File**: `src/components/settings/ArticleCatalog.tsx` (righe 342, 346, 438-443)

I campi Nome, SKU e Descrizione non hanno limiti di lunghezza, rischiando input eccessivi nel database.

**Fix**: `maxLength={100}` su nome, `maxLength={50}` su SKU, `maxLength={500}` su descrizione.

### 3. Tipo duplicato: `ArticleTemplate` vs `ArticleTemplateData` (P2)

**File**: `ArticleCatalog.tsx` (riga 52-63) e `ArticleCombobox.tsx` (riga 22-33)

Le due interfacce sono identiche ma duplicate in file diversi. Viola il principio DRY.

**Fix**: Usare l'interfaccia `ArticleTemplateData` gia esportata da `ArticleCombobox.tsx` anche in `ArticleCatalog.tsx`, eliminando la definizione locale.

### 4. Update senza filtro `company_id` (P1 - Sicurezza)

**File**: `src/components/settings/ArticleCatalog.tsx` (riga 119-122)

L'update filtra solo per `id` senza aggiungere `.eq("company_id", companyId)`. Sebbene RLS protegga a livello DB, la best practice defense-in-depth richiede il filtro esplicito nel codice.

**Fix**: Aggiungere `.eq("company_id", companyId)` sia nell'update (riga 122) che nel delete (riga 144).

### 5. `SupplierSelect.tsx`: stessa inconsistenza toast (P1)

**File**: `src/components/orders/SupplierSelect.tsx` (riga 6, 51)

Usa `useToast` invece di `sonner`.

**Fix**: Migrare a `sonner`.

## Componenti OK (nessun intervento)

- `ArticleCombobox.tsx`: ben implementato, staleTime implicito, filtro corretto
- CATEGORIES array: coerente e completo
- Filtro ricerca client-side: corretto e performante
- Margine %: calcolo corretto con guard `> 0`

## File da modificare

| File | Intervento |
|------|-----------|
| `src/components/settings/ArticleCatalog.tsx` | sonner + maxLength + rimuovi tipo duplicato + company_id su update/delete |
| `src/components/orders/SupplierSelect.tsx` | sonner |

