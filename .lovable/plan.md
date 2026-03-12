

# F3: PDF Preview, XML FatturaPA, SDI Submission

## Scope

Create 6 deliverables: PreviewFattura component, PDF generation (edge function HTML→PDF), XML FatturaPA 1.2 generator, SDI submission edge function, SDI webhook receiver, and CassettoSDI page.

## Architecture

### 1. `src/components/fatturazione/PreviewFattura.tsx`
Standalone, reusable A4 preview component with `scale` prop. Replaces the current `EditorPreviewPanel` internals (which will import PreviewFattura). Features:
- A4 container (210mm × min-297mm, 15mm padding, Inter 9pt)
- **Header**: logo + company details (left) / colored type badge + number + dates (right), using `anagrafica_azienda.colore_primario`
- **Client box**: bg-slate-50 rounded, with NC storno amber box and PA CIG/CUP blue box
- **Items table**: alternating rows, codice + note_riga sub-lines, natura code for 0% IVA
- **IVA summary + Totals**: side-by-side flex, with ritenuta/cassa/bollo lines
- **Payment block**: bg-slate-50, IBAN monospace, scadenze list
- **Notes + RF19 forfettario disclaimer** auto-shown
- **Footer**: company name + P.IVA left, platform credit right

Accepts `documento: EditorState` and `azienda: AnagraficaAzienda | null` as props. Update `EditorPreviewPanel` to just wrap `<PreviewFattura>`.

### 2. PDF Generation — Edge Function approach
Instead of `@react-pdf/renderer` (heavy client-side dependency, problematic in Vite), use an **edge function** `generate-native-pdf` that:
- Receives `documento_id`
- Loads document + anagrafica_azienda from DB
- Builds an HTML string matching PreviewFattura layout (reuse same HTML structure as existing `generate-invoice-pdf` pattern)
- Uses Deno's built-in or a lightweight HTML-to-PDF approach (same pattern as existing `generate-invoice-pdf`)
- Uploads to storage bucket `documenti-fiscali` at `{company_id}/{doc_id}/fattura.pdf`
- Updates `documenti_fiscali.pdf_url`
- Returns PDF as blob or URL

Client-side: `downloadPDF()` in `src/lib/fatturazione/generatePDF.ts` calls the edge function and triggers download.

### 3. `src/lib/fatturazione/generateXML.ts`
Client-side XML string builder for FatturaPA 1.2:
- `generateFatturaPAXML(doc, azienda)` → XML string
- `validateXML(xml)` → `ValidationError[]`
- Handles: FPA12/FPR12, DatiTrasmissione, CedentePrestatore (with IscrizioneREA), CessionarioCommittente, DatiGeneraliDocumento, DatiRitenuta, DatiBollo, DatiCassaPrevidenziale, ScontoMaggiorazione, DatiOrdineAcquisto, DatiDDT, DettaglioLinee, DatiRiepilogo, DatiPagamento, Allegati
- XML escaping for special chars

### 4. `supabase/functions/invia-sdi/index.ts`
- Auth via shared `requireAuth`
- Loads document, validates stato='emessa', generates XML server-side
- Saves XML to storage `fatture-xml/{company_id}/IT{piva}_{numero}.xml`
- Routes to provider: 'aruba' → API call with AbortController 30s timeout; 'manuale' → just save XML
- Updates `documenti_fiscali`: stato='inviata_sdi', sdi_id_trasmissione, sdi_file_xml_url
- Inserts `sdi_log` entry
- Error handling: keeps stato='emessa', updates sdi_errori

Config: `verify_jwt = false` in config.toml (auth in code).

### 5. `supabase/functions/sdi-webhook/index.ts`
- Public endpoint, `verify_jwt = false`
- Parses XML body for notification type (RC/NS/MC/EC/DT)
- Maps to stato transitions
- Requires `BILLING_WEBHOOK_SECRET` — rejects with 401 if not set
- Logs full xml_content to `sdi_log`

### 6. `src/pages/azienda/fatturazione/CassettoSDI.tsx`
- 4 KPI cards (Trasmesse/Consegnate/Scartate/In attesa)
- Filterable table of SDI-submitted documents with status badges
- Row actions: Scarica XML, Scarica Ricevuta, Reinvia
- Links to AdE portals
- Route: `/azienda/documenti/cassetto-sdi`

### 7. Storage bucket
Create `documenti-fiscali` and `fatture-xml` buckets via migration (storage API).

## Files to create/modify

| File | Action |
|------|--------|
| `src/components/fatturazione/PreviewFattura.tsx` | Create — reusable A4 preview |
| `src/pages/azienda/fatturazione/editor/EditorPreviewPanel.tsx` | Simplify — wrap PreviewFattura |
| `src/lib/fatturazione/generatePDF.ts` | Create — client helper calling edge fn |
| `src/lib/fatturazione/generateXML.ts` | Create — FatturaPA 1.2 XML builder |
| `supabase/functions/generate-native-pdf/index.ts` | Create — HTML→PDF edge function |
| `supabase/functions/invia-sdi/index.ts` | Create — SDI submission |
| `supabase/functions/sdi-webhook/index.ts` | Create — SDI webhook receiver |
| `src/pages/azienda/fatturazione/CassettoSDI.tsx` | Create — SDI dashboard page |
| `src/routes/companyRoutes.tsx` | Add CassettoSDI route |
| `supabase/config.toml` | Add verify_jwt=false for new functions |

Database migration: create storage buckets `documenti-fiscali` and `fatture-xml` with RLS.

