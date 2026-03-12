

# F2: Document Editor — EditorDocumento

## Overview
Build a full-height split-screen document editor for native billing. Left panel: scrollable form with tabs (Cliente, Righe, Pagamento, Note). Right panel: live invoice preview rendered as a styled HTML "PDF". Top bar: document info, autosave status, action buttons.

## Architecture

Given the complexity, the editor will be split into multiple focused files:

```text
src/pages/azienda/fatturazione/
├── EditorDocumento.tsx          ← main page (layout + state orchestration)
├── editor/
│   ├── EditorTopBar.tsx         ← doc type badge, number, autosave indicator, actions
│   ├── EditorClienteSection.tsx ← client picker + snapshot display
│   ├── EditorRigheSection.tsx   ← line items table with add/remove/reorder
│   ├── EditorPagamentoSection.tsx ← payment method, due dates, IBAN
│   ├── EditorNoteSection.tsx    ← notes, causale, internal notes
│   ├── EditorTotaliSection.tsx  ← subtotal, discount, VAT, withholding, stamp, total
│   ├── EditorPreviewPanel.tsx   ← live HTML invoice preview (right panel)
│   └── useEditorState.ts       ← local state management hook with autosave
```

## Component Details

### 1. `EditorDocumento.tsx` (main page)
- Route: `/azienda/documenti/nuovo` (create) or `/azienda/documenti/:id` (edit)
- Uses `useParams` to detect create vs edit mode
- On create: calls `useCreateDocumento` immediately with `tipo` from query param, then redirects to `/azienda/documenti/:newId`
- On edit: loads doc via `useDocumentoFiscale(id)`
- Layout: `flex h-screen` with a fixed top bar and two side-by-side panels below using CSS `flex` (no need for `react-resizable-panels` — simple 50/50 split with `w-1/2`)
- Passes document state down to sub-components

### 2. `useEditorState.ts` (custom hook)
- Holds local document state as a `useReducer` with actions: `SET_FIELD`, `SET_CLIENTE`, `ADD_RIGA`, `UPDATE_RIGA`, `REMOVE_RIGA`, `REORDER_RIGHE`, `SET_PAGAMENTO`, `RECALCULATE`
- `RECALCULATE` action: recomputes subtotale, imponibile, IVA, riepilogo_iva, bollo, ritenuta, totale_da_pagare from righe
- Autosave: `useEffect` with 2-second debounce calling `useUpdateDocumento` on every state change (skips if doc is not `bozza`)
- Exposes `isDirty`, `isSaving`, `lastSaved` for the top bar indicator

### 3. `EditorTopBar.tsx`
- Badge showing document type (Fattura, NC, DDT, etc.) with color coding
- Document number (read-only)
- Date picker for `data_emissione`
- Autosave indicator: "Salvato" / "Salvataggio..." / "Non salvato" with dot
- Action buttons: "Emetti" (calls `useEmittiDocumento`), "Elimina" (only for bozza), "Scarica PDF", back nav

### 4. `EditorClienteSection.tsx`
- Combobox to search `anagrafiche_native` by ragione_sociale/partita_iva
- On select: populates `anagrafica_id` + builds `cliente_snapshot` from the anagrafica record
- Shows snapshot card with address, P.IVA, CF, SDI, PEC
- For PA clients: shows CIG/CUP fields

### 5. `EditorRigheSection.tsx`
- Table with columns: #, Descrizione, Qtà, U.M., Prezzo, Sconto%, IVA, Totale, Actions
- Add row button: can pick from `articoli_native` catalog or add blank row
- Inline editing for all cells
- Row remove button
- Each row change triggers `RECALCULATE` in reducer
- Row totals: `imponibile = (prezzo * qtà) - sconto`, `imposta = imponibile * aliquota/100`

### 6. `EditorTotaliSection.tsx`
- Read-only computed summary below righe:
  - Subtotale, Sconto globale (editable %), Imponibile, IVA breakdown by rate, Bollo (toggle), Ritenuta (toggle + config), Cassa previd. (toggle + config), **Totale documento**, **Totale da pagare**

### 7. `EditorPagamentoSection.tsx`
- Select for `metodo_pagamento_codice` (from `METODI_PAGAMENTO_SDI`)
- IBAN, BIC, banca fields (auto-filled from `anagrafica_azienda`)
- Payment schedule: date + amount per installment

### 8. `EditorNoteSection.tsx`
- Textarea for `note_documento` and `note_interne`

### 9. `EditorPreviewPanel.tsx`
- Renders a styled HTML representation of the invoice that looks like a PDF
- Uses the document state to render: company header (from `anagrafica_azienda`), client block, line items table, VAT summary, totals, payment info, notes
- Updates reactively on every state change
- Styled with print-friendly CSS (A4 aspect ratio container)
- Needs a hook `useAnagraficaAzienda` to fetch emitter data

## New Hooks Needed

### `useAnagraficheNative.ts`
- `useAnagraficheNative(filters)` — list anagrafiche for the company (for client picker)
- `useAnagraficaNative(id)` — single record

### `useAnagraficaAzienda.ts`
- `useAnagraficaAzienda()` — fetch the company's emitter profile (for preview header)

### `useArticoliNative.ts`
- `useArticoliNative()` — list catalog items (for row picker)

## Route Update

In `companyRoutes.tsx`, update the existing stub routes:
- `/azienda/documenti/nuovo` → `EditorDocumento` (create mode)
- `/azienda/documenti/:id` → `EditorDocumento` (edit mode)

## Files to create/modify

| File | Action |
|------|--------|
| `src/pages/azienda/fatturazione/EditorDocumento.tsx` | Create — main page |
| `src/pages/azienda/fatturazione/editor/useEditorState.ts` | Create — reducer + autosave |
| `src/pages/azienda/fatturazione/editor/EditorTopBar.tsx` | Create |
| `src/pages/azienda/fatturazione/editor/EditorClienteSection.tsx` | Create |
| `src/pages/azienda/fatturazione/editor/EditorRigheSection.tsx` | Create |
| `src/pages/azienda/fatturazione/editor/EditorTotaliSection.tsx` | Create |
| `src/pages/azienda/fatturazione/editor/EditorPagamentoSection.tsx` | Create |
| `src/pages/azienda/fatturazione/editor/EditorNoteSection.tsx` | Create |
| `src/pages/azienda/fatturazione/editor/EditorPreviewPanel.tsx` | Create |
| `src/hooks/useAnagraficheNative.ts` | Create — client CRUD hook |
| `src/hooks/useAnagraficaAzienda.ts` | Create — emitter profile hook |
| `src/hooks/useArticoliNative.ts` | Create — catalog items hook |
| `src/lib/queryKeys.ts` | Add keys for anagrafiche, articoli, anagrafica_azienda |
| `src/routes/companyRoutes.tsx` | Update stub routes to point to EditorDocumento |

No database changes needed — all tables already exist from F1.

