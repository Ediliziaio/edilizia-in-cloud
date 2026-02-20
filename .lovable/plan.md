

# Analisi Completa del Software - Area Azienda

## 1. ARCHITETTURA GENERALE - Valutazione: Buona

L'architettura e solida e ben strutturata:
- **Routing** correttamente protetto con `ProtectedRoute` e ruoli (`company_admin`, `company_staff`, `super_admin`)
- **Multi-tenancy** gestito via `effectiveCompany` dall'AuthContext, con supporto impersonazione super admin
- **Error Boundary** su tutti i layout principali
- **QueryClient** configurato con gestione errori centralizzata (QueryCache + MutationCache)
- **RLS policies** correttamente applicate su tutte le tabelle

---

## 2. PROBLEMI TROVATI

### 2.1 BUG - Warning React nel Magazzino (Priorita: Bassa)
- **Console log**: `Function components cannot be given refs` nel componente `Warehouse` legato a `Select` di Radix
- Il componente `Select` riceve un `ref` ma non usa `forwardRef`. Non causa crash ma genera warning.

### 2.2 BUG - Checkbox "indeterminate" nella OrdersTable (Priorita: Bassa)
```typescript
ref={(el) => {
  if (el) (el as any).indeterminate = someSelected;
}}
```
- Il componente `Checkbox` di Radix non supporta nativamente la proprieta `indeterminate` via ref DOM. Il cast `as any` e fragile. Lo stato "indeterminate" potrebbe non funzionare visivamente.
- **Soluzione**: usare la prop `checked` con valore `"indeterminate"` supportato da Radix (`checked={allSelected ? true : someSelected ? "indeterminate" : false}`).

### 2.3 BUG - Ordini senza `order_errors` (Priorita: Media)
- La query in GlobalErrors usa `orders!inner(...)` (inner join). Se un errore ha un `order_id` che punta a un ordine eliminato, l'errore non apparira nella vista globale. Si consiglia di usare un left join o gestire il caso.

### 2.4 BUG - deleteOneOrder non elimina `order_errors` (Priorita: Alta)
```typescript
const deleteOneOrder = async (orderId: string) => {
  // Elimina items, attachments, history, employees, external_teams, salespeople
  // MA NON elimina order_errors!
};
```
- Quando un ordine viene eliminato, i record `order_errors` associati restano orfani nel database. Questo inquina i dati della vista globale errori e del previsionale.
- **Soluzione**: aggiungere `supabase.from("order_errors").delete().eq("order_id", orderId)` nel `Promise.all`.

### 2.5 BUG - deleteOneOrder non elimina `tasks` e `appointments` (Priorita: Alta)
- Le tabelle `tasks` e `appointments` hanno un campo `order_id`. L'eliminazione ordine non pulisce questi record collegati.
- **Soluzione**: aggiungere `supabase.from("tasks").delete().eq("order_id", orderId)` e `supabase.from("appointments").delete().eq("order_id", orderId)`.

### 2.6 PROBLEMA - Limite 1000 righe Supabase (Priorita: Media)
- La query ordini in `OrdersList.tsx` non ha un limite esplicito. Per aziende con piu di 1000 ordini, i risultati saranno troncati silenziosamente dal default di Supabase.
- Stesso problema per `order_items` nelle query batch dei costi (`itemCosts`, `employeeCosts`, ecc.) che usano `.in("order_id", orderIds)`.
- **Soluzione**: implementare paginazione o aumentare il range con `.range()`.

### 2.7 PROBLEMA - Statistiche totalGross calcolate in modo impreciso (Priorita: Bassa)
```typescript
const totalGross = filteredOrders.reduce((sum, o) => sum + o.total_amount * (1 + (o.vat_rate ?? 22) / 100), 0);
```
- `total_amount` nel database sembra essere gia l'importo imponibile (netto). Il calcolo dell'ivato e corretto. Tuttavia, le `OrdersStatsCards` mostrano questo come "Totale Lordo" che potrebbe confondere l'utente finale.

### 2.8 PROBLEMA - Settings TabsList dinamica con grid-cols hardcoded (Priorita: Bassa)
```typescript
<TabsList className={`grid w-full ${isAdmin ? 'grid-cols-10' : 'grid-cols-5'} lg:w-[${isAdmin ? '1300' : '750'}px]`}>
```
- L'interpolazione dentro le classi Tailwind (`lg:w-[${...}px]`) non funziona. Tailwind non genera classi dinamiche. La larghezza non verra applicata.
- **Soluzione**: usare classi statiche o lo stile inline.

---

## 3. SEZIONI ANALIZZATE - Funzionamento Corretto

### Dashboard (`CompanyDashboard.tsx`)
- Query parallelizzate con `Promise.all` (7 query simultanee) - ottimizzato
- Gestione stati: loading, errore, vuoto - tutti coperti
- Financial alerts intelligenti (pagamenti scaduti, uscite > entrate)
- Widget: Stat Cards, Ordini Recenti, Cash Flow, Labor Costs, Warehouse Alerts, Supplier Payments, Quick Actions

### Ordini (`OrdersList.tsx`)
- Vista tabella + pipeline (Kanban) con toggle
- Filtri completi: ricerca, stato, pagamento, cliente, importo, date multiple
- Selezione multipla + azioni bulk (cambio stato, eliminazione) - appena implementato
- Export/Import CSV funzionante
- Calcolo marginalita per ordine con costi variabili

### Magazzino (`Warehouse.tsx`)
- 3 viste: Kanban, Lista, Calendario + tab Stock
- Filtri per stato, fornitore, ordine
- Alert urgenze integrati

### Previsionale (`CashFlowForecast.tsx`)
- Tab: Incassi, Costi, Cash Flow, Tesoreria, Marginalita
- Export CSV e stampa
- Hook dedicato `useCashFlowData` per centralizzazione dati

### Errori Globali (`GlobalErrors.tsx`)
- Stat cards, grafici Recharts (categoria + trend), tabella con filtri
- Appena implementato, funzionamento corretto

### Impostazioni (`Settings.tsx`)
- 10 tab per admin, 5 per staff
- Profilo, Stati Ordine, Catalogo, Fornitori, Utenti, Venditori, Staff, Attivita, Automazioni, Sicurezza

### Attivita (`Tasks.tsx`)
- Filtri per stato, priorita, categoria
- Stat cards con KPI
- Link agli ordini collegati

---

## 4. RIEPILOGO PRIORITA

| # | Problema | Priorita | Impatto |
|---|----------|----------|---------|
| 2.4 | deleteOneOrder non elimina order_errors | Alta | Dati orfani, statistiche inquinate |
| 2.5 | deleteOneOrder non elimina tasks/appointments | Alta | Dati orfani, task/appuntamenti fantasma |
| 2.6 | Limite 1000 righe Supabase | Media | Dati troncati per aziende grandi |
| 2.3 | Inner join in GlobalErrors | Media | Errori orfani nascosti |
| 2.2 | Checkbox indeterminate | Bassa | Stato visivo non corretto |
| 2.1 | Warning ref nel Magazzino | Bassa | Solo warning console |
| 2.7 | Label "Totale Lordo" | Bassa | Confusione utente |
| 2.8 | Tailwind dinamico in Settings | Bassa | Larghezza TabsList non applicata |

---

## 5. PIANO DI FIX CONSIGLIATO

Se approvi, procedo a correggere i problemi trovati in ordine di priorita:

1. **Fix deleteOneOrder**: aggiungere eliminazione `order_errors`, `tasks`, `appointments`
2. **Fix Checkbox indeterminate**: usare la prop nativa di Radix
3. **Fix Tailwind dinamico in Settings**: classi statiche
4. **Fix Warning Warehouse**: forwardRef o rimuovere ref

I problemi di limite 1000 righe e inner join richiedono una decisione architetturale (paginazione vs range) che possiamo discutere separatamente.

