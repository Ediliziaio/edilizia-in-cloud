
# Fix: Provvigioni calcolate su base sbagliata nel Conto Economico

## Il problema
`totalAmount` (passato come prop) e gia l'**imponibile** (netto IVA) -- lo si vede nella sezione VENDITA dove e mostrato come "Imponibile". Ma il codice chiama `calculateNetFromGross(totalAmount, vatRate)` che scorporta l'IVA **una seconda volta**, riducendo la base di calcolo delle provvigioni.

Esempio concreto: imponibile 8.181,82 EUR con IVA 10% e provvigione 10% sull'incassato con incassato = 3.000 EUR:
- Attuale (sbagliato): 3.000 / 1.10 = 2.727,27 --> 10% = 272,73 EUR
- Corretto: 3.000 e gia imponibile --> 10% = 300,00 EUR

Secondo problema: `OrderEconomics` non riceve `collectedAmount` come prop da `OrderDetail`, quindi le provvigioni "% sull'incassato" risultano sempre 0 nel Conto Economico.

## La soluzione

### File 1: `src/components/orders/OrderEconomics.tsx`
- **Rimuovere** le righe 156-157 che chiamano `calculateNetFromGross` su `totalAmount` e `collectedAmount`
- Usare direttamente `totalAmount` e `collectedAmount` nella funzione `calculateCommission` (sono gia imponibili)

### File 2: `src/pages/azienda/OrderDetail.tsx`
- Passare la prop `collectedAmount` a `OrderEconomics`, calcolata nello stesso modo in cui viene passata a `OrderCommissions` (somma dei pagamenti effettuati: acconto + acconto 2 + saldo)

### File 3: `src/components/orders/OrderCommissions.tsx`
- Stesso bug: righe 98-99 chiamano `calculateNetFromGross` su `totalAmount` e `collectedAmount` che sono gia importi netti
- Rimuovere le righe 98-99 e usare direttamente `totalAmount` e `collectedAmount` nella funzione `calculateCommission`
- Aggiornare la sezione "Decurtazioni dall'ordine" per mostrare `totalAmount` invece di `netTotalAmount`

## Impatto
Nessun cambiamento di comportamento funzionale desiderato. Solo correzione dei calcoli errati che scorporavano l'IVA due volte.
