

## Piano: Allineamento V3 — Gap residui

La spec V3 è sostanzialmente identica alla V2 già implementata. Le differenze sono poche ma significative:

### Gap identificati

1. **FormField types incompleti**: Il type union attuale è `"text" | "email" | "phone" | "number" | "textarea" | "select" | "checkbox"`. La spec V3 richiede anche: `"radio" | "date" | "heading" | "paragraph" | "divider" | "hidden" | "file"`. Di conseguenza anche la libreria campi e il pannello proprietà non li supportano.

2. **FormFieldLibrary manca sezione "Struttura"**: La spec vuole due sezioni — "Campi" (input) e "Struttura" (heading, paragraph, divider, hidden). Attualmente c'è solo la sezione "Campi".

3. **FormFieldProperties manca gestione radio/options**: Il pannello proprietà gestisce solo le opzioni per `select`, ma la spec richiede lo stesso anche per `radio`.

4. **Snippet di condivisione assente**: Il pannello proprietà V3 prevede, quando nessun campo è selezionato, tab "Aspetto", "Impostazioni", "Condivisione" (con URL pubblica, iframe embed, JS snippet). Attualmente mostra solo "Seleziona un campo".

5. **Filtri attr_source/attr_campaign nella lista contatti**: La spec chiede filtri per Sorgente e Campagna nella lista marketing_contacts + colonne opzionali nella tabella. Non implementato.

6. **form-render HTML**: La spec V3 ha un rendering più ricco con supporto per radio, date, heading, paragraph, divider, hidden. Il rendering attuale manca di questi tipi.

### Piano di implementazione (3 step)

**Step 1 — Espandere FormField types + UI builder**
- Aggiornare `FormField["type"]` in `useFormBuilder.ts` con i tipi mancanti
- Aggiungere voci in `FormFieldLibrary.tsx` con sezione "Struttura" (heading, paragraph, divider, hidden) + radio e date nella sezione campi
- Aggiornare `FormFieldProperties.tsx`: gestire radio options, valore per hidden, nessun placeholder per heading/paragraph/divider
- Aggiornare `FormEditorCanvas.tsx` per renderizzare correttamente i nuovi tipi

**Step 2 — Pannello condivisione + form settings nel pannello proprietà**
- Quando `selectedField === null`, mostrare 3 tab nel pannello destro: Aspetto, Impostazioni, Condivisione
- Tab Aspetto: color pickers, border radius, testo bottone, messaggio successo (spostare da editor top-level)
- Tab Impostazioni: email notifica, redirect URL, toggle "Crea contatto", assegna utente, pipeline
- Tab Condivisione: URL pubblica con copy, iframe snippet con copy, link alla sezione Tracking UTM

**Step 3 — Aggiornare form-render per nuovi tipi campo**
- Aggiungere nel rendering HTML: radio, date, heading, paragraph, divider, hidden
- Il rendering attuale nel form-render edge function gestisce solo text/email/phone/number/textarea/select/checkbox

### File da modificare

| File | Modifica |
|---|---|
| `src/hooks/useFormBuilder.ts` | Espandere type union |
| `src/components/settings/FormFieldLibrary.tsx` | Aggiungere sezione Struttura + radio/date |
| `src/components/settings/FormFieldProperties.tsx` | Radio options, hidden value, tab aspetto/impostazioni/condivisione |
| `src/components/settings/FormEditorCanvas.tsx` | Render nuovi tipi nel canvas |
| `supabase/functions/form-render/index.ts` | Aggiungere rendering HTML per radio/date/heading/paragraph/divider/hidden |
| `src/pages/azienda/settings/SettingsFormBuilder.tsx` | Spostare theme/settings controls nel pannello proprietà |

I filtri contatti per attr_source/attr_campaign sono una feature separata che richiederebbe modifiche alla tabella contatti e alla pagina lista contatti — suggerisco di trattarla come task successivo.

