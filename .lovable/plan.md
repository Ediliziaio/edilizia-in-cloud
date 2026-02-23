

# Stabilizzazione Email Builder - QA Report

## Analisi Completata

Ho analizzato tutti i file del modulo email builder (`builderTypes.ts`, `BuilderSidebar.tsx`, `BuilderBlock.tsx`, `BuilderCanvas.tsx`, `BuilderPropertiesPanel.tsx`, `DragDropEmailBuilder.tsx`, `builderHtmlGenerator.ts`) e la console del browser.

---

## 1. Bug Trovati

### Bug 1: Cambio layout colonne non sincronizza l'array children
Quando l'utente modifica il layout nelle proprieta (es. da "2 colonne" a "3 colonne"), solo `props.layout` viene aggiornato ma l'array `children` resta con il vecchio numero di colonne. I blocchi aggiunti nelle vecchie colonne possono andare persi o la nuova colonna rimane inaccessibile.

**Fix**: Intercettare il cambio layout in `DragDropEmailBuilder.tsx` (dentro `handleUpdateBlockProps`): se il blocco e di tipo `columns` e il layout cambia, ricalcolare e adattare l'array `children` al nuovo numero di colonne (aggiungendo array vuoti o preservando quelli esistenti).

### Bug 2: Import inutilizzato `Columns` in BuilderBlock.tsx
L'import `Columns` da lucide-react non e usato nel file.

**Fix**: Rimuovere l'import.

### Bug 3: Console warning "Function components cannot be given refs" su BuilderPropertiesPanel
Il warning proviene dal rendering di `BuilderPropertiesPanel` come componente funzionale dove React tenta di passare un ref.

**Fix**: Nessun impatto funzionale, ma per pulizia console si puo wrappare con `React.forwardRef` oppure verificare che nessun parent stia passando ref implicitamente.

---

## 2. Pulizia Codice

| File | Azione |
|------|--------|
| `BuilderBlock.tsx` | Rimuovere import `Columns` (non usato) |

---

## 3. Miglioramento UX: Sincronizzazione Layout

Quando l'utente cambia il layout delle colonne nel pannello proprieta, i blocchi figli nelle colonne esistenti devono essere preservati e le nuove colonne devono apparire vuote. Se il numero di colonne diminuisce, i blocchi figli "orfani" vengono spostati nell'ultima colonna disponibile.

---

## Riepilogo Modifiche

| File | Modifica |
|------|----------|
| `src/components/email-builder/BuilderBlock.tsx` | Rimuovere import `Columns` inutilizzato |
| `src/pages/azienda/marketing/DragDropEmailBuilder.tsx` | Aggiungere logica di riadattamento children quando cambia il layout colonne in `handleUpdateBlockProps` |

### Nessuna modifica database necessaria

