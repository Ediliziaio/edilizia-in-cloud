

# Registrazione Costo Acquisto al Salvataggio Giacenza

## Cosa cambia

Quando si aggiunge un nuovo articolo in giacenza (o si esegue un carico), l'utente potra opzionalmente registrare il costo di acquisto sostenuto direttamente dalla dialog, senza doverlo inserire manualmente nella sezione Costi.

## Comportamento

- Nel dialog "Nuovo Articolo in Giacenza", viene aggiunto un **toggle/checkbox** "Registra costo acquisto"
- Se attivato, appaiono due campi aggiuntivi:
  - **Data pagamento** (precompilata con oggi)
  - **Categoria costo** (opzionale, es. "Materiali", "Magazzino")
- Al salvataggio, oltre a creare l'articolo in `warehouse_stock`, il sistema inserisce automaticamente un record nella tabella `company_costs` con:
  - `name`: nome dell'articolo + " (acquisto magazzino)"
  - `amount`: costo unitario x quantita
  - `vat_rate`: aliquota IVA selezionata
  - `supplier_id`: fornitore selezionato
  - `due_date`: data pagamento
  - `is_paid`: true
  - `paid_date`: data pagamento
  - `cost_type`: "variable"
  - `category`: categoria selezionata o "Magazzino"
  - `recurrence`: "once"

- In **modifica** articolo, il toggle non appare (il costo e gia stato registrato alla creazione)
- Lo stesso meccanismo viene aggiunto anche al dialog di **Carico** (StockMovementDialog), per registrare il costo di un riapprovvigionamento

---

## Dettaglio tecnico

### File modificati

| File | Modifica |
|------|----------|
| `src/components/warehouse/StockItemDialog.tsx` | Aggiungere checkbox "Registra costo acquisto", campi data e categoria. Passare i nuovi dati via `onSave`. |
| `src/components/warehouse/WarehouseStockTab.tsx` | Nel `saveMutation` (solo insert, non update): se i dati costo sono presenti, inserire anche in `company_costs`. |
| `src/components/warehouse/StockMovementDialog.tsx` | Aggiungere lo stesso toggle per i movimenti di carico, passando i dati extra via `onSave`. |
| `src/components/warehouse/WarehouseStockTab.tsx` | Nel `movementMutation` (solo tipo "carico"): se i dati costo sono presenti, inserire in `company_costs`. |

### Interfaccia `onSave` aggiornata (StockItemDialog)

```text
onSave: (data: {
  name, description, quantity, unit_cost, vat_rate, supplier_id, min_stock_level,
  // nuovi campi opzionali:
  registerCost?: boolean;
  costPaidDate?: string;
  costCategory?: string;
}) => void
```

### Logica insert costo (in saveMutation, solo creazione)

```text
if (data.registerCost && !data.id) {
  const totalAmount = data.unit_cost * data.quantity;
  await supabase.from("company_costs").insert({
    company_id, 
    name: data.name + " (acquisto magazzino)",
    cost_type: "variable",
    amount: totalAmount,
    vat_rate: data.vat_rate,
    supplier_id: data.supplier_id || null,
    due_date: data.costPaidDate,
    is_paid: true,
    paid_date: data.costPaidDate,
    category: data.costCategory || "Magazzino",
    recurrence: "once",
  });
}
```

### UX del toggle

- Checkbox con label "Registra costo acquisto nei Costi Aziendali"
- Sotto il checkbox (visibile solo se attivo):
  - Campo data con valore default = oggi
  - Select categoria (opzionale)
- Il toggle e disattivato di default
- Non appare in modalita modifica (`editingItem` presente)

