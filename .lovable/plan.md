
# Funzionalita GHL-Style per Opportunity Cards

## Panoramica

Aggiungere 3 funzionalita ispirate a GHL nelle card opportunita:
1. Avatar titolare (owner) in alto a destra con tooltip
2. Selezione multipla con checkbox + barra azioni bulk
3. Icona tag con badge conteggio e tooltip con nomi tag

---

## 1. Avatar Titolare (Owner Circle)

**Problema attuale**: `OpportunityCard` gia mostra `assignedInitials` ma il campo `assigned_to_name` non viene mai popolato perche la query in `useOpportunities` non fa JOIN con `profiles`.

**Soluzione**:
- Modificare la query in `useOpportunitiesData.ts` (`useOpportunities`) per fare un LEFT JOIN con `profiles` sulla colonna `assigned_to`
- Query aggiornata: `*, marketing_contacts(...), assigned_profile:profiles!marketing_opportunities_assigned_to_fkey(first_name, last_name)`
- Nel componente `OpportunityCard`, leggere `opportunity.assigned_profile` per costruire le iniziali
- Se `assigned_to` e NULL, mostrare l'icona persona vuota (come in GHL: icona `UserCircle` grigia) con tooltip "Non assegnato"
- Se assegnato, mostrare cerchio con iniziali colorato + tooltip con nome completo

**File modificati**:
- `src/hooks/useOpportunitiesData.ts` - aggiungere join profiles nella query `useOpportunities`
- `src/components/opportunities/OpportunityCard.tsx` - aggiornare logica avatar per usare `assigned_profile`

---

## 2. Selezione Multipla + Azioni Bulk

**Riferimento**: Come fa GHL (screenshot), con checkbox su ogni card + barra sticky in alto con conteggio e azioni.

### 2a. Checkbox nelle Card

- Aggiungere una prop `selected` e `onSelect` a `OpportunityCard`
- Posizionare checkbox in alto a destra, accanto all'avatar titolare (come in GHL)
- Il checkbox si mostra sempre (come in GHL)
- Click sul checkbox NON apre il detail dialog

### 2b. Stato selezione

- Lo stato `selectedIds: Set<string>` vive in `MarketingOpportunities.tsx` (pagina principale)
- Viene passato giu a `OpportunityKanbanView` e poi a `StageColumn` e `OpportunityCard`
- Logica "Seleziona tutto" per selezionare tutte le opportunita filtrate

### 2c. Barra Azioni Bulk (sticky)

Quando `selectedIds.size > 0`, mostrare una barra sticky sopra il kanban con:
- Badge: "{N} lead selezionato/i"
- Link "Seleziona tutto {total}"
- Bottone "Modifica" che apre sheet bulk edit
- Bottone "Elimina" con AlertDialog di conferma

### 2d. Sheet "Modifica in blocco"

Come in GHL (screenshot destro), un `Sheet` laterale con:
- Titolo "Modifica in blocco"
- Campo ricerca
- Lista campi modificabili: Fase, Stato, Valore, Titolare, Follower, Fonte, Tags
- Quando si seleziona un campo, mostra il form per il nuovo valore
- Bottone "Applica" che esegue update su tutte le opportunita selezionate

**Nuovo file**: `src/components/opportunities/BulkEditSheet.tsx`

**File modificati**:
- `src/components/opportunities/OpportunityCard.tsx` - aggiungere props `selected`, `onSelect`, checkbox
- `src/components/opportunities/OpportunityKanbanView.tsx` - propagare selectedIds, onSelect, bulk actions
- `src/pages/azienda/marketing/MarketingOpportunities.tsx` - stato selectedIds, barra bulk, sheet bulk edit
- `src/hooks/useOpportunitiesData.ts` - aggiungere `useBulkUpdateOpportunities` e `useBulkDeleteOpportunities`

---

## 3. Icona Tag con Badge e Tooltip

**Attualmente**: L'icona `Tag` nella action bar mostra solo "funzionalita in arrivo".

**Soluzione**:
- Se l'opportunita ha tags (`opportunity.tags?.length > 0`), mostrare un badge con il conteggio accanto all'icona Tag
- Al hover (tooltip), mostrare la lista dei tag separati da virgola
- Se non ci sono tag, tooltip mostra "Nessuna etichetta"
- Click sull'icona apre il detail dialog sul tab dettagli (non piu "in arrivo")

**File modificato**: `src/components/opportunities/OpportunityCard.tsx`

---

## Riepilogo file

| File | Tipo |
|------|------|
| `src/hooks/useOpportunitiesData.ts` | Modifica: join profiles, bulk mutations |
| `src/components/opportunities/OpportunityCard.tsx` | Modifica: avatar, checkbox, tag badge |
| `src/components/opportunities/OpportunityKanbanView.tsx` | Modifica: propagare selection state |
| `src/pages/azienda/marketing/MarketingOpportunities.tsx` | Modifica: selectedIds, barra bulk, sheet |
| `src/components/opportunities/BulkEditSheet.tsx` | Nuovo: sheet modifica in blocco |

## Note tecniche

- La selezione checkbox deve interrompere la propagazione dell'evento per non attivare il drag-and-drop o il click sulla card
- Il bulk update usa `Promise.all` come gia fatto in `OrdersTable`
- La query profiles usa la foreign key esistente `marketing_opportunities_assigned_to_fkey`
