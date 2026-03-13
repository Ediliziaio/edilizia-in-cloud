

## Piano: INT-04 — Prima Nota Auto-generazione da Fatturazione

### Analisi critica — Adattamenti rispetto alla spec

La spec propone di creare un sistema completamente nuovo (`piano_conti`, `prima_nota_scritture`, `prima_nota_righe`) con partita doppia. Tuttavia il progetto ha **già** un sistema Prima Nota funzionante basato sulla tabella `prima_nota_entries` con logica entrata/uscita semplice (contabilità semplificata). Creare un sistema parallelo di partita doppia causerebbe confusione e duplicazione.

**Decisione**: Non creare tabelle nuove. Invece, estendere il sistema `prima_nota_entries` esistente con trigger che auto-generano entries quando:
1. Una fattura viene emessa (stato → `emessa`)
2. Un incasso viene registrato in `movimenti_cassa_native`
3. Una nota di credito viene emessa (storno)

| Spec propone | Realtà | Azione |
|---|---|---|
| `piano_conti` (nuova tabella) | Non necessario per contabilità semplificata | Non creare |
| `prima_nota_scritture` + `prima_nota_righe` | `prima_nota_entries` già esiste | Usare tabella esistente |
| `incassi_fattura` | Non esiste (INT-02 usa `movimenti_cassa_native`) | Trigger su `movimenti_cassa_native` |
| `documenti_fiscali.totale` | `totale_da_pagare` | Usare campo corretto |
| `documenti_fiscali.numero_documento` | `numero` | Usare campo corretto |
| `documenti_fiscali.data_documento` | `data_emissione` | Usare campo corretto |
| `documenti_fiscali.tipo_documento` | `tipo` | Usare campo corretto |

---

### 1. Migration SQL

**Trigger 1: `trg_prima_nota_on_fattura_emessa`** — su `documenti_fiscali` AFTER UPDATE
- Quando `stato` passa da `bozza` a `emessa` e `tipo` è fattura (non DDT, non preventivo)
- Inserisce in `prima_nota_entries`: direction=`uscita` (per costi) o `entrata` (per ricavi), category=`incasso`, is_auto=true, auto_source=`fattura_emessa`, invoice_id=documento.id
- Descrizione: "Fattura n. {numero} emessa"
- Amount: `totale_da_pagare`

**Trigger 2: `trg_prima_nota_on_incasso`** — su `movimenti_cassa_native` AFTER INSERT
- Inserisce in `prima_nota_entries`: direction=`entrata`, category=`incasso`, is_auto=true, auto_source=`incasso_fattura`, invoice_id=movimento.documento_id
- Descrizione: "Incasso fattura n. {numero}"

**Trigger 3: `trg_prima_nota_on_nota_credito`** — su `documenti_fiscali` AFTER UPDATE
- Quando `tipo` = `nota_credito` e stato diventa `emessa`
- Inserisce scrittura di storno: direction=`uscita`, category=`incasso`, is_auto=true, auto_source=`nota_credito`
- Amount negativo (storno)

### 2. UI: Aggiornare pagina Prima Nota

Aggiornare `src/pages/azienda/PrimaNota.tsx`:
- Aggiungere filtro toggle "Tutte / Automatiche / Manuali" (filtra su `is_auto`)
- Aggiungere filtro per `auto_source` (fattura_emessa, incasso_fattura, nota_credito, manuale)
- Badge "Auto" sulle righe generate automaticamente (già presente con icona Bot)
- Link cliccabile alla fattura quando `invoice_id` è presente → naviga a `/azienda/documenti/{id}`

### 3. Aggiornare hook `usePrimaNota`

- Aggiungere filtro `is_auto` e `auto_source` ai parametri
- Join su `documenti_fiscali` per mostrare numero fattura nelle righe auto-generate

---

### File da creare/modificare

| File | Azione |
|---|---|
| Migration SQL | 3 trigger su `documenti_fiscali` e `movimenti_cassa_native` |
| `src/hooks/usePrimaNota.ts` | Aggiungere filtri is_auto, auto_source, join documenti_fiscali |
| `src/pages/azienda/PrimaNota.tsx` | Toggle Tutte/Auto/Manuali, link fattura, badge auto_source |

