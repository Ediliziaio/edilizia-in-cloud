

## Fix 4 Critical Billing Bugs

### Bug 1 — mapRow incompleto
`mapRow` in `useDocumentiFiscali.ts` is missing ~25 fields that exist in the DB and in `DocumentoFiscale` type. Fields like `sdi_data_consegna`, `pdf_url`, `allegati`, `bollo_importo`, `arrotondamento`, all DDT transport fields (`ddt_aspetto_beni`, `ddt_numero_colli`, `ddt_peso`, `ddt_mezzo_trasporto`, `ddt_data_ora_consegna`, `ddt_indirizzo_consegna`, `ddt_porto`, `ddt_vettore`), payment details (`bic_pagamento`, `nome_banca`, `intestatario_conto`, `metodo_pagamento_nome`), cassa details (`cassa_imponibile`, `cassa_aliquota_iva`, `cassa_ritenuta`), preventivo fields (`probabilita_chiusura`, `testo_intro`, `testo_conclusivo`), and `salesperson_id` are all silently dropped.

**Fix**: Add all missing field mappings to `mapRow` function.

### Bug 2 — Validazione NC nell'emissione
`useEmittiDocumento` rejects documents with `righe.length === 0`, which is correct for invoices but wrong for note di credito where lines intentionally have negative quantities. The current code doesn't differentiate — it blocks partial NC with zero lines (valid in parziale mode) and doesn't validate that NC lines should be negative.

**Fix**: Skip the `righe.length === 0` check when `tipo === "nota_credito"` and `modalita === "parziale"`. Actually, looking at the flow, partial NC starts with empty lines that the user fills in, so the check should simply allow NC to have zero or more lines, or at minimum skip the empty-lines check for NC.

### Bug 3 — Cestino "Elimina definitivamente" non funziona
When clicking "Elimina definitivamente" from trash, `handleAction("delete", doc)` sets `deleteTarget`. The delete dialog then checks `deleteTarget.stato === "bozza"` — for trash items (stato = "annullata"), it falls to the else branch which calls `updateMutation.mutate({ id: doc.id, stato: "annullata" })`, a no-op since it's already annullata. Permanent deletion never happens.

**Fix**: Add a third condition in the delete dialog: if `deleteTarget.stato === "annullata"`, perform a physical `.delete()` instead. Update `useDeleteDocumento` to accept annullata docs for permanent deletion, or handle it inline.

### Bug 4 — Autosave data_validita already present
Looking at `useEditorState.ts`, `data_validita` IS included in both the serialized change detection (line 199) and the autosave payload (line 246). This field appears correctly handled. However, the autosave is missing other fields that map to DB columns: `probabilita_chiusura`, `testo_intro`, `testo_conclusivo` (preventivo fields), and `salesperson_id`. These fields are changed in the editor but never persisted via autosave.

**Fix**: Add `probabilita_chiusura`, `testo_intro`, `testo_conclusivo` to both the serialization check and the autosave payload in `useEditorState.ts`.

### Files Modified
1. **`src/hooks/useDocumentiFiscali.ts`** — Complete mapRow with ~25 missing fields; update `useDeleteDocumento` to allow permanent deletion of annullata docs; update `useEmittiDocumento` to skip righe check for NC
2. **`src/pages/azienda/fatturazione/editor/useEditorState.ts`** — Add missing preventivo fields to autosave serialization and payload
3. **`src/pages/azienda/fatturazione/DocumentiFiscaliList.tsx`** — Fix delete dialog to handle permanent deletion of annullata docs (physical delete)

