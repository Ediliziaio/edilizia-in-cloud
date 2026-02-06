
# Piano di Implementazione - Portale Cliente con Progress Tracker

## Panoramica

Implementeremo la pagina di dettaglio ordine per i clienti (`/cliente/ordini/:id`) che permettera loro di visualizzare lo stato dei propri ordini con il progress tracker visivo.

---

## Test Impersonation e Flusso (Eseguiti)

Ho testato con successo:

1. **Login Super Admin**: flo.andriciuc@gmail.com funziona correttamente
2. **Impersonation**: Cliccando "Accedi come Admin" su Test Serramenti:
   - Banner giallo visibile con nome azienda
   - Pulsante "Torna a Admin" funzionante
   - Sidebar mostra "(Impersonando)"
3. **Creazione Cliente**: Ho creato Mario Rossi (mario.rossi@example.com) con password auto-generata
4. **Navigazione ordini**: La pagina ordini e accessibile ma il test di creazione ordine e stato interrotto da un errore di rendering (DOM issue non correlato alle nuove funzionalita)

---

## 1. Pagina Dettaglio Ordine Cliente

### File: `src/pages/cliente/CustomerOrderDetail.tsx`

Creeremo una versione semplificata della pagina dettaglio ordine per i clienti che include:

**Layout:**
- Header con titolo e pulsante "Torna ai miei ordini"
- Progress tracker visivo (componente esistente) in modalita read-only
- Card informazioni ordine (descrizione, importi, data prevista)
- Card storico stati con timeline

**Differenze rispetto alla versione Admin:**
- Nessun pulsante di modifica/elimina
- Progress tracker NON interattivo (solo visualizzazione)
- Nessuna sezione note interne (sono private per l'azienda)
- Layout piu semplice e mobile-first

### Struttura UI

```text
+----------------------------------+
| ← I Miei Ordini                  |
| Ordine #123                      |
+----------------------------------+
| [===========○-------] Progress   |
| Contratto → Produzione → ...     |
+----------------------------------+
| Descrizione                      |
| Fornitura e posa serramenti...   |
+----------------------------------+
| Riepilogo Finanziario            |
| Totale:    €5,000                |
| Acconto:   €2,000                |
| Saldo:     €3,000                |
+----------------------------------+
| Data prevista: 15 Marzo 2026     |
+----------------------------------+
| Storico Aggiornamenti            |
| • In Produzione - 5 Feb 2026     |
| • Acconto Pagato - 1 Feb 2026    |
| • Contratto Firmato - 28 Gen     |
+----------------------------------+
```

---

## 2. Funzionalita Progress Tracker per Cliente

Il componente `OrderProgressTracker` gia implementato supporta:
- `interactive={false}` per disabilitare i click
- Visualizzazione responsive (orizzontale su desktop, verticale su mobile)
- Date dei cambi stato dallo storico
- Icone e colori personalizzati per ogni step

Per il cliente useremo:
```jsx
<OrderProgressTracker
  statuses={statuses}
  currentStatusId={order.current_status_id}
  statusHistory={statusHistory}
  interactive={false}  // Read-only per cliente
  size="md"
/>
```

---

## 3. Query Database

Il cliente puo vedere solo i propri ordini grazie alle RLS policies gia configurate:

```sql
-- Policy esistente (verificata nel contesto):
Policy: "Customers can view their own orders"
Command: SELECT
Using: (customer_id = auth.uid())
```

Quindi il cliente potra accedere a:
- `orders` - i propri ordini
- `order_statuses` - stati dell'azienda (policy esistente per company_id)
- `order_status_history` - storico dei propri ordini (policy esistente)

---

## 4. File da Creare

```text
src/pages/cliente/CustomerOrderDetail.tsx  - Pagina dettaglio ordine cliente
```

---

## 5. File da Modificare

```text
src/App.tsx - Sostituire il placeholder alla linea 98 con CustomerOrderDetail
```

La route `/cliente/ordini/:id` attualmente mostra un placeholder ("Dettaglio Ordine - Coming soon") e verra collegata alla nuova pagina.

---

## 6. Componenti Riutilizzati

- `OrderProgressTracker` - Gia implementato in `src/components/orders/OrderProgressTracker.tsx`
- `Card`, `Badge`, `Button` - Componenti shadcn esistenti
- `CustomerLayout` - Layout gia configurato per i clienti

---

## 7. Sicurezza

La sicurezza e garantita dalle RLS policies esistenti:
- I clienti possono vedere SOLO i propri ordini (`customer_id = auth.uid()`)
- Gli stati dell'azienda sono visibili ai clienti della stessa azienda
- Lo storico stati e filtrato per order_id, quindi solo lo storico dei propri ordini

---

## 8. Responsive Design

La pagina sara ottimizzata per mobile (considerando che i clienti accederanno principalmente da smartphone):
- Layout a singola colonna su mobile
- Progress tracker verticale su schermi piccoli
- Card impilate verticalmente
- Touch-friendly con aree di tap adeguate

---

## Dettagli Tecnici

### Query per Dettaglio Ordine
```typescript
const { data: order } = await supabase
  .from("orders")
  .select(`
    id, description, total_amount, deposit_amount, balance_amount,
    expected_date, created_at, current_status_id,
    status:order_statuses(name, color, icon)
  `)
  .eq("id", orderId)
  .eq("customer_id", user.id) // Doppia verifica per sicurezza
  .single();
```

### Query per Stati Azienda
```typescript
const { data: statuses } = await supabase
  .from("order_statuses")
  .select("id, name, icon, color, position")
  .order("position");
```

### Query per Storico Stati
```typescript
const { data: history } = await supabase
  .from("order_status_history")
  .select(`
    id, status_id, changed_at,
    status:order_statuses(name, color)
  `)
  .eq("order_id", orderId)
  .order("changed_at", { ascending: false });
```
