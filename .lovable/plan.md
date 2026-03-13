

## Piano: INT-02 — Fattura ↔ Ordine ↔ Incasso

### Adattamenti critici rispetto alla spec

La spec fa riferimento a tabelle/colonne inesistenti che vanno corrette:

| Spec dice | Realtà nel DB | Azione |
|---|---|---|
| `ordini` | `orders` | Usare `orders` |
| `conti_bancari` | Non esiste | Rimuovere FK, campo opzionale stringa |
| `documenti_fiscali.totale` | `totale_da_pagare` | Usare campo corretto |
| `documenti_fiscali.scadenza_pagamento` | `data_scadenza` | Usare campo corretto |
| `documenti_fiscali.deleted_at` | Non esiste | Filtrare per `stato != 'annullata'` |
| `documenti_fiscali.tipo_documento` | `tipo` | Usare campo corretto |
| `documenti_fiscali.numero_documento` | `numero` | Usare campo corretto |
| `documenti_fiscali.data_documento` | `data_emissione` | Usare campo corretto |
| `incassi_fattura` (nuova tabella) | `movimenti_cassa_native` (esiste già) | **Non creare tabella parallela** — estendere `movimenti_cassa_native` |

### Decisione chiave: Incassi

Il sistema ha già `movimenti_cassa_native` che registra incassi legati a `documento_id`. Creare `incassi_fattura` creerebbe un sistema parallelo e duplicato. Invece:
- Usiamo `movimenti_cassa_native` come tabella incassi (è già collegata a `documenti_fiscali` via `documento_id`)
- Creiamo solo la **view** `fattura_pagamento_stato` che aggrega i dati da `movimenti_cassa_native`
- Il trigger di aggiornamento stato fattura su incasso **già esiste** nella logica di `useCreateMovimento` (client-side) — lo migriamo a un trigger DB per coerenza

---

### 1. Migration SQL

**Creare:**
- Tabella `fattura_ordine` (many-to-many tra `documenti_fiscali` e `orders`) con RLS company-scoped
- Colonna `ordine_id` su `documenti_fiscali` (shortcut 1:1)
- View `fattura_pagamento_stato` basata su `movimenti_cassa_native` (non `incassi_fattura`)
- Trigger `trg_update_fattura_stato_on_movimento` su `movimenti_cassa_native` per aggiornare automaticamente lo stato della fattura

**Non creare** `incassi_fattura` — usare `movimenti_cassa_native` esistente.

### 2. Types (`src/types/fatturazione.ts`)

Aggiungere:
- `FatturaOrdineLink` interface
- `FatturaPagamentoStato` interface
- `ordine_id?: string` a `DocumentoFiscale`

### 3. Hook `useFatturaOrdineLink.ts` (nuovo)

- `useOrdiniByFattura(fatturaId)` — join su `fattura_ordine` → `orders`
- `useFattureByOrdine(ordineId)` — join inverso + shortcut `ordine_id`
- `useLinkFatturaOrdine()` — mutation upsert
- `useUnlinkFatturaOrdine()` — mutation delete

### 4. Hook `useFatturaPagamentoStato.ts` (nuovo)

- `useFatturaPagamentoStato(fatturaId)` — query sulla view

### 5. UI: Sezione Ordine Collegato nell'Editor Fattura

In `EditorDocumento.tsx`, aggiungere sotto la sezione cliente una card "Ordine collegato" con:
- Combobox per cercare e selezionare un ordine da `orders`
- Badge con ordine collegato e pulsante scollega
- Pre-compilazione automatica se `?ordine=ID` nei search params

### 6. UI: Sezione Pagamenti nel Dettaglio Fattura

Nell'`AnagraficaDetail.tsx` o nel futuro dettaglio fattura, aggiungere la progress bar pagamento con:
- Barra percentuale (incassato / totale)
- Lista movimenti da `movimenti_cassa_native`
- Il form di registrazione incasso già esiste via `useCreateMovimento`

### 7. UI: Tab Fatturazione nella pagina Ordine

In `OrderDetail.tsx`, aggiungere una card "Fatturazione" che mostra:
- KPI: totale fatturato, totale incassato, residuo
- Lista fatture collegate (da `fattura_ordine` + shortcut `ordine_id`)
- CTA "Crea fattura per questo ordine" → naviga a `/azienda/documenti/nuovo?ordine=ID`

### 8. Pre-compilazione Editor da Ordine

In `EditorDocumento.tsx`, leggere `searchParams.get('ordine')`:
- Fetch ordine con customer → anagrafica collegata (da INT-01 `cliente_id`)
- Pre-popolare `anagrafica_id`, `cliente_snapshot`, `ordine_id`
- Aggiungere causale "Ordine #CODE — DESCRIPTION"

---

### File da creare/modificare

| File | Azione |
|---|---|
| Migration SQL | Creare via migration tool |
| `src/hooks/billing/useFatturaOrdineLink.ts` | Creare |
| `src/hooks/billing/useFatturaPagamentoStato.ts` | Creare |
| `src/types/fatturazione.ts` | Aggiungere types + `ordine_id` |
| `src/pages/azienda/fatturazione/EditorDocumento.tsx` | Aggiungere pre-compilazione da ordine |
| `src/pages/azienda/fatturazione/editor/EditorOrdineSection.tsx` | Creare — combobox ordine collegato |
| `src/pages/azienda/OrderDetail.tsx` | Aggiungere card Fatturazione |
| `src/hooks/useDocumentiFiscali.ts` | Mappare `ordine_id` in `mapRow` |

