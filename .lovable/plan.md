
# Fix layout, timeline e nomi utente nel dettaglio contatto

## Problema 1: Colonna sinistra troppo larga

La colonna sinistra ha `w-[340px] min-w-[340px]` fisso. Ridurre a `w-[300px] min-w-[300px]` per dare piu spazio alla timeline centrale.

**File: `src/pages/azienda/marketing/MarketingContactDetail.tsx`** (riga 455)
- Cambiare `w-[340px] min-w-[340px]` in `w-[300px] min-w-[300px]`

## Problema 2: Timeline non aggiornata dopo cambio fase opportunita

I trigger database funzionano correttamente (i dati sono presenti nel DB), ma la cache React Query della timeline non viene invalidata quando si spostano le opportunita di fase. I cambi avvengono in altri componenti (KanbanView, OpportunityDetailDialog) che non invalidano la query `marketing_contact_activities`.

**File: `src/hooks/useOpportunitiesData.ts`**
- Nella mutazione `useUpdateOpportunity` e `useMoveOpportunityStage`, aggiungere invalidazione della query `marketing_contact_activities` dopo il successo

**File: `src/components/opportunities/OpportunityKanbanView.tsx`**
- Dopo il drag-and-drop che cambia la fase, invalidare `marketing_contact_activities`

## Problema 3: Mostrare il nome utente accanto a note e attivita

Attualmente le note e le attivita non mostrano chi ha eseguito l'azione.

### Attivita (timeline centrale)
**File: `src/pages/azienda/marketing/MarketingContactDetail.tsx`**
- Modificare la query delle attivita per fare un join con `profiles` tramite `created_by`:
  ```
  .select("*, profiles:created_by(first_name, last_name)")
  ```
- Nella visualizzazione di ogni attivita, mostrare il nome utente sotto la descrizione (stile GHL: "Creato da: Nome Cognome")

### Note (sidebar destra)
- Modificare la query delle note per fare un join con `profiles` tramite `created_by`:
  ```
  .select("*, profiles:created_by(first_name, last_name)")
  ```
- Nella card di ogni nota, aggiungere "Creato da: Nome Cognome" come in GHL (sotto la data)

## Riepilogo modifiche

| File | Modifica |
|------|----------|
| `MarketingContactDetail.tsx` | Ridurre larghezza colonna sinistra da 340px a 300px |
| `MarketingContactDetail.tsx` | Join attivita con profiles per mostrare nome utente |
| `MarketingContactDetail.tsx` | Join note con profiles per mostrare nome utente |
| `MarketingContactDetail.tsx` | Visualizzare "Creato da: Nome Cognome" in attivita e note |
| `useOpportunitiesData.ts` | Invalidare `marketing_contact_activities` dopo aggiornamento opportunita |
| `OpportunityKanbanView.tsx` | Invalidare `marketing_contact_activities` dopo drag-and-drop |

## Dettagli tecnici

### Layout della timeline con nome utente (stile GHL)

Ogni entry della timeline diventera:
```
[icona] Fase cambiata: Da Chiamare -> Non risponde
        19:06 · Creato da: Mario Rossi
        [Dettagli]
```

Ogni nota nella sidebar diventera:
```
Testo della nota...
22 feb 2026, 18:50
Creato da: Mario Rossi
[Badge Opportunita se collegata]
```
