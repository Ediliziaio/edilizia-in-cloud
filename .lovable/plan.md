

# Audit Costi / Tesoreria / Previsionale — Bug Reali e Piano Correzioni

## FASE 1: Mappa Flussi e Bug Identificati

### Fonti dati per modulo

| Modulo | Fonti | Query Key |
|--------|-------|-----------|
| **Costi** | `company_costs`, `order_items`, `order_external_teams`, `order_salespeople`, `employees` | `costs.*` |
| **Previsionale** | `order_installments`, `order_external_teams`, `order_salespeople`, `order_items`, `company_costs`, `scadenze`, RPC `get_cashflow_summary` | `cashflow.*` |
| **Prima Nota** | `prima_nota_entries`, RPC `get_prima_nota_saldo` | `["prima-nota"]`, `["prima-nota-saldo"]` |
| **Scadenzario** | `scadenze`, RPC `get_scadenzario_summary` | `["scadenze"]`, `["scadenzario-summary"]` |

### Bug Critici (P0)

**Bug 1: Prima Nota mutations non invalidano il cashflow summary**
`usePrimaNota` create/delete invalidano solo `["prima-nota"]` e `["prima-nota-saldo"]`. La RPC `get_cashflow_summary` (che include `primaNota.saldo`) non viene mai invalidata. Risultato: dopo aver creato/eliminato una registrazione Prima Nota, il Previsionale mostra il saldo vecchio finché non si ricarica la pagina.

**Bug 2: Scadenzario mutations non invalidano cashflow scadenze**
`useScadenzario` markPaid/create/cancel invalidano solo `["scadenze"]` e `["scadenzario-summary"]`. Manca:
- `["cashflow", "scadenze", companyId]` (usato dal Previsionale per le scadenze aperte)
- `queryKeys.cashflow.summary` (RPC aggregata)
- `["prima-nota-saldo"]` (markPaid genera registrazione Prima Nota ma invalida solo `["prima-nota"]`, non il saldo)

**Bug 3: Cost mutations non invalidano cashflow summary**
`useCompanyCostsMutations` invalida `queryKeys.cashflow.companyCosts` ma NON `queryKeys.cashflow.summary`. La RPC aggregata resta stale dopo ogni operazione sui costi.

**Bug 4: Tab "Previsti" esclude costi one-shot futuri**
Riga 314 di `useCompanyCostsData.ts`: `c.recurrence !== "once"` filtra via i costi una tantum non pagati con scadenza futura. Un costo one-shot da €5.000 dovuto tra 2 settimane non appare nella tab "Previsti". Questo è un bug logico — "previsto" deve includere qualsiasi costo futuro non pagato.

### Bug Medi (P1)

**Bug 5: Prima Nota entries query senza limit**
`usePrimaNota` non specifica `.limit()` → default Supabase 1000 righe. Per aziende con storico lungo, le registrazioni vengono troncate silenziosamente. Il saldo mostrato sarà comunque corretto (viene dalla RPC), ma la lista sarà incompleta.

**Bug 6: Scadenzario query senza limit**
Stesso problema: `useScadenzario` non ha `.limit()`, troncamento silenzioso a 1000.

**Bug 7: CSV export del Previsionale esclude le scadenze**
`CashFlowForecast.tsx` exportCSV() include `expectedPayments`, `expectedExpenses`, `expectedCommissions`, `expectedCompanyCosts`, `expectedSupplierPayments` ma **non** `scadenzeForForecast`. Le scadenze sono visibili nella tab ma assenti dall'export.

## FASE 2: Piano Correzioni

### File 1: `src/hooks/usePrimaNota.ts`
- Aggiungere `queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.summary(companyId) })` a create e delete onSuccess
- Aggiungere `.limit(10000)` alla query entries

### File 2: `src/hooks/useScadenzario.ts`
- markPaid onSuccess: aggiungere invalidazione di `["cashflow", "scadenze"]`, `queryKeys.cashflow.summary`, `["prima-nota-saldo"]`
- create/cancel onSuccess: aggiungere invalidazione di `["cashflow", "scadenze"]`, `queryKeys.cashflow.summary`
- Aggiungere `.limit(10000)` alla query scadenze

### File 3: `src/hooks/useCompanyCostsMutations.ts`
- `invalidateCosts()`: aggiungere `queryKeys.cashflow.summary(companyId)`
- `invalidateOrderItems()`: aggiungere `queryKeys.cashflow.summary(companyId)`
- `invalidateExtTeams()`: aggiungere `queryKeys.cashflow.summary(companyId)`
- `invalidateCommissions()`: aggiungere `queryKeys.cashflow.summary(companyId)`

### File 4: `src/hooks/useCompanyCostsData.ts`
- Riga 314: cambiare filtro "previsti" da `c.recurrence !== "once" && !c.is_paid && ...` a `!c.is_paid && c.due_date && new Date(c.due_date) > now` (rimuovere esclusione one-shot)

### File 5: `src/pages/azienda/CashFlowForecast.tsx`
- `exportCSV()`: aggiungere `scadenzeForForecast` come righe nell'export CSV

### Riepilogo modifiche

| File | Bug corretti | Tipo |
|------|-------------|------|
| `usePrimaNota.ts` | #1, #5 | Cache + Scalabilità |
| `useScadenzario.ts` | #2, #6 | Cache + Scalabilità |
| `useCompanyCostsMutations.ts` | #3 | Cache |
| `useCompanyCostsData.ts` | #4 | Logica |
| `CashFlowForecast.tsx` | #7 | Export |

### Rischi e mitigazioni
- Aggiunta invalidazioni: nessun rischio funzionale, solo più refetch (giustificati per coerenza)
- Filtro "previsti": cambia il conteggio visibile nella tab, ma ora è corretto (include anche one-shot futuri)
- Limit 10000: allineato con le altre query finanziarie del progetto

