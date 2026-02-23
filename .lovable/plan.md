

# Email Builder Drag-and-Drop - Progettazione Custom

## Panoramica

Aggiungere un editor visuale drag-and-drop ispirato a GoHighLevel, dove l'utente puo trascinare elementi (Testo, Immagine, Pulsante, Divisore, ecc.) e layout (1 colonna, 2 colonne, 1/3+2/3, ecc.) su un canvas centrale. Ogni elemento selezionato mostra un pannello proprieta sulla destra per personalizzarlo.

Il progetto ha gia installato `@dnd-kit/core`, `@dnd-kit/sortable` e `@dnd-kit/utilities`, e la tabella `email_templates` ha un campo `json_content` pronto per salvare la struttura del builder.

---

## Architettura

L'editor visuale viene implementato come una nuova pagina full-screen (`DragDropEmailBuilder.tsx`) accessibile sia dalle campagne che dai template. La struttura dati e un array JSON di "blocchi", ciascuno con tipo, proprieta e figli (per i layout multi-colonna). L'HTML viene generato dal JSON al momento del salvataggio.

```text
+------------------+------------------------+------------------+
|   SIDEBAR SX     |       CANVAS           |   SIDEBAR DX     |
|   (Elementi +    |   (Drop zone con       |   (Proprieta     |
|    Layout)       |    blocchi ordinabili)  |    elemento      |
|                  |                        |    selezionato)  |
+------------------+------------------------+------------------+
```

---

## Elementi Supportati

### Contenuto
| Elemento | Icona | Proprieta |
|----------|-------|-----------|
| Testo | Type | Testo, font, dimensione, colore, allineamento |
| Immagine | Image | URL, alt, larghezza, allineamento |
| Pulsante | RectangleHorizontal | Testo, URL, colore sfondo, colore testo, bordo arrotondato |
| Divisore | Minus | Spessore, colore, margine |
| Distanziatore | Space | Altezza in px |
| HTML personalizzato | Code | Codice HTML libero |

### Layout
| Layout | Descrizione |
|--------|-------------|
| 1 colonna | Contenitore 100% |
| 2 colonne | 50% + 50% |
| 3 colonne | 33% + 33% + 33% |
| 1/3 + 2/3 | 33% + 66% |
| 2/3 + 1/3 | 66% + 33% |

---

## Struttura Dati JSON

```text
[
  {
    "id": "block-1",
    "type": "text",
    "props": {
      "content": "Ciao {{contact.first_name}}",
      "fontSize": "16px",
      "color": "#333333",
      "textAlign": "left"
    }
  },
  {
    "id": "block-2",
    "type": "columns",
    "props": { "layout": "1/2-1/2" },
    "children": [
      [{ "id": "col1-1", "type": "image", "props": { ... } }],
      [{ "id": "col2-1", "type": "text", "props": { ... } }]
    ]
  }
]
```

---

## File da Creare

| File | Scopo |
|------|-------|
| `src/pages/azienda/marketing/DragDropEmailBuilder.tsx` | Pagina full-screen del builder (top bar + layout 3 colonne) |
| `src/components/email-builder/BuilderSidebar.tsx` | Sidebar sinistra con lista elementi/layout trascinabili |
| `src/components/email-builder/BuilderCanvas.tsx` | Canvas centrale con area di drop e blocchi ordinabili |
| `src/components/email-builder/BuilderPropertiesPanel.tsx` | Pannello destro per modificare le proprieta dell'elemento selezionato |
| `src/components/email-builder/BuilderBlock.tsx` | Componente singolo blocco renderizzato nel canvas |
| `src/components/email-builder/builderTypes.ts` | Tipi TypeScript per blocchi, proprieta, layout |
| `src/components/email-builder/builderHtmlGenerator.ts` | Funzione per convertire JSON in HTML email-safe (con tabelle inline) |

## File da Modificare

| File | Modifica |
|------|----------|
| `src/App.tsx` | Aggiungere rotta `/azienda/marketing/email/campagna/:id/builder` |
| `src/components/email-marketing/CampaignCreateDropdown.tsx` | Aggiungere opzione "Progettazione custom" che crea bozza e naviga al builder |

---

## Dettagli Implementativi

### 1. `DragDropEmailBuilder.tsx` - Pagina principale

- Top bar identica a `CampaignEditor`: indietro, nome editabile, auto-save, anteprima, salva, invia
- Layout 3 colonne: sidebar elementi (240px) | canvas (flex) | proprieta (280px)
- Carica `json_content` dalla campagna (se presente), altrimenti array vuoto
- Salva sia `json_content` (per riaprire nel builder) che `html_content` (generato) ad ogni auto-save
- Anteprima: Dialog che mostra l'HTML generato in un iframe
- Responsive preview: 3 toggle (desktop/tablet/mobile) nella top bar che cambiano la larghezza del canvas

### 2. `BuilderSidebar.tsx` - Pannello elementi

- Sezione "Elementi": griglia 3 colonne di card trascinabili con icona + label
- Sezione "Layout": griglia 3 colonne di card con rappresentazione visiva delle colonne
- Usa `useDraggable` da `@dnd-kit/core` per rendere ogni card trascinabile
- Overlay di drag con anteprima dell'elemento

### 3. `BuilderCanvas.tsx` - Area centrale

- Usa `SortableContext` da `@dnd-kit/sortable` per riordinare i blocchi
- `useDroppable` per accettare nuovi elementi dalla sidebar
- Ogni blocco ha:
  - Handle di trascinamento (grip icon)
  - Toolbar inline al hover: duplica, elimina, sposta su/giu
  - Bordo di selezione al click (mostra proprieta a destra)
- Drop indicator visivo (linea blu) tra i blocchi durante il drag
- Empty state: "Trascina un elemento qui per iniziare"

### 4. `BuilderPropertiesPanel.tsx` - Pannello proprieta

- Si adatta al tipo di blocco selezionato
- Testo: textarea ricco, font family, font size, colore (con color picker), allineamento
- Immagine: URL input con anteprima, alt text, larghezza (slider), allineamento
- Pulsante: testo, URL, colore sfondo, colore testo, border-radius
- Divisore: spessore, colore, margini
- Layout: selezione tipo layout, spaziatura tra colonne
- Ogni modifica aggiorna il blocco in tempo reale e triggera auto-save

### 5. `builderHtmlGenerator.ts` - Generatore HTML

- Converte l'array JSON in HTML email-safe con tabelle inline
- Usa stili inline (no CSS esterno, compatibilita client email)
- Wrapper con max-width 600px centrato
- Layout multi-colonna generati con `<table>` e `<td>`
- Supporto variabili ({{contact.first_name}} passate come testo)

### 6. Flusso di Creazione

Nel `CampaignCreateDropdown`, le opzioni diventano:

1. **"Editor standard"** - Naviga a `/campagna/:id/editor` (rich text esistente)
2. **"Progettazione custom"** - Naviga a `/campagna/:id/builder` (nuovo drag-and-drop)
3. **"Modelli di email marketing"** - Placeholder (invariato)
4. **"I tuoi modelli"** - Template picker (invariato)

---

## Nessuna Modifica Database

Il campo `json_content` su `email_templates` puo essere replicato su `email_campaigns` con una migration, oppure possiamo riusare `html_content` per l'HTML e un campo JSON generico. Per ora salveremo il JSON nel campo `html_content` come stringa serializzata con un prefisso marker, oppure aggiungeremo una colonna `json_content` alla tabella `email_campaigns`.

**Decisione**: Aggiungere colonna `json_content jsonb` a `email_campaigns` tramite migration, cosi come gia esiste su `email_templates`. Questo permette di distinguere chiaramente HTML puro (editor standard) da struttura builder (editor visuale).

---

## Riepilogo Impatto

- **7 file nuovi** (pagina builder + 5 componenti + generatore HTML)
- **2 file modificati** (App.tsx per rotta, CampaignCreateDropdown per opzione)
- **1 migration DB** (aggiunta `json_content` a `email_campaigns`)
- Nessun breaking change sulle funzionalita esistenti

