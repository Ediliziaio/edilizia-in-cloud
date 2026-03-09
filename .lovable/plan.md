

# Ordinamento Drag-and-Drop per Materiali Preventivi

## Cosa cambia

La pagina `SettingsQuoteMaterials` attualmente mostra l'icona di drag (GripVertical) ma **non ha il drag-and-drop funzionante**. L'ordine dei materiali (`sort_order`) viene usato sia nella lista impostazioni che nella generazione PDF (`generate-quote-pdf` ordina per `sort_order`), quindi basta implementare il riordino lato frontend + salvataggio.

## Implementazione

### 1. Convertire la griglia in lista verticale sortable

Passare dal layout `grid` a una **lista verticale** (come `OrderStatusConfig.tsx`) per rendere il drag-and-drop intuitivo. Ogni card mostra la posizione numerica (badge con numero), il nome, la categoria e le azioni.

Componenti da usare:
- `DndContext` + `SortableContext` + `verticalListSortingStrategy` da `@dnd-kit/sortable`
- `useSortable` su ogni riga materiale
- `arrayMove` per riordinare l'array
- `closestCenter` come collision strategy

### 2. Logica di riordino e salvataggio

- Al `DragEnd`: riordinare l'array locale con `arrayMove`, assegnare `sort_order = index` a ogni elemento
- Bottone "Salva ordinamento" visibile solo quando ci sono modifiche pendenti
- Al salvataggio: batch update di `sort_order` per ogni materiale via `supabase.from("quote_pdf_materials").update({ sort_order }).eq("id", id)`
- Toast di conferma al completamento

### 3. Badge posizione

Ogni riga mostra un badge numerico (es. `1`, `2`, `3`...) prima del nome per rendere chiaro l'ordine. Colore primary per il primo elemento, muted per gli altri.

### File modificati

| File | Modifica |
|------|----------|
| `SettingsQuoteMaterials.tsx` | Aggiunta DndContext/SortableContext, conversione card in sortable items, logica salvataggio batch, badge posizione, bottone "Salva ordinamento" |

Nessuna migration necessaria — `sort_order` esiste già nella tabella `quote_pdf_materials`.

