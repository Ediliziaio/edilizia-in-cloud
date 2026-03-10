

## Piano: Completamento Gap Residui Performance (Round Finale)

Dopo audit completo, la maggior parte dei fix è già applicata. Restano questi gap specifici:

### 1. `gcTime` mancante in `OrderDetail.tsx` (6 query)
Tutte le query hanno `staleTime` ma nessuna ha `gcTime`. Aggiungere:
- Query operative (order, installments, items, attachments, history): `gcTime: 10 * 60 * 1000`
- Query statuses (reference data): `gcTime: 30 * 60 * 1000`

### 2. `gcTime` mancante in `OrdersList.tsx` (~10 query)
Stessa situazione. Aggiungere:
- Query dati ordine (orders, itemCosts, employeeCosts, etc.): `gcTime: 15 * 60 * 1000`
- Query profili/reference (salespersonProfiles, employeeProfiles, etc.): `gcTime: 30 * 60 * 1000`

### 3. `AutomationFlowsList.tsx` — enrollment staleTime troppo basso
Attualmente `staleTime: 120_000` (2min). Portare a `staleTime: 5 * 60 * 1000` come richiesto, aggiungere `gcTime: 15 * 60 * 1000`.

### 4. Calendar.tsx — FIX 16 NON applicabile
La query appointments già usa un join con orders. La seconda query per profiles è necessaria perché `assigned_to` referenzia `profiles`, non una FK diretta su appointments. Tentare un join diretto causerebbe errore. **Skip**.

### 5. OrdersList.tsx — FIX 13 (split orderCostsMap) NON necessario
Il `useMemo` attuale non usa profileMaps — calcola costi da `itemCosts`, `employeeCosts`, `externalTeamCosts`, `salespeopleData`. I profili non sono coinvolti nel calcolo. Lo split proposto nel prompt non si applica alla struttura reale. **Skip**.

---

**File da modificare:** 3 file, solo aggiunta `gcTime` e aumento `staleTime`. Zero modifiche funzionali.

