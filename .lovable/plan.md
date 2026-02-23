
# Piano: Custom Fields + Blocchi in Colonne + Undo/Redo

## 1. Variabili di personalizzazione (Custom Fields) nel Builder

Attualmente il `CampaignEditor` (editor standard) ha gia un dropdown "Variabili" con tag come `{{contact.first_name}}`. Il builder drag-and-drop non ha questa funzionalita.

### Implementazione

**File: `BuilderPropertiesPanel.tsx`**
- Aggiungere un dropdown "Inserisci variabile" nel pannello proprieta per i blocchi di tipo **text** e **button**
- Le variabili disponibili sono le stesse del CampaignEditor: `{{contact.first_name}}`, `{{contact.last_name}}`, `{{contact.email}}`, `{{contact.phone}}`, `{{company.name}}`, `{{unsubscribe_url}}`
- Al click su una variabile, il tag viene appeso al contenuto del blocco testo (nel campo "Contenuto") o al testo del pulsante
- Le variabili vengono mantenute come testo nel JSON e passate inalterate nell'HTML generato (la sostituzione avviene lato server al momento dell'invio)

### Dettaglio tecnico
- Estrarre la lista `VARIABLES` in un file condiviso (`builderTypes.ts`) per riutilizzarla sia nel CampaignEditor che nel PropertiesPanel
- Nel `TextProperties`: aggiungere un `DropdownMenu` sotto il campo "Contenuto" con le variabili
- Nel `ButtonProperties`: aggiungere lo stesso dropdown sotto il campo "Testo"

---

## 2. Blocchi dentro le Colonne (Column Children)

Attualmente le colonne nel canvas mostrano placeholder "Colonna 1", "Colonna 2" ma non permettono di aggiungere elementi al loro interno. L'utente non puo trascinare blocchi dentro le colonne.

### Implementazione

**File: `BuilderBlock.tsx`**
- Ogni colonna diventa un mini-canvas con un pulsante "+" per aggiungere elementi
- Al click su "+" si apre un piccolo menu (DropdownMenu) con la lista degli elementi disponibili (Testo, Immagine, Pulsante, etc.)
- L'elemento viene creato e aggiunto ai `children[colIndex]` del blocco colonne

**File: `DragDropEmailBuilder.tsx`**
- Aggiungere una funzione `handleAddChildBlock(parentBlockId: string, colIndex: number, childType: BlockType)` che:
  1. Trova il blocco colonne
  2. Crea un nuovo blocco figlio con `createBlock(childType)`
  3. Lo inserisce in `children[colIndex]`
  4. Aggiorna lo stato e triggera l'auto-save
- Aggiungere `handleDeleteChildBlock(parentBlockId: string, colIndex: number, childBlockId: string)` per rimuovere blocchi figli
- Aggiungere `handleUpdateChildBlockProps(parentBlockId: string, colIndex: number, childBlockId: string, partial)` per aggiornare le proprieta dei blocchi figli
- Passare queste funzioni al `BuilderCanvas` e poi al `BuilderBlock`

**File: `BuilderCanvas.tsx`**
- Passare le nuove callback per la gestione dei blocchi figli

**File: `BuilderBlock.tsx`**
- Nella sezione `case "columns"`, ogni colonna renderizza:
  - I blocchi figli esistenti con toolbar (elimina)
  - Un pulsante "+" in fondo per aggiungere nuovi elementi
  - Click su un blocco figlio seleziona quel blocco nel pannello proprieta

**File: `BuilderPropertiesPanel.tsx`**
- Il pannello deve poter mostrare le proprieta di un blocco figlio (non solo dei blocchi root)
- Aggiornare la logica di selezione per supportare `selectedBlock` che puo essere un figlio

---

## 3. Undo/Redo (Ctrl+Z / Ctrl+Y)

### Implementazione

**File: `DragDropEmailBuilder.tsx`**
- Creare un hook/logica di history con due stack: `undoStack` e `redoStack` (array di `BuilderBlock[]`)
- Ogni volta che `updateBlocks` viene chiamato, pushare lo stato **precedente** nell'`undoStack` e svuotare il `redoStack`
- Limitare la history a 50 step per evitare consumo memoria eccessivo
- Funzioni:
  - `handleUndo()`: pop dall'undoStack, push stato corrente nel redoStack, setBlocks
  - `handleRedo()`: pop dal redoStack, push stato corrente nell'undoStack, setBlocks
- Registrare un event listener `keydown` per:
  - `Ctrl+Z` (o `Cmd+Z` su Mac): chiama `handleUndo()`
  - `Ctrl+Y` (o `Cmd+Shift+Z` su Mac): chiama `handleRedo()`
- Aggiungere nella top bar due pulsanti icona (Undo/Redo) con stato disabled quando lo stack corrispondente e vuoto
- Le operazioni di undo/redo triggerano l'auto-save

---

## 4. Riepilogo File da Modificare

| File | Modifiche |
|------|-----------|
| `src/components/email-builder/builderTypes.ts` | Aggiungere costante `PERSONALIZATION_VARIABLES` condivisa |
| `src/components/email-builder/BuilderPropertiesPanel.tsx` | Dropdown variabili per testo e pulsante |
| `src/components/email-builder/BuilderBlock.tsx` | Pulsante "+" per aggiungere blocchi nelle colonne, click su figli per selezionarli, eliminazione figli |
| `src/components/email-builder/BuilderCanvas.tsx` | Passare callback per gestione blocchi figli |
| `src/pages/azienda/marketing/DragDropEmailBuilder.tsx` | Logica undo/redo con history stack, handler per blocchi figli nelle colonne, shortcut tastiera, pulsanti undo/redo nella top bar |

### Nessuna modifica database necessaria
