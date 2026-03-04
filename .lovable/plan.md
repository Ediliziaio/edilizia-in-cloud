

# Analisi Approfondita - Modulo Automazioni Marketing

## Verdetto Generale

Il modulo e ben strutturato e segue pattern solidi (GHL-inspired). Tuttavia, ci sono diversi problemi funzionali e aree di miglioramento che impattano l'usabilita e l'affidabilita del sistema.

---

## Problemi Identificati

### 1. Nessun motore di esecuzione backend (CRITICO)

Il builder visuale permette di creare flussi complessi con 19 trigger e 22 azioni, ma **non esiste nessun backend che esegua effettivamente questi flussi**. Le tabelle `automation_enrollments` e `automation_execution_log` esistono per tracciare le esecuzioni, ma non c'e nessuna Edge Function o worker che:
- Ascolti i trigger (contact_created, email_opened, etc.)
- Esegua le azioni (send_email, create_opportunity, etc.)
- Gestisca delay, condizioni if/else, split percentuali
- Registri i log di esecuzione

Il sistema di automazioni della "Gestione Interna" (basato su `execute_automation` in PL/pgSQL) e completamente separato e gestisce solo trigger legati agli ordini (commesse), non ai contatti marketing.

**Impatto**: I flussi possono essere creati e pubblicati, ma non faranno nulla.

### 2. Settings tab non persiste correttamente

In `AutomationBuilder.tsx` riga 484, le settings vengono salvate in `flow.config_json.settings`, ma il tipo `AutomationFlow` non include `config_json` come campo. La tabella `automation_flows` potrebbe non avere questa colonna, causando errori silenti al salvataggio.

### 3. Pulsante "Test flusso" non funzionale

Il pulsante "Test flusso" (riga 414-416 di AutomationBuilder) e puramente decorativo - non ha alcun `onClick` handler ne logica collegata.

### 4. Ricerca nella lista non filtra per entity_id nelle Enrollments

In `AutomationEnrollmentsTab.tsx`, il campo di ricerca raccoglie `search` ma non lo usa nella query (righe 42-61). Il filtro per entity_id non viene mai applicato.

### 5. Stessi problemi nei Logs

In `AutomationLogsTab.tsx`, il campo di ricerca `search` non viene usato nella query (righe 43-62).

### 6. GlobalWorkflowSettings - select utenti limitata

La select "Seleziona Utente" nel componente GlobalWorkflowSettings ha solo l'opzione "Tutti gli utenti" hardcoded. Non carica gli utenti reali dall'azienda.

### 7. Connessioni SVG non gestiscono nodi condition/split

Le connessioni (`AutomationConnectionLine`) disegnano solo curve semplici point-to-point. Per i nodi `condition` (if/else) e `split` non c'e supporto per rami multipli (branch Yes/No, A/B). Un nodo if/else dovrebbe avere 2 uscite, ma l'UI non lo permette.

### 8. Drag & drop dei nodi non salva posizioni automaticamente

Il drag dei nodi aggiorna `position_x/position_y` ma il `triggerAutoSave` nel hook non viene chiamato dopo il drag (solo `onUpdateNode` viene chiamato, che a sua volta chiama `triggerAutoSave` - questo funziona ma genera molte entry nella history durante il drag).

### 9. Mancanza di breadcrumb per navigazione cartelle

Quando si naviga dentro una cartella nella lista, non c'e modo visivo di tornare alla root se non tramite il pulsante browser "Back". Manca un breadcrumb o un link ".. Torna su".

---

## Cosa Funziona Bene

- **Builder canvas**: Pan, zoom, drag nodi, connessioni SVG funzionano correttamente
- **Undo/Redo**: Sistema basato su history con ref, performante e senza cascade di re-render
- **Auto-save con debounce**: 2 secondi di debounce, salvataggio corretto via upsert
- **Creazione flusso**: Guard robusto con `creationAttemptedRef` per evitare duplicati
- **Duplicazione flussi**: Copia completa di nodi e connessioni con remapping degli ID
- **Pannello configurazione**: 22 tipi di azione con form dedicati, validazione, campi dinamici
- **Trigger condition builder**: Supporto AND/OR nested, negazione NOT, campi personalizzati da DB
- **Keyboard shortcuts**: Ctrl+Z/Y/S, Delete per rimuovere nodi
- **Paginazione e filtri nella lista**: Funzionali e completi
- **Bulk operations**: Selezione multipla e eliminazione batch

---

## Piano di Correzione Proposto

### Fase 1 - Fix immediati (UI/UX)

1. **Aggiungere breadcrumb per cartelle** nella lista flussi
2. **Collegare il campo search** nelle tab Enrollments e Logs alle rispettive query
3. **Rimuovere o disabilitare "Test flusso"** con tooltip "Coming soon"
4. **Caricare utenti reali** nella select di GlobalWorkflowSettings
5. **Ridurre history push durante drag** (push solo su mouseUp, non su ogni mousemove)

### Fase 2 - Supporto rami condizionali

6. **Gestire uscite multiple** per nodi condition e split (2+ handle di output)
7. **Label sulle connessioni** (Si/No, Ramo A/B) visibili nel canvas

### Fase 3 - Motore di esecuzione (Backend)

8. **Edge Function `process-automation`** che riceve eventi trigger e processa il flusso nodo per nodo
9. **Trigger reali** collegati via database triggers o webhook interni
10. **Coda di esecuzione** per gestire delay e retry

---

Vuoi che proceda con la Fase 1 (fix immediati) o preferisci partire da un'area specifica?

