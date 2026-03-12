

# F2 Enhancement: Advanced Document Editor

## Current State
A basic editor exists with tabs (Cliente/Righe/Pagamento/Note), simple inputs, and a preview panel. It works but is far from the Fatture in Cloud-level quality requested.

## Key Gaps vs Requirements

| Area | Current | Required |
|------|---------|----------|
| Layout | Tabs hiding sections | Continuous scroll with all sections visible |
| ClienteSelector | Basic search + card | Avatar, accordion details, "Crea nuovo", "Cliente occasionale" |
| Dati Documento | Missing entirely | Tipo doc select, serie, valuta, DDT reference |
| RigheEditor | Basic table, no drag | Drag reorder (@dnd-kit), expanded row details, IVA natura submenu, duplicate |
| TotaliSection | Inline `fmt()` | Use `formatCurrency`, auto-suggest bollo, sticky footer |
| Pagamento | Basic IBAN + date | Scadenze multiple, preset chips, IBAN validation, auto-fill from azienda |
| Note | Basic textareas | CIG/CUP for PA, causali tags, allegati dropzone |
| TopBar | Minimal | Status badge, fullscreen preview, "..." menu |
| Validation | None | `validateDocumento()` with error list |
| Emetti | No confirmation | Confirmation dialog |
| Currency | `€${x.toFixed(2)}` | `formatCurrency()` from `src/lib/formatters.ts` |

## Plan

### 1. Create `src/lib/fatturazione/calcoli.ts`
Extract calculation logic from `useEditorState.ts` into a dedicated module:
- `calcolaRiga(riga)` — single row calculation
- `calcolaTotaliDocumento(righe, options)` — full document totals
- `calcolaRiepilogoIVA(righe, proportionalDiscount)` — IVA grouping
- `validateDocumento(doc)` — returns `ValidationError[]` array

### 2. Rewrite `useEditorState.ts`
- Import calculation functions from `calcoli.ts`
- Keep reducer actions but delegate math to the extracted module
- No logic change, just cleaner separation

### 3. Rewrite `EditorDocumento.tsx` — continuous scroll layout
- Remove tabs, show all sections in a single scrollable left panel
- Add sticky totals footer at bottom of left panel
- Keep 50/50 split with preview

### 4. Enhance `EditorTopBar.tsx`
- Add status badge (bozza/emessa/etc) with color
- Add "..." dropdown menu (Duplica, Scarica PDF, Stampa)
- Add fullscreen preview button
- Use `formatDistanceToNow` for "Salvata Xm fa"
- Add confirmation AlertDialog for Emetti

### 5. Rewrite `EditorClienteSection.tsx`
- Collapsed state: gradient card, avatar with 2-letter initials, "Cambia" button
- Collapsible "Dettagli fiscali" accordion (SDI, PEC, tipo)
- Expanded: dashed border, search with debounce, results with avatar+name+PIVA+tipo badge
- Footer: "+ Crea nuovo cliente" button, "Cliente occasionale" manual input
- CIG/CUP auto-shown for PA (move from Note)

### 6. Add `EditorDatiDocumento.tsx` (new section)
- Grid: Tipo Documento select (TD01-TD25), Numero (readonly), Serie input
- Grid: Data Emissione (DatePicker), Data Scadenza (DatePicker, red if past), Valuta select
- Conditional: amber info box for fattura differita TD24/TD25 with DDT reference

### 7. Rewrite `EditorRigheSection.tsx`
- Add @dnd-kit/sortable for drag reorder
- IVA column: proper Select with 22/10/5/4/0% + natura submenu when 0%
- U.M.: compact Select (pz/h/gg/mese/km/kg/l/m/m²/m³/kWh/%)
- Row actions on hover: expand chevron, duplicate, delete
- Collapsible row details: codice articolo, sconto €, riferimento amm., tipo cessione, note, ritenuta toggle
- Footer: "+ Aggiungi riga", "Da catalogo", "+ Riga descrittiva"
- Use `formatCurrency` for totals

### 8. Enhance `EditorTotaliSection.tsx` → sticky footer
- Auto-suggest bollo if totale > €77.47 and all lines exempt
- Use `formatCurrency` instead of inline `fmt()`
- Show validation errors list (red) above emit button
- Make it sticky at bottom of left panel

### 9. Rewrite `EditorPagamentoSection.tsx`
- Grouped payment method select
- Auto-fill IBAN/BIC/banca from `anagrafica_azienda`
- Quick preset chips: "30gg", "60gg", "90gg", "30/60gg", "30/60/90gg"
- Multiple scadenze rows: date + importo + metodo + "segna pagata" + delete
- Warning banner if SUM ≠ totale_da_pagare with "Distribuisci automaticamente" button
- Italian IBAN format validation

### 10. Enhance `EditorNoteSection.tsx`
- Add causali tag input (Enter to add)
- Keep note_documento and note_interne textareas

### 11. Enhance `EditorPreviewPanel.tsx`
- Use `formatCurrency` instead of `toLocaleString`
- Show sconto if present, cassa previdenziale line
- Show payment schedule details
- Show CIG/CUP for PA

## Files to create/modify

| File | Action |
|------|--------|
| `src/lib/fatturazione/calcoli.ts` | Create — extracted calculations + validation |
| `src/pages/azienda/fatturazione/EditorDocumento.tsx` | Rewrite — continuous scroll, sticky footer |
| `src/pages/azienda/fatturazione/editor/useEditorState.ts` | Refactor — use calcoli.ts |
| `src/pages/azienda/fatturazione/editor/EditorTopBar.tsx` | Enhance — status badge, menu, confirm dialog |
| `src/pages/azienda/fatturazione/editor/EditorClienteSection.tsx` | Rewrite — avatar, accordion, create new |
| `src/pages/azienda/fatturazione/editor/EditorDatiDocumento.tsx` | Create — tipo/numero/serie/date/valuta |
| `src/pages/azienda/fatturazione/editor/EditorRigheSection.tsx` | Rewrite — drag, IVA select, row details |
| `src/pages/azienda/fatturazione/editor/EditorTotaliSection.tsx` | Enhance — sticky, formatCurrency, validation errors |
| `src/pages/azienda/fatturazione/editor/EditorPagamentoSection.tsx` | Rewrite — scadenze, presets, auto-fill |
| `src/pages/azienda/fatturazione/editor/EditorNoteSection.tsx` | Enhance — causali tags |
| `src/pages/azienda/fatturazione/editor/EditorPreviewPanel.tsx` | Enhance — formatCurrency, more detail |

No database changes needed.

