
# Fix: Impossibile aggiungere articoli e salvare ordine

## Problema Identificato

Il bug e nel componente `ArticleCombobox.tsx`. Quando l'utente digita un nuovo nome articolo e clicca "+ Aggiungi 'nome'", il sistema tenta di creare un template nel database. Se `companyId` e `undefined` (es. Super Admin senza azienda impersonata), la mutazione lancia un errore non gestito che **blocca completamente** l'assegnazione del nome all'articolo.

Conseguenza a catena:
1. Il nome articolo non viene mai impostato
2. Il pulsante "Aggiungi" nel dialog non fa nulla (controlla `itemName.trim()`)
3. Nessun articolo viene aggiunto alla lista
4. L'ordine non puo essere salvato correttamente

## Soluzione

### File: `src/components/orders/ArticleCombobox.tsx`

Modificare `handleCreateNew` per:
1. Impostare **sempre** il nome dell'articolo tramite `onValueChange`, anche se la creazione del template fallisce
2. Aggiungere un try/catch per gestire l'errore silenziosamente (il template e un aiuto opzionale, non un requisito)
3. Se `companyId` non e disponibile, saltare la creazione del template e impostare solo il nome

### Codice attuale (problematico)
```typescript
const handleCreateNew = async () => {
  if (!searchValue.trim()) return;
  await createTemplateMutation.mutateAsync(searchValue); // ERRORE qui blocca tutto
  onValueChange(searchValue.trim()); // Mai raggiunto
  setOpen(false);
  setSearchValue("");
};
```

### Codice corretto
```typescript
const handleCreateNew = async () => {
  if (!searchValue.trim()) return;
  const trimmed = searchValue.trim();
  // Imposta il nome immediatamente (non dipende dal template)
  onValueChange(trimmed);
  setOpen(false);
  setSearchValue("");
  // Tenta la creazione del template in background (opzionale)
  if (companyId) {
    try {
      await createTemplateMutation.mutateAsync(searchValue);
    } catch {
      // Template non creato, ma il nome e gia stato impostato
    }
  }
};
```

## Impatto
- Nessun cambiamento funzionale visibile per utenti con `companyId` valido
- Gli utenti Super Admin (o con company non ancora caricata) potranno aggiungere articoli senza blocchi
- Il template viene comunque creato quando possibile
