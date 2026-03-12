

# F4: Documenti Speciali, Registro Incassi, Anagrafica Avanzata

## Current State
- Editor handles all document types but lacks DDT-specific transport fields, NC creation flow from existing invoices, and fattura differita from DDT workflow
- No `DocumentoDetail` page exists (only `EditorDocumento` for editing)
- No `RegistroIncassi`, `DDTList`, `AnagraficheList`, or `AnagraficaDetail` pages
- `movimenti_cassa_native` table exists with company_id, documento_id, importo, tipo, metodo, riferimento, note, data_movimento
- `documenti_fiscali` table has all needed columns (documento_correlato_id, ddt_* fields, importo_pagato, etc.)
- Routes currently: `/documenti`, `/documenti/nuovo`, `/documenti/:id`, `/documenti/cassetto-sdi`

## Plan

### 1. `src/lib/fatturazione/noteCredito.ts` — NC utility functions
- `creaNotaCredito(fatturaOriginaleId, modalita)`: loads original invoice, returns prefilled NC document with negated quantities (totale) or empty righe (parziale), sets documento_correlato_id and reference note
- `applicaStornoSuFattura(fatturaId, importoNC)`: updates original invoice's importo_pagato and stato

### 2. `src/lib/fatturazione/fatturazioneAvanzata.ts` — DDT→Fattura utility
- `creaFatturaDaDDT(ddtIds)`: validates same client, aggregates righe from all DDTs, sets tipo='fattura' with TD24, populates riferimenti_ddt

### 3. `src/pages/azienda/fatturazione/DocumentoDetail.tsx` — Read-only detail page
- Shows emitted document info (header, client, righe, totals, payment status, SDI status)
- "Emetti Nota di Credito" button (visible when stato is emessa/consegnata/inviata_sdi/accettata/pagata/parzialmente_pagata)
- AlertDialog with "Storno totale" / "Storno parziale" options → calls `creaNotaCredito` → navigates to editor
- "Scarica PDF" and "Scarica XML" buttons
- Payment tracking section showing scadenze and importo_pagato

### 4. DDT-specific sections in `EditorDocumento`
- Conditionally render new `EditorDDTSection.tsx` when tipo='ddt'
- **Destinazione card**: toggle "Destinazione diversa" with address fields
- **Trasporto card**: causale, porto (Franco/Assegnato), aspetto beni, colli/peso/volume, vettore radio (mittente/destinatario/terzo), data/ora consegna
- NC amber banner in editor when tipo='nota_credito' showing original invoice reference and motivo select

### 5. `src/pages/azienda/fatturazione/DDTList.tsx`
- List of DDT documents with multi-select
- Filter: "Da fatturare" (amber) / "Fatturati" (emerald)
- "Crea fattura da DDT selezionati" button → calls `creaFatturaDaDDT` → navigates to editor

### 6. `src/pages/azienda/fatturazione/RegistroIncassi.tsx`
- 4 KPI cards (Incassato mese, Da incassare, Scaduto, Saldo netto)
- Table of movimenti_cassa_native with filters
- "Registra Incasso" side panel: fattura searchable select, auto-fill importo, data, metodo, riferimento, note
- On save: insert movimenti_cassa_native + update documenti_fiscali importo_pagato/stato
- **Scadenzario tab**: invoices sorted by data_scadenza with color-coded urgency bands

### 7. `src/pages/azienda/fatturazione/AnagraficheList.tsx`
- Tabs: Clienti / Fornitori / Tutti
- Search by nome/PIVA/email, filter by tipo_cliente, attivo toggle
- Table with avatar initials, fatturato YTD, bulk actions (export, disattiva)
- Import Excel: dropzone + column mapper + validation + upsert

### 8. `src/pages/azienda/fatturazione/AnagraficaDetail.tsx`
- Header with avatar, KPI row (fatturato, pagato, saldo aperto, n. fatture)
- Tabs: Dati (inline-edit form) / Fatture (filtered documenti_fiscali) / DDT / Movimenti / Note
- Financial position widget when fatturato > 0

### 9. Route additions in `companyRoutes.tsx`
```
documenti/:id/dettaglio → DocumentoDetail
documenti/ddt → DDTList
documenti/incassi → RegistroIncassi
documenti/anagrafiche → AnagraficheList
documenti/anagrafiche/:id → AnagraficaDetail
```

### 10. `src/hooks/useMovimentiCassa.ts` — CRUD hooks
- `useMovimentiCassa(filters)`: list with date range, tipo, documento_id filters
- `useCreateMovimento()`: insert + update linked invoice
- `useDeleteMovimento()`: delete + recalculate invoice importo_pagato

## Files

| File | Action |
|------|--------|
| `src/lib/fatturazione/noteCredito.ts` | Create |
| `src/lib/fatturazione/fatturazioneAvanzata.ts` | Create |
| `src/pages/azienda/fatturazione/DocumentoDetail.tsx` | Create |
| `src/pages/azienda/fatturazione/editor/EditorDDTSection.tsx` | Create |
| `src/pages/azienda/fatturazione/EditorDocumento.tsx` | Add DDT section + NC banner |
| `src/pages/azienda/fatturazione/DDTList.tsx` | Create |
| `src/pages/azienda/fatturazione/RegistroIncassi.tsx` | Create |
| `src/pages/azienda/fatturazione/AnagraficheList.tsx` | Create |
| `src/pages/azienda/fatturazione/AnagraficaDetail.tsx` | Create |
| `src/hooks/useMovimentiCassa.ts` | Create |
| `src/routes/companyRoutes.tsx` | Add 5 new routes |

No database migrations needed — all tables exist.

