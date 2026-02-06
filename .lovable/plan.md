

# Piano: Ottimizzazione Creazione Ordini e Gestione Dettagli

## Richieste dell'Utente

1. **Creazione cliente inline durante la creazione ordine** - Se il cliente non esiste, deve poter essere creato direttamente senza uscire dalla pagina
2. **Riepilogo finanziario espanso** - Importo totale, Acconto 1, Acconto 2, Saldo, oppure Finanziamento
3. **Elenco articoli dell'ordine con stato individuale** - Ogni articolo (infissi, tapparelle, porte, pannelli fotovoltaici, ecc.) deve avere il proprio stato/flag

---

## FASE 1: Creazione Cliente Inline

### Problema Attuale
Nel form di creazione ordine, se il cliente non esiste, l'utente deve:
1. Uscire dalla pagina
2. Andare su "Clienti" → "Nuovo Cliente"
3. Tornare indietro e riprendere la creazione ordine

### Soluzione
Aggiungere un pulsante "Nuovo Cliente" accanto al dropdown di selezione che apre un **Dialog** con il form di creazione cliente integrato.

```
+------------------------------------------+
| Cliente *                                |
| [Dropdown selezione cliente ▼] [+ Nuovo] |
+------------------------------------------+
          ↓ Click su "+ Nuovo"
+------------------------------------------+
|        Dialog: Nuovo Cliente             |
|  Nome: [________] Cognome: [________]    |
|  Email: [________________________]       |
|  Telefono: [____________________]        |
|  Indirizzo: [____________________]       |
|                                          |
|  [Annulla]  [Crea e Seleziona]           |
+------------------------------------------+
```

### Comportamento
1. Clic su "Nuovo Cliente" apre un dialog
2. L'utente compila i dati minimi (nome, cognome, email)
3. Al salvataggio, il cliente viene creato e **automaticamente selezionato** nel dropdown
4. La password generata viene mostrata in un secondo dialog
5. L'utente puo continuare con la creazione dell'ordine

---

## FASE 2: Riepilogo Finanziario Espanso

### Schema Attuale Database (tabella `orders`)
- `total_amount` - Importo totale
- `deposit_amount` - Acconto (singolo)
- `balance_amount` - Saldo calcolato

### Nuovi Campi Necessari
Aggiungere alla tabella `orders`:
- `deposit_2_amount` - Secondo acconto (opzionale)
- `financing_amount` - Valore finanziamento (opzionale, alternativo)
- `payment_type` - Tipo pagamento: "standard" | "financing"

### Nuovo Riepilogo Finanziario

**Modalita Standard:**
```
+------------------------------------------+
| Tipo Pagamento: [Standard ▼]             |
+------------------------------------------+
| Importo Totale *    € [________]         |
| Acconto 1           € [________]         |
| Acconto 2           € [________]         |
+------------------------------------------+
| Saldo da Pagare      € 5.000,00          |
+------------------------------------------+
```

**Modalita Finanziamento:**
```
+------------------------------------------+
| Tipo Pagamento: [Finanziamento ▼]        |
+------------------------------------------+
| Importo Totale *    € [________]         |
| Valore Finanziamento € [________]        |
+------------------------------------------+
| Pagato tramite finanziaria               |
+------------------------------------------+
```

### Calcolo Saldo
```
Se payment_type === "standard":
  saldo = totale - acconto1 - acconto2
Altrimenti:
  saldo = 0 (coperto da finanziamento)
```

---

## FASE 3: Articoli dell'Ordine con Stato Individuale

### Nuova Tabella: `order_items`
Ogni ordine puo contenere piu articoli, ognuno con il proprio stato.

```sql
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,           -- Es: "Finestre soggiorno", "Tapparelle", "Porta blindata"
  description TEXT,             -- Descrizione opzionale
  quantity INTEGER DEFAULT 1,
  status TEXT DEFAULT 'da_ordinare',  -- "da_ordinare", "ordinato", "in_produzione", "consegnato", "installato"
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Stati Disponibili per Articoli
| Stato | Etichetta | Colore |
|-------|-----------|--------|
| `da_ordinare` | Da Ordinare | Grigio |
| `ordinato` | Ordinato | Blu |
| `in_produzione` | In Produzione | Arancione |
| `consegnato` | Consegnato | Verde chiaro |
| `installato` | Installato | Verde |

### UI Creazione Ordine - Sezione Articoli

```
+------------------------------------------+
| Articoli dell'Ordine                     |
+------------------------------------------+
| [+ Aggiungi Articolo]                    |
|                                          |
| 1. Finestre soggiorno (x4)      [Da ord.]|
|    [Modifica] [Elimina]                  |
|                                          |
| 2. Tapparelle (x4)              [Da ord.]|
|    [Modifica] [Elimina]                  |
|                                          |
| 3. Porta blindata (x1)          [Da ord.]|
|    [Modifica] [Elimina]                  |
+------------------------------------------+
```

### UI Dettaglio Ordine - Gestione Articoli

```
+------------------------------------------+
| Articoli                                 |
+------------------------------------------+
| ☑ Finestre soggiorno (x4)               |
|   [Da ordinare ▼] → Ordinato, In prod... |
|                                          |
| ☐ Tapparelle (x4)                        |
|   [Da ordinare ▼]                        |
|                                          |
| ☑ Porta blindata (x1)                    |
|   [Installato ✓]                         |
+------------------------------------------+
```

L'admin azienda puo:
1. Aggiungere/rimuovere articoli
2. Cambiare lo stato di ogni articolo individualmente
3. Vedere a colpo d'occhio quali articoli sono completati

---

## Modifiche Database (Migrazione SQL)

```sql
-- 1. Nuovi campi finanziari per orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS deposit_2_amount NUMERIC DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS financing_amount NUMERIC DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_type TEXT DEFAULT 'standard' 
  CHECK (payment_type IN ('standard', 'financing'));

-- 2. Nuova tabella order_items
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  quantity INTEGER DEFAULT 1,
  status TEXT DEFAULT 'da_ordinare' 
    CHECK (status IN ('da_ordinare', 'ordinato', 'in_produzione', 'consegnato', 'installato')),
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. RLS policies per order_items
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins can manage their order items"
  ON order_items FOR ALL
  USING (
    has_role(auth.uid(), 'company_admin') AND
    EXISTS (
      SELECT 1 FROM orders o 
      WHERE o.id = order_items.order_id 
      AND o.company_id = get_user_company_id(auth.uid())
    )
  );

CREATE POLICY "Customers can view their order items"
  ON order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orders o 
      WHERE o.id = order_items.order_id 
      AND o.customer_id = auth.uid()
    )
  );

CREATE POLICY "Super admins can manage all order items"
  ON order_items FOR ALL
  USING (has_role(auth.uid(), 'super_admin'));

-- 4. Trigger per updated_at
CREATE TRIGGER update_order_items_updated_at
  BEFORE UPDATE ON order_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

---

## File da Creare/Modificare

| File | Azione | Descrizione |
|------|--------|-------------|
| `src/pages/azienda/CreateOrder.tsx` | Modificare | Aggiungere dialog creazione cliente inline, nuovi campi finanziari, sezione articoli |
| `src/pages/azienda/EditOrder.tsx` | Modificare | Aggiungere stessi campi di CreateOrder |
| `src/pages/azienda/OrderDetail.tsx` | Modificare | Mostrare articoli con gestione stato, nuovo riepilogo finanziario |
| `src/pages/cliente/CustomerOrderDetail.tsx` | Modificare | Mostrare articoli (sola lettura), nuovo riepilogo finanziario |
| `src/components/orders/CreateCustomerDialog.tsx` | Creare | Dialog per creazione cliente inline |
| `src/components/orders/OrderItemsList.tsx` | Creare | Componente lista articoli con gestione stato |
| `src/components/orders/OrderItemEditor.tsx` | Creare | Dialog per aggiungere/modificare articolo |

---

## Dettagli UI Componenti

### CreateCustomerDialog

```tsx
interface CreateCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCustomerCreated: (customerId: string, customerName: string) => void;
}
```

Flusso:
1. Apre dialog con form compatto (nome, cognome, email, telefono opzionale)
2. Chiama edge function `create-customer`
3. Mostra password in dialog secondario
4. Chiama `onCustomerCreated` con ID del nuovo cliente
5. Il form ordine seleziona automaticamente il nuovo cliente

### OrderItemsList

```tsx
interface OrderItemsListProps {
  items: OrderItem[];
  onItemsChange: (items: OrderItem[]) => void;
  editable?: boolean;  // false per vista cliente
}

interface OrderItem {
  id?: string;
  name: string;
  description?: string;
  quantity: number;
  status: 'da_ordinare' | 'ordinato' | 'in_produzione' | 'consegnato' | 'installato';
}
```

---

## Risultato Atteso

1. **Creazione ordine piu veloce** - Il cliente puo essere creato al volo senza interrompere il flusso
2. **Flessibilita finanziaria** - Supporto per acconti multipli o finanziamento
3. **Tracciamento granulare** - Ogni articolo dell'ordine ha il proprio stato, permettendo di gestire consegne e installazioni scaglionate
4. **Visibilita cliente** - Il cliente vede l'avanzamento di ogni singolo articolo del suo ordine

