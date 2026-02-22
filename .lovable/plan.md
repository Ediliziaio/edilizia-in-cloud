
# Miglioramento Creazione Sequenze Opportunita

## Problemi attuali

1. **Creazione pipeline senza fasi**: Quando si crea una nuova sequenza, viene creata vuota senza nessuna fase. L'utente deve poi cliccare sulla sequenza, andare nella configurazione fasi, aggiungere ogni fase manualmente una per una, e poi salvare. Questo e scomodo.

2. **Salvataggio fasi pericoloso**: Il salvataggio delle fasi in `PipelineStagesConfig` cancella TUTTE le fasi esistenti e le ricrea. Questo rompe i riferimenti `stage_id` nelle opportunita esistenti, causando potenziale perdita di dati.

3. **Dialog di creazione troppo semplice**: Solo un campo "nome", senza possibilita di configurare le fasi iniziali.

## Modifiche previste

### 1. Creazione pipeline con fasi predefinite

**File**: `src/components/settings/PipelinesConfig.tsx`

Modificare il dialog di creazione per:
- Aggiungere fasi predefinite editabili (es: "Nuovo Lead", "Contattato", "Qualificato", "Proposta", "Negoziazione", "Chiuso Vinto", "Chiuso Perso")
- Permettere di aggiungere/rimuovere/rinominare le fasi prima della creazione
- Creare pipeline E fasi in un'unica operazione atomica
- L'utente puo modificare i nomi delle fasi predefinite o rimuoverle prima di creare

### 2. Fix salvataggio fasi (upsert invece di delete+insert)

**File**: `src/components/settings/PipelineStagesConfig.tsx`

Cambiare la logica di salvataggio:
- Le fasi esistenti (con id reale) vengono aggiornate con UPDATE (nome e posizione)
- Le fasi nuove (con id "temp-") vengono inserite con INSERT
- Le fasi rimosse vengono eliminate con DELETE solo se non hanno opportunita collegate
- Se una fase ha opportunita collegate, mostrare un avviso e impedire l'eliminazione

### 3. Validazione: impedire eliminazione fasi con opportunita

Aggiungere un controllo prima di eliminare una fase nella UI: se ci sono opportunita nella fase, mostrare un messaggio di errore e suggerire di spostare le opportunita prima.

## Dettaglio tecnico

### File 1: `src/components/settings/PipelinesConfig.tsx`
- Aggiungere stato `defaultStages` al dialog di creazione con fasi predefinite
- Aggiungere UI per editare/rimuovere/aggiungere fasi nel dialog
- Nella mutation `createPipeline`: dopo aver creato la pipeline, inserire le fasi in batch
- La mutation restituisce l'id della pipeline creata per poter inserire le fasi

### File 2: `src/components/settings/PipelineStagesConfig.tsx`
- Cambiare `handleSave` da "delete all + insert all" a logica differenziale:
  - Identificare fasi aggiunte (id inizia con "temp-")
  - Identificare fasi modificate (confronto con queryData)
  - Identificare fasi rimosse (presenti in queryData ma non in stages)
  - Per fasi rimosse: verificare se hanno opportunita collegate prima di eliminare
- Cambiare `handleDelete` per controllare se la fase ha opportunita prima di permettere la rimozione

## File modificati (2)

1. `src/components/settings/PipelinesConfig.tsx` - Dialog creazione con fasi predefinite
2. `src/components/settings/PipelineStagesConfig.tsx` - Fix salvataggio sicuro con upsert
