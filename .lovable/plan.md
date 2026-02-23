
# Email Marketing - Revisione Completa e Stabilizzazione

## Problemi Identificati

### Bug Funzionali

1. **CampaignDialog: stato non si resetta** - Quando apri il dialog per creare una nuova campagna dopo averne modificata una, i campi mantengono i valori della campagna precedente. `useState` con valore iniziale da `campaign` non si aggiorna quando `campaign` cambia da un oggetto a `undefined`. Serve un `useEffect` per resettare lo stato.

2. **TemplateDialog: stesso problema di reset stato** - Identico bug: i campi nome, subject, htmlContent e folder non si resettano tra apertura per modifica e apertura per creazione.

3. **TemplateDialog: campo "folder" usa stringa libera** - Il campo cartella e un semplice `Input` di testo invece di usare il sistema `email_folders` con `folder_id`. I template vengono filtrati per `t.folder` (stringa) nella tab, ma il sistema cartelle usa `folder_id` (UUID). I due sistemi sono disallineati.

4. **EmailCampaignsTab: tipo "bulk" mancante nel dialog** - La sidebar ha 3 categorie (Email/Flusso/Bulk) ma il CampaignDialog permette solo "broadcast" e "automation". Manca "bulk".

5. **DialogContent senza Description** - Warning Radix: "Missing Description or aria-describedby" su tutti i dialog email (CampaignDialog, TemplateDialog). Serve `DialogDescription` o `aria-describedby`.

6. **Filtro cartelle campagne non funziona con "all"** - Quando `category === "all"`, il filtro tipo viene saltato correttamente, ma il filtro folder mostra solo campagne senza folder quando si e in Home. Le campagne dentro cartelle non vengono mai mostrate nella vista "all".

### Pulizia Codice

7. **Import `Textarea` non usato** in CampaignDialog (riga 8).
8. **EmailStatsTab: `CampaignDialog` duplicato** - Il dialog per creare campagna e presente sia nella tab Statistiche che nella tab Campagne. Nella tab Statistiche non ha senso il pulsante "Crea campagna" (e una tab di analytics).
9. **EmailPerformanceChart: `chartData` sempre vuoto** - I dati del grafico performance sono inizializzati come array vuoto e mai popolati. Il grafico mostra sempre "Nessun dato disponibile".

### Miglioramenti UX

10. **Empty states incoerenti** - Alcuni messaggi vuoti sono generici. Servono messaggi contestuali con CTA chiare.
11. **Nessuna conferma per eliminazione** - Campagne e template vengono eliminati con un solo click senza conferma.
12. **Cartelle: `prompt()` nativo** - La creazione cartella usa `window.prompt()` che e brutto e non gestisce validazione. Serve un piccolo dialog modale.

---

## Soluzione

### 1. Fix reset stato CampaignDialog

Aggiungere `useEffect` che resetta tutti i campi quando `campaign` o `open` cambiano:

```
useEffect(() => {
  if (open) {
    setName(campaign?.name || "");
    setSubject(campaign?.subject || "");
    setType(campaign?.type || "broadcast");
    setTemplateId(campaign?.template_id || "none");
    setAbEnabled(campaign?.ab_test_enabled || false);
    setAbSubjectB(campaign?.ab_subject_b || "");
    setScheduledAt(campaign?.scheduled_at?.slice(0, 16) || "");
  }
}, [open, campaign]);
```

Aggiungere tipo "bulk" al Select:
```
<SelectItem value="bulk">Azione in blocco</SelectItem>
```

Aggiungere `DialogDescription` per eliminare il warning Radix.

Rimuovere import `Textarea` inutilizzato.

### 2. Fix reset stato TemplateDialog

Stesso pattern `useEffect` per resettare name, subject, htmlContent, folder.

Aggiungere `DialogDescription`.

### 3. Fix filtro campagne nella vista "all"

Rimuovere il filtro `matchFolder` quando `category === "all"` per mostrare tutte le campagne indipendentemente dalla cartella, oppure meglio: mostrare tutte le campagne nella vista "all" senza filtro cartella, e filtrare per cartella solo quando si naviga dentro una cartella specifica.

### 4. Popolare EmailPerformanceChart con dati reali

In `EmailStatsTab`, costruire `chartData` aggregando i log per data e tipo di campagna, calcolando i tassi di apertura giornalieri.

### 5. Rimuovere CampaignDialog dalla tab Statistiche

La tab Statistiche e solo analytics. Rimuovere il pulsante "Crea campagna" e il dialog. L'utente puo creare campagne dalla tab Campagne.

### 6. Aggiungere conferma eliminazione

Aggiungere un `AlertDialog` prima di eliminare campagne e template.

### 7. Sostituire `prompt()` con dialog modale

Creare un piccolo componente `CreateFolderDialog` riutilizzabile per campagne e template.

---

## Sezione tecnica

### File modificati

| Azione | File |
|--------|------|
| Modifica | `src/components/email-marketing/CampaignDialog.tsx` - useEffect reset, tipo bulk, DialogDescription, rimuovi Textarea |
| Modifica | `src/components/email-marketing/TemplateDialog.tsx` - useEffect reset, DialogDescription |
| Modifica | `src/components/email-marketing/EmailStatsTab.tsx` - rimuovi CampaignDialog, popola chartData |
| Modifica | `src/components/email-marketing/EmailCampaignsTab.tsx` - fix filtro folder, conferma eliminazione, dialog cartella |
| Modifica | `src/components/email-marketing/EmailTemplatesTab.tsx` - conferma eliminazione, dialog cartella |
| Nuovo | `src/components/email-marketing/CreateFolderDialog.tsx` - dialog modale per creazione cartella |

### Nessuna modifica database

Tutte le tabelle (email_campaigns, email_templates, email_folders, email_logs, email_billing) sono gia presenti e correttamente strutturate.
