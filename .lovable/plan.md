

# Sincronizzazione Tag tra Contatti e Opportunita

## Problema attuale

I tag dei contatti (`marketing_contacts.tags`) e delle opportunita (`marketing_opportunities.tags`) sono completamente indipendenti. Se aggiungo un tag "caldo" a un contatto, l'opportunita collegata non lo mostra, e viceversa.

## Strategia di sincronizzazione

La logica e: quando si salvano i tag su un'opportunita, i tag vengono **uniti** (merge) a quelli del contatto collegato. Quando si salvano i tag su un contatto, i tag vengono uniti a tutte le opportunita collegate a quel contatto. In questo modo nessun tag viene perso.

---

## Modifiche

### 1. OpportunityDetailDialog - Sync opp -> contatto

Quando si salva un'opportunita con tag modificati, dopo l'update dell'opportunita, aggiornare anche il contatto collegato unendo i tag:

```
contatto.tags = [...new Set([...contatto.tags_attuali, ...opp.tags_nuovi])]
```

**File**: `src/components/opportunities/OpportunityDetailDialog.tsx` - nel `handleSave`, dopo `updateOpp.mutate`, aggiungere update del contatto con tag merged.

### 2. OpportunityDialog (creazione) - Sync opp -> contatto

Quando si crea un'opportunita con tag, aggiornare anche il contatto collegato con i tag uniti.

**File**: `src/components/opportunities/OpportunityDialog.tsx` - nel `onSuccess` di `createOpportunity`, dopo il save dei tag, fare merge con il contatto.

### 3. MarketingContactDetail - Sync contatto -> opportunita

Quando si modificano i tag di un contatto dalla pagina dettaglio contatto, aggiornare tutte le opportunita collegate unendo i tag.

**File**: `src/pages/azienda/marketing/MarketingContactDetail.tsx` - nella `onTagsChange` e nella rimozione tag, dopo l'update del contatto, aggiornare le opportunita collegate.

### 4. MarketingContacts (lista contatti) - Sync contatto -> opportunita

Quando si salvano i tag dal dialog di modifica contatto nella lista, sincronizzare anche verso le opportunita.

**File**: `src/pages/azienda/marketing/MarketingContacts.tsx` - nella callback `onSave` del `ContactDialog`, aggiungere sync.

### 5. Hook di utilita per la sync

Creare una funzione riutilizzabile per la sincronizzazione bidirezionale dei tag:

```typescript
// Merge tags from opportunity to contact
async function syncTagsToContact(contactId: string, newTags: string[])

// Merge tags from contact to all linked opportunities  
async function syncTagsToOpportunities(contactId: string, newTags: string[])
```

**Nuovo file**: `src/hooks/useTagSync.ts`

---

## Riepilogo file

| File | Tipo | Modifica |
|------|------|----------|
| `src/hooks/useTagSync.ts` | Nuovo | Hook con funzioni `syncTagsToContact` e `syncTagsToOpportunities` |
| `src/components/opportunities/OpportunityDetailDialog.tsx` | Modifica | Chiamare `syncTagsToContact` nel `handleSave` |
| `src/components/opportunities/OpportunityDialog.tsx` | Modifica | Chiamare `syncTagsToContact` nella creazione |
| `src/pages/azienda/marketing/MarketingContactDetail.tsx` | Modifica | Chiamare `syncTagsToOpportunities` quando cambiano i tag contatto |
| `src/pages/azienda/marketing/MarketingContacts.tsx` | Modifica | Chiamare `syncTagsToOpportunities` nel salvataggio contatto |

## Dettagli tecnici

- La sync usa un **merge** (unione) dei tag, non una sovrascrittura. Se il contatto ha `["caldo"]` e l'opportunita aggiunge `["urgente"]`, il contatto avra `["caldo", "urgente"]`
- La rimozione di un tag da un contatto lo rimuove anche dalle opportunita collegate
- La rimozione di un tag da un'opportunita lo rimuove solo dall'opportunita, non dal contatto (il contatto potrebbe avere quel tag per altre ragioni)
- Le query di sync usano il Supabase client standard con filtro `contact_id`
- Dopo la sync, `queryClient.invalidateQueries` aggiorna entrambe le cache
