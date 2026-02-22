

# Miglioramento Drag and Drop Opportunita

## Problemi attuali

1. **Nessun DragOverlay**: durante il trascinamento non c'e un'anteprima visuale della card, rendendo l'esperienza confusa
2. **Nessun aggiornamento ottimistico**: dopo il drop, la card scompare e riappare solo dopo la risposta del server, causando un ritardo visibile
3. **Due chiamate DB per ogni spostamento**: `useUpdateOpportunityStage` prima recupera `auto_status` della fase target e poi aggiorna l'opportunita - due query sequenziali che rallentano
4. **Re-render eccessivi**: ogni `OpportunityCard` crea la propria istanza di `useDeleteOpportunity`, e `StageColumn` non e memoizzata

## Modifiche previste

### 1. Aggiungere DragOverlay con anteprima card

**File**: `src/components/opportunities/OpportunityKanbanView.tsx`

- Aggiungere stato `activeItem` con `DragStartEvent`
- Aggiungere `DragOverlay` che mostra una copia della card durante il trascinamento
- La card originale diventa semi-trasparente (`opacity-50`) durante il drag

### 2. Aggiornamento ottimistico (optimistic update)

**File**: `src/hooks/useOpportunitiesData.ts`

Nella mutation `useUpdateOpportunityStage`:
- Usare `onMutate` per aggiornare immediatamente la cache di React Query prima della risposta del server
- La card si sposta istantaneamente nella nuova colonna
- In caso di errore (`onError`), ripristinare la cache precedente (rollback)
- Eliminare la prima query separata per `auto_status`: passare le stages gia caricate come parametro

### 3. Passare auto_status dalle stages gia in cache

**File**: `src/components/opportunities/OpportunityKanbanView.tsx`

- Passare le `stages` (con `auto_status`) alla mutation invece di fare una query DB extra
- Il componente gia ha accesso alle stages tramite le props

**File**: `src/hooks/useOpportunitiesData.ts`

- Modificare `useUpdateOpportunityStage` per accettare `auto_status` come parametro opzionale
- Eliminare la query `supabase.from("marketing_pipeline_stages").select("auto_status")` - una chiamata DB in meno per ogni drag

### 4. Memoizzare StageColumn e OpportunityCard

**File**: `src/components/opportunities/OpportunityKanbanView.tsx`

- Wrappare `StageColumn` con `React.memo` per evitare re-render quando le altre colonne cambiano

**File**: `src/components/opportunities/OpportunityCard.tsx`

- Wrappare con `React.memo`
- Spostare `useDeleteOpportunity` fuori dal componente card (passare come callback)

### 5. Touch support migliorato

**File**: `src/components/opportunities/OpportunityKanbanView.tsx`

- Aggiungere `TouchSensor` oltre a `PointerSensor` per supporto mobile
- Aggiungere `KeyboardSensor` per accessibilita

## Risultato atteso

- Card si sposta istantaneamente al rilascio (nessun ritardo visivo)
- Anteprima visuale durante il trascinamento
- Una sola chiamata DB per spostamento (invece di due)
- Meno re-render = prestazioni migliori con molte card
- Funziona su touch/mobile

## File modificati (2)

1. `src/components/opportunities/OpportunityKanbanView.tsx` - DragOverlay, memo, touch sensors, passaggio auto_status
2. `src/hooks/useOpportunitiesData.ts` - Optimistic update, eliminazione query extra
3. `src/components/opportunities/OpportunityCard.tsx` - React.memo, cleanup hooks

