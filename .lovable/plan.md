

# Editing inline nel canvas - Click per modificare direttamente

## Problema attuale
Quando l'utente clicca su un blocco testo o pulsante nel canvas, puo solo modificarlo dal pannello proprieta a destra. L'utente vuole poter cliccare direttamente sul testo nel canvas e scriverci dentro.

## Soluzione

### File: `src/components/email-builder/BuilderBlock.tsx`

Aggiungere una nuova prop `onInlineEdit` al componente per comunicare le modifiche inline al parent.

**Blocco Testo (`case "text"`):**
- Sostituire il `div` con `dangerouslySetInnerHTML` con un `div` con `contentEditable={isSelected}`
- Quando il blocco e selezionato, l'utente puo cliccare dentro e digitare
- Al `blur` o `onInput`, chiamare `onInlineEdit(block.id, { content: element.innerHTML })`
- Mantenere tutti gli stili inline (font, colore, allineamento)

**Blocco Pulsante (`case "button"`):**
- Rendere lo `span` del testo `contentEditable={isSelected}`
- Al `blur`, chiamare `onInlineEdit(block.id, { text: element.textContent })`

**Blocco HTML (`case "html"`):** Non toccare - l'editing inline non ha senso per codice HTML raw.

### File: `src/components/email-builder/BuilderCanvas.tsx`
- Passare la nuova prop `onInlineEdit` dal canvas ai `SortableBlock` e poi ai `BuilderBlock`

### File: `src/pages/azienda/marketing/DragDropEmailBuilder.tsx`
- Creare un handler `handleInlineEdit(blockId, partial)` che aggiorna le props del blocco (riutilizzando la logica di `handleUpdateBlockProps`)
- Per i blocchi figli nelle colonne, verificare se il blockId appartiene a un figlio e usare `handleUpdateChildBlockProps`
- Passare `handleInlineEdit` al `BuilderCanvas`

### Dettagli tecnici
- Usare `contentEditable` nativo di React con `suppressContentEditableWarning`
- Aggiornare lo stato su evento `onBlur` (non su ogni keystroke per performance)
- Impedire che il click dentro il `contentEditable` triggeri la deselezione del blocco (gia gestito da `e.stopPropagation`)
- Le shortcut Ctrl+Z/Y del browser funzionano nativamente dentro `contentEditable` per l'undo del testo; lo stack globale undo/redo cattura lo stato al blur

