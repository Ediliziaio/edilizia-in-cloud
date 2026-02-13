
# Piano: Miglioramenti Sezione Ordini

## Panoramica

Tre miglioramenti alla sezione Ordini:
1. Filtro articoli per origine (Magazzino / Fornitore) nel dettaglio ordine
2. Nuova colonna "Da Ricevere" nella tabella ordini
3. Reportistica riepilogativa in alto con filtro mensile

---

## 1. Filtro Articoli per Origine (OrderItemsList)

Aggiungere sopra la lista articoli un piccolo ToggleGroup con tre opzioni:
- **Tutti** (default)
- **Da Giacenza** (solo articoli con `stock_item_id`)
- **Da Fornitore** (solo articoli senza `stock_item_id`)

Il filtro agisce solo sulla visualizzazione, non modifica i dati.

---

## 2. Colonna "Da Ricevere" nella Tabella Ordini

Aggiungere una colonna nella tabella di `OrdersList.tsx` che mostra l'importo ancora da incassare dal cliente.

Calcolo:

```text
Da Ricevere = 
  (deposit_paid ? 0 : deposit_amount) +
  (deposit_2_paid ? 0 : deposit_2_amount) +
  (balance_paid ? 0 : balance_amount)
```

La colonna viene posizionata dopo "Totale", con importo in rosso/arancione se > 0 e verde se tutto pagato (0).

---

## 3. Reportistica in Alto (Stats Cards)

Aggiungere una riga di card statistiche sopra i filtri, calcolate sugli ordini filtrati. Le card mostreranno:

| Card | Valore | Icona |
|------|--------|-------|
| N. Ordini | Conteggio ordini filtrati | ShoppingBag |
| Importo Totale | Somma `total_amount` | Euro |
| Incassato | Somma degli importi gia pagati (deposit se paid + deposit_2 se paid + balance se paid) | TrendingUp |
| Da Incassare | Somma degli importi non pagati | AlertCircle |

Tutte le statistiche si aggiornano automaticamente in base ai filtri attivi (stato, cliente, date, importo, pagamenti).

Aggiungere inoltre un **filtro mese rapido** (Select con mesi dell'anno corrente + "Tutti i mesi") che filtra per `created_at` (data contratto). Questo si integra con i filtri gia esistenti.

---

## File da Modificare

| File | Azione | Descrizione |
|------|--------|-------------|
| `src/components/orders/OrderItemsList.tsx` | Modifica | Aggiungere ToggleGroup filtro origine articoli |
| `src/pages/azienda/OrdersList.tsx` | Modifica | Aggiungere colonna "Da Ricevere", stats cards in alto, filtro mese rapido |

Nessuna migrazione DB necessaria: tutti i dati sono gia disponibili nella query esistente.

---

## Dettagli Tecnici

### Filtro Articoli (OrderItemsList)

Nuovo state `sourceFilter` con valori `"all" | "stock" | "supplier"`. La lista renderizzata filtra gli items:

```text
const displayedItems = items.filter(item => {
  if (sourceFilter === "stock") return !!item.stock_item_id;
  if (sourceFilter === "supplier") return !item.stock_item_id;
  return true;
});
```

### Colonna "Da Ricevere" (OrdersList)

Helper function:

```text
function getAmountDue(order): number {
  let due = 0;
  if (!order.deposit_paid) due += order.deposit_amount || 0;
  if (!order.deposit_2_paid) due += order.deposit_2_amount || 0;
  if (!order.balance_paid) due += order.balance_amount || 0;
  return due;
}
```

### Stats Cards (OrdersList)

Calcolo con `useMemo` su `filteredOrders`:

```text
const stats = useMemo(() => {
  const totalOrders = filteredOrders.length;
  const totalAmount = sum of total_amount;
  const collected = sum of paid portions;
  const pending = sum of unpaid portions;
  return { totalOrders, totalAmount, collected, pending };
}, [filteredOrders]);
```

### Filtro Mese Rapido

Select con 12 mesi + "Tutti":

```text
const [monthFilter, setMonthFilter] = useState<string>("all");
// Valori: "all", "2026-01", "2026-02", ...
// Filtra created_at nel range del mese selezionato
```

Il filtro mese si integra con il filtro `contractDateRange` gia esistente: se l'utente seleziona un mese, imposta automaticamente il range data contratto. Se usa il date range manuale, il select mese torna su "Tutti".

### Layout Stats Cards

Griglia a 4 colonne (responsive):

```text
<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
  <Card> N. Ordini </Card>
  <Card> Importo Totale </Card>
  <Card> Incassato </Card>
  <Card> Da Incassare </Card>
</div>
```

Ogni card ha icona colorata, valore grande e label descrittiva.
