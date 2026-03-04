

# Audit Sezioni Rimanenti: Stati Ordine, Campi Personalizzati, Venditori, Pipeline

## Componenti analizzati
- `OrderStatusConfig.tsx` + `StatusItem.tsx`
- `CustomFieldsConfig.tsx`
- `SalespeopleConfig.tsx`
- `PipelinesConfig.tsx`
- `PipelineStagesConfig.tsx`

---

## Bug e Problemi

### 1. OrderStatusConfig: `useToast` invece di `sonner` (P1)
**File**: `src/components/settings/OrderStatusConfig.tsx` (righe 21, 30, 151-154, 161-165)
**Fix**: Migrare a `import { toast } from "sonner"`.

### 2. OrderStatusConfig: manca `maxLength` su StatusItem (P1)
**File**: `src/components/settings/StatusItem.tsx` (riga 64)
L'input nome stato non ha `maxLength`.
**Fix**: Aggiungere `maxLength={50}`.

### 3. SalespeopleConfig: `useToast` invece di `sonner` (P1)
**File**: `src/components/settings/SalespeopleConfig.tsx` (righe 6, 62, 114, 118, 137, 143, 170, 174, 232)
**Fix**: Migrare a `import { toast } from "sonner"`.

### 4. SalespeopleConfig: update/delete senza `company_id` (P1 - Sicurezza)
**File**: `src/components/settings/SalespeopleConfig.tsx`
- Update (riga 100): `.eq("id", data.id)` senza `company_id`
- Toggle active (riga 124): `.eq("id", id)` senza `company_id`
- Delete (riga 132): `.eq("id", id)` senza `company_id`
**Fix**: Aggiungere `.eq("company_id", companyId!)` a tutte e tre le mutazioni.

### 5. CustomFieldsConfig: delete senza `company_id` (P1 - Sicurezza)
**File**: `src/components/settings/CustomFieldsConfig.tsx` (riga 220)
Il delete filtra solo per `.eq("id", id)`.
**Fix**: Aggiungere `.eq("company_id", companyId!)`.

### 6. CustomFieldsConfig: manca `maxLength` sugli input (P1)
**File**: `src/components/settings/CustomFieldsConfig.tsx` (righe 406-409, 439-442)
Nome campo e opzioni senza limiti.
**Fix**: `maxLength={100}` su nome, `maxLength={200}` su opzioni.

### 7. PipelinesConfig: update/delete senza `company_id` (P1 - Sicurezza)
**File**: `src/components/settings/PipelinesConfig.tsx`
- Update (riga 123): `.eq("id", id)` senza `company_id`
- Delete (riga 136): `.eq("id", id)` senza `company_id`
**Fix**: Aggiungere `.eq("company_id", companyId!)`.

### 8. PipelinesConfig: manca `maxLength` sugli input (P1)
**File**: `src/components/settings/PipelinesConfig.tsx` (righe 229-233, 248-250, 304)
Nome pipeline e nomi fasi senza limiti.
**Fix**: `maxLength={100}` su tutti gli input nome.

### 9. PipelineStagesConfig: update/delete senza `company_id` (P1 - Sicurezza)
**File**: `src/components/settings/PipelineStagesConfig.tsx`
- Delete (riga 179): `.eq("id", stage.id)` senza `company_id`
- Update (riga 187): `.eq("id", stage.id)` senza `company_id`
**Fix**: Aggiungere `.eq("company_id", companyId!)`.

### 10. PipelineStagesConfig: manca `maxLength` su input fase (P1)
**File**: `src/components/settings/PipelineStagesConfig.tsx` (riga 50)
**Fix**: `maxLength={100}`.

---

## Componenti OK (nessun intervento)

- `CustomFieldsConfig.tsx`: usa già `sonner`, query filtrate per `company_id`
- `PipelinesConfig.tsx`: usa già `sonner`, query filtrate per `company_id`
- `PipelineStagesConfig.tsx`: usa già `sonner`, check opportunità collegate prima del delete
- `StatusItem.tsx`: componente UI puro, nessuna logica DB

---

## File da modificare

| File | Intervento |
|------|-----------|
| `OrderStatusConfig.tsx` | sonner |
| `StatusItem.tsx` | maxLength |
| `SalespeopleConfig.tsx` | sonner + company_id su update/toggle/delete |
| `CustomFieldsConfig.tsx` | company_id su delete + maxLength |
| `PipelinesConfig.tsx` | company_id su update/delete + maxLength |
| `PipelineStagesConfig.tsx` | company_id su update/delete + maxLength |

