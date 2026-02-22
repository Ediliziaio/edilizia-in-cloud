
# Fix Tag Badge e Sincronizzazione Tag Bidirezionale

## Problema 1: Badge tag visibili sotto il nome della card

Nella card opportunita (screenshot dell'utente), i tag come "facebook" appaiono come badge sotto il nome. L'utente non li vuole li - devono essere visibili solo tramite l'icona etichetta nella barra azioni in basso (che gia mostra il conteggio).

**File**: `src/components/opportunities/OpportunityCard.tsx` (righe 165-179)

**Fix**: Rimuovere completamente il blocco che renderizza i badge tag sotto il nome. I tag resteranno visibili solo tramite l'icona Tag nella action bar con il badge numerico.

## Problema 2: Rimozione tag non sincronizzata tra opportunita e contatti

Attualmente:
- Quando si aggiunge un tag a un'opportunita, viene sincronizzato al contatto (solo aggiunta)
- Quando si aggiunge un tag a un contatto, viene sincronizzato alle opportunita (solo aggiunta)
- Quando si rimuove un tag da un contatto, viene rimosso dalle opportunita collegate (funziona)
- Quando si rimuove un tag da un'opportunita, NON viene rimosso dal contatto (manca)

**File**: `src/hooks/useTagSync.ts`

**Fix**: Aggiungere una nuova funzione `removeTagFromContact` che, dato un contactId e un tag rimosso, lo rimuove dal contatto collegato. Inoltre, modificare `syncTagsToContact` per gestire anche le rimozioni (non solo le aggiunte).

**File**: `src/components/opportunities/OpportunityDetailDialog.tsx` (righe 256-260)

**Fix**: Dopo il salvataggio dell'opportunita, confrontare i tag precedenti con quelli nuovi. Per i tag rimossi, chiamare `removeTagFromContact`. Per i tag aggiunti, chiamare `syncTagsToContact` (gia esistente).

## Problema 3: Pulizia import Badge inutilizzato

Dopo la rimozione dei badge tag dalla card, l'import di `Badge` in `OpportunityCard.tsx` non sara piu necessario e verra rimosso.

## Riepilogo modifiche

| File | Tipo | Descrizione |
|------|------|-------------|
| `src/components/opportunities/OpportunityCard.tsx` | UX Fix | Rimuovere badge tag sotto il nome + rimuovere import Badge |
| `src/hooks/useTagSync.ts` | Bug Fix | Aggiungere funzione `removeTagFromContact` per sincronizzazione bidirezionale |
| `src/components/opportunities/OpportunityDetailDialog.tsx` | Bug Fix | Chiamare `removeTagFromContact` quando un tag viene rimosso dall'opportunita |

## Dettagli tecnici

### useTagSync.ts - Nuova funzione

```text
removeTagFromContact(contactId, removedTag):
  1. Recupera i tag attuali del contatto
  2. Se il tag e presente, lo rimuove
  3. Aggiorna il contatto con i tag filtrati
```

### OpportunityDetailDialog.tsx - Logica di confronto

Nella funzione `handleSave`, prima del salvataggio:
1. Salvare i tag originali dell'opportunita (`opportunity.tags`)
2. Dopo il successo, confrontare tag vecchi vs nuovi
3. Per ogni tag rimosso (presente nei vecchi ma non nei nuovi), chiamare `removeTagFromContact(contactId, removedTag)`
4. Per i tag aggiunti, mantenere la chiamata a `syncTagsToContact` esistente
