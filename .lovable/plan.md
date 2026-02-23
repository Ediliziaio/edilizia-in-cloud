
# Email Marketing - Flusso Campagna stile GHL

## Obiettivo

Replicare il flusso di GoHighLevel per la creazione e invio campagne email. Attualmente il sistema usa un semplice Dialog modale. Il flusso GHL prevede 3 step su pagine dedicate:

1. **Creazione** - Click "Crea campagna" con dropdown (Vuoto / Modelli email / I tuoi modelli), crea bozza e naviga all'editor
2. **Editor email** - Pagina full-screen con editor rich-text, toolbar, nome campagna editabile al centro, pulsanti Anteprima/Salva/Invia o programma
3. **Impostazioni invio** - Pagina con opzioni di invio (Invia adesso, Programma), campi mittente, oggetto, testo anteprima, destinatari, impostazioni aggiuntive, anteprima email nella sidebar

---

## Modifiche Database

Aggiungere colonne mancanti alla tabella `email_campaigns`:

| Colonna | Tipo | Default | Descrizione |
|---------|------|---------|-------------|
| `html_content` | text | '' | Contenuto HTML dell'email |
| `sender_name` | text | null | Nome del mittente |
| `sender_email` | text | null | Email del mittente |
| `preview_text` | text | null | Testo di pre-intestazione |
| `track_clicks` | boolean | false | Traccia i clic sui link |
| `utm_tracking` | boolean | false | Tracciamento UTM |
| `auto_tag` | boolean | false | Aggiungi etichette automatiche |
| `resend_to_unopened` | boolean | false | Rinvia a chi non ha aperto |
| `send_mode` | text | 'immediate' | Modalita invio (immediate/scheduled/batch/rss/smart) |

---

## Nuovi File

### 1. `src/pages/azienda/marketing/CampaignEditor.tsx`
Pagina full-screen per l'editor email, layout:
- **Top bar**: "Indietro" (torna alla lista), indicatore salvataggio automatico, nome campagna editabile al centro con icona matita, pulsanti "Anteprima" / "Salva" / "Invia o programma" (blu primario)
- **Toolbar**: selettore formato (Paragrafo), font family, font size, colore testo, bold/italic/underline/strikethrough, link, immagine, allineamento, interlinea, liste, codice, variabili, undo/redo
- **Area editor**: editor contentEditable con contenuto HTML, area bianca centrata con bordi grigi (stile foglio)
- **Salvataggio automatico**: ogni 30 secondi salva la bozza su DB con debounce
- Carica la campagna tramite `id` dalla URL, aggiorna `html_content` e `name`

### 2. `src/pages/azienda/marketing/CampaignSendSettings.tsx`
Pagina impostazioni invio, layout a 2 colonne:
- **Colonna principale** (sinistra ~70%):
  - Header "Invia o programma" con pulsante "Allega file"
  - Tab di modalita invio: "Invia adesso" / "Programma" / "Programmazione per batch" / "Programma RSS" / "Invio intelligente"
  - Campi form:
    - Nome del mittente (opzionale)
    - Email del mittente (obbligatorio, con nota dominio)
    - Checkbox "Imposta indirizzo di risposta personalizzato"
    - Oggetto (obbligatorio)
    - Testo di anteprima (opzionale)
    - Destinatari con opzioni radio: Scegli contatti / Invia all'elenco / Scegli contatti dal... / Segmenti predefiniti / Crea segmenti
    - Sezione collapsible "Impostazioni aggiuntive": Traccia clic, Tracciamento UTM, Aggiungi etichette, Rinvia a non aperta
  - Pulsante "Rivedi e invia" (blu primario in alto a destra)
- **Colonna sidebar** (destra ~30%):
  - Punteggio spam con indicatore visivo (gauge colorato)
  - Link "Anteprima nel browser" e "Invia email di test"
  - Anteprima HTML dell'email
  - Card "Campi obbligatori" con contatore campi critici mancanti

### 3. `src/components/email-marketing/CampaignCreateDropdown.tsx`
Dropdown per creare campagna (usato sia nella tab Statistiche che in Campagne):
- 3 opzioni: "Vuoto" (crea bozza e naviga all'editor), "Modelli di email marketing" (mostra lista modelli), "I tuoi modelli" (mostra modelli dell'azienda)
- Crea la campagna in DB con status "draft" e naviga a `/azienda/marketing/email/campagna/:id/editor`

---

## File Modificati

### `src/App.tsx`
Aggiungere 2 nuove route:
```
/azienda/marketing/email/campagna/:id/editor -> CampaignEditor
/azienda/marketing/email/campagna/:id/impostazioni -> CampaignSendSettings
```

### `src/components/email-marketing/EmailCampaignsTab.tsx`
- Sostituire il pulsante "Nuovo" che apre CampaignDialog con `CampaignCreateDropdown`
- Click su riga tabella: naviga all'editor della campagna
- Rimuovere `CampaignDialog` import e stato `dialogOpen`/`editCampaign`

### `src/components/email-marketing/EmailStatsTab.tsx`
- Aggiungere il pulsante "Crea campagna" (blu) nella barra filtri con `CampaignCreateDropdown`, come nello screenshot GHL

### `src/pages/azienda/marketing/EmailMarketing.tsx`
- Nessuna modifica sostanziale, il flusso si sposta su pagine dedicate tramite navigazione

### `src/components/email-marketing/CampaignDialog.tsx`
- Mantenere per la modifica rapida dei metadati (nome, tipo) ma non per la creazione. Alternativa: rimuoverlo completamente e usare solo le pagine dedicate.
- Decisione: **rimuoverlo** - tutta la gestione campagna avviene nelle pagine dedicate

---

## Flusso Utente

```text
Lista campagne
    |
    v
[+ Crea campagna] --> Dropdown
    |                    |-- Vuoto --> Crea bozza DB --> /campagna/:id/editor
    |                    |-- Modelli email marketing --> Mostra modelli pubblici (future)
    |                    '-- I tuoi modelli --> Mostra template azienda, seleziona, crea bozza con HTML
    |
    v
Editor email (pagina full-screen)
    |-- [Indietro] --> Torna a lista campagne
    |-- [Salva] --> Salva bozza
    |-- [Anteprima] --> Mostra anteprima in dialog
    |-- [Invia o programma] --> /campagna/:id/impostazioni
    '-- Auto-save ogni 30s
    |
    v
Impostazioni invio (pagina full-screen)
    |-- [Torna al builder] --> Torna all'editor
    |-- [Salva] --> Salva impostazioni
    |-- [Rivedi e invia] --> Valida campi obbligatori, invia/programma
    '-- Sidebar: anteprima email, punteggio spam
```

---

## Riepilogo Tecnico

| Azione | File |
|--------|------|
| Migration DB | Aggiungere 9 colonne a email_campaigns |
| Nuovo | `src/pages/azienda/marketing/CampaignEditor.tsx` |
| Nuovo | `src/pages/azienda/marketing/CampaignSendSettings.tsx` |
| Nuovo | `src/components/email-marketing/CampaignCreateDropdown.tsx` |
| Modifica | `src/App.tsx` - 2 nuove route |
| Modifica | `src/components/email-marketing/EmailCampaignsTab.tsx` - dropdown, navigazione |
| Modifica | `src/components/email-marketing/EmailStatsTab.tsx` - pulsante crea campagna |
| Rimuovere | `src/components/email-marketing/CampaignDialog.tsx` - sostituito da pagine dedicate |

