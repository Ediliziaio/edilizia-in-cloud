
# Piano: Correzione Bug Creazione Ordine e Miglioramento Gestione Pagamenti

## Problemi Identificati

### 1. Errore "Company not found" durante la creazione dell'ordine
L'errore si verifica perché il profilo dell'utente corrente ha `company_id = null`. La query per ottenere il `company_id` non trova un valore valido.

**Causa**: L'utente loggato potrebbe non avere un `company_id` associato nel suo profilo, oppure la query non sta usando correttamente il `company_id` del contesto di autenticazione.

**Soluzione**: Utilizzare `effectiveCompany` dal contesto `AuthContext` invece di fare una query separata. Questo risolve anche il caso di impersonation per il super_admin.

### 2. Miglioramenti Gestione Finanziaria Richiesti
- Possibilità di inserire l'importo IVA inclusa e calcolare automaticamente l'imponibile
- Stato pagamento per ogni acconto (pagato/non pagato)
- Data prevista pagamento saldo
- Pianificazione pagamenti

---

## Modifiche Database

Nuovi campi nella tabella `orders`:

| Campo | Tipo | Descrizione |
|-------|------|-------------|
| `deposit_paid` | BOOLEAN | Acconto 1 pagato |
| `deposit_paid_date` | DATE | Data pagamento acconto 1 |
| `deposit_2_paid` | BOOLEAN | Acconto 2 pagato |
| `deposit_2_paid_date` | DATE | Data pagamento acconto 2 |
| `balance_paid` | BOOLEAN | Saldo pagato |
| `balance_paid_date` | DATE | Data pagamento saldo |
| `balance_expected_date` | DATE | Data prevista pagamento saldo |

---

## Modifiche UI - FinancialSummary

### Vista Aggiornata con Stato Pagamenti

```
+------------------------------------------+
| Importo Totale                           |
| [Tab: Imponibile | Ivato]                |
| € [15.000,00]                            |
+------------------------------------------+
| Aliquota IVA: [22% ▼]                    |
+------------------------------------------+
| Imponibile:         € 15.000,00          |
| IVA (22%):          €  3.300,00          |
| Totale con IVA:     € 18.300,00          |
+------------------------------------------+
| ACCONTI                                  |
+------------------------------------------+
| Acconto 1                                |
| € [5.000,00]                             |
| [x] Pagato   Data: [05/02/2026]          |
+------------------------------------------+
| Acconto 2                                |
| € [3.000,00]                             |
| [ ] Pagato   Data: [--]                  |
+------------------------------------------+
| SALDO                                    |
+------------------------------------------+
| Saldo da Pagare:    € 10.300,00          |
| [ ] Pagato   Data prevista: [01/03/2026] |
+------------------------------------------+
```

### Nuove Funzionalità

1. **Toggle Imponibile/Ivato**
   - L'utente può scegliere se inserire l'importo come imponibile o già ivato
   - Se sceglie "Ivato", il sistema calcola automaticamente l'imponibile in base all'aliquota IVA selezionata

2. **Stato Pagamento Acconti**
   - Checkbox "Pagato" per ogni acconto
   - Campo data pagamento (visibile quando "Pagato" è selezionato)

3. **Pianificazione Saldo**
   - Checkbox "Saldo Pagato"
   - Campo "Data prevista pagamento" (visibile quando non pagato)
   - Campo "Data pagamento" (visibile quando pagato)

---

## File da Modificare

| File | Modifiche |
|------|-----------|
| Migrazione SQL | Nuovi campi per stato pagamenti |
| `src/components/orders/FinancialSummary.tsx` | Toggle imponibile/ivato, stato pagamenti, date |
| `src/pages/azienda/CreateOrder.tsx` | Usare `effectiveCompany` da AuthContext, nuovi campi |
| `src/pages/azienda/EditOrder.tsx` | Nuovi campi stato pagamenti |
| `src/pages/azienda/OrderDetail.tsx` | Visualizzare stato pagamenti |

---

## Dettagli Tecnici

### Correzione Bug CreateOrder

```typescript
// PRIMA (problematico)
const { data: profile } = useQuery({
  queryKey: ["profile", user?.id],
  queryFn: async () => {
    const { data } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", user!.id)
      .single();
    return data;
  },
});
// company_id può essere null

// DOPO (corretto)
const { effectiveCompany } = useAuth();
// effectiveCompany.id è sempre disponibile per company_admin
// e funziona anche con impersonation per super_admin
```

### Logica Toggle Imponibile/Ivato

```typescript
const [inputMode, setInputMode] = useState<'net' | 'gross'>('net');
const [rawAmount, setRawAmount] = useState("");

// Calcolo automatico
if (inputMode === 'gross') {
  // L'utente inserisce il totale IVA inclusa
  const grossAmount = parseFloat(rawAmount) || 0;
  const netAmount = grossAmount / (1 + vatRate / 100);
  // Mostra: Imponibile = netAmount, Totale con IVA = grossAmount
} else {
  // L'utente inserisce l'imponibile
  const netAmount = parseFloat(rawAmount) || 0;
  const grossAmount = netAmount * (1 + vatRate / 100);
}
```

### Nuova Interfaccia Props FinancialSummary

```typescript
interface FinancialSummaryProps {
  // Campi esistenti...
  totalAmount: string;
  depositAmount: string;
  deposit2Amount: string;
  // Nuovi campi
  depositPaid: boolean;
  depositPaidDate?: Date;
  deposit2Paid: boolean;
  deposit2PaidDate?: Date;
  balancePaid: boolean;
  balancePaidDate?: Date;
  balanceExpectedDate?: Date;
  // Callbacks
  onDepositPaidChange: (paid: boolean) => void;
  onDepositPaidDateChange: (date?: Date) => void;
  onDeposit2PaidChange: (paid: boolean) => void;
  onDeposit2PaidDateChange: (date?: Date) => void;
  onBalancePaidChange: (paid: boolean) => void;
  onBalancePaidDateChange: (date?: Date) => void;
  onBalanceExpectedDateChange: (date?: Date) => void;
}
```

---

## Migrazione SQL

```sql
-- Nuovi campi per stato pagamenti
ALTER TABLE orders
ADD COLUMN deposit_paid BOOLEAN DEFAULT false,
ADD COLUMN deposit_paid_date DATE,
ADD COLUMN deposit_2_paid BOOLEAN DEFAULT false,
ADD COLUMN deposit_2_paid_date DATE,
ADD COLUMN balance_paid BOOLEAN DEFAULT false,
ADD COLUMN balance_paid_date DATE,
ADD COLUMN balance_expected_date DATE;
```

---

## Risultato Atteso

1. **Creazione ordine funzionante** - Corretto il bug che impediva di creare ordini
2. **Input flessibile importo** - L'utente può inserire l'importo come imponibile o già con IVA
3. **Tracciamento pagamenti** - Ogni acconto ha uno stato "Pagato" con data
4. **Pianificazione saldo** - Il saldo ha una data prevista di pagamento
5. **Vista completa** - Nel dettaglio ordine si vedono tutti gli stati dei pagamenti

---

## Riepilogo Visivo Stato Pagamenti (Dettaglio Ordine)

```
+------------------------------------------+
| Stato Pagamenti                          |
+------------------------------------------+
| Acconto 1: € 5.000    ✅ Pagato 05/02    |
| Acconto 2: € 3.000    ⏳ In attesa       |
| Saldo:     € 10.300   📅 Previsto 01/03  |
+------------------------------------------+
```

