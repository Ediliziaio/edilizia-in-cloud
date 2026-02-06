

# Piano: Finanziamento con Acconto Opzionale

## Situazione Attuale

Attualmente il sistema gestisce il tipo di pagamento come:
- **Standard**: Acconto 1 + Acconto 2 = calcola Saldo
- **Finanziamento**: Solo valore finanziamento, Saldo = 0

## Nuova Logica Richiesta

Il finanziamento deve supportare due scenari:
1. **Finanziamento Totale** - L'intero importo è coperto dalla finanziaria
2. **Acconto + Finanziamento** - Il cliente paga un acconto e il resto viene finanziato

---

## Modifiche UI - FinancialSummary

### Vista Finanziamento Aggiornata

```
+------------------------------------------+
| Tipo Pagamento: [Finanziamento ▼]        |
+------------------------------------------+
| Importo Totale *    € [15.000,00]        |
| Aliquota IVA        [22% ▼]              |
+------------------------------------------+
| Imponibile:         € 15.000,00          |
| IVA (22%):          €  3.300,00          |
| Totale con IVA:     € 18.300,00          |
+------------------------------------------+
| Acconto (opzionale) € [3.000,00]         |
| Valore Finanziamento € [15.300,00]       |
+------------------------------------------+
| Saldo da Pagare     € 0,00               |
| (coperto da finanziamento)               |
+------------------------------------------+
```

### Logica di Calcolo

```typescript
// Modalita Finanziamento
if (paymentType === 'financing') {
  // L'acconto e opzionale
  // Il finanziamento copre: Totale con IVA - Acconto
  const totalWithVat = total + vatAmount;
  const deposit = depositAmount || 0;
  const suggestedFinancing = totalWithVat - deposit;
  
  // Il saldo e sempre 0 perche coperto dal finanziamento
  balance = 0;
}
```

---

## File da Modificare

| File | Modifiche |
|------|-----------|
| `src/components/orders/FinancialSummary.tsx` | Aggiungere campo Acconto anche per finanziamento |
| `src/components/orders/CustomerFinancialSummary.tsx` | Mostrare acconto + finanziamento se presenti |
| `src/pages/azienda/CreateOrder.tsx` | Nessuna modifica (gia gestisce depositAmount) |
| `src/pages/azienda/EditOrder.tsx` | Nessuna modifica (gia gestisce depositAmount) |

---

## Dettagli Implementazione

### FinancialSummary.tsx - Sezione Finanziamento

La sezione finanziamento mostrera:

1. **Campo Acconto (opzionale)** - Il cliente puo versare un acconto iniziale
2. **Campo Valore Finanziamento** - L'importo finanziato dalla finanziaria
3. **Riepilogo** - Mostra che il saldo e coperto

```
Quando paymentType === 'financing':
  - Mostra campo "Acconto" (opzionale, usa depositAmount)
  - Mostra campo "Valore Finanziamento" (usa financingAmount)
  - Calcolo suggerito: Finanziamento = Totale con IVA - Acconto
  - Saldo finale = € 0,00 (coperto da acconto + finanziamento)
```

### CustomerFinancialSummary.tsx - Vista Cliente

Se il pagamento e tramite finanziamento, il cliente vedra:
- Acconto versato (se presente)
- Importo finanziato
- Saldo = € 0,00 con nota "Pagamento tramite finanziaria"

---

## Esempio Pratico

**Ordine da € 15.000 + IVA 22% = € 18.300 totale**

**Scenario 1 - Finanziamento Totale:**
- Acconto: € 0
- Finanziamento: € 18.300
- Saldo: € 0

**Scenario 2 - Acconto + Finanziamento:**
- Acconto: € 3.000
- Finanziamento: € 15.300
- Saldo: € 0

---

## Riepilogo Modifiche

Le modifiche sono limitate ai componenti `FinancialSummary.tsx` e `CustomerFinancialSummary.tsx`:

1. Nella modalita finanziamento, aggiungere il campo "Acconto (opzionale)" prima del campo "Valore Finanziamento"
2. Aggiornare la vista read-only per mostrare sia acconto che finanziamento quando presenti
3. Aggiornare la vista cliente per mostrare entrambi i valori

Non sono necessarie modifiche al database poiche i campi `deposit_amount` e `financing_amount` esistono gia nella tabella `orders`.

