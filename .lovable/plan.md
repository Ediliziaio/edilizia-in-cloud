

# Piano: Dashboard Previsionale Cassa

## Panoramica

Creare una dashboard di previsione finanziaria che mostra le possibili entrate in base alle date previste di incasso, con statistiche rapide e dettagli filtrabili per periodo.

---

## Design Visivo

### Layout Principale

```
+---------------------------------------------------------------------+
| Previsionale Cassa                                                   |
| Analizza le entrate previste                                         |
+---------------------------------------------------------------------+
|                                                                       |
|  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ |
|  │ Questo Mese  │ │ Prossimo     │ │ Prossimi     │ │ Totale Non   │ |
|  │              │ │ Mese         │ │ 3 Mesi       │ │ Incassato    │ |
|  │ €12.500      │ │ €28.400      │ │ €45.200      │ │ €85.300      │ |
|  │ 3 pagamenti  │ │ 8 pagamenti  │ │ 15 pagamenti │ │ 26 pagamenti │ |
|  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘ |
|                                                                       |
|  ┌─────────────────────────────────────────────────────────────────┐ |
|  │ [Filtro Data: Da ____ A ____]               [Esporta CSV?]      │ |
|  ├─────────────────────────────────────────────────────────────────┤ |
|  │ Grafico Timeline Incassi Previsti                                │ |
|  │ (BarChart con mesi sull'asse X e importi sull'asse Y)           │ |
|  └─────────────────────────────────────────────────────────────────┘ |
|                                                                       |
|  ┌─────────────────────────────────────────────────────────────────┐ |
|  │ Dettaglio Pagamenti Attesi                                       │ |
|  ├─────────────────────────────────────────────────────────────────┤ |
|  │ Data Prevista | Ordine      | Cliente      | Tipo     | Importo │ |
|  │ 15/02/2026    | ORD-001     | Mario R.     | Saldo    | €5.400  │ |
|  │ 20/02/2026    | ORD-003     | Luigi V.     | Acc. 1   | €3.000  │ |
|  │ 01/03/2026    | ORD-005     | Anna B.      | Saldo    | €8.200  │ |
|  └─────────────────────────────────────────────────────────────────┘ |
|                                                                       |
+---------------------------------------------------------------------+
```

---

## Dati e Calcoli

### Fonte Dati

Da ogni ordine estrarremo i pagamenti NON ancora incassati:

| Campo | Condizione | Data Prevista |
|-------|-----------|---------------|
| Acconto 1 | `deposit_paid = false` | `deposit_expected_date` |
| Acconto 2 | `deposit_2_paid = false` | `deposit_2_expected_date` |
| Saldo | `balance_paid = false` | `balance_expected_date` |

### Struttura Dati Elaborati

```typescript
interface ExpectedPayment {
  orderId: string;
  orderCode: string | null;
  customerName: string;
  type: "Acconto 1" | "Acconto 2" | "Saldo";
  amount: number;
  expectedDate: Date | null;
}
```

### Calcolo Statistiche Rapide

```typescript
// Questo mese
const thisMonthPayments = payments.filter(p => 
  p.expectedDate && isThisMonth(p.expectedDate)
);

// Prossimo mese
const nextMonthPayments = payments.filter(p => 
  p.expectedDate && isNextMonth(p.expectedDate)
);

// Prossimi 3 mesi
const next3MonthsPayments = payments.filter(p => 
  p.expectedDate && isWithinNext3Months(p.expectedDate)
);

// Totale non incassato (inclusi quelli senza data)
const totalPending = payments.reduce((sum, p) => sum + p.amount, 0);
```

---

## Componenti

### 1. Stat Cards (4 card in riga)

| Card | Calcolo |
|------|---------|
| Questo Mese | Somma pagamenti con data prevista nel mese corrente |
| Prossimo Mese | Somma pagamenti con data prevista nel mese successivo |
| Prossimi 3 Mesi | Somma pagamenti con data prevista nei prossimi 3 mesi |
| Totale Non Incassato | Somma di tutti i pagamenti non incassati |

### 2. Grafico Timeline (Recharts BarChart)

- Asse X: Mesi (prossimi 6 mesi)
- Asse Y: Importo in EUR
- Barre colorate per tipo pagamento (Acconto 1, Acconto 2, Saldo)

### 3. Tabella Dettaglio

Colonne:
- Data Prevista (ordinabile)
- Codice Ordine (link al dettaglio)
- Cliente
- Tipo Pagamento
- Importo

Filtri:
- Range data
- Solo con data prevista / Tutti

---

## Struttura File

### Nuovo File: `src/pages/azienda/CashFlowForecast.tsx`

```typescript
// Struttura principale
export default function CashFlowForecast() {
  // Query ordini con pagamenti non incassati
  const { data: orders } = useQuery({...});
  
  // Elabora pagamenti attesi
  const expectedPayments = useMemo(() => {
    return orders.flatMap(order => {
      const payments: ExpectedPayment[] = [];
      
      // Acconto 1
      if (!order.deposit_paid && order.deposit_amount > 0) {
        payments.push({
          orderId: order.id,
          orderCode: order.order_code,
          customerName: `${order.customer?.first_name} ${order.customer?.last_name}`,
          type: "Acconto 1",
          amount: order.deposit_amount,
          expectedDate: order.deposit_expected_date ? new Date(order.deposit_expected_date) : null,
        });
      }
      
      // Acconto 2 (se presente)
      if (!order.deposit_2_paid && order.deposit_2_amount > 0) {
        payments.push({...});
      }
      
      // Saldo
      if (!order.balance_paid && order.balance_amount > 0) {
        payments.push({...});
      }
      
      return payments;
    });
  }, [orders]);
  
  // Calcola statistiche
  const stats = useMemo(() => {...}, [expectedPayments]);
  
  // Prepara dati per grafico
  const chartData = useMemo(() => {...}, [expectedPayments]);
  
  return (
    <div className="space-y-6">
      {/* Header */}
      {/* Stat Cards */}
      {/* Chart */}
      {/* Filter + Table */}
    </div>
  );
}
```

---

## Dettagli Tecnici

### Query Supabase

```typescript
const { data: orders = [] } = useQuery({
  queryKey: ["forecast-orders", user?.id],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("orders")
      .select(`
        id,
        order_code,
        deposit_amount,
        deposit_paid,
        deposit_expected_date,
        deposit_2_amount,
        deposit_2_paid,
        deposit_2_expected_date,
        balance_amount,
        balance_paid,
        balance_expected_date,
        customer:profiles!orders_customer_id_fkey(first_name, last_name)
      `)
      .or(
        "deposit_paid.eq.false,deposit_2_paid.eq.false,balance_paid.eq.false"
      );
    
    if (error) throw error;
    return data;
  },
});
```

### Funzioni di Calcolo Date

```typescript
import { 
  isThisMonth, 
  isAfter, 
  isBefore, 
  startOfMonth, 
  endOfMonth, 
  addMonths,
  format 
} from "date-fns";

function isInMonth(date: Date, monthOffset: number): boolean {
  const targetMonth = addMonths(new Date(), monthOffset);
  return (
    isAfter(date, startOfMonth(targetMonth)) &&
    isBefore(date, endOfMonth(targetMonth))
  );
}

function isWithinMonths(date: Date, months: number): boolean {
  const now = new Date();
  const endDate = addMonths(now, months);
  return isAfter(date, now) && isBefore(date, endDate);
}
```

### Dati Grafico (Recharts)

```typescript
const chartData = useMemo(() => {
  const months: { month: string; acconto1: number; acconto2: number; saldo: number }[] = [];
  
  for (let i = 0; i < 6; i++) {
    const monthDate = addMonths(new Date(), i);
    const monthPayments = expectedPayments.filter(p => 
      p.expectedDate && isInMonth(p.expectedDate, i)
    );
    
    months.push({
      month: format(monthDate, "MMM yyyy", { locale: it }),
      acconto1: sum(monthPayments.filter(p => p.type === "Acconto 1")),
      acconto2: sum(monthPayments.filter(p => p.type === "Acconto 2")),
      saldo: sum(monthPayments.filter(p => p.type === "Saldo")),
    });
  }
  
  return months;
}, [expectedPayments]);
```

---

## File da Creare/Modificare

| File | Azione |
|------|--------|
| `src/pages/azienda/CashFlowForecast.tsx` | **Nuovo** - Pagina principale |
| `src/App.tsx` | Modificare route `/azienda/previsionale` |

---

## Riepilogo Funzionalita

1. **4 Stat Cards**: Incassi previsti questo mese, prossimo mese, 3 mesi, totale pendente
2. **Grafico a Barre**: Timeline dei prossimi 6 mesi con breakdown per tipo pagamento
3. **Tabella Dettagliata**: Elenco pagamenti attesi con data, ordine, cliente, tipo e importo
4. **Filtro Data**: Range picker per filtrare la tabella
5. **Link Ordine**: Click sul codice ordine porta al dettaglio
6. **Gestione Date Mancanti**: Pagamenti senza data prevista mostrati in sezione "Senza data"

