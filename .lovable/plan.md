

# Email Marketing - Stabilizzazione e Fix

## Problemi Identificati

### 1. Bug: Warning "Function components cannot be given refs" (Console)

Il warning proviene da `AlertDialog` in `EmailTemplatesTab.tsx` (riga 274). Radix UI `AlertDialog` viene usato in modalita controllata (`open` prop) senza `AlertDialogTrigger`. In questa configurazione, Radix tenta di passare un ref al componente figlio diretto. La soluzione e assicurarsi che `AlertDialogContent` sia il figlio diretto senza wrapper funzionali intermedi. Lo stesso pattern esiste in `EmailCampaignsTab.tsx` (riga 275).

**Fix**: Avvolgere entrambi gli `AlertDialog` controllati in modo che il contenuto sia correttamente strutturato, aggiungendo `onOpenChange` handler esplicito.

### 2. Bug: TemplateDialog usa `folder` (stringa) invece di `folder_id` (UUID)

Il `TemplateDialog` salva `folder: "Home"` come stringa di testo nel campo `folder` della tabella `email_templates`. Ma il `EmailTemplatesTab` filtra per `folder_id` (UUID) alla riga 96:

```
const matchFolder = currentFolderId ? t.folder_id === currentFolderId : !t.folder_id;
```

Risultato: i template creati non appaiono mai nella vista "Home" perche hanno `folder_id = null` E `folder = "Home"`, ma il filtro controlla solo `folder_id`. Il campo `folder` (stringa) nella tabella e legacy e non piu necessario dato che esiste `folder_id`.

**Fix**: Rimuovere il campo `folder` dal `TemplateDialog`. Il template si salva con `folder_id: null` (Home) di default. Aggiungere un Select per scegliere la cartella tramite `folder_id` dalle `email_folders` reali.

### 3. Pulizia: campo "Cartella" nella tabella template

La colonna "Cartella" nella tabella mostra `t.folder || "Home"` (stringa legacy). Dovrebbe mostrare il nome della cartella basato su `folder_id`, oppure "Home" se null.

**Fix**: Fare un lookup del nome cartella dai `folders` caricati.

### 4. Pulizia: Import non necessari

- `EmailPerformanceChart.tsx` riga 12-14: `METRICS` array definito ma il selettore metrica non cambia effettivamente i dati visualizzati (mostra sempre gli stessi dati indipendentemente dalla selezione). Il selettore e decorativo.

**Fix**: Rendere il selettore funzionale o rimuoverlo. Per ora lo rendiamo funzionale cambiando il titolo della card in base alla selezione.

### 5. UX: Nessun loading state sulle mutation di eliminazione

Quando si clicca "Elimina" nell'AlertDialog, il pulsante non mostra stato di caricamento.

**Fix**: Aggiungere `disabled={deleteMutation.isPending}` al pulsante Elimina e mostrare testo di caricamento.

### 6. UX: CampaignDialog - tipo "broadcast" mostrato come default non chiaro

Il tipo default e "broadcast" ma nell'UI si vede solo "Broadcast" nel Select. Dovrebbe essere coerente con la sidebar ("Campagne email" = broadcast).

**Fix**: Cambiare le label del Select tipo nel CampaignDialog per allinearsi alla sidebar: "Email" (broadcast), "Flusso" (automation), "Azione in blocco" (bulk).

---

## Riepilogo Modifiche

| Azione | File | Dettaglio |
|--------|------|-----------|
| Modifica | `TemplateDialog.tsx` | Sostituire campo `folder` stringa con Select `folder_id` da email_folders |
| Modifica | `EmailTemplatesTab.tsx` | Mostrare nome cartella da folders lookup, fix ref warning AlertDialog |
| Modifica | `EmailCampaignsTab.tsx` | Fix ref warning AlertDialog, loading state eliminazione |
| Modifica | `EmailPerformanceChart.tsx` | Titolo card dinamico basato su metrica selezionata |
| Modifica | `CampaignDialog.tsx` | Allineare label tipi campagna alla sidebar |

### Nessuna modifica database

Tutti i fix sono puramente frontend. Il campo `folder` (stringa) nella tabella `email_templates` resta per backward compatibility ma non viene piu usato dal dialog.

