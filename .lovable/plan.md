
# Modalita di Pagamento a livello Fornitore + Tracciamento Rate Articolo

## Panoramica

Spostare la "Modalita di Pagamento" dal singolo articolo alla scheda fornitore (Impostazioni). Quando si seleziona un fornitore nell'articolo, la modalita viene ereditata automaticamente. Per modalita a rate (50/50, 30/70), tracciare separatamente acconto e saldo con date e stati, alimentando il previsionale cassa.

---

## 1. Migrazione Database

### Tabella `suppliers`: aggiungere colonna `payment_method`

```text
ALTER TABLE suppliers ADD COLUMN payment_method text DEFAULT NULL;
```

### Tabella `order_items`: aggiungere campi per tracciamento rate

```text
ALTER TABLE order_items 
  ADD COLUMN deposit_amount numeric DEFAULT 0,
  ADD COLUMN deposit_paid boolean DEFAULT false,
  ADD COLUMN deposit_paid_date date DEFAULT NULL,
  ADD COLUMN balance_amount numeric DEFAULT 0,
  ADD COLUMN balance_paid boolean DEFAULT false,
  ADD COLUMN balance_paid_date date DEFAULT NULL,
  ADD COLUMN balance_expected_date date DEFAULT NULL;
```

La colonna `payment_method` su `order_items` rimane (gia esistente) ma viene popolata automaticamente dal fornitore scelto.
I campi `is_paid` e `paid_date` esistenti diventano lo stato globale (usato per pagamenti a rata unica come Bonifico, Contanti, RIBA).

Per le modalita a rate (50/50, 30/70):
- `deposit_amount` / `deposit_paid` / `deposit_paid_date` = acconto
- `balance_amount` / `balance_paid` / `balance_paid_date` / `balance_expected_date` = saldo

---

## 2. Modifiche a `SuppliersConfig.tsx` (Impostazioni)

### Form fornitore
- Aggiungere un campo **"Modalita di Pagamento"** nella sezione "Dati Generali" con le stesse opzioni attualmente in `PAYMENT_METHODS`:
  - Bonifico unico, 50/50, 30/70, RIBA, Contanti, Altro
- Il campo viene salvato su `suppliers.payment_method`

### Interfaccia e form data
- Aggiungere `payment_method: string` a `SupplierFormData`
- Aggiungere alla tabella di visualizzazione una colonna "Modalita Pagamento"

---

## 3. Modifiche a `SupplierSelect.tsx` (Creazione inline fornitore)

### Dialog "Nuovo Fornitore"
- Aggiungere il campo **Modalita di Pagamento** nel dialog di creazione rapida
- Il campo viene salvato su `suppliers.payment_method`
- Il callback `onValueChange` deve restituire anche la `payment_method` del fornitore

### Interfaccia aggiornata
```text
onValueChange: (value: string | undefined, supplierVatRate?: number, paymentMethod?: string) => void;
```

---

## 4. Modifiche a `OrderItemsList.tsx` (Articoli ordine)

### Selezione fornitore
- Quando si seleziona un fornitore, la modalita di pagamento viene ereditata automaticamente dal fornitore
- Il campo "Modalita Pagamento" diventa read-only (mostra il valore del fornitore) oppure editabile come override

### Sezione "Stato Pagamento Fornitore" - logica condizionale

**Se modalita = Bonifico unico / Contanti / RIBA / Altro:**
- Un singolo toggle "Pagato / Non pagato" (usa `is_paid`)
- Data pagamento (`paid_date`)

**Se modalita = 50/50 o 30/70:**
- Calcolo automatico degli importi:
  - 50/50: acconto = 50% di (purchase_price * quantity), saldo = 50%
  - 30/70: acconto = 30%, saldo = 70%
- Sezione "Acconto":
  - Importo (calcolato, read-only)
  - Toggle Pagato
  - Data pagamento acconto
- Sezione "Saldo":
  - Importo (calcolato, read-only)
  - Toggle Pagato
  - Data pagamento saldo
  - Data prevista saldo (per il previsionale)

### State aggiuntivi
- `itemDepositAmount`, `itemDepositPaid`, `itemDepositPaidDate`
- `itemBalanceAmount`, `itemBalancePaid`, `itemBalancePaidDate`, `itemBalanceExpectedDate`

### Visualizzazione card articolo
- Mostrare le due rate con i relativi stati (es. "Acconto: Pagato il 15/01 | Saldo: Da pagare entro 15/03")
- Badge: verde se tutto pagato, arancione se parziale, rosso se scaduto

---

## 5. Aggiornamento salvataggio ordine

### `CreateOrder.tsx` e `EditOrder.tsx`
- Aggiornare il payload di insert/upsert per includere i nuovi campi rate:
  - `deposit_amount`, `deposit_paid`, `deposit_paid_date`
  - `balance_amount`, `balance_paid`, `balance_paid_date`, `balance_expected_date`

---

## 6. Integrazione Previsionale Cassa

### `useCashFlowData.ts`
- Aggiungere una query per `order_items` con `balance_paid = false` e `balance_expected_date` non null
- Queste voci appaiono come "Uscite Previste Fornitori" nel previsionale
- Raggruppare per mese e fornitore

### Dashboard `SupplierPaymentsSummary.tsx`
- Aggiornare per mostrare anche le rate (acconto pagato, saldo da pagare, data prevista)

---

## 7. Riepilogo file

| Azione | File |
|--------|------|
| Migrazione | Aggiungere `payment_method` a `suppliers` + campi rate a `order_items` |
| Modificare | `src/components/settings/SuppliersConfig.tsx` (campo modalita pagamento) |
| Modificare | `src/components/orders/SupplierSelect.tsx` (campo payment_method nel dialog + callback) |
| Modificare | `src/components/orders/OrderItemsList.tsx` (ereditare payment_method, UI rate condizionale) |
| Modificare | `src/pages/azienda/CreateOrder.tsx` (payload con campi rate) |
| Modificare | `src/pages/azienda/EditOrder.tsx` (payload con campi rate) |
| Modificare | `src/components/dashboard/SupplierPaymentsSummary.tsx` (mostrare rate) |
| Modificare | `src/hooks/useCashFlowData.ts` (query uscite previste fornitori) |

---

## 8. Flusso utente finale

1. **Impostazioni > Fornitori**: creo "ABC Serramenti" con modalita "50/50"
2. **Crea Ordine > Articolo**: seleziono "ABC Serramenti" come fornitore, la modalita "50/50" appare automaticamente
3. Inserisco costo acquisto 1000 EUR, il sistema calcola: Acconto 500 EUR, Saldo 500 EUR
4. Segno l'acconto come "Pagato" con data 15/01
5. Il saldo resta "Da pagare" con data prevista 15/03
6. **Dashboard**: il widget mostra "ABC Serramenti: 500 EUR pagati, 500 EUR da pagare"
7. **Previsionale**: il saldo da 500 EUR appare nelle uscite previste di marzo
