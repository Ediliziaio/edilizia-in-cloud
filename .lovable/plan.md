
# Stabilizzazione e Fix - Opportunita

## Bug identificati e correzioni

### 1. Doppio Toast al salvataggio (BUG CRITICO UX)

**Problema**: Quando si salva un'opportunita dal `OpportunityDetailDialog`, appaiono DUE toast di successo:
- `useUpdateOpportunity.onSuccess` mostra "Opportunita aggiornata" (riga 98 di `useOpportunitiesData.ts`)
- `handleSave` inline `onSuccess` mostra "Opportunita aggiornata con successo" (riga 234 di `OpportunityDetailDialog.tsx`)

Entrambi i callback `onSuccess` vengono eseguiti da React Query.

**Soluzione**: Rimuovere il toast globale da `useUpdateOpportunity` e lasciare solo `queryClient.invalidateQueries`. I chiamanti gestiscono i propri messaggi. L'unico chiamante e `OpportunityDetailDialog`.

**File**: `src/hooks/useOpportunitiesData.ts` (riga 98: rimuovere `toast.success`)

---

### 2. GripVertical importato ma non usato in PipelineStagesConfig

**Problema**: In `PipelineStagesConfig.tsx` riga 13, `GripVertical` e importato da lucide-react ED effettivamente usato nel componente `SortableStage` (riga 47). Questo e OK, nessuna azione necessaria.

---

### 3. Warning Console "Function components cannot be given refs"

**Problema**: Il warning persiste nella console. `OpportunityCard` ha gia `forwardRef`, ma i log mostrano anche un warning per `OpportunityDetailDialog` (secondo warning nella console).

**Analisi**: `OpportunityDetailDialog` e renderizzato fuori dal `DndContext` nel fragment di `OpportunityKanbanView`. Il warning per `OpportunityDetailDialog` puo provenire dal fatto che `Dialog` di Radix tenta internamente di clonare elementi e passare ref. Il fix e wrappare `OpportunityDetailDialog` con `forwardRef` per eliminare il warning.

**Soluzione**: Wrappare `OpportunityDetailDialog` con `forwardRef` (accettando e ignorando il ref, dato che non serve).

**File**: `src/components/opportunities/OpportunityDetailDialog.tsx`

---

### 4. StageColumn dentro OpportunityKanbanView - potenziale warning ref

**Problema**: `StageColumn` e wrappato con `memo` ma non `forwardRef`. Se DndContext tenta di passare un ref, genera warning.

**Soluzione**: Wrappare `StageColumn` con `forwardRef` come fatto per `OpportunityCard`.

**File**: `src/components/opportunities/OpportunityKanbanView.tsx`

---

### 5. isSaving non riflette lo stato reale delle mutations

**Problema**: In `OpportunityDetailDialog` riga 170:
```
const isSaving = updateOpp.isPending || updateContact.isPending || upsertContactFields.isPending || upsertOppFields.isPending;
```
Ma `handleSave` chiama `updateContact.mutate` e `upsertContactFields.mutate` in modo fire-and-forget (senza attendere). Solo `updateOpp.mutate` ha callback `onSuccess`/`onError`. Le altre mutations potrebbero fallire silenziosamente.

**Soluzione**: Questo e accettabile per ora dato che le mutations hanno i propri `onError` con toast. Nessuna modifica necessaria, ma si documenta il comportamento.

---

## Riepilogo modifiche (3 file)

| File | Modifica |
|------|----------|
| `src/hooks/useOpportunitiesData.ts` | Rimuovere `toast.success` da `useUpdateOpportunity.onSuccess` per evitare doppio toast |
| `src/components/opportunities/OpportunityDetailDialog.tsx` | Wrappare con `forwardRef` per eliminare warning console |
| `src/components/opportunities/OpportunityKanbanView.tsx` | Wrappare `StageColumn` con `forwardRef` per eliminare warning console |

## Cosa NON cambia
- Nessun comportamento funzionale modificato
- Nessun layout/design toccato
- Nessuna tabella DB modificata
