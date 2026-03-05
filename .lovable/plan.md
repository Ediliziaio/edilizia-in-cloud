

# Fix: Stipendi personale interno classificati come costi fissi nel grafico mensile

## Problema identificato

Nel file `src/hooks/useCompanyCostsData.ts`, gli stipendi dei dipendenti sono **correttamente** marcati come `cost_type: "fixed"` (riga 252). Tuttavia, nel calcolo della **distribuzione mensile** per il mini-grafico (righe 383-390), TUTTI i costi derivanti da ordini (`allOrderDerivedCosts`) vengono sommati nella colonna `variable` — **senza controllare il `cost_type`** del singolo costo.

Questo significa che gli stipendi (fissi) vengono conteggiati come variabili nel grafico, distorcendo la visualizzazione.

```text
Codice attuale (riga 383-390):
  allOrderDerivedCosts.forEach((c) => {
    ...
    variable += c.amount;    ← BUG: tutto va in "variabile"
  });

Dovrebbe essere:
  allOrderDerivedCosts.forEach((c) => {
    ...
    if (c.cost_type === "fixed") fixed += c.amount;
    else variable += c.amount;
  });
```

## Modifica

**File: `src/hooks/useCompanyCostsData.ts`** — riga 388:
- Sostituire `variable += c.amount` con un check su `c.cost_type` per sommare correttamente fissi e variabili.

Nessun'altra modifica necessaria: la classificazione degli stipendi come `fixed` è già corretta ovunque (marginalità, break-even, tabella costi, export CSV).

