

# F5: Lista Documenti, Proforma, Preventivi, Impostazioni, Report

## Current State
- `DocumentiFiscaliList.tsx` is a placeholder with no functionality
- `DocumentoDetail.tsx` exists with basic NC/PDF/XML actions but no proforma/preventivo logic, no SDI timeline, no 60/40 layout
- Sidebar (`sidebarConfig.ts`) shows "Fatturazione" and "Scadenzario" for external mode; no native billing entries
- No `ImpostazioniFatturazione`, `ReportFatturazione`, `PipelinePreventivi`, or `AccettaPreventivo` pages
- No `proforma.ts` utility
- Routes exist for core native billing but missing report, settings, preventivi pipeline, and public acceptance

## Plan

### 1. Rewrite `DocumentiFiscaliList.tsx` — Main Dashboard
- Header with "Nuova Fattura" dropdown (Fattura/NC/Pro-Forma/Preventivo/DDT/Fattura PA)
- 4 KPI cards querying `documenti_fiscali` with aggregates (fatturato mese, da incassare, scadute, bozze)
- Filter bar: type tabs, status multiselect chips, date range presets, search input
- Paginated table (25/page) with colored status badges, row action dropdown (Visualizza/Modifica/Duplica/PDF/XML/NC/Segna pagata/Elimina)
- Empty state with CTA

### 2. Enhance `DocumentoDetail.tsx` — Full Detail Page
- 60/40 split layout: left PreviewFattura at scale=0.8, right info/SDI/payments/linked docs cards
- Context-aware action buttons per stato
- SDI Timeline from `sdi_log` table (vertical timeline with icons)
- Payment progress bar with "Registra incasso" button
- Linked documents card (documento_correlato, DDTs)
- Proforma: "NON FISCALE" red banner + "Converti in Fattura" button
- Preventivo: "Accettato/Rifiutato" buttons, "Converti in Fattura", acceptance link generation

### 3. Create `src/lib/fatturazione/proforma.ts`
- `convertiProformaInFattura(proformaId)`: loads proforma, creates new fattura with same data, marks proforma as 'annullata'

### 4. Create `PipelinePreventivi.tsx` — Kanban Board
- Columns: Bozza / Inviato / In trattativa / Accettato / Perso
- Cards with cliente, importo, data, probabilita badge
- @dnd-kit drag-and-drop to change stato
- KPI header: Win rate %, Valore pipeline, Valore medio

### 5. Create `AccettaPreventivo.tsx` — Public Page
- Route: `/preventivo/:id` (public, no auth)
- Edge function `genera-link-preventivo` creates signed URL (JWT with 7-day expiry)
- Shows read-only preview + Accept/Reject buttons
- Calls edge function to update stato and notify company

### 6. Create `ImpostazioniFatturazione.tsx` — Native Settings
- 5 tabs: Azienda / Numeratori / Template PDF / Integrazioni SDI / Avanzate
- Azienda: full `anagrafica_azienda` form with logo upload
- Numeratori: prefix + next number per tipo with format preview
- Template PDF: 4 template cards + color picker + toggles + live PreviewFattura
- SDI: provider select + API key + test connection button
- Avanzate: IVA per cassa, split payment PA, bollo automatico toggles

### 7. Create `ReportFatturazione.tsx` — Reports
- Area chart: fatturato mensile 12 mesi (recharts)
- Grouped bar: Fatturato vs Incassato
- Horizontal bar: top 10 clienti
- Liquidazione IVA table with disclaimer
- Export buttons: Registro IVA CSV, Export Fatture Excel, Prima Nota CSV

### 8. Update Sidebar Navigation
- In `sidebarConfig.ts`: conditionally show native billing links when mode='native' (Fatturazione→/azienda/documenti, DDT, Preventivi, Anagrafica, Articoli, Registro Incassi, Cassetto SDI, Report)
- The sidebar uses `useBillingMode` to swap between external and native nav items in the Finanza subcategory

### 9. Route Additions
```
/azienda/documenti/preventivi/pipeline → PipelinePreventivi
/azienda/documenti/report → ReportFatturazione
/azienda/impostazioni/fatturazione-nativa → ImpostazioniFatturazione
/preventivo/:id → AccettaPreventivo (public, outside CompanyLayout)
```

### 10. Edge Functions
- `genera-link-preventivo`: creates signed JWT token, returns URL
- `accetta-preventivo`: validates token, updates documento stato, logs

## Files

| File | Action |
|------|--------|
| `src/pages/azienda/fatturazione/DocumentiFiscaliList.tsx` | Rewrite — full dashboard |
| `src/pages/azienda/fatturazione/DocumentoDetail.tsx` | Enhance — 60/40 layout, SDI timeline, proforma/preventivo |
| `src/lib/fatturazione/proforma.ts` | Create |
| `src/pages/azienda/fatturazione/PipelinePreventivi.tsx` | Create |
| `src/pages/public/AccettaPreventivo.tsx` | Create |
| `src/pages/azienda/fatturazione/ImpostazioniFatturazione.tsx` | Create |
| `src/pages/azienda/fatturazione/ReportFatturazione.tsx` | Create |
| `src/lib/sidebarConfig.ts` | Add native billing nav items |
| `src/components/layouts/CompanyLayout.tsx` | Conditionally render native vs external nav |
| `src/routes/companyRoutes.tsx` | Add 4 new routes |
| `supabase/functions/genera-link-preventivo/index.ts` | Create |
| `supabase/functions/accetta-preventivo/index.ts` | Create |

No database migrations needed. Existing billing files remain untouched.

