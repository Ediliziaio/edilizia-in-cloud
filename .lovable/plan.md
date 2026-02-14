

# Import/Export CSV per Ordini, Clienti e Costi

## Panoramica

Aggiungere funzionalita di **esportazione** e **importazione** file CSV/Excel nelle sezioni Ordini, Clienti e Costi dell'area azienda. L'importazione includera un sistema di **mappatura colonne** che permette di associare ogni colonna del file ai campi del database.

---

## Stato attuale

| Sezione | Export | Import |
|---------|--------|--------|
| Ordini | No | No |
| Clienti | No | No |
| Costi | Si (CSV gia presente) | No |

---

## Componente riutilizzabile: ImportDialog

Creare un componente generico `src/components/shared/ImportExportUtils.tsx` che gestisce:

1. **Upload file** - Accetta `.csv`, `.xls`, `.xlsx`
2. **Parsing** - Legge le prime righe come anteprima
3. **Mappatura colonne** - Per ogni colonna del file, l'utente sceglie il campo di destinazione tramite un Select
4. **Validazione** - Mostra errori (campi obbligatori mancanti, formati errati)
5. **Inserimento** - Invia i dati al database

### Parsing file

- **CSV**: parsing nativo con `FileReader` + split (gia usato nel progetto per l'export)
- **XLS/XLSX**: usare la libreria `xlsx` (SheetJS) per leggere file Excel lato client

### Interfaccia mappatura colonne

```text
+-----------------------------------------------+
|  Importa Clienti                               |
+-----------------------------------------------+
|  File: clienti.xlsx (25 righe trovate)         |
|                                                |
|  Colonna file     ->   Campo destinazione      |
|  +--------------+     +-------------------+    |
|  | "Nome"       | --> | Nome *            |    |
|  | "Cognome"    | --> | Cognome *         |    |
|  | "Mail"       | --> | Email *           |    |
|  | "Tel"        | --> | Telefono          |    |
|  | "CF"         | --> | Codice Fiscale    |    |
|  | "Indirizzo"  | --> | -- Ignora --      |    |
|  +--------------+     +-------------------+    |
|                                                |
|  Anteprima: 3 righe su 25                      |
|  | Mario | Rossi | m.rossi@... | 333... |      |
|                                                |
|  [Annulla]                    [Importa 25 righe]|
+-----------------------------------------------+
```

---

## Dettaglio per sezione

### 1. Clienti (`CustomersList.tsx`)

**Export CSV**: Nome, Cognome, Email, Telefono, CF/P.IVA, Indirizzo, Indirizzo Cantiere, Note, N. Ordini

**Import CSV** - Campi mappabili:

| Campo | Obbligatorio | Note |
|-------|-------------|------|
| Nome | Si | `first_name` |
| Cognome | Si | `last_name` |
| Email | Si | `email` - deve essere unica |
| Telefono | No | `phone` |
| Codice Fiscale | No | `fiscal_code` |
| Indirizzo | No | `address` |
| Indirizzo Cantiere | No | `site_address` |
| Note | No | `notes` |

L'import chiamera la edge function `create-customer` per ogni riga (crea utente auth + profilo + password).

### 2. Ordini (`OrdersList.tsx`)

**Export CSV**: Codice Ordine, Cliente, Descrizione, Importo Totale, Acconto 1, Acconto 2, Saldo, Stato, Data Contratto, Data Magazzino, Data Posa, Stato Pagamenti

**Import CSV** - Campi mappabili:

| Campo | Obbligatorio | Note |
|-------|-------------|------|
| Codice Ordine | No | `order_code` |
| Email Cliente | Si | Per associare al cliente esistente |
| Descrizione | Si | `description` |
| Importo Totale | Si | `total_amount` |
| Acconto 1 | No | `deposit_amount` |
| Acconto 2 | No | `deposit_2_amount` |
| Saldo | No | `balance_amount` (calcolato se omesso) |
| Data Prevista | No | `expected_date` |
| Data Magazzino | No | `warehouse_arrival_date` |
| Data Inizio Lavori | No | `work_start_date` |
| Note Interne | No | `internal_notes` |
| Tipo Pagamento | No | `payment_type` |

### 3. Costi (`CompanyCostsManager.tsx`)

**Export**: Gia presente, nessuna modifica necessaria.

**Import CSV** - Campi mappabili:

| Campo | Obbligatorio | Note |
|-------|-------------|------|
| Nome | Si | `name` |
| Tipo | No | `cost_type` (fisso/variabile, default: fisso) |
| Importo | Si | `amount` |
| Categoria | No | `category` |
| Ricorrenza | No | `recurrence` (mensile/trimestrale/annuale/una tantum) |
| Data Scadenza | Si | `due_date` |
| Note | No | `notes` |

---

## File da creare/modificare

### Nuovi file

1. **`src/components/shared/CSVImportDialog.tsx`** - Componente riutilizzabile con:
   - Upload file (drag & drop + click)
   - Parsing CSV/XLS/XLSX
   - UI mappatura colonne con Select per ogni colonna
   - Anteprima dati (prime 5 righe)
   - Validazione campi obbligatori
   - Progress bar durante import
   - Report risultato (righe importate / errori)

### File da modificare

2. **`src/pages/azienda/OrdersList.tsx`** - Aggiungere:
   - Pulsante "Esporta CSV" nell'header
   - Pulsante "Importa" che apre CSVImportDialog
   - Funzione `exportOrdersCSV()`
   - Configurazione campi per import ordini

3. **`src/pages/azienda/CustomersList.tsx`** - Aggiungere:
   - Pulsante "Esporta CSV" nell'header
   - Pulsante "Importa" che apre CSVImportDialog
   - Funzione `exportCustomersCSV()`
   - Configurazione campi per import clienti (chiama edge function `create-customer`)

4. **`src/components/forecast/CompanyCostsManager.tsx`** - Aggiungere:
   - Pulsante "Importa" accanto all'export esistente
   - Configurazione campi per import costi

### Dipendenza da aggiungere

5. **`xlsx`** (SheetJS) - Per parsing file Excel (.xls, .xlsx) lato browser

---

## Dettaglio tecnico: CSVImportDialog

```typescript
interface ImportField {
  key: string;          // es: "first_name"
  label: string;        // es: "Nome"
  required: boolean;
  type?: "text" | "number" | "date" | "email";
}

interface CSVImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;                    // "Importa Clienti"
  fields: ImportField[];            // campi disponibili
  onImport: (rows: Record<string, string>[]) => Promise<{
    success: number;
    errors: string[];
  }>;
}
```

### Flusso import

1. Utente carica file
2. Parsing automatico (rileva separatore per CSV, foglio per Excel)
3. Tentativo auto-match colonne (match esatto o fuzzy sul nome)
4. Utente corregge/conferma mappatura
5. Click "Importa" -> callback `onImport` riceve array di oggetti con chiavi mappate
6. Ogni sezione gestisce la propria logica di inserimento (insert diretto o edge function)
7. Dialog mostra risultato: "22 importati, 3 errori"

---

## UX

- I pulsanti Export/Import saranno raggruppati in un **DropdownMenu** con icona Download/Upload
- L'auto-match tentera di associare colonne automaticamente (es: "nome" -> "Nome", "email" -> "Email")
- Campi non mappati vengono ignorati con opzione "-- Ignora --"
- L'anteprima mostra le prime 5 righe con i valori che verranno importati
- Errori di validazione evidenziati in rosso riga per riga

