
# Wizard di Importazione in 4 Step stile GHL

## Panoramica

Sostituire il dialog modale `CSVImportDialog` con un wizard a pagina intera in 4 step, identico a GHL. Il wizard sara un nuovo componente riutilizzabile che verra mostrato al posto del contenuto corrente quando l'utente clicca "Importa".

## I 4 Step del Wizard

### Step 1 - Avvia
- Stepper orizzontale in alto con 4 step: Avvia, Carica, Mappa, Verifica
- Selezione oggetto da importare con card selezionabili:
  - **Contatti**: "Contiene l'elenco di tutti i lead, i loro dettagli e le specifiche" (icona utente)
  - **Opportunita**: "Contiene l'elenco di tutte le vendite, le loro fasi, gli stati e l'avanzamento" (icona target)
- Pre-selezionato in base alla pagina da cui si arriva (contatti o opportunita)
- Footer fisso con pulsanti "Annulla" e "Successivo"

### Step 2 - Carica
- Titolo "Carica i tuoi file" con link "Scarica file di esempio"
- Area drag-and-drop per CSV (dimensione massima 30MB)
- Select "Seleziona come importare contatti": Crea contatti / Crea e aggiorna contatti / Aggiorna contatti
- Se oggetto = Opportunita, select aggiuntiva "Seleziona come importare opportunita"
- Footer con "Indietro", "Annulla", "Successivo" (abilitato solo dopo upload)

### Step 3 - Mappa
- Alert informativo: "Assicurati che tutti i campi obbligatori siano mappati correttamente"
- Box con campi obbligatori evidenziati (Nome per contatti, Nome Opportunita per opportunita)
- Tabella di mapping con colonne:
  - **Intestazione colonna nel file**: nome header CSV
  - **Informazioni di anteprima**: prime 3 righe di dati (stacked verticalmente)
  - **Stato**: badge "Mappato" (verde) o "In sospeso" (grigio)
  - **Oggetto**: Contatto / Opportunita
  - **Campi**: dropdown per selezionare il campo di destinazione con auto-match
- Checkbox "Non importare dati in X unmapped columns"
- Footer con "Indietro", "Annulla", "Successivo"

### Step 4 - Verifica
- Sezione Preferenze:
  - Checkbox "Aggiungi etichette ai contatti importati" con select tag
- Sezione "Rivedi importazione":
  - Info documento (nome file, dimensione, stato caricamento)
  - Tabella mapping riassuntiva (solo colonne mappate)
- Checkbox consenso in basso: "Confermo che tutti i contatti coinvolti hanno acconsentito..."
- Footer con "Indietro", "Annulla", "Avvia importazione in blocco"

## Architettura

### Nuovi file

| File | Descrizione |
|------|-------------|
| `src/components/shared/ImportWizard.tsx` | Componente principale wizard 4 step |
| `src/components/shared/import-wizard/StepIndicator.tsx` | Stepper orizzontale con icone e linee connettore |
| `src/components/shared/import-wizard/StepStart.tsx` | Step 1 - Selezione oggetto |
| `src/components/shared/import-wizard/StepUpload.tsx` | Step 2 - Upload file e configurazione |
| `src/components/shared/import-wizard/StepMap.tsx` | Step 3 - Mapping colonne con tabella GHL-style |
| `src/components/shared/import-wizard/StepReview.tsx` | Step 4 - Verifica e avvio importazione |

### File modificati

| File | Modifica |
|------|----------|
| `src/pages/azienda/marketing/MarketingContacts.tsx` | Sostituire `CSVImportDialog` con `ImportWizard` inline (overlay a pagina intera) |
| `src/pages/azienda/marketing/MarketingOpportunities.tsx` | Sostituire `CSVImportDialog` con `ImportWizard` inline |

## Dettagli tecnici

### ImportWizard Props
```text
interface ImportWizardProps {
  open: boolean
  onClose: () => void
  defaultObjectType: "contacts" | "opportunities"  
  contactFields: ImportField[]
  opportunityFields: ImportField[]
  onImportContacts: (rows, options) => Promise<result>
  onImportOpportunities: (rows, options) => Promise<result>
}
```

### StepIndicator
- 4 cerchi numerati collegati da linee
- Step completati: cerchio blu con check, linea blu
- Step corrente: cerchio blu con numero
- Step futuri: cerchio grigio con numero, linea grigia
- Sotto ogni cerchio: nome step + descrizione

### Tabella Mapping (Step 3)
- Auto-match intelligente: confronto normalizzato tra header CSV e label campi
- Preview: mostra le prime 3 righe per ogni colonna (stacked in un'unica cella)
- Badge stato: "Mappato" verde se il campo e mappato, "In sospeso" grigio se non mappato
- Colonna "Oggetto" fissa a "Contatto" o "Opportunita" in base all'oggetto selezionato
- Dropdown campi: lista di tutti i campi disponibili + "Please Select" (non mappato)

### Import Mode
- "Crea contatti": inserisce solo nuovi record
- "Aggiorna contatti": aggiorna solo record esistenti (match per email/telefono)
- "Crea e aggiorna": upsert - crea nuovi e aggiorna esistenti

### Parsing File
- Riutilizza la logica di parsing esistente (CSV con auto-detect separatore, XLS/XLSX via xlsx)
- Supporta sia ; che , come separatore

### Footer Fisso
- Barra bianca sticky in basso con bordo superiore
- Pulsante "Indietro" a sinistra (non visibile su step 1)
- Pulsanti "Annulla" e "Successivo"/"Avvia importazione" a destra
