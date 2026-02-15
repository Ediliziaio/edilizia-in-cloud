
# Riepilogo Pagamenti Fornitori nella pagina Dettaglio Ordine

## Panoramica

Aggiungere un nuovo componente `SupplierPaymentsCard` nella sidebar della pagina Dettaglio Ordine che mostra lo stato dei pagamenti verso i fornitori per gli articoli dell'ordine, con barre di progresso e timeline delle scadenze.

---

## 1. Aggiornare `OrderItemData` in `OrderDetail.tsx`

L'interfaccia `OrderItemData` (riga 166) non include i nuovi campi installment. Aggiungere:

- `payment_method: string | null`
- `deposit_amount: number | null`
- `deposit_paid: boolean | null`
- `deposit_paid_date: string | null`
- `balance_amount: number | null`
- `balance_paid: boolean | null`
- `balance_paid_date: string | null`
- `balance_expected_date: string | null`

---

## 2. Creare il componente `SupplierPaymentsCard`

Nuovo file: `src/components/orders/SupplierPaymentsCard.tsx`

### Props
- `items`: array di OrderItemData (con i campi installment)

### Logica
- Raggruppa gli articoli per `supplier_id`
- Per ogni fornitore, calcola:
  - **Totale lordo**: somma di `purchase_price * quantity` per ogni articolo
  - **Importo pagato**: basato su `payment_method`:
    - Modalita a rata unica (bonifico, riba, contanti, altro): usa `is_paid` per determinare se tutto e' pagato
    - Modalita a rate (50/50, 30/70): somma `deposit_amount` se `deposit_paid` + `balance_amount` se `balance_paid`
  - **Importo da pagare**: totale - pagato
  - **Prossima scadenza**: `balance_expected_date` piu' vicina non ancora pagata

### UI
- Card con titolo "Pagamenti Fornitori" e icona Truck
- Per ogni fornitore:
  - Nome fornitore + badge stato (Pagato / Parziale / Da pagare)
  - Barra di progresso con percentuale pagata
  - Riga dettaglio: importo pagato / totale
  - Se presente `balance_expected_date` non pagato: mostra "Scadenza saldo: DD/MM/YYYY" con colore rosso se scaduto, arancione se entro 7 giorni, grigio altrimenti
- Se nessun articolo ha un fornitore: messaggio "Nessun fornitore associato"
- Sezione riepilogo totale in alto con totale pagato vs da pagare

---

## 3. Integrare in `OrderDetail.tsx`

- Importare `SupplierPaymentsCard`
- Inserirlo nella sidebar (colonna destra), dopo `OrderEconomics` e prima di `OrderLaborCosts` (circa riga 776)
- Passare gli `orderItems` con tutti i campi installment

---

## 4. Aggiornare il mapping `displayItems`

Il mapping attuale (riga 480-503) non include i campi installment. Aggiungere il passaggio di:
- `payment_method`, `deposit_amount`, `deposit_paid`, `deposit_paid_date`
- `balance_amount`, `balance_paid`, `balance_paid_date`, `balance_expected_date`

---

## 5. Riepilogo file

| Azione | File |
|--------|------|
| Creare | `src/components/orders/SupplierPaymentsCard.tsx` |
| Modificare | `src/pages/azienda/OrderDetail.tsx` (interfaccia + mapping + integrazione) |

---

## 6. Risultato visivo atteso

Per un ordine con 2 articoli:
- "ABC Serramenti" (50/50, 1000 EUR): acconto 500 EUR pagato, saldo 500 EUR da pagare entro 15/03
- "XYZ Vetri" (bonifico unico, 600 EUR): non pagato

Il widget mostrera':

```text
Pagamenti Fornitori
--------------------
Totale: Pagato €500 | Da pagare €1.100

ABC Serramenti         [Parziale]
[=========>          ] 50%
€500 / €1.000
Scadenza saldo: 15/03/2026

XYZ Vetri              [Da pagare]
[                    ] 0%
€0 / €600
```
