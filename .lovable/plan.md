
# Semplificazione Articoli Ordine + Stato Pagamento Fornitore

## Panoramica

Rimuovere i campi "Prezzo Vendita", "Sconto %" e "Costo Standard" dal form degli articoli dell'ordine, mantenendo solo "Costo Acquisto" con IVA. Aggiungere uno "Stato Pagamento Fornitore" per tracciare come e quando si paga il fornitore per ogni articolo, con supporto per modalita di pagamento (50/50, 30/70, RIBA, ecc.).

---

## 1. Migrazione Database

Aggiungere una nuova colonna `payment_method` alla tabella `order_items` per gestire la modalita di pagamento al fornitore.

```text
ALTER TABLE order_items ADD COLUMN payment_method text DEFAULT NULL;
```

Le colonne `unit_price`, `discount_percent`, `standard_cost` rimangono nel DB (per non rompere dati storici) ma non vengono piu usate nel form. I nuovi articoli avranno questi campi a 0/null.

---

## 2. Modifiche a `OrderItemsList.tsx`

### Form dialog (sia tab "Nuovo Articolo" che fallback senza stock)
- **Rimuovere** i campi: "Prezzo Vendita", "Sconto %", "Costo Standard"
- **Mantenere**: Quantita, Costo Acquisto, IVA Acquisto, Stato Articolo, Fornitore
- **Aggiungere**: sezione "Stato Pagamento Fornitore" con:
  - Toggle Pagato / Non Pagato (usa `is_paid` esistente)
  - Data pagamento (`paid_date` esistente)
  - Modalita pagamento (`payment_method` - nuovo): select con opzioni:
    - "Bonifico unico"
    - "50% acconto + 50% saldo"
    - "30% acconto + 70% saldo"
    - "RIBA"
    - "Contanti"
    - "Altro"

### Lista articoli (card visualizzazione)
- **Rimuovere** la riga "Vendita: X x Y -Z% = ..." dalla visualizzazione
- **Aggiungere** badge stato pagamento (es. "Pagato" verde / "Non pagato" arancione)
- Mostrare la modalita di pagamento se presente

### State e logica
- Rimuovere state: `itemUnitPrice`, `itemDiscountPercent`, `itemStandardCost`
- Aggiungere state: `itemIsPaid`, `itemPaidDate`, `itemPaymentMethod`
- Aggiornare `resetForm()`, `openEditDialog()`, `handleSaveItem()`, `handleArticleSelect()`

### Interface `OrderItem`
- Rimuovere: `unit_price`, `discount_percent`, `standard_cost`
- Aggiungere: `is_paid`, `paid_date`, `payment_method`

---

## 3. Modifiche a `OrderEconomics.tsx`

- Rimuovere la sezione "MARGINE PREVISTO vs CONSUNTIVO" (righe 358-399) che dipendeva da `standard_cost`
- Rimuovere i riferimenti a `unit_price`, `discount_percent`, `standard_cost` dall'interfaccia `OrderItem` interna
- Il margine consuntivo continua a funzionare normalmente basandosi su `purchase_price`

---

## 4. Aggiornamento `ArticleCombobox` / `handleArticleSelect`

Quando si seleziona un articolo dal catalogo:
- Non piu popolare `unit_price` e `standard_cost`
- Popolare solo: `purchase_price` (da `standard_cost` del template), `vat_rate`, `supplier_id`, `description`

---

## 5. Aggiornamento salvataggio ordine

### `CreateOrder.tsx` e `EditOrder.tsx`
- Aggiornare il payload di insert/upsert degli `order_items` per includere `is_paid`, `paid_date`, `payment_method`
- Impostare `unit_price: 0`, `discount_percent: 0`, `standard_cost: 0` nei nuovi inserimenti

### `useOrderDraft.ts`
- Aggiornare l'interfaccia `OrderDraftData` per riflettere i nuovi campi degli `OrderItem`

---

## 6. Riepilogo file

| Azione | File |
|--------|------|
| Migrazione | Aggiungere colonna `payment_method` a `order_items` |
| Modificare | `src/components/orders/OrderItemsList.tsx` (rimuovere campi, aggiungere pagamento) |
| Modificare | `src/components/orders/OrderEconomics.tsx` (rimuovere sezione margine previsto) |
| Modificare | `src/pages/azienda/CreateOrder.tsx` (aggiornare payload salvataggio) |
| Modificare | `src/pages/azienda/EditOrder.tsx` (aggiornare payload salvataggio) |
| Modificare | `src/hooks/useOrderDraft.ts` (aggiornare interfaccia) |

---

## 7. Impatto

- I dati storici con `unit_price`/`standard_cost` restano nel DB ma non vengono piu visualizzati
- Il Conto Economico perde la sezione "Previsto vs Consuntivo" ma mantiene il margine basato sui costi effettivi
- Ogni articolo ora traccia il pagamento al fornitore con modalita e data
