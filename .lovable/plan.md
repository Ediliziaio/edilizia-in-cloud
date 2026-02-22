
# Migliorare il concetto delle Liste Contatti

## Problemi attuali

Le liste oggi sono basiche: si possono solo creare, rinominare, eliminare e filtrare. Mancano diverse funzionalita chiave per renderle davvero utili come in GHL.

## Miglioramenti previsti

### 1. Vista dettaglio lista con gestione membri

Quando l'utente clicca su una lista, invece di tornare al tab "Tutti" con un filtro, si apre una **vista dedicata** dentro il tab Liste stessa con:
- Header con nome lista, descrizione, conteggio membri
- Pulsante "Indietro" per tornare all'elenco liste
- Tabella contatti con possibilita di **rimuovere** singoli contatti dalla lista
- Pulsante "Aggiungi contatti" che apre un dialog per cercare e aggiungere contatti esistenti
- Ricerca contatti dentro la lista

### 2. Dialog "Aggiungi contatti a lista"

Un nuovo dialog con:
- Barra di ricerca per trovare contatti esistenti (nome, email, telefono)
- Checkbox per selezionare piu contatti
- Mostra quanti contatti sono gia nella lista (disabilitati)
- Pulsante "Aggiungi selezionati"

### 3. Rimuovi da lista (bulk e singolo)

- Nella vista dettaglio lista, ogni riga ha un'icona "rimuovi dalla lista" (non elimina il contatto, solo la membership)
- Selezione multipla con azione "Rimuovi dalla lista"

### 4. Conferma eliminazione lista

- Dialog di conferma prima di eliminare una lista (oggi elimina direttamente)
- Messaggio chiaro: "I contatti non verranno eliminati, solo la lista"

### 5. Conteggio liste nel tab

- Badge con il numero di liste nel tab "Liste"

## File coinvolti

| File | Azione |
|------|--------|
| `ContactListsView.tsx` | Ristrutturare: aggiungere vista dettaglio lista inline, dialog aggiunta contatti, rimozione membri, conferma eliminazione |
| `MarketingContacts.tsx` | Rimuovere logica filterListId (spostata dentro ContactListsView), aggiungere badge conteggio al tab Liste |
| `ContactsTable.tsx` | Nessuna modifica |
| `AddToListDropdown.tsx` | Nessuna modifica |

## Dettagli tecnici

### ContactListsView - Nuova struttura interna

Il componente gestira due stati interni:
- `selectedList: null` = mostra griglia liste
- `selectedList: { id, name }` = mostra vista dettaglio con tabella membri

### Query per membri della lista

```text
supabase
  .from("marketing_contact_list_members")
  .select("contact_id, added_at, marketing_contacts(*)")
  .eq("list_id", selectedListId)
```

### Dialog "Aggiungi contatti"

Ricerca contatti dell'azienda non ancora nella lista:
```text
- Fetch tutti i contatti dell'azienda con ricerca
- Escludere quelli gia presenti nella lista
- Upsert dei selezionati nella tabella members
```

### Conferma eliminazione

AlertDialog standard con testo: "Sei sicuro di voler eliminare la lista '{nome}'? I contatti al suo interno non verranno eliminati."

## Flusso UX migliorato

1. Utente va su tab "Liste" e vede le card con conteggio
2. Clicca su una lista e vede la tabella dei suoi membri
3. Puo cercare dentro la lista, rimuovere contatti, aggiungerne di nuovi
4. Pulsante indietro per tornare all'elenco liste
5. Dal tab "Tutti", puo ancora usare la selezione multipla e "Aggiungi a lista"
