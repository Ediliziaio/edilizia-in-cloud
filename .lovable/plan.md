

# Miglioramento pagina Clienti

## Modifiche previste

### 1. Migrazione DB: aggiungere `salesperson_id` alla tabella `profiles`
- Nuova colonna nullable `salesperson_id UUID` con foreign key verso `salespeople(id) ON DELETE SET NULL`
- Nessun impatto sui dati esistenti (nullable, default null)

### 2. `CustomersList.tsx` — Filtri, colonna data, colonna venditore

**Query**: aggiungere `created_at` e `salesperson_id` al select dei profili. Caricare anche i salespeople per risolvere i nomi.

**Filtri** (sotto la search bar, in riga):
- Filtro **Venditore**: select con lista venditori attivi + opzione "Tutti"
- Filtro **Con/Senza ordini**: select con "Tutti", "Con ordini", "Senza ordini"

**Nuove colonne tabella**:
- **Data inserimento** (`created_at`): formattata `dd MMM yyyy`
- **Venditore** (`salesperson_id`): nome venditore o "—"

**Ordinamento**: aggiungere sort su `created_at` e `first_name` (click su header)

### 3. `CustomersList.tsx` — Select venditore inline
- Nella colonna Venditore, mostrare un piccolo select inline (o badge cliccabile) per assegnare/cambiare venditore direttamente dalla lista
- Mutazione di update `profiles.salesperson_id` con invalidazione cache

### 4. `CompanyCustomerDetail.tsx` — Aggiungere SalespersonSelect
- Nella scheda di dettaglio cliente, aggiungere il componente `SalespersonSelect` esistente per gestire l'associazione venditore

### File modificati
| File | Modifica |
|------|----------|
| Migrazione SQL | `ALTER TABLE profiles ADD COLUMN salesperson_id` + FK |
| `CustomersList.tsx` | Filtri, colonne data+venditore, sort, assign inline |
| `CompanyCustomerDetail.tsx` | SalespersonSelect nel form |

