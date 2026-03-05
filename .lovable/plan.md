
Obiettivo: correggere definitivamente la classificazione dei costi “stipendio personale interno” in modo che compaiano nei **Fissi** e non nei **Variabili**.

1) Analisi causa radice (già verificata)
- In `src/hooks/useCompanyCostsData.ts` gli stipendi sono creati correttamente come `cost_type: "fixed"` (`employeeAsFixedCosts`).
- Il problema reale è nel calcolo delle liste tabellari:
  - `fixedCosts` (riga ~426) prende solo `filteredCosts` (manuali), quindi **esclude** i costi derivati da ordine.
  - `variableCostsWithOrders` (riga ~428) concatena `manualVariableCosts + filteredOrderItemCosts`.
  - `filteredOrderItemCosts` contiene **tutti** i costi derivati (anche stipendi), quindi gli stipendi finiscono nei Variabili.

2) Refactor mirato della logica liste (senza cambiare UX)
- Introdurre una lista unica filtrata dei costi derivati (riuso della logica attuale), poi splittarla per tipo:
  - `filteredOrderDerivedFixedCosts = filteredOrderDerivedCosts.filter(c => c.cost_type === "fixed")`
  - `filteredOrderDerivedVariableCosts = filteredOrderDerivedCosts.filter(c => c.cost_type === "variable")`
- Comporre le liste finali così:
  - `fixedCosts = [...manualFixedCosts, ...filteredOrderDerivedFixedCosts]`
  - `variableCostsWithOrders = [...manualVariableCosts, ...filteredOrderDerivedVariableCosts]`
  - `allCostsSorted` resta la unione completa (manuali + derivati).

3) Allineamenti conseguenti
- Aggiornare i nomi variabili per evitare ambiguità (`filteredOrderItemCosts` -> `filteredOrderDerivedCosts`).
- Verificare che export CSV e contatori tab continuino a usare la lista completa (non solo variabili).
- Sistemare eventuale indentazione residua nel blocco `monthlyDistribution` per mantenibilità.

4) Verifica funzionale obbligatoria
- Test su `/azienda/costi`:
  - Tab “Fissi”: gli stipendi compaiono.
  - Tab “Variabili”: gli stipendi non compaiono più.
  - Tab “Tutti”: gli stipendi restano visibili con badge “Fisso”.
- Test filtri principali (stato, categoria, origine) per assicurare coerenza.
- Controllo rapido regressioni: mark paid/unpaid su costi da ordine non deve rompersi.

5) Hardening extra (stabilità UI)
- Separatamente, correggere il warning console su `CostsTable`:
  - “Function components cannot be given refs … check render method of CostsTable”.
  - Fare audit dei `TooltipTrigger asChild` per assicurare child con `forwardRef` (es. evitare combinazioni nested `asChild` problematiche).
- Nota qualità: verificare e rimuovere qualsiasi modifica accidentale a file non modificabili manualmente (es. `.env`).
