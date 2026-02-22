

# Stabilizzazione Modulo Opportunita - Pulizia e Fix

## Bug principali

### 1. Campi "tags" e "owner" non reagiscono alla personalizzazione

Nel componente `OpportunityCard.tsx`, la funzione `CardDetailRows` (riga 240) salta i campi `opp_name`, `tags` e `owner` perche sono gestiti "a parte" nell'header della card. Ma il problema e che:
- Le **etichette (tags)** non vengono mai mostrate come badge sulla card, solo come icona nella barra azioni in basso. Se l'utente disattiva "tags" nel pannello personalizza, non cambia nulla visivamente.
- Il **titolare (owner)** e l'avatar sono sempre visibili nell'header, anche se disattivato.

**Fix**: Rendere condizionale la visualizzazione dei tag (come badge sotto il nome) e dell'avatar owner nell'header della card, basandosi su `isFieldActive("tags")` e `isFieldActive("owner")`.

**File**: `src/components/opportunities/OpportunityCard.tsx`

### 2. Variabile `filteredContacts` non utilizzata

In `OpportunityDialog.tsx` riga 191, `filteredContacts` e assegnata ma mai usata.

**Fix**: Rimuoverla.

**File**: `src/components/opportunities/OpportunityDialog.tsx`

## Miglioramenti UX

### 3. Aggiungere badge tag visibili sulla card

Attualmente i tag sono visibili solo come numero sull'icona nella barra azioni. Per coerenza con l'anteprima nel pannello "Personalizza scheda" (che mostra badge "facebook", "google"), aggiungere una riga di badge tag nella card quando il campo `tags` e attivo.

**File**: `src/components/opportunities/OpportunityCard.tsx`

### 4. Anteprima nel pannello personalizza: sincronizzare con il rendering reale

L'anteprima nella `CardCustomizeSheet` mostra i tag come badge colorati, ma la card reale non li mostra. Dopo il fix al punto 3, saranno allineati.

## Riepilogo modifiche

| File | Modifica |
|------|----------|
| `src/components/opportunities/OpportunityCard.tsx` | Rendere tags e owner condizionali tramite `isFieldActive`, aggiungere badge tag visibili |
| `src/components/opportunities/OpportunityDialog.tsx` | Rimuovere variabile `filteredContacts` inutilizzata (riga 191) |

## Dettagli tecnici

### OpportunityCard - Modifiche specifiche

1. **Tag badge condizionali** (dopo il nome, prima dei detail rows):
   - Se `isFieldActive("tags")` e `tags.length > 0`, mostrare una riga con badge colorati (max 3 visibili + "+N")
   - Se disattivato, non mostrare nulla

2. **Owner avatar condizionale**:
   - L'avatar nel corner superiore destro viene mostrato solo se `isFieldActive("owner")`
   - Se disattivato, non mostrare l'avatar

3. **Nessuna modifica alla barra azioni**: le icone in basso restano sempre visibili (sono azioni, non campi dati)

