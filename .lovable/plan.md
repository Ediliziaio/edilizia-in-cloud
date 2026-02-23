
# Automazioni Marketing - Trasformazione UI in stile GoHighLevel

## Analisi delle differenze con GHL

### Screenshot 1: Lista Flussi di Lavoro
La vista attuale usa **card** impilate verticalmente. GHL usa una **tabella** con colonne strutturate, checkbox per selezione multipla, paginazione, ricerca, cartelle e filtri avanzati.

**Differenze principali:**

| Elemento | Attuale | GHL |
|----------|---------|-----|
| Layout lista | Card verticali | Tabella con colonne |
| Colonne | Nome + badge + data | Nome, Stato, Totale Iscritto, Dinamico Iscritto, Aggiornato il, Creato il, Statistiche |
| Selezione | Nessuna | Checkbox per riga + selezione multipla |
| Ricerca | Assente | Campo ricerca in alto a destra |
| Paginazione | Assente | Previous/Next + pagine + "10 / page" |
| Cartelle | Assente | "Crea Cartella" button |
| Filtri avanzati | Assenti | "Filtri avanzati" toggle |
| Personalizzazione | Assente | "Personalizza Elenco" |
| Tab in alto | Tab inline (Tabs component) | Tab-link in header (Flussi di lavoro / Impostazioni flusso di lavoro globali) |
| Azioni riga | Switch + icone inline | Freccia ">" + menu "..." a tre punti |
| Link esterno | Assente | Icona link esterno accanto al nome |

### Screenshot 2: Impostazioni Flusso di Lavoro Globali
Attualmente la pagina MarketingAutomations ha solo la lista. GHL ha una seconda tab "Impostazioni flusso di lavoro globali" con:
- **Promemoria**: Toggle on/off
- **Notifica Email**: Descrizione + "Seleziona Utente" dropdown + checkbox "Amministratori account secondari" / "Utenti account secondari" + pulsante "Salva"
- **Salvataggio automatico**: Toggle + descrizione dettagliata
- **Sospendi il Flusso di lavoro**: Scheduler con Start/End Date+Time, selezione flussi, checkbox "Annualmente", "+ Aggiungi data", pulsante "Salva"

## Piano di implementazione

### 1. Ristrutturare MarketingAutomations.tsx - Header con tab GHL

Sostituire l'header attuale con una struttura a due livelli:
- **Livello 1**: Titolo "Automazione" con tab-link ("Flussi di lavoro" | "Impostazioni flusso di lavoro globali")
- **Livello 2**: Sotto-header contestuale (titolo "Elenco Flusso di lavoro", bottoni "Crea Cartella", "Crea tramite AI", "+ Crea Flusso di lavoro")

Tab "Flussi di lavoro" mostra la lista, tab "Impostazioni flusso di lavoro globali" mostra le impostazioni globali.

Sotto la sotto-header, aggiungere:
- Tab filtro secondarie: "Tutti i flussi di la...", "Necessita revisi...", "Eliminato", "smart_list_mode...", "+ Nuovo Elenco Intelligente"
- Toggle "Filtri avanzati"
- Campo "Cerca" a destra
- Link "Personalizza Elenco" con icona

### 2. Ristrutturare AutomationFlowsList.tsx - Da Card a Tabella

Trasformare la vista da card a tabella HTML con:
- **Checkbox** per ogni riga (prima colonna)
- **Nome**: testo con icona link esterno
- **Stato**: Badge "Published" (verde) o "Draft" (grigio)
- **Totale Iscritto**: numero (query count da automation_enrollments)
- **Dinamico Iscritto**: numero (count enrollments attive)
- **Aggiornato il**: data formattata "Oct 09 2025, 8:42 AM"
- **Creato il**: data formattata
- **Statistiche**: link ">"
- **Azioni**: menu "..." con Modifica, Duplica, Archivia, Elimina

Aggiungere **paginazione** in basso a destra: "Previous [1] 2 Next | 10/page"

### 3. Creare componente GlobalWorkflowSettings.tsx

Nuovo componente per la tab "Impostazioni flusso di lavoro globali" con tre sezioni:

**Sezione 1: Promemoria**
- Toggle Promemoria
- Card "Notifica Email" con icona busta, descrizione, Select "Seleziona Utente"
- Checkbox "Amministratori di account secondari" e "Utenti di account secondari"
- Pulsante "Salva"

**Sezione 2: Salvataggio automatico**
- Toggle con descrizione: "Salva automaticamente le modifiche durante la modifica della bozza del flusso di lavoro..."

**Sezione 3: Sospendi il Flusso di lavoro**
- Card con descrizione: "Metti temporaneamente in pausa i flussi di lavoro selezionati..."
- Tabella scheduling con:
  - "Quando a Sospendi Flusso di lavoro?" label + "Sospendi le date: 1/15" counter
  - Righe con: Start Date and Time -> End Date and Time -> Select "Seleziona Flussi di lavoro"
  - Checkbox "Annualmente"
  - Icone refresh e delete
  - Pulsante "+ Aggiungi data"
  - Note in basso (max 15 giorni differenza, no overlap)
  - Pulsante "Salva"

I dati globali saranno salvati come record nella tabella `automation_flows` con un campo specifico o in una nuova tabella leggera di configurazione (preferibilmente un JSON in una riga di settings globali).

### 4. Aggiungere ricerca e paginazione

- Stato locale `searchQuery` per filtrare i flussi per nome
- Stato `page` e `pageSize` (default 10) per paginazione client-side
- Select per "10 / page" con opzioni 10, 25, 50

### 5. Pulizia e stabilizzazione

- Rimuovere il componente `Tabs` / `TabsList` dalla lista (sostituiti con tab-link custom)
- Verificare che la tabella sia responsiva (scroll orizzontale su mobile)
- Assicurarsi che tutti i link di navigazione (verso builder) funzionino
- Mantenere funzionalita di Switch publish/draft via menu contestuale "..."

## File da modificare

| File | Operazione |
|------|------------|
| `src/pages/azienda/marketing/MarketingAutomations.tsx` | Ristruttura completa: header GHL, tab "Flussi" + "Impostazioni globali", ricerca, sotto-tab filtro |
| `src/components/marketing/automations/AutomationFlowsList.tsx` | Da card a tabella GHL con checkbox, colonne, paginazione, menu azioni |
| `src/components/marketing/automations/GlobalWorkflowSettings.tsx` | **Nuovo file**: Impostazioni globali con Promemoria, Salvataggio automatico, Sospendi Flusso |

## Note tecniche

- I conteggi "Totale Iscritto" e "Dinamico Iscritto" verranno calcolati con query aggregate sulla tabella `automation_enrollments` raggruppate per `flow_id`
- La paginazione e la ricerca sono client-side per semplicita (i flussi per azienda sono tipicamente < 100)
- Le impostazioni globali saranno salvate come JSON in un record dedicato (nuova tabella o campo in una tabella settings esistente) - da valutare se serve una migration
- Nessuna modifica al database richiesta per la trasformazione della lista (i dati sono gia presenti)
- Per le impostazioni globali potrebbe servire una migration per una tabella `automation_global_settings` con colonne `company_id`, `config_json`, `updated_at`
