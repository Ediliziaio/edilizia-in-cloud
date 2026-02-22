
# Esportazione CSV e Importazione Avanzata per Opportunita e Contatti

## Panoramica

Implementare l'esportazione CSV funzionante (attualmente placeholder) e un'importazione avanzata in stile GHL per opportunita e contatti, con wizard a step e mapping colonne avanzato.

## 1. Esportazione CSV - Contatti

**File**: `src/pages/azienda/marketing/MarketingContacts.tsx`

Aggiungere un pulsante "Esporta" nell'header accanto a "Importa". Al click:
- Recupera tutti i contatti della company (non solo la pagina corrente) via query Supabase
- Genera un file CSV con colonne: Nome, Cognome, Telefono, Email, Azienda, Tag, Note, Fonte, Data Creazione
- Scarica automaticamente il file come `contatti_YYYY-MM-DD.csv`
- Toast di successo/errore

## 2. Esportazione CSV - Opportunita

**File**: `src/pages/azienda/marketing/MarketingOpportunities.tsx`

Sostituire il toast placeholder "Esportazione in arrivo" nel DropdownMenu (riga 200) con una funzione reale:
- Recupera tutte le opportunita della pipeline selezionata con i dati del contatto collegato
- Genera CSV con colonne: Nome Opportunita, Contatto, Email, Telefono, Valore, Stato, Fase, Fonte, Tag, Data Creazione
- Scarica come `opportunita_YYYY-MM-DD.csv`

## 3. Utility condivisa per export CSV

**Nuovo file**: `src/lib/csvExport.ts`

Funzione helper riutilizzabile:
```
exportToCSV(rows: Record<string, string>[], columns: {key, label}[], filename: string)
```
- Gestisce escape delle virgole e doppi apici
- Supporta separatore punto e virgola (standard italiano)
- Aggiunge BOM UTF-8 per compatibilita Excel

## 4. Importazione Opportunita - Nuovo dialog

**File**: `src/pages/azienda/marketing/MarketingOpportunities.tsx`

Sostituire il toast placeholder "Importazione in arrivo" (riga 187) con apertura del `CSVImportDialog` esistente, configurato con i campi delle opportunita:
- Nome Opportunita (obbligatorio)
- Contatto Nome (obbligatorio - per creare/collegare il contatto)
- Contatto Cognome
- Contatto Email
- Contatto Telefono
- Valore
- Fonte
- Tag
- Note

La funzione `onImport`:
1. Per ogni riga, cerca un contatto esistente per email/telefono
2. Se non esiste, crea un nuovo contatto
3. Crea l'opportunita collegata al contatto nella pipeline e fase selezionate
4. Ritorna conteggio successi/errori

## 5. Miglioramento importazione contatti esistente

L'importazione contatti (gia funzionante in `MarketingContacts.tsx`) e gia completa. Nessuna modifica necessaria.

## Riepilogo modifiche

| File | Tipo | Descrizione |
|------|------|-------------|
| `src/lib/csvExport.ts` | Nuovo | Utility condivisa per generazione e download CSV |
| `src/pages/azienda/marketing/MarketingContacts.tsx` | Modifica | Aggiungere pulsante e logica esportazione CSV |
| `src/pages/azienda/marketing/MarketingOpportunities.tsx` | Modifica | Esportazione CSV reale + importazione con CSVImportDialog |

## Dettagli tecnici

### csvExport.ts

```text
function exportToCSV(rows, columns, filename):
  - header row = columns.map(c => c.label).join(";")
  - data rows = rows.map(r => columns.map(c => escapeCSV(r[c.key])).join(";"))
  - BOM + header + data -> Blob -> download link click
```

### Esportazione Contatti
- Query: `supabase.from("marketing_contacts").select("*").eq("company_id", id)` senza paginazione (fino a 1000 righe)
- Mapping diretto dei campi DB alle colonne CSV

### Esportazione Opportunita
- Query: usa la stessa query di `useOpportunities` ma senza paginazione
- Include dati contatto e nome fase dalla lista stages

### Importazione Opportunita
- Riusa il componente `CSVImportDialog` esistente
- Campi configurati con `ImportField[]`
- La funzione onImport fa upsert contatti + insert opportunita in batch
- Pipeline e stage di default: usa la pipeline selezionata e la prima fase
