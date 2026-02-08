
# Piano: Completamento Sistema Venditori + Pulizia Codice

## Panoramica

Questo piano completa l'implementazione del sistema venditori aggiungendo:
1. **Campo Venditore nei form ordini** - CreateOrder e EditOrder con SalespersonSelect
2. **Sezione Provvigioni da Pagare** nel Previsionale Cassa
3. **Pagine area venditore** - I Miei Ordini e Guadagni
4. **Pulizia e stabilizzazione** del codice esistente

---

## 1. Integrazione Venditore nei Form Ordine

### CreateOrder.tsx - Modifiche

Aggiunta del componente `SalespersonSelect` nel form di creazione ordine:

| Modifica | Dettaglio |
|----------|-----------|
| Import | `SalespersonSelect` da `@/components/salespeople/SalespersonSelect` |
| State | `salespersonId`, `salespersonData` per tracciare venditore selezionato |
| UI | Campo venditore dopo la descrizione ordine (card "Dettagli Ordine") |
| Mutation | Creare record in `order_salespeople` dopo creazione ordine |

Posizione nel form: dopo il campo "Note Interne" nel card "Dettagli Ordine".

### EditOrder.tsx - Modifiche

Stesse modifiche di CreateOrder con in piu:
- Fetch del venditore esistente quando si carica l'ordine
- Possibilita di cambiare o rimuovere il venditore
- Aggiornamento del record `order_salespeople` esistente

---

## 2. Sezione Provvigioni da Pagare nel CashFlowForecast

### Nuova Query

Aggiungere query per recuperare provvigioni non pagate:

```typescript
// Query provvigioni non pagate
const { data: unpaidCommissions = [] } = useQuery({
  queryKey: ["forecast-unpaid-commissions", companyId],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("order_salespeople")
      .select(`
        id, commission_amount, payment_expected_date, is_paid,
        salesperson:salespeople!inner(first_name, last_name, company_id),
        order:orders!inner(id, order_code, company_id)
      `)
      .eq("is_paid", false);
    
    return data.filter(item => item.order?.company_id === companyId);
  },
  enabled: !!companyId,
});
```

### Nuova Sezione UI

Aggiungere card "Provvigioni da Pagare" dopo la sezione "Uscite Materiali Previste":

| Elemento | Descrizione |
|----------|-------------|
| Icona | UserCheck |
| Titolo | "Provvigioni da Pagare" |
| Contenuto | Lista venditori con importo e data prevista |
| Totale | Somma di tutte le provvigioni non pagate |

Integrazione nel calcolo statistiche:
- Aggiungere `totalCommissions` alle uscite totali
- Aggiornare il calcolo del saldo netto

---

## 3. Pagine Area Venditore

### MyOrders.tsx (I Miei Ordini)

Nuova pagina `/venditore/ordini` che mostra:

| Sezione | Contenuto |
|---------|-----------|
| Header | Titolo + conteggio ordini |
| Filtri | Periodo, stato pagamento provvigione |
| Tabella | Cliente, Ordine, Importo vendita, Provvigione, Stato incasso, Data |

Query principale:
```typescript
const { data: orders = [] } = useQuery({
  queryKey: ["salesperson-orders", salesperson?.id],
  queryFn: async () => {
    return await supabase
      .from("order_salespeople")
      .select(`
        *,
        order:orders(
          id, order_code, description, total_amount, created_at,
          deposit_paid, deposit_2_paid, balance_paid,
          customer:profiles!orders_customer_id_fkey(first_name, last_name)
        )
      `)
      .eq("salesperson_id", salesperson.id)
      .order("created_at", { ascending: false });
  },
});
```

### MyEarnings.tsx (Guadagni)

Nuova pagina `/venditore/guadagni` che mostra:

| Sezione | Contenuto |
|---------|-----------|
| KPI Cards | Maturate, Pagate, Da ricevere, % pagato |
| Grafico | Trend mensile provvigioni (ultimi 6 mesi) |
| Tabella dettaglio | Lista provvigioni con stato pagamento |

Funzionalita:
- Filtro per periodo
- Raggruppamento per mese
- Totali cumulativi

### SalespersonProfile.tsx (Profilo)

Pagina semplice con:
- Dati anagrafici del venditore (sola lettura)
- Tipo e valore provvigione default
- Form cambio password

---

## 4. Aggiornamento Rotte App.tsx

Aggiungere le nuove rotte nell'area venditore:

```typescript
{/* Salesperson Routes */}
<Route path="/venditore" element={<ProtectedRoute allowedRoles={["salesperson"]}><SalespersonLayout /></ProtectedRoute>}>
  <Route index element={<SalespersonDashboard />} />
  <Route path="ordini" element={<MyOrders />} />
  <Route path="guadagni" element={<MyEarnings />} />
  <Route path="profilo" element={<SalespersonProfile />} />
</Route>
```

---

## 5. Pulizia e Stabilizzazione Codice

### Verifiche da Effettuare

| Area | Controllo |
|------|-----------|
| Import | Rimuovere import inutilizzati |
| Query | Verificare `enabled` conditions per evitare errori |
| Types | Assicurare coerenza tipi TypeScript |
| RLS | Verificare che le policy permettano accesso corretto |

### Miglioramenti UX

| Componente | Miglioramento |
|------------|---------------|
| SalespersonSelect | Loading state mentre carica venditori |
| Tabelle | Empty state con messaggio chiaro |
| Form | Feedback visivo su salvataggio |
| Navigazione | Highlight pagina attiva in SalespersonLayout |

---

## 6. File da Creare

| File | Descrizione |
|------|-------------|
| `src/pages/venditore/MyOrders.tsx` | Pagina lista ordini venditore |
| `src/pages/venditore/MyEarnings.tsx` | Pagina guadagni venditore |
| `src/pages/venditore/SalespersonProfile.tsx` | Pagina profilo venditore |

---

## 7. File da Modificare

| File | Modifica |
|------|----------|
| `src/pages/azienda/CreateOrder.tsx` | Aggiungere SalespersonSelect + mutation order_salespeople |
| `src/pages/azienda/EditOrder.tsx` | Aggiungere SalespersonSelect + gestione update |
| `src/pages/azienda/CashFlowForecast.tsx` | Query e sezione provvigioni da pagare |
| `src/App.tsx` | Aggiungere rotte area venditore |

---

## 8. Dettaglio Tecnico: CreateOrder con Venditore

### State da Aggiungere

```typescript
const [salespersonId, setSalespersonId] = useState("");
const [salespersonData, setSalespersonData] = useState<{
  commission_type: string;
  commission_value: number;
} | null>(null);
```

### UI da Aggiungere

Dopo il campo "Note Interne" nel CardContent:

```tsx
<SalespersonSelect
  value={salespersonId}
  onChange={(id, salesperson) => {
    setSalespersonId(id);
    setSalespersonData(salesperson ? {
      commission_type: salesperson.commission_type,
      commission_value: salesperson.commission_value,
    } : null);
  }}
/>
```

### Mutation da Modificare

Dopo la creazione dell'ordine, se c'e un venditore:

```typescript
if (salespersonId && salespersonData) {
  const commissionAmount = calculateCommission(
    salespersonData.commission_type,
    salespersonData.commission_value,
    total
  );
  
  await supabase.from("order_salespeople").insert({
    order_id: order.id,
    salesperson_id: salespersonId,
    commission_type: salespersonData.commission_type,
    commission_value: salespersonData.commission_value,
    commission_amount: commissionAmount,
  });
}
```

---

## 9. Dettaglio Tecnico: CashFlowForecast Provvigioni

### Interface da Aggiungere

```typescript
interface ExpectedCommission {
  orderId: string;
  orderCode: string | null;
  salespersonName: string;
  amount: number;
  expectedDate: Date | null;
  direction: "out";
}
```

### Calcolo Statistiche Aggiornato

```typescript
// Aggiungere al calcolo stats
const totalCommissionsExpenses = unpaidCommissions.reduce(
  (sum, c) => sum + c.commission_amount, 0
);

// Aggiornare stats.total.expenses
expenses: totalExpenses + totalCommissionsExpenses,
```

### UI Nuova Sezione

Card con stile simile a "Uscite Materiali Previste":
- Bordo viola/indigo per differenziare
- Tabella con: Venditore, Ordine, Importo, Data prevista
- Totale provvigioni da pagare

---

## 10. Fasi di Implementazione

### Fase 1: Form Ordini (Priorita Alta)
1. Aggiungere SalespersonSelect a CreateOrder
2. Modificare mutation per creare record order_salespeople
3. Replicare in EditOrder con gestione update

### Fase 2: CashFlowForecast (Priorita Alta)
1. Aggiungere query unpaidCommissions
2. Creare nuova sezione UI
3. Integrare nel calcolo statistiche

### Fase 3: Pagine Venditore (Priorita Media)
1. Creare MyOrders.tsx
2. Creare MyEarnings.tsx
3. Creare SalespersonProfile.tsx
4. Aggiornare rotte in App.tsx

### Fase 4: Pulizia e Test (Priorita Media)
1. Verificare tutti i path funzionanti
2. Testare flusso completo
3. Rimuovere codice non utilizzato

---

## 11. Test Funzionali da Eseguire

| Test | Scenario |
|------|----------|
| Crea ordine con venditore | Verificare creazione record order_salespeople |
| Crea ordine senza venditore | Verificare che funzioni senza errori |
| Modifica ordine | Cambiare venditore e verificare aggiornamento |
| Previsionale | Verificare sezione provvigioni con dati |
| Area venditore | Navigazione e visualizzazione dati corretti |
| Dashboard venditore | KPI calcolati correttamente |

---

## 12. Output Atteso

Al termine dell'implementazione:

- Campo venditore funzionante in creazione/modifica ordine
- Sezione "Provvigioni da Pagare" visibile nel Previsionale
- Area venditore completa con 4 pagine navigate
- Codice pulito senza warning o errori console
- UX fluida con loading states e feedback appropriati
