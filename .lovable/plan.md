

# Piano: Miglioramento Lista Ordini con Nuove Colonne e Filtri

## Panoramica

Miglioreremo la tabella degli ordini aggiungendo colonne informative e un filtro per i pagamenti in sospeso.

---

## Modifiche Database

Aggiungere un campo `order_code` per il Codice Ordine:

```sql
ALTER TABLE orders
ADD COLUMN order_code TEXT;
```

Il codice ordine sara un campo testuale libero che l'utente puo impostare manualmente durante la creazione/modifica dell'ordine.

---

## Nuove Colonne nella Tabella

| Colonna | Campo Database | Descrizione |
|---------|---------------|-------------|
| Codice | `order_code` | Codice identificativo ordine (es. "ORD-2026-001") |
| Data Contratto | `created_at` | Data di creazione dell'ordine |
| Arrivo Merce | `warehouse_arrival_date` | Data prevista arrivo merce in magazzino |
| Data Posa | `expected_date` | Data potenziale posa/consegna |
| Pagamenti | (calcolato) | Stato pagamenti in sospeso |
| Stato | `current_status_id` | Stato attuale dell'ordine |

### Layout Nuova Tabella

```
+--------+-------------+---------+--------+--------------+------------+------------+-------+--------+
| Codice | Descrizione | Cliente | Totale | Data Contrat.| Arrivo     | Data Posa  | Pagam.| Stato  |
+--------+-------------+---------+--------+--------------+------------+------------+-------+--------+
| ORD-01 | Finestre... | Mario R | €5.000 | 05 Feb 2026  | 15 Feb     | 01 Mar     | ✓ OK  | Conf.  |
| ORD-02 | Porte...    | Luigi B | €3.000 | 04 Feb 2026  | 20 Feb     | --         | Saldo | In att.|
+--------+-------------+---------+--------+--------------+------------+------------+-------+--------+
```

---

## Nuovo Filtro Pagamenti

Aggiungere un terzo filtro a tendina per i pagamenti:

```
+------------------------------------------+
| Filtri                                   |
| [Cerca...]  [Stato ▼]  [Pagamenti ▼]     |
|                        - Tutti           |
|                        - In Sospeso      |
|                        - Tutto Pagato    |
+------------------------------------------+
```

### Opzioni Filtro Pagamenti

- **Tutti** - Mostra tutti gli ordini
- **In Sospeso** - Mostra solo ordini con almeno un pagamento da incassare
- **Tutto Pagato** - Mostra solo ordini completamente saldati

---

## File da Modificare

| File | Modifica |
|------|----------|
| Migrazione SQL | Aggiungere campo `order_code` |
| `OrdersList.tsx` | Nuove colonne, nuovo filtro pagamenti |
| `CreateOrder.tsx` | Campo input per codice ordine |
| `EditOrder.tsx` | Campo input per codice ordine |
| `OrderDetail.tsx` | Visualizzare codice ordine |

---

## Dettagli Tecnici

### Aggiornamento Interface OrderWithDetails

```typescript
interface OrderWithDetails {
  id: string;
  order_code: string | null;  // NUOVO
  description: string;
  total_amount: number;
  deposit_amount: number;
  deposit_paid: boolean | null;
  deposit_2_amount: number | null;
  deposit_2_paid: boolean | null;
  balance_amount: number;
  balance_paid: boolean | null;
  expected_date: string | null;
  warehouse_arrival_date: string | null;  // NUOVO nella UI
  created_at: string;
  current_status_id: string | null;
  customer: {...} | null;
  status: {...} | null;
}
```

### Nuovo Stato per Filtro Pagamenti

```typescript
const [paymentFilter, setPaymentFilter] = useState<"all" | "pending" | "paid">("all");

// Logica filtro
const filteredOrders = orders.filter((order) => {
  // ... filtri esistenti ...
  
  const pendingPayments = getPendingPayments(order);
  const matchesPayment = 
    paymentFilter === "all" ||
    (paymentFilter === "pending" && pendingPayments.length > 0) ||
    (paymentFilter === "paid" && pendingPayments.length === 0);
  
  return matchesSearch && matchesStatus && matchesPayment;
});
```

### Colonne Responsive

Per evitare che la tabella diventi troppo larga, su mobile nasconderemo alcune colonne meno critiche usando classi CSS:

```typescript
<TableHead className="hidden lg:table-cell">Arrivo Merce</TableHead>
<TableHead className="hidden md:table-cell">Data Posa</TableHead>
```

---

## Risultato Atteso

1. **Codice Ordine** - Colonna con codice identificativo personalizzabile
2. **Date Chiave Visibili** - Data contratto, arrivo merce, data posa
3. **Filtro Pagamenti** - Facile trovare ordini con pagamenti in sospeso
4. **Tabella Responsive** - Si adatta bene a schermi di diverse dimensioni
5. **Colonna Pagamenti Funzionante** - Badge colorato che mostra lo stato

