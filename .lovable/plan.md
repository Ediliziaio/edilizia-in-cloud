

# Allineamento Builder Automazioni a GoHighLevel

## Analisi Gap (GHL vs Attuale)

Confrontando lo screenshot GHL con l'implementazione attuale, mancano diversi elementi chiave:

### 1. Header e Tabs (mancanti)
Il builder GHL ha una barra tabs sotto l'header con: **Builder** | **Impostazioni** | **Cronologia delle iscrizioni** | **Registro di esecuzione**. Attualmente l'header ha solo nome flusso + bottoni azione senza navigazione a tab.

### 2. Left Sidebar con icone (mancante)
GHL ha una barra laterale sinistra con icone strumento (nodo, timer, condizione, ecc.). Attualmente non esiste.

### 3. Bottom Toolbar (mancante)
GHL ha una toolbar in basso con: cursore/selezione, fit-to-screen, zoom out, zoom in, settings. Attualmente c'e solo un indicatore zoom statico.

### 4. Pulsante "+ Aggiungi" in alto a destra del canvas (mancante)
Nella UI GHL c'e un bottone "+ Aggiungi" fisso in alto a destra del canvas per aggiungere nodi rapidamente.

### 5. Toggle Bozza/Pubblica (da migliorare)
GHL usa un toggle switch "Bozza / Pubblica". Attualmente c'e un bottone che cambia testo.

### 6. "Flusso di lavoro di test" (mancante)
Link per lanciare un test run del flusso.

### 7. Trigger e Azioni mancanti
- **Trigger mancanti**: Chiamata registrata, Data personalizzata, Sondaggio inviato
- **Azioni mancanti**: Invia SMS, Invia Messaggio AI, Split percentuale, Goal, Salta a step, API esterna, Sync Google, Sync Meta Lead

### 8. Empty state non centrato
Il placeholder "Aggiungi il primo passaggio" deve essere centrato dinamicamente nel canvas visibile, non posizionato a coordinate fisse.

---

## Modifiche da implementare

### File: `src/types/automationBuilder.ts`
- Aggiungere trigger mancanti: `call_registered` (Chiamata registrata), `custom_date` (Data personalizzata), `survey_submitted` (Sondaggio inviato)
- Aggiungere azioni mancanti: `send_sms`, `send_ai_message`, `split_percentage`, `goal`, `jump_to_step`, `external_api`, `sync_google`, `sync_meta_lead`
- Aggiungere `node_type: "split"` ai tipi nodo
- Aggiornare `NODE_TYPE_COLORS` e `NODE_TYPE_LABELS` per i nuovi tipi

### File: `src/components/marketing/automations/AutomationBuilder.tsx`
- Ristrutturare l'header in 2 righe:
  - Riga 1: freccia indietro + nome flusso editabile (centrato) + undo/redo/archivia (destra)
  - Riga 2: tab **Builder** | **Impostazioni** | **Cronologia iscrizioni** | **Registro esecuzione** (centro) + toggle switch Bozza/Pubblica (destra) + "Test flusso" link
- Aggiungere stato `activeTab` per gestire la vista corrente
- La tab "Registro esecuzione" mostra un placeholder tabella log
- La tab "Impostazioni" mostra un form basico (nome, descrizione)
- La tab "Cronologia iscrizioni" mostra un placeholder

### File: `src/components/marketing/automations/AutomationCanvas.tsx`
- Aggiungere **left sidebar** con icone verticali per aggiungere nodi rapidamente (trigger, azione, condizione, delay, nota)
- Aggiungere **pulsante "+ Aggiungi"** fisso in alto a destra del canvas
- Aggiungere **bottom toolbar** con: cursore, fit-to-screen, zoom out, zoom in, settings
- Centrare dinamicamente l'empty state "Aggiungi il primo passaggio" nel viewport visibile
- Implementare il bottone "fit to screen" (calcola bounding box dei nodi e adatta zoom/pan)

### File: `src/components/marketing/automations/AutomationNodeConfig.tsx`
- Aggiungere configurazione per i nuovi tipi di nodo (SMS, AI message, split percentuale, goal, ecc.)
- Aggiungere campi per `send_sms` (numero, testo)
- Aggiungere campi per `send_ai_message` (prompt, modello)
- Aggiungere campi per `split_percentage` (percentuali branch A/B)
- Aggiungere campi per `goal` (condizione di completamento)

### File: `src/components/marketing/automations/AutomationNode.tsx`
- Aggiungere icone per i nuovi tipi di azione (`send_sms`, `send_ai_message`, `split_percentage`, `goal`, ecc.)

### File: `src/components/marketing/automations/TriggerPickerDialog.tsx`
- Aggiungere le voci mancanti nelle categorie esistenti

### File: `src/components/marketing/automations/ActionPickerDialog.tsx`
- Aggiungere le voci mancanti nelle categorie esistenti

---

## Fix e bug da risolvere

### Console warning (ancora presente)
Il warning "Function components cannot be given refs" per `AutomationConnectionLine` e `AutomationNodeConfig` persiste. `AutomationConnectionLine` usa `memo()` ma il ref warning viene dal fatto che il componente e renderizzato dentro un contesto che tenta di passare un ref. Verificare e fixare wrappando con `forwardRef` dove necessario.

### Empty state posizionamento
Attualmente l'empty state e a `left: 300, top: 200` fissi. Va centrato dinamicamente nel viewport visibile del canvas.

---

## Riepilogo file modificati

| File | Modifica |
|------|----------|
| `src/types/automationBuilder.ts` | Nuovi trigger, azioni, tipi nodo |
| `AutomationBuilder.tsx` | Header a 2 righe, tabs, toggle switch |
| `AutomationCanvas.tsx` | Left sidebar, bottom toolbar, "+ Aggiungi", fit-to-screen, empty state centrato |
| `AutomationNodeConfig.tsx` | Config per nuovi tipi nodo |
| `AutomationNode.tsx` | Icone nuovi tipi azione |
| `TriggerPickerDialog.tsx` | Voci trigger mancanti |
| `ActionPickerDialog.tsx` | Voci azione mancanti |

Nessun file nuovo. Nessuna modifica al database. Nessun file eliminato.

