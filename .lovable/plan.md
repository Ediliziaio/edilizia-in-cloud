

# Piano: Colonna Pagamenti in Sospeso, Fix Articoli e Nuovo Stato "Installato"

## Problemi Identificati

### 1. ArticleCombobox non crea nuovi articoli
Il componente `ArticleCombobox.tsx` usa una query per ottenere il `company_id` dal profilo, ma se il profilo non ha un `company_id` associato (problema simile a quello risolto in precedenza), la creazione fallisce silenziosamente.

**Soluzione**: Usare `effectiveCompany` dal contesto `AuthContext` invece di fare una query separata sul profilo.

### 2. Manca la selezione dello stato articolo durante la creazione
Attualmente quando si aggiunge un nuovo articolo, lo stato viene impostato automaticamente a "da_ordinare". L'utente vuole poter selezionare lo stato direttamente nel dialog di creazione/modifica.

### 3. Manca lo stato "Installato" per gli articoli
Gli stati attuali sono: `da_ordinare`, `ordinato`, `in_magazzino`. L'utente vuole aggiungere `installato`.

### 4. Manca la colonna "Pagamenti in Sospeso" nella lista ordini
Nella tabella degli ordini serve una colonna che mostri subito quali ordini hanno pagamenti da incassare.

---

## Modifiche da Effettuare

### File: `src/components/orders/ArticleCombobox.tsx`

- Rimuovere la query per ottenere il profilo
- Usare `effectiveCompany` da `useAuth()` per ottenere il `company_id`
- Questo risolve il bug della creazione articoli

```typescript
// PRIMA (problematico)
const { data: profile } = useQuery({...});
// company_id potrebbe essere null

// DOPO (corretto)
const { effectiveCompany } = useAuth();
// effectiveCompany.id è sempre disponibile
```

---

### File: `src/components/orders/OrderItemsList.tsx`

#### Aggiungere stato "Installato"
```typescript
// PRIMA
export type OrderItemStatus = 'da_ordinare' | 'ordinato' | 'in_magazzino';

// DOPO
export type OrderItemStatus = 'da_ordinare' | 'ordinato' | 'in_magazzino' | 'installato';

// Nuova configurazione colore
const STATUS_CONFIG = {
  ...
  installato: { 
    label: "Installato", 
    color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" 
  },
};
```

#### Aggiungere Select stato nel dialog di creazione/modifica
Nel dialog per aggiungere/modificare un articolo, aggiungere un campo Select per lo stato:

```
+------------------------------------------+
| Nome Articolo *                          |
| [Seleziona o digita nome articolo...]    |
+------------------------------------------+
| Descrizione                              |
| [Dettagli aggiuntivi...]                 |
+------------------------------------------+
| Quantità      | Costo Acquisto           |
| [1]           | € [0.00]                 |
+------------------------------------------+
| Stato Articolo                           |
| [Da Ordinare ▼]                          |
+------------------------------------------+
| Fornitore                                |
| [Nessun fornitore ▼]     [+]             |
+------------------------------------------+
```

---

### File: `src/pages/azienda/OrdersList.tsx`

Aggiungere colonna "Pagamenti" che mostra lo stato dei pagamenti in sospeso.

#### Logica calcolo pagamenti in sospeso
```typescript
function getPendingPayments(order: OrderWithDetails): string[] {
  const pending = [];
  
  // Acconto 1
  if (order.deposit_amount > 0 && !order.deposit_paid) {
    pending.push("Acconto 1");
  }
  
  // Acconto 2
  if (order.deposit_2_amount > 0 && !order.deposit_2_paid) {
    pending.push("Acconto 2");
  }
  
  // Saldo
  if (order.balance_amount > 0 && !order.balance_paid) {
    pending.push("Saldo");
  }
  
  return pending;
}
```

#### Nuova colonna nella tabella
```
| Descrizione | Cliente | Totale | Pagamenti   | Stato | Data |
|-------------|---------|--------|-------------|-------|------|
| Finestre... | Mario R | €5.000 | Saldo       | ✓     | 05/02|
| Porte...    | Luigi B | €3.000 | Acc 1, Saldo| ⏳    | 04/02|
| Infissi...  | Anna V  | €8.000 | (tutto ok)  | ✓     | 03/02|
```

Visualizzazione:
- Se tutti i pagamenti sono completati: badge verde "Tutto Pagato"
- Se ci sono pagamenti in sospeso: badge arancione con lista (es. "Acc 1, Saldo")

---

## Riepilogo Modifiche

| File | Modifica |
|------|----------|
| `ArticleCombobox.tsx` | Usare `effectiveCompany` invece della query profilo |
| `OrderItemsList.tsx` | Aggiungere stato "Installato" + Select stato nel dialog |
| `OrdersList.tsx` | Aggiungere colonna "Pagamenti in Sospeso" |

---

## Risultato Atteso

1. **Creazione articoli funzionante** - Il combobox usa correttamente `effectiveCompany` per creare nuovi template
2. **Nuovo stato "Installato"** - Gli articoli possono avere 4 stati: Da Ordinare, Ordinato, In Magazzino, Installato
3. **Selezione stato alla creazione** - Nel dialog di nuovo articolo si può scegliere lo stato iniziale
4. **Colonna Pagamenti** - Nella lista ordini si vede subito quali ordini hanno pagamenti in sospeso

