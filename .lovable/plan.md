

# Rendere le righe delle tabelle cliccabili per aprire l'ordine associato

## Obiettivo
In tutti i tab del Previsionale (Incassato, Marginalità, Previsionale Costi, Previsionale di Cassa), cliccando su una riga della tabella si naviga al dettaglio dell'ordine associato (`/azienda/ordini/:id`). Le righe senza ordine (es. costi aziendali) restano non cliccabili.

## Modifiche per file

### 1. `src/components/forecast/CollectedTab.tsx`
- Importare `useNavigate` da `react-router-dom`
- Aggiungere `onClick={() => navigate(\`/azienda/ordini/${p.orderId}\`)}` e `className="cursor-pointer hover:bg-muted/50"` su ogni `TableRow` nella tabella "Già incassato" e "Da ricevere"
- Solo se `p.orderId` esiste

### 2. `src/components/forecast/MarginTab.tsx`
- Importare `useNavigate`
- Aggiungere `onClick` + cursor-pointer su ogni `TableRow` usando `order.orderId`

### 3. `src/components/forecast/CashForecastTab.tsx`
- Aggiungere `orderId` all'interfaccia `UnifiedTransaction`
- Popolare `orderId` da ogni sorgente dati (`expectedPayments.orderId`, `expectedExpenses.orderId`, ecc.) — i `companyCosts` avranno `orderId: null`
- Importare `useNavigate`, rendere le righe cliccabili solo quando `t.orderId` non è null

### 4. `src/components/forecast/CostsForecastTab.tsx`
- Aggiungere `orderId?: string | null` alla struttura `rows` passata a `CostSection`
- In `CostSection`, importare `useNavigate` e rendere le righe cliccabili quando `row.orderId` è presente
- Passare `orderId` dalle sorgenti dati (expenses, commissions, supplier) — i costi aziendali non hanno orderId

### UX
- `cursor-pointer` e `hover:bg-muted/50` sulle righe cliccabili
- Nessun cambio visivo sulle righe senza ordine associato (costi aziendali)

