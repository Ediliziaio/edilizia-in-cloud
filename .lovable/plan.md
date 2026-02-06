

# Piano: Correzione Riepilogo Finanziario e Bug Articoli

## Problemi Identificati

### 1. Input/Cancellazione Importi Non Funziona Correttamente
Il problema e causato dalla logica di conversione tra modalita "Imponibile" e "IVA Inclusa". Quando l'utente e in modalita "gross" (IVA Inclusa), il campo mostra `totalWithVat.toFixed(2)` che viene ricalcolato continuamente, rendendo impossibile la modifica e la cancellazione.

**Causa**: Il `displayAmount` viene ricalcolato ad ogni render, sovrascrivendo l'input dell'utente.

**Soluzione**: Usare uno stato separato per l'input grezzo (`rawInput`) e sincronizzarlo con la logica di calcolo solo quando l'utente cambia modalita o aliquota IVA.

---

### 2. Stato Pagamento (Pagato/Non Pagato) Poco Chiaro
Attualmente viene usato un checkbox che non e intuitivo. L'utente preferisce un menu a tendina.

**Soluzione**: Sostituire il checkbox con un Select che mostra:
- "Non Pagato" 
- "Pagato"

Aggiungere anche la possibilita di impostare la **data prevista di incasso** per gli acconti non ancora pagati (non solo per il saldo).

---

### 3. Click su "Aggiungi" Articoli Causa Uscita dalla Pagina
Il problema e che il bottone "Aggiungi" si trova dentro un `<form>` e, se non ha `type="button"`, viene trattato come `type="submit"` di default, causando l'invio del form.

**Soluzione**: Assicurarsi che tutti i bottoni nel componente `OrderItemsList` abbiano `type="button"` esplicito.

---

## Modifiche da Effettuare

### File: `src/components/orders/FinancialSummary.tsx`

1. **Correggere la gestione dell'input importo**
   - Usare uno stato locale `rawInput` per l'importo inserito dall'utente
   - Sincronizzare con il parent solo quando l'input perde il focus o al cambio modalita
   - Permettere la cancellazione completa del campo

2. **Sostituire Checkbox con Select per stato pagamento**
   - Cambiare da checkbox a menu tendina con opzioni "Non Pagato" / "Pagato"
   - Mostrare data incasso quando pagato
   - Mostrare data prevista incasso quando NON pagato (per tutti: Acconto 1, Acconto 2, Saldo)

3. **Aggiungere date previste per gli acconti**
   - Nuove props: `depositExpectedDate`, `deposit2ExpectedDate`
   - Nuovi campi nel database per queste date

---

### File: `src/components/orders/OrderItemsList.tsx`

1. **Aggiungere `type="button"` al pulsante "Aggiungi"**
   - Linea 200: Il bottone `<Button size="sm" onClick={openAddDialog}>` deve avere `type="button"`
   - Questo previene il submit del form quando si clicca su "Aggiungi"

---

### Migrazione Database (opzionale)

Se si vogliono le date previste anche per gli acconti:

```sql
ALTER TABLE orders
ADD COLUMN deposit_expected_date DATE,
ADD COLUMN deposit_2_expected_date DATE;
```

---

## Nuovo Design UI - Stato Pagamento

### Acconto 1 (con Select invece di Checkbox)
```
+------------------------------------------+
| Acconto 1                                |
| € [5.000,00]                             |
+------------------------------------------+
| Stato: [Non Pagato ▼]                    |
|        - Non Pagato                      |
|        - Pagato                          |
|                                          |
| Data Prevista Incasso: [01/03/2026]      |
+------------------------------------------+
```

### Acconto 1 (quando Pagato)
```
+------------------------------------------+
| Acconto 1                                |
| € [5.000,00]                             |
+------------------------------------------+
| Stato: [Pagato ▼]                        |
| Data Incasso: [05/02/2026]               |
+------------------------------------------+
```

---

## Correzione Input Importo

### Prima (problematico)
```typescript
// Problema: displayAmount viene ricalcolato ogni render
const displayAmount = inputMode === 'gross' ? totalWithVat.toFixed(2) : totalAmount;

<Input value={displayAmount} onChange={...} />
```

### Dopo (corretto)
```typescript
// Soluzione: stato locale per l'input
const [rawInput, setRawInput] = useState("");

// Sincronizzazione solo al blur o cambio modalita
const handleBlur = () => {
  if (inputMode === 'gross') {
    const grossAmount = parseFloat(rawInput) || 0;
    const netAmount = grossAmount / (1 + vat / 100);
    onTotalAmountChange(netAmount.toFixed(2));
  } else {
    onTotalAmountChange(rawInput);
  }
};

<Input 
  value={rawInput} 
  onChange={(e) => setRawInput(e.target.value)}
  onBlur={handleBlur}
/>
```

---

## Riepilogo Modifiche

| File | Modifica |
|------|----------|
| `FinancialSummary.tsx` | Correggere input importo, Select per pagato/non pagato, date previste acconti |
| `OrderItemsList.tsx` | Aggiungere `type="button"` al pulsante Aggiungi |
| `CreateOrder.tsx` | Passare nuove props per date previste acconti |
| `EditOrder.tsx` | Passare nuove props per date previste acconti |
| Migrazione SQL | Aggiungere colonne `deposit_expected_date`, `deposit_2_expected_date` |

---

## Risultato Atteso

1. **Input funzionante** - L'utente puo inserire, modificare e cancellare gli importi senza problemi
2. **Stato pagamento chiaro** - Menu a tendina "Non Pagato" / "Pagato" intuitivo
3. **Date previste per tutti** - Ogni acconto e saldo non pagato puo avere una data prevista di incasso
4. **Nessuna uscita inaspettata** - Cliccare su "Aggiungi" articolo apre il dialog senza fare submit del form

