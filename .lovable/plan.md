

# Audit Enterprise - Area Costi Aziendali

## Stato Attuale (AS-IS)

L'area Costi e' il modulo di gestione uscite piu' completo del progetto, con:
- Pagina wrapper `CompanyCosts.tsx` che monta `CompanyCostsManager`
- Orchestratore principale `CompanyCostsManager.tsx` (354 righe) con 12 state hooks, filtri, bulk selection
- Tabella `CostsTable.tsx` (358 righe) con selezione multipla, azioni, badge stato
- Stats `CostsStatsCards.tsx` (95 righe) con 5 card + grafico distribuzione mensile
- Form `CostFormDialog.tsx` (351 righe) con IVA, ricorrenza, preview periodi, combobox categorie
- Dialogs `CostsDialogs.tsx` (149 righe) con conferma delete, pagamento, task collegate
- Data hook `useCompanyCostsData.ts` (509 righe, 7 query) con UnifiedCost, filtri, CSV export
- Mutations hook `useCompanyCostsMutations.ts` (290 righe, 14 mutazioni + CSV import)
- Tab previsionale `CostsForecastTab.tsx` (233 righe) con date filter e tabelle dettaglio
- Multi-tenancy con effectiveCompany e company_id su tutte le query

## Problemi Identificati

### P1 - Duplicazione: logica routing pagamento per tipo ID (2 blocchi identici)
**File**: `CompanyCostsManager.tsx` (righe 154-167 `handlePaymentConfirm`, righe 169-178 `handleMarkOrderItemUnpaid`)
**Problema**: La stessa logica di risoluzione tipo costo basata su prefisso ID (`order-item-dep-`, `order-item-bal-`, `ext-team-`, `commission-`) e' implementata 2 volte con pattern identico (startsWith + replace). Entrambi i blocchi determinano il tipo di pagamento e chiamano la mutazione corrispondente.
**Fix**: Estrarre una funzione utility `resolveCostOrigin(cost: UnifiedCost)` che restituisce `{ type: "manual" | "order-item" | "ext-team" | "commission", realId: string, paymentType?: "deposit" | "balance" | "single" }`. Usarla in entrambi i handler.

### P1 - Duplicazione: calcolo `paymentType` da prefisso ID (2 occorrenze identiche)
**File**: `CompanyCostsManager.tsx` (riga 158 e riga 171)
**Problema**: L'espressione `id.startsWith("order-item-dep-") ? "deposit" : id.startsWith("order-item-bal-") ? "balance" : "single"` e' copiata identica in 2 punti.
**Fix**: Inclusa nella utility `resolveCostOrigin` sopra.

### P1 - Prefissi ID magici sparsi senza costanti
**File**: `useCompanyCostsData.ts` (righe 168, 186, 205, 230, 270), `CompanyCostsManager.tsx` (righe 158-176)
**Problema**: I prefissi `"order-item-dep-"`, `"order-item-bal-"`, `"order-item-"`, `"ext-team-"`, `"commission-"`, `"employee-salary-"` sono stringhe magiche sparse in 2 file. Un refuso in uno di questi prefissi causerebbe bug silenziosi nella logica di pagamento.
**Fix**: Estrarre costanti `COST_ID_PREFIX` in `forecastTypes.ts` e usarle sia nel data hook (creazione ID) che nel manager (risoluzione tipo).

### P2 - `CostsTable.tsx`: calcolo IVA inline (righe 170-172)
**File**: `CostsTable.tsx`
**Problema**: `vatAmount = cost.amount * (vatRate / 100)` e `grossAmount = cost.amount + vatAmount` calcolati inline per ogni riga. La funzione `calculateGrossFromNet` esiste gia' in `vatUtils.ts` ma non viene usata qui.
**Fix**: Usare `calculateGrossFromNet` da `vatUtils.ts` per coerenza. Riduce rischio di divergenza nel calcolo IVA.

### P2 - `CompanyCostsManager.tsx`: 12 state hooks nel componente
**File**: `CompanyCostsManager.tsx` (righe 39-61)
**Problema**: 12 useState separati per gestire dialog, selezione, filtri. Funzionalmente corretto ma complesso da manutenere. Gli state di dialog/pagamento (dialogOpen, editingCost, formData, deleteConfirmId, payDialogOpen, payingCostId, paymentDate, taskCostId) sono candidati per un reducer.
**Stato**: Documentato come P2. Il componente e' funzionalmente coeso e il pattern attuale e' idiomatico React. Non si interviene per minimizzare rischio regressione.

### P2 - `useCompanyCostsData.ts`: uso di `any` su costi e items
**File**: `useCompanyCostsData.ts` (righe 89, 104, 137, 299, etc.)
**Problema**: Diversi cast `as any[]` su dati di ritorno delle query. I tipi Supabase sono disponibili ma non usati per i join complessi.
**Stato**: Accettabile. I tipi Supabase per join nested sono complessi e fragili. Il tipo `UnifiedCost` copre il layer di trasformazione. Nessun intervento.

---

## Piano Interventi

### Intervento 1 - Estrarre costanti prefissi ID in `forecastTypes.ts`

Aggiungere a `src/lib/forecastTypes.ts`:
- `COST_ID_PREFIX` oggetto con chiavi: `ORDER_ITEM_DEPOSIT`, `ORDER_ITEM_BALANCE`, `ORDER_ITEM`, `EXT_TEAM`, `COMMISSION`, `EMPLOYEE_SALARY`
- `resolveCostOrigin(costId: string, cost?: UnifiedCost)` funzione utility che restituisce il tipo di origine e il real ID estratto

### Intervento 2 - Aggiornare `useCompanyCostsData.ts`
- Importare `COST_ID_PREFIX` da `forecastTypes.ts`
- Usare le costanti al posto delle stringhe magiche nella creazione degli ID (righe 168, 186, 205, 230, 270)

### Intervento 3 - Aggiornare `CompanyCostsManager.tsx`
- Importare `resolveCostOrigin` da `forecastTypes.ts`
- Sostituire `handlePaymentConfirm` (righe 154-167) con versione che usa `resolveCostOrigin`
- Sostituire `handleMarkOrderItemUnpaid` (righe 169-178) con versione che usa `resolveCostOrigin`
- Eliminare la duplicazione dei blocchi `startsWith`/`replace`

### Intervento 4 - Usare `calculateGrossFromNet` in `CostsTable.tsx`
- Importare `calculateGrossFromNet` da `vatUtils.ts`
- Sostituire il calcolo inline IVA (righe 170-172) con la funzione centralizzata

---

## Checklist Sicurezza e Multi-Tenancy

| Area | Stato |
|------|-------|
| company_id su query company_costs | OK |
| company_id su query order_items (inner join) | OK |
| company_id su query external_teams (inner join) | OK |
| company_id su query commissions (inner join) | OK |
| company_id su query employees | OK |
| company_id su query suppliers | OK |
| company_id su query orders-for-costs | OK |
| company_id su insert company_costs | OK |
| company_id su update company_costs | OK |
| company_id su delete company_costs | OK |
| company_id su delete group | OK |
| RLS su company_costs | OK |
| RLS su order_items | OK |
| RLS su order_external_teams | OK |
| RLS su order_salespeople | OK |
| Validazione input (importo > 0, nome, data) | OK |
| CSV import: company_id su insert | OK |
| CSV export: dati gia' filtrati per tenant | OK |
| Nessuna API key esposta | OK |
| effectiveCompany per impersonificazione | OK |
| Query limit (5000 costi, 50 ordini) | OK |

## Checklist Performance

| Area | Stato attuale | Dopo intervento |
|------|--------------|-----------------|
| Prefissi ID | 6 stringhe magiche sparse | 1 oggetto costanti |
| Logica routing pagamento | 2 blocchi identici | 1 funzione utility |
| Calcolo IVA in tabella | Inline (divergente) | `calculateGrossFromNet` (coerente) |
| staleTime (5min) tutte le query | OK | Invariato |
| 7 query parallele in useCompanyCostsData | OK (React Query) | Invariato |
| useMemo su trasformazioni | OK | Invariato |
| Bulk operations | OK | Invariato |

## File Modificati (Previsti)

1. `src/lib/forecastTypes.ts` - aggiunta COST_ID_PREFIX, resolveCostOrigin
2. `src/hooks/useCompanyCostsData.ts` - import e uso COST_ID_PREFIX
3. `src/components/forecast/CompanyCostsManager.tsx` - import e uso resolveCostOrigin
4. `src/components/forecast/CostsTable.tsx` - import e uso calculateGrossFromNet

## Note

Nessuna modifica strutturale al database. Nessuna modifica al comportamento funzionale. Tutti gli interventi sono refactor behavior-preserving. I 12 state hooks nel CompanyCostsManager restano invariati (P2 accettabile, pattern idiomatico). I cast `as any` nel data hook restano invariati (P2, i tipi Supabase per join nested sono complessi). L'area Costi risulta gia' ben architetturata con separazione netta tra data layer (hook), mutations (hook), UI (componenti), e dialogs (componente dedicato).

