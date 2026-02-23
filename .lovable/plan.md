

# Analisi e Piano di Miglioramento - Modulo Email Marketing

## Stato Attuale

Il modulo ha una buona struttura base con 3 tab (Statistiche, Campagne, Modelli), un editor full-screen, e una pagina di configurazione invio. Tuttavia, pensando da esperto SaaS, ci sono **lacune significative** e **problemi di qualita** che impediscono al modulo di essere competitivo con GHL.

---

## A. BUG E PROBLEMI ESISTENTI

### A1. `prompt()` nativo nell'editor (viola le linee guida UX)
In `CampaignEditor.tsx`, le funzioni `handleInsertLink` e `handleInsertImage` usano `window.prompt()` (il popup nativo del browser). Questo viola la convenzione del progetto che prevede dialog modali personalizzati.

**Fix**: Sostituire con Dialog modali dedicati per inserimento link e immagine.

### A2. Campagne in Home non filtrate per `folder_id`
In `EmailCampaignsTab.tsx` riga 114, la logica per la vista "Home" e:
```
const matchFolder = currentFolderId ? c.folder_id === currentFolderId : true;
```
Questo mostra **tutte** le campagne in Home, anche quelle nelle sottocartelle. Il tab Modelli (riga 97) invece filtra correttamente con `!t.folder_id`.

**Fix**: Allineare la logica a `!c.folder_id` quando `currentFolderId` e `null`.

### A3. Dropdown azioni campagna troppo limitato
Il menu contestuale delle campagne ha solo "Elimina". Mancano azioni fondamentali: Duplica, Rinomina, Sposta in cartella.

### A4. A/B test nel DB ma mai esposto
La tabella ha `ab_test_enabled` e `ab_subject_b` ma nessun componente li utilizza. Codice morto nel DB.

---

## B. FUNZIONALITA MANCANTI (priorita alta)

### B1. Duplicazione campagna
Fondamentale in qualsiasi tool email marketing. Un utente deve poter duplicare una campagna esistente (con tutto il contenuto HTML) per creare varianti.

**Implementazione**: Aggiungere "Duplica" nel dropdown azioni della tabella campagne. La mutation crea un nuovo record con `name: "Copia di [nome]"`, stesso `html_content`, status "draft".

### B2. Duplicazione template
Stesso concetto per i modelli email.

### B3. Creazione campagna da template ("I tuoi modelli")
Il dropdown "Crea campagna" ha "I tuoi modelli" come placeholder. Questa e una funzionalita core.

**Implementazione**: Aprire un Dialog che mostra i template dell'azienda in una lista. Al click, creare una bozza con `html_content` copiato dal template selezionato e navigare all'editor.

### B4. Contatore destinatari nel flusso di invio
La pagina `CampaignSendSettings` non mostra quanti contatti riceveranno l'email. Questo e critico per evitare errori.

**Implementazione**: Query count su `marketing_contacts` filtrata per la modalita destinatari selezionata, mostrata nella sidebar.

### B5. Selezione liste destinatari effettiva
Attualmente i radio button "Invia all'elenco" / "Scegli contatti" / "Segmenti" non fanno nulla. Servono almeno la selezione delle liste (gia esistenti in `marketing_contact_lists`).

### B6. Inserimento variabili nell'editor
Il `TemplateEditor` ha gia il sistema variabili (`{{contact.first_name}}` etc.), ma il `CampaignEditor` no. Senza variabili di personalizzazione, l'email marketing perde il suo valore.

**Implementazione**: Aggiungere un dropdown "Variabili" nella toolbar dell'editor che inserisce le variabili nel contenuto.

---

## C. MIGLIORAMENTI UX (priorita media)

### C1. Dialog modali per link/immagine nell'editor
Sostituire i `prompt()` con Dialog che validano l'input (URL valido, anteprima immagine).

### C2. Spostamento campagne/template in cartelle
Aggiungere "Sposta in cartella" nel dropdown azioni con un Dialog di selezione cartella.

### C3. Rinomina campagna dalla lista
Aggiungere "Rinomina" nel dropdown azioni per modificare il nome senza entrare nell'editor.

### C4. Empty state piu informativo nella tab Statistiche
Quando non ci sono dati, i grafici mostrano "Nessun dato disponibile" ma non guidano l'utente verso l'azione successiva.

### C5. Conferma prima dell'invio
Cliccando "Rivedi e invia" si dovrebbe aprire un AlertDialog di riepilogo finale (destinatari, oggetto, mittente) prima dell'invio effettivo.

---

## D. RIEPILOGO IMPLEMENTAZIONE PROPOSTA

L'intervento e organizzato in ordine di impatto/sforzo.

### Fase 1 - Bug fix e pulizia (rapida)

| Azione | File | Dettaglio |
|--------|------|-----------|
| Bug fix | `EmailCampaignsTab.tsx` | Fix filtro cartelle Home |
| Bug fix | `CampaignEditor.tsx` | Sostituire `prompt()` con Dialog modali per link e immagine |

### Fase 2 - Funzionalita core mancanti

| Azione | File | Dettaglio |
|--------|------|-----------|
| Feature | `EmailCampaignsTab.tsx` | Aggiungere "Duplica" e "Rinomina" nel menu azioni |
| Feature | `EmailTemplatesTab.tsx` | Aggiungere "Duplica" nel menu azioni template |
| Feature | `CampaignCreateDropdown.tsx` | "I tuoi modelli" apre Dialog con lista template selezionabili |
| Feature | `CampaignEditor.tsx` | Dropdown variabili nella toolbar ({{contact.first_name}}, etc.) |
| Feature | `CampaignSendSettings.tsx` | Conferma invio con AlertDialog riepilogativo |

### Fase 3 - UX polish

| Azione | File | Dettaglio |
|--------|------|-----------|
| UX | `EmailCampaignsTab.tsx` | "Sposta in cartella" nel menu azioni |
| UX | `CampaignSendSettings.tsx` | Contatore destinatari nella sidebar |

### Nessuna modifica database necessaria

Tutte le funzionalita possono essere implementate con le tabelle esistenti.

---

## E. COSA NON FARE ORA

- **Integrazione SendGrid**: richiede API key e Edge Functions dedicate, e un progetto a parte
- **A/B testing UI**: le colonne DB esistono ma la feature e complessa, va pianificata separatamente
- **Drag-and-drop email builder**: richiederebbe una libreria dedicata (es. GrapeJS/Unlayer), fuori scope

