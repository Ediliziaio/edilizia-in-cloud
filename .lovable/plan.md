

# Ristrutturazione Tab "Operai" in "Staff" con 3 sotto-tab

## Cosa cambia

La tab "Operai" nelle Impostazioni viene rinominata in **"Staff"** e al suo interno si trovano 3 sotto-tab:

1. **Operai** -- personale interno di cantiere, pagato mensilmente (stipendio)
2. **Squadre Esterne** -- ditte esterne, costi una tantum per lavoro (invariato)
3. **Staff Interno** -- personale d'ufficio/amministrazione, pagato mensilmente (stipendio)

## Modifica database

Aggiungere una colonna `role_type` alla tabella `employees` per distinguere operai da staff interno:

- Colonna: `role_type TEXT NOT NULL DEFAULT 'operaio'`
- Valori: `'operaio'` oppure `'staff_interno'`
- Tutti i dipendenti esistenti diventano automaticamente "operaio" grazie al default

## Modifiche ai file

### 1. `src/pages/azienda/Settings.tsx`
- Rinominare la tab da "Operai" a "Staff" (label e icona restano `HardHat` o si usa `Users`)

### 2. `src/pages/azienda/Employees.tsx` (file principale della tab)
- Cambiare titolo da "Gestione Operai" a "Gestione Staff"
- Aggiungere una terza sotto-tab "Staff Interno" accanto a "Operai" e "Squadre Esterne"
- Filtrare i dipendenti per `role_type`:
  - Tab "Operai": mostra solo `role_type === 'operaio'`
  - Tab "Staff Interno": mostra solo `role_type === 'staff_interno'`
- Aggiungere un pulsante "Nuovo" per ciascuna tab che apre lo stesso `EmployeeDialog` ma con il `role_type` corretto

### 3. `src/components/employees/EmployeeDialog.tsx`
- Aggiungere prop `roleType: 'operaio' | 'staff_interno'` per personalizzare titoli e label:
  - Operaio: "Nuovo Operaio" / "Modifica Operaio"
  - Staff Interno: "Nuovo Staff" / "Modifica Staff"
- Il `role_type` viene passato nei dati del form (aggiunto a `EmployeeFormData`)

### 4. `src/pages/azienda/Employees.tsx` (mutation)
- Nel `saveEmployeeMutation`, includere `role_type` nell'insert (non nell'update, il tipo non cambia)

### 5. Costi (nessuna modifica)
- La query nel `CompanyCostsManager` gia carica tutti i dipendenti attivi e li trasforma in costi mensili. Sia operai che staff interno appariranno correttamente come costi fissi mensili con il loro stipendio lordo.

## Dettaglio tecnico

### Migrazione SQL

```sql
ALTER TABLE public.employees 
ADD COLUMN role_type TEXT NOT NULL DEFAULT 'operaio';
```

### Filtraggio nelle sotto-tab

```typescript
const operai = employees.filter(e => e.role_type === 'operaio');
const staffInterno = employees.filter(e => e.role_type === 'staff_interno');
```

### Struttura tab risultante in Settings

```
Impostazioni > Staff
  |-- Operai (dipendenti cantiere, stipendio mensile)
  |-- Squadre Esterne (ditte esterne, costo per lavoro)  
  |-- Staff Interno (ufficio/admin, stipendio mensile)
  |-- Rapportini
```

### Impatto sui costi

Nessuna modifica necessaria: il `CompanyCostsManager` carica gia TUTTI i dipendenti attivi dalla tabella `employees` e li mostra come costi mensili. Aggiungendo staff interno alla stessa tabella, appariranno automaticamente nei costi con la label "(stipendio)".

