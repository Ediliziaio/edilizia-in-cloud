
# Fix: Pagamenti non aggiornati nelle statistiche Costi

## Problema identificato

Il pagamento funziona correttamente a livello database (le provvigioni risultano pagate nel DB), ma le **stat cards** mostrano ancora "0 pagati" perche' il calcolo delle statistiche ignora i costi derivati dagli ordini.

### Bug specifici trovati

**1. Stats "Pagato (mese)" ignora i costi da ordine** (righe 1081-1087)
- `totalPaidThisMonth` conta solo i `company_costs` manuali pagati
- I costi da ordine pagati (fornitori, squadre, provvigioni, dipendenti) non vengono sommati

**2. Stats "Da pagare (mese)" somma TUTTI i costi da ordine non pagati indipendentemente dal mese** (riga 1085-1086)
- `orderItemsTotalUnpaid` somma tutti i costi da ordine non pagati senza filtro temporale
- Dovrebbe filtrare solo quelli con scadenza nel mese corrente

**3. Nessun feedback in caso di errore** -- tutte le mutation di pagamento mancano di `onError`
- Se un update fallisce, l'utente non riceve alcun messaggio

**4. Pagamento deposito/saldo ordine errato** (riga 826)
- Per articoli con metodo 50/50 o 30/70, `markOrderItemPaidMutation` aggiorna `is_paid` invece di `deposit_paid`/`balance_paid`
- Questo non riflette correttamente lo stato parziale del pagamento

---

## Soluzione

### File: `src/components/forecast/CompanyCostsManager.tsx`

**Fix 1 -- Includere costi da ordine nelle stats:**

```typescript
// PRIMA (riga 1081-1088):
const thisMonthUnpaid = costs.filter(...)
const thisMonthPaid = costs.filter(...)
const orderItemsTotalUnpaid = allOrderDerivedCosts.filter(c => !c.is_paid).reduce(...)
const totalUnpaidThisMonth = thisMonthUnpaid.reduce(...) + orderItemsTotalUnpaid;
const totalPaidThisMonth = thisMonthPaid.reduce(...); // <-- solo manuali!

// DOPO:
// Filtro mese anche per order-derived
const orderDerivedThisMonthUnpaid = allOrderDerivedCosts.filter(c => 
  !c.is_paid && c.due_date && isWithinInterval(new Date(c.due_date), thisMonthInterval)
);
const orderDerivedThisMonthPaid = allOrderDerivedCosts.filter(c => 
  c.is_paid && c.paid_date && isWithinInterval(new Date(c.paid_date), thisMonthInterval)
);

const totalUnpaidThisMonth = thisMonthUnpaid.reduce(...) + 
  orderDerivedThisMonthUnpaid.reduce((s, c) => s + c.amount, 0);
const totalPaidThisMonth = thisMonthPaid.reduce(...) + 
  orderDerivedThisMonthPaid.reduce((s, c) => s + c.amount, 0);
```

Aggiornare anche il contatore sotto le card per mostrare il numero corretto di pagati (manuali + ordine).

**Fix 2 -- Aggiungere `onError` a tutte le mutation di pagamento:**

Aggiungere a `markPaidMutation`, `markOrderItemPaidMutation`, `markExtTeamPaidMutation`, `markCommissionPaidMutation`, `markEmployeeCostPaidMutation` (e le rispettive unpaid):
```typescript
onError: (error) => {
  console.error("Payment error:", error);
  toast({ title: "Errore nel salvataggio del pagamento", variant: "destructive" });
},
```

**Fix 3 -- Gestire correttamente deposito/saldo per articoli fornitore:**

Modificare `markOrderItemPaidMutation` per distinguere tra deposito, saldo e pagamento singolo. Passare il tipo di pagamento come parametro:
```typescript
// Aggiungere un campo "paymentType" per distinguere
type OrderItemPaymentType = "single" | "deposit" | "balance";

const markOrderItemPaidMutation = useMutation({
  mutationFn: async ({ id, date, paymentType }: { id: string; date: string; paymentType: OrderItemPaymentType }) => {
    let updateData: any;
    if (paymentType === "deposit") {
      updateData = { deposit_paid: true, deposit_paid_date: date };
    } else if (paymentType === "balance") {
      updateData = { balance_paid: true, balance_paid_date: date };
    } else {
      updateData = { is_paid: true, paid_date: date };
    }
    const { error } = await supabase.from("order_items").update(updateData).eq("id", id);
    if (error) throw error;
  },
  ...
});
```

Nel handler di conferma pagamento, determinare il tipo in base all'ID del costo:
- `order-item-dep-xxx` -> `paymentType: "deposit"`
- `order-item-bal-xxx` -> `paymentType: "balance"`
- `order-item-xxx` -> `paymentType: "single"`

Stessa logica per il pulsante "Riporta a non pagato".

**Fix 4 -- Aggiungere `markExtTeamPaidMutation.isPending` alla condizione disabled del bottone** (attualmente mancante).

---

## Riepilogo modifiche

| Cosa | Stato attuale | Dopo il fix |
|------|---------------|-------------|
| Card "Pagato (mese)" | Solo costi manuali | Manuali + Da Ordine |
| Card "Da pagare (mese)" | Tutti gli ordini senza filtro mese | Filtrati per mese corrente |
| Errori pagamento | Silenziosi | Toast di errore visibile |
| Pagamento deposito fornitore | Aggiorna campo sbagliato | Aggiorna deposit_paid/balance_paid |
| Contatore pagati | Solo manuali | Include tutti i tipi |

Un unico file modificato: `src/components/forecast/CompanyCostsManager.tsx`
