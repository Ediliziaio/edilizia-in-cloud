

# Spostare 4 sezioni nella sidebar destra

Spostare `SupplierPaymentsCard`, `OrderLaborCosts`, `OrderCommissions` e `OrderErrors` dalla colonna sinistra (righe 714-733) alla colonna destra, posizionandole dopo "Storico Stati" e prima di "Data Consegna Prevista".

### File: `src/pages/azienda/OrderDetail.tsx`

**Rimuovere** dalla colonna sinistra (righe 714-733):
- `SupplierPaymentsCard`
- `OrderLaborCosts`
- `OrderCommissions`
- `OrderErrors`

**Inserire** nella colonna destra dopo lo Storico Stati (dopo riga 816), nello stesso ordine:
1. Pagamenti Fornitori
2. Manodopera
3. Provvigioni
4. Errori / Perdite

La colonna sinistra rimarrà con: Descrizione, Articoli, Documenti, Riepilogo Finanziario, Economia Ordine.

