

# Piano: Completamento Funzionalita Core Mancanti

## Stato Attuale

Le fasi 1-5 precedenti hanno stabilizzato l'applicazione: bug critici corretti, validazioni aggiunte, alert finanziari implementati, UX migliorata. Il flusso ordine-margine-cashflow funziona end-to-end.

## Gap Identificati rispetto ai Requisiti

Dopo audit completo del codebase, restano queste funzionalita mancanti:

### GAP 1: Catalogo Articoli/Prodotti strutturato
**Situazione attuale:** Esiste solo `article_templates` con un campo `name`. Manca un vero catalogo prodotti con SKU, categoria, prezzo vendita, costo standard, unita di misura, aliquota IVA.

**Impatto:** Senza un catalogo strutturato, ogni articolo viene inserito manualmente in ogni ordine senza prezzo di riferimento. Impossibile calcolare il "margine previsto" (basato su costi standard) vs "margine consuntivo" (costi reali).

### GAP 2: Margine Previsto vs Consuntivo
**Situazione attuale:** Il Conto Economico (`OrderEconomics.tsx`) calcola solo il margine consuntivo (basato sui costi effettivi). Non esiste un confronto con i costi standard/previsti.

**Impatto:** L'azienda non puo vedere gli scostamenti tra quanto preventivato e quanto effettivamente speso.

### GAP 3: Prezzo di vendita per riga ordine
**Situazione attuale:** L'ordine ha un `total_amount` globale ma le singole righe non hanno un prezzo di vendita unitario (`unit_price`), sconto, o totale riga. Questo rende impossibile calcolare il margine per singolo articolo.

### GAP 4: Generazione PDF (preventivo/conferma ordine)
**Situazione attuale:** Non esiste alcuna generazione PDF. Il previsionale usa `window.print()`. Nessun preventivo o conferma d'ordine generabile.

### GAP 5: Versioning Ordini
**Situazione attuale:** Nessun sistema di revisioni. Quando un ordine viene modificato, la versione precedente viene sovrascritta.

---

## Piano di Implementazione (per priorita)

### FASE A: Catalogo Articoli e Prezzo Riga (fondamentale per tutto il resto)

**Database:**
- Espandere `article_templates` con: `sku`, `category`, `unit_price` (prezzo vendita), `standard_cost` (costo standard), `unit_of_measure`, `vat_rate`, `supplier_id`
- Aggiungere a `order_items`: `unit_price` (prezzo vendita unitario), `discount_percent`, `line_total` (calcolato)

**Frontend:**
- Creare pagina gestione catalogo articoli (CRUD completo) accessibile da Impostazioni o come sezione dedicata
- Quando si seleziona un articolo dal catalogo nella creazione ordine, auto-compilare prezzo vendita, costo standard, IVA e fornitore
- Mostrare nella lista articoli ordine: prezzo unitario x quantita - sconto = totale riga

**File coinvolti:**
- Migrazione DB per colonne aggiuntive
- Nuovo componente `src/components/settings/ArticleCatalog.tsx`
- Modifica `src/components/orders/OrderItemsList.tsx` (aggiunta campi prezzo vendita e sconto)
- Modifica `src/components/orders/ArticleCombobox.tsx` (restituire dati completi del template)

### FASE B: Margine Previsto vs Consuntivo

**Logica:**
- Al momento dell'inserimento articolo, salvare il `standard_cost` (dal catalogo) come riferimento
- Nel Conto Economico mostrare due colonne affiancate:
  - **Previsto**: calcolato da `unit_price * qty` (ricavi) - `standard_cost * qty` (costi)
  - **Consuntivo**: calcolato da ricavi reali - `purchase_price * qty` (costi effettivi)
  - **Scostamento**: differenza con evidenziazione visiva (verde se positivo, rosso se negativo)

**File coinvolti:**
- Modifica `src/components/orders/OrderEconomics.tsx` (aggiunta sezione comparativa)
- Aggiungere colonna `standard_cost` a `order_items` (nella migrazione di Fase A)

### FASE C: Generazione PDF Preventivo

**Approccio:** Utilizzare la libreria browser-native per generare PDF senza dipendenze esterne pesanti. Creare un componente React che renderizza il preventivo in formato stampabile e usare `window.print()` con CSS `@media print` ottimizzato.

**Contenuto PDF:**
- Intestazione azienda (logo, ragione sociale, P.IVA, indirizzo)
- Dati cliente
- Tabella articoli (nome, quantita, prezzo unitario, sconto, totale riga)
- Riepilogo finanziario (imponibile, IVA, totale)
- Condizioni di pagamento
- Note

**File coinvolti:**
- Nuovo componente `src/components/orders/OrderPrintView.tsx`
- Aggiunta pulsante "Genera Preventivo" in `OrderDetail.tsx`
- CSS print styles in `index.css`

### FASE D: Versioning base (opzionale, bassa priorita)

**Approccio minimale:** Salvare uno snapshot JSON dell'ordine nella tabella `order_status_history` o in una nuova tabella `order_revisions` ogni volta che l'ordine viene modificato, con numero versione incrementale.

---

## Dettaglio Tecnico - Migrazione Database

```text
ALTER TABLE article_templates:
  + sku TEXT
  + category TEXT  
  + unit_price NUMERIC DEFAULT 0
  + standard_cost NUMERIC DEFAULT 0
  + unit_of_measure TEXT DEFAULT 'pz'
  + vat_rate NUMERIC DEFAULT 22
  + supplier_id UUID (FK -> suppliers)
  + description TEXT

ALTER TABLE order_items:
  + unit_price NUMERIC DEFAULT 0
  + discount_percent NUMERIC DEFAULT 0
  + standard_cost NUMERIC DEFAULT 0
```

## Sequenza di Implementazione Consigliata

1. **Fase A** (Catalogo + Prezzo riga) - prerequisito per tutto il resto
2. **Fase B** (Margine previsto vs consuntivo) - dipende da Fase A
3. **Fase C** (PDF) - indipendente, puo procedere in parallelo con B
4. **Fase D** (Versioning) - opzionale, da valutare dopo

## Note

- Le Fasi A e B insieme risolvono il requisito critico "margine previsto vs consuntivo"
- La Fase C e il primo passo verso la generazione documenti (preventivo, conferma d'ordine, SAL)
- La Fase D e minimale ma sufficiente per tracciare le modifiche con storico

