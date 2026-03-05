

# Miglioramento Sezione Ordini — Colonne dinamiche, link su codice, data ordine

## Obiettivo
1. Rendere il **codice ordine** cliccabile → apre il dettaglio
2. Aggiungere la colonna **Data Ordine** (created_at)
3. Aggiungere **colonne opzionali** configurabili dall'utente: Venditore, Manodopera (dipendenti/squadre esterne), con possibilità di attivare/disattivare colonne dalla UI

---

## 1. Codice ordine cliccabile (OrdersTable.tsx)

Trasformare la cella "Codice" da testo semplice a `<Link>` verso `/azienda/ordini/${order.id}`:

```tsx
<TableCell className="font-medium">
  <Link to={`/azienda/ordini/${order.id}`} className="text-primary hover:underline">
    {order.order_code || "—"}
  </Link>
</TableCell>
```

---

## 2. Colonna "Data Ordine"

Aggiungere dopo "Codice" una colonna con `format(new Date(order.created_at), "dd/MM/yyyy")`. Il dato `created_at` è già presente nell'interfaccia `OrderWithDetails`.

---

## 3. Colonne opzionali configurabili

### Dati aggiuntivi necessari (da OrdersList.tsx)
Le query per `order_employees`, `order_external_teams`, `order_salespeople` già esistono ma selezionano solo costi. Occorre **espandere** le query per includere nomi:

- `order_salespeople`: aggiungere `salesperson:profiles!order_salespeople_salesperson_id_fkey(first_name, last_name)`
- `order_employees`: aggiungere `employee:employees!order_employees_employee_id_fkey(first_name, last_name)`
- `order_external_teams`: aggiungere `external_team:external_teams!order_external_teams_external_team_id_fkey(name)`

### Struttura colonne opzionali

Definire un set di colonne extra disponibili:

| Chiave | Label | Sorgente |
|--------|-------|----------|
| `date` | Data Ordine | `order.created_at` — **sempre visibile** |
| `salesperson` | Venditore | `salespeopleMap.get(order.id)` |
| `employees` | Manodopera | `employeesMap.get(order.id)` + `teamsMap.get(order.id)` |
| `expected_date` | Data Prevista | `order.expected_date` |
| `warehouse_date` | Data Magazzino | `order.warehouse_arrival_date` |

### UI per attivare/disattivare colonne

Aggiungere un pulsante **"Colonne"** con un `DropdownMenu` con checkbox per ogni colonna opzionale. Lo stato viene salvato in `localStorage` per persistenza tra sessioni.

### Filtro per venditore e manodopera

Aggiungere in `OrdersFilters.tsx` (o nella pagina OrdersList):
- **Filtro Venditore**: Select con lista venditori unici estratti da `salespeopleData`
- **Filtro Manodopera**: Select con lista dipendenti/squadre unici

I filtri vengono applicati nella logica `filteredOrders` in OrdersList.tsx.

---

## 4. Passaggio dati a OrdersTable

Nuove props per OrdersTable:
- `salespeopleMap: Map<string, string[]>` (order_id → nomi venditori)
- `employeesMap: Map<string, string[]>` (order_id → nomi dipendenti + squadre)
- `visibleColumns: Set<string>` (colonne attive)

---

## File da modificare

| File | Intervento |
|------|-----------|
| `OrdersTable.tsx` | Codice cliccabile, colonna Data, colonne opzionali condizionali (venditore, manodopera, date), nuove props |
| `OrdersList.tsx` | Espandere query salespeople/employees/teams per includere nomi, costruire mappe nomi, stato colonne con localStorage, filtri venditore/manodopera, pulsante "Colonne", passare nuovi dati a OrdersTable |

Nessuna migrazione DB necessaria — i dati sono già tutti nelle tabelle esistenti.

