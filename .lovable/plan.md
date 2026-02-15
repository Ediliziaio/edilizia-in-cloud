

# Pagamenti Fornitori, Squadre Esterne e Dipendenti come Costi Variabili

## Obiettivo

Far comparire automaticamente nella sezione "Costi" tutti i pagamenti derivanti dagli ordini: articoli con fornitore (sdoppiati in acconto/saldo se rateizzati), squadre esterne e costi manodopera dipendenti. In questo modo la sezione Costi diventa il punto unico di controllo per tutte le uscite e alimenta correttamente il Previsionale.

---

## 1. Nuova query: Articoli con fornitore (pagamenti sdoppiati)

Sostituire la query attuale `orderItemCosts` (che filtra solo `da_ordinare`/`ordinato`) con una nuova query che recupera TUTTI gli articoli con `supplier_id` non nullo, includendo i campi necessari per la rateizzazione:

- `payment_method`, `deposit_amount`, `deposit_paid`, `deposit_paid_date`
- `balance_amount`, `balance_paid`, `balance_paid_date`, `balance_expected_date`
- `is_paid`, `paid_date`

### Logica di trasformazione (`useMemo`)

Per ogni articolo con fornitore:
- Se `payment_method` e' `50_50` o `30_70`: genera DUE righe
  - Riga 1: "Acconto - [nome articolo]" con importo `deposit_amount`, stato `deposit_paid`, data `deposit_paid_date`
  - Riga 2: "Saldo - [nome articolo]" con importo `balance_amount`, stato `balance_paid`, data scadenza `balance_expected_date`
- Altrimenti: genera UNA riga con il costo totale (`purchase_price * quantity`), stato `is_paid`

Ogni riga avra' `supplierName` visibile e link all'ordine.

## 2. Nuova query: Squadre esterne

Aggiungere una query su `order_external_teams` (join con `external_teams` per il nome e `orders` per il codice ordine), filtrando per `company_id`.

Trasformazione: ogni riga diventa un costo variabile con:
- Nome: "[nome squadra]"
- Importo: `total_cost`
- Data: `payment_date`
- Stato: `is_paid`
- Categoria: "Squadre Esterne"

## 3. Nuova query: Dipendenti (costi manodopera)

Aggiungere una query su `order_employees` (join con `employees` per il nome e `orders` per il codice ordine), filtrando per `company_id`.

Trasformazione: ogni riga diventa un costo variabile con:
- Nome: "[nome dipendente]"
- Importo: `total_cost`
- Data: data corrente (non c'e' campo specifico)
- Stato: non gestito (sempre "da pagare" come voce informativa)
- Categoria: "Manodopera"

## 4. Integrazione nella vista

Tutte queste righe "da ordine" verranno unite in `variableCostsWithOrders` e `allCostsSorted`, con il flag `isFromOrder: true` per impedire modifica/eliminazione (sono dati derivati dagli ordini).

Le tab resteranno: "Tutti", "Fissi", "Variabili" -- ma la tab "Variabili" ora includera' anche fornitori sdoppiati, squadre e manodopera.

## 5. Stat cards

Le stat cards "Da pagare" e "Pagato" includeranno anche i totali di questi costi derivati dagli ordini, dando una visione completa.

## 6. Mini-grafico

Il mini-grafico distribuzione mensile includera' anche i costi derivati dagli ordini nei calcoli "Variabili".

---

## File modificato

Solo `src/components/forecast/CompanyCostsManager.tsx`:

1. Sostituire query `orderItemCosts` con query piu' completa (tutti gli articoli con supplier, tutti i campi pagamento)
2. Aggiungere query `externalTeamCosts` su `order_external_teams`
3. Aggiungere query `employeeCosts` su `order_employees`
4. Riscrivere `orderItemsAsVariableCosts` per sdoppiare gli articoli rateizzati
5. Creare `externalTeamAsVariableCosts` e `employeeAsVariableCosts`
6. Unire tutto in `variableCostsWithOrders` e `allCostsSorted`
7. Aggiornare il mini-grafico per includere costi da ordine nei "Variabili"

Nessuna modifica al database.

