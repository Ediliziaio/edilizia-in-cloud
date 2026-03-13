

## Piano: Selezione multipla con azioni in blocco + ricerca full-text

### 1. Selezione multipla in `DocumentiFiscaliList.tsx`

Aggiungere:
- State `selectedIds: Set<string>` e logica toggle/toggleAll
- Colonna checkbox come prima colonna della tabella (header con "seleziona tutti", righe con checkbox individuale)
- Barra azioni in blocco (sticky, sopra la tabella) quando `selectedIds.size > 0`:
  - **Esporta XLS** — esporta i documenti selezionati
  - **Segna pagati** — solo se tab non è cestino, con conferma AlertDialog
  - **Elimina** — con conferma AlertDialog
  - **Pulsante "Deseleziona"** con conteggio
- Reset selezione al cambio tab, cambio filtri, cambio pagina
- Import `Checkbox` da `@/components/ui/checkbox`

### 2. Barra azioni in blocco (inline, non componente separato)

Renderizzata tra i filtri e la tabella quando `selectedIds.size > 0`. Stile: `bg-muted/50 border rounded-lg px-4 py-2.5` con:
- `{count} selezionati`
- Button "Esporta" → chiama export XLS con solo i doc selezionati
- Button "Segna pagati" → AlertDialog conferma → `updateMutation` per ogni id con stato "pagata"
- Button "Elimina" → AlertDialog conferma → `deleteMutation` per ogni id
- Button ghost "×" per deselezionare

### 3. Ricerca full-text migliorata

La ricerca nel hook `useDocumentiFiscali` (riga 110) già include `cliente_snapshot->>ragione_sociale`. Verificare che funzioni correttamente con il path JSONB. Aggiungere anche ricerca su `cliente_snapshot->>codice_fiscale` e `cliente_snapshot->>partita_iva` per completezza.

**File modificati:**
- `src/pages/azienda/fatturazione/DocumentiFiscaliList.tsx` — checkbox, bulk bar, reset selezione
- `src/hooks/useDocumentiFiscali.ts` — estendere `.or()` con campi aggiuntivi dalla snapshot

