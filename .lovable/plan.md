
# Piano: Gestione Avanzata Articoli Ordine e Conto Economico

## Richieste dell'Utente

1. **Nome articolo con autocomplete** - Dropdown che mostra articoli usati in precedenza + possibilita di aggiungerne nuovi
2. **Fornitore per ogni articolo** - Selezione fornitore per tracciare dove ordinare
3. **Stati articolo semplificati** - "Da Ordinare", "Ordinato", "In Magazzino" (per uso interno azienda)
4. **Importo di acquisto per articolo** - Costo per calcolare margine
5. **Vista cliente semplificata** - Il cliente vede SOLO: data arrivo merce, data inizio lavori, data fine lavori (NON i singoli articoli)
6. **Conto economico ordine** - Totale Vendita, Totale Costi, con gestione IVA

---

## FASE 1: Database - Nuove Tabelle e Modifiche

### Nuova Tabella: `suppliers` (Fornitori)
```
+------------------------------------------+
| suppliers                                |
+------------------------------------------+
| id          | UUID PK                    |
| company_id  | UUID FK -> companies       |
| name        | TEXT NOT NULL              |
| created_at  | TIMESTAMPTZ                |
+------------------------------------------+
```

### Nuova Tabella: `article_templates` (Nomi Articoli Salvati)
Per l'autocomplete dei nomi articoli gia usati.
```
+------------------------------------------+
| article_templates                        |
+------------------------------------------+
| id          | UUID PK                    |
| company_id  | UUID FK -> companies       |
| name        | TEXT NOT NULL              |
| created_at  | TIMESTAMPTZ                |
| UNIQUE (company_id, name)                |
+------------------------------------------+
```

### Modifiche Tabella: `order_items`
Nuovi campi:
- `supplier_id` - UUID FK verso suppliers (opzionale)
- `purchase_price` - NUMERIC per costo acquisto

### Modifiche Tabella: `orders`
Nuovi campi per date cliente e conto economico:
- `warehouse_arrival_date` - Data prevista arrivo merce
- `work_start_date` - Data inizio lavori
- `work_end_date` - Data fine lavori
- `vat_rate` - Aliquota IVA (default 22)
- `total_costs` - Totale costi (calcolato sommando purchase_price articoli)

### Stati Articolo Aggiornati
Cambiare da 5 stati a 3 stati interni:
- `da_ordinare` -> "Da Ordinare"
- `ordinato` -> "Ordinato"
- `in_magazzino` -> "In Magazzino"

---

## FASE 2: Componente OrderItemsList Aggiornato

### Dialog Aggiunta/Modifica Articolo
```
+------------------------------------------+
| Nuovo Articolo                           |
+------------------------------------------+
| Nome Articolo *                          |
| [ComboBox: cerca o crea nuovo    ▼]      |
|   - Finestre (usato 5 volte)             |
|   - Tapparelle (usato 3 volte)           |
|   - Porta blindata (usato 2 volte)       |
|   + Aggiungi "Nuovo nome..."             |
+------------------------------------------+
| Descrizione                              |
| [____________________________]           |
+------------------------------------------+
| Quantita       | Fornitore               |
| [__1__]        | [Seleziona fornitore ▼] |
|                | + Nuovo fornitore       |
+------------------------------------------+
| Costo Acquisto (opzionale)               |
| € [________]                             |
+------------------------------------------+
|        [Annulla]  [Aggiungi]             |
+------------------------------------------+
```

### Comportamento Autocomplete Nome
1. Mostra lista articoli usati precedentemente dalla stessa azienda
2. Filtra mentre l'utente digita
3. Se il testo non corrisponde, mostra opzione "Aggiungi: [testo digitato]"
4. Al salvataggio, se nuovo nome, lo salva in `article_templates`

### Vista Lista Articoli (per Azienda)
```
+----------------------------------------------------------+
| Articoli dell'Ordine                    [+ Aggiungi]     |
+----------------------------------------------------------+
| Finestre soggiorno (x4)                                  |
| Fornitore: ABC Serramenti | Costo: €1.200    [Ordinato]  |
| [Allegati] [Modifica] [Elimina]                          |
+----------------------------------------------------------+
| Tapparelle (x4)                                          |
| Fornitore: XYZ Avvolgibili | Costo: €800   [Da Ordinare] |
| [Allegati] [Modifica] [Elimina]                          |
+----------------------------------------------------------+
```

---

## FASE 3: Vista Cliente Semplificata

### CustomerOrderDetail - Cosa Vede il Cliente
Il cliente NON vede:
- Lista articoli singoli
- Stati articoli
- Costi acquisto
- Fornitori

Il cliente VEDE SOLO:
```
+------------------------------------------+
| Stato Ordine                             |
| [Progress Tracker generale]              |
+------------------------------------------+
| Tempistiche Previste                     |
+------------------------------------------+
| Arrivo Merce in Magazzino                |
| 📦 15 Marzo 2026                         |
+------------------------------------------+
| Inizio Lavori                            |
| 🔧 20 Marzo 2026                         |
+------------------------------------------+
| Fine Lavori                              |
| ✅ 25 Marzo 2026                         |
+------------------------------------------+
| Riepilogo Economico                      |
| Totale: €15.000,00                       |
| IVA (22%): €3.300,00                     |
| Totale con IVA: €18.300,00               |
| Acconto versato: €5.000,00               |
| Saldo: €13.300,00                        |
+------------------------------------------+
```

---

## FASE 4: Conto Economico Ordine (Vista Azienda)

### Nuova Card nel Dettaglio Ordine
```
+------------------------------------------+
| Conto Economico                          |
+------------------------------------------+
| VENDITA                                  |
| Imponibile:           € 15.000,00        |
| IVA (22%):            €  3.300,00        |
| Totale con IVA:       € 18.300,00        |
+------------------------------------------+
| COSTI ARTICOLI                           |
| Finestre:             €  1.200,00        |
| Tapparelle:           €    800,00        |
| Porta:                €    500,00        |
| Totale Costi:         €  2.500,00        |
+------------------------------------------+
| MARGINE                                  |
| Margine Lordo:        € 12.500,00        |
| Margine %:            83.3%              |
+------------------------------------------+
```

### Campi Aggiuntivi nel Form Ordine
- Aliquota IVA (default 22%, modificabile: 4%, 10%, 22%)
- Date per cliente: Arrivo merce, Inizio lavori, Fine lavori

---

## File da Creare/Modificare

| File | Azione | Descrizione |
|------|--------|-------------|
| Migrazione SQL | Creare | Tabelle suppliers, article_templates, nuovi campi |
| `src/components/orders/ArticleCombobox.tsx` | Creare | Combobox autocomplete per nome articolo |
| `src/components/orders/SupplierSelect.tsx` | Creare | Select con creazione fornitore inline |
| `src/components/orders/OrderItemsList.tsx` | Modificare | Aggiungere fornitore, costo, nuovi stati, combobox |
| `src/components/orders/OrderEconomics.tsx` | Creare | Card conto economico |
| `src/components/orders/FinancialSummary.tsx` | Modificare | Aggiungere IVA |
| `src/pages/azienda/CreateOrder.tsx` | Modificare | Aggiungere date cliente, aliquota IVA |
| `src/pages/azienda/EditOrder.tsx` | Modificare | Stesso di CreateOrder |
| `src/pages/azienda/OrderDetail.tsx` | Modificare | Mostrare conto economico |
| `src/pages/cliente/CustomerOrderDetail.tsx` | Modificare | Rimuovere articoli, mostrare date e riepilogo con IVA |

---

## Migrazione SQL

```sql
-- 1. Tabella fornitori
CREATE TABLE suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (company_id, name)
);

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins can manage their suppliers"
  ON suppliers FOR ALL
  USING (
    has_role(auth.uid(), 'company_admin') AND
    company_id = get_user_company_id(auth.uid())
  );

CREATE POLICY "Super admins can manage all suppliers"
  ON suppliers FOR ALL
  USING (has_role(auth.uid(), 'super_admin'));

-- 2. Tabella template articoli (autocomplete)
CREATE TABLE article_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (company_id, name)
);

ALTER TABLE article_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins can manage their article templates"
  ON article_templates FOR ALL
  USING (
    has_role(auth.uid(), 'company_admin') AND
    company_id = get_user_company_id(auth.uid())
  );

CREATE POLICY "Super admins can manage all article templates"
  ON article_templates FOR ALL
  USING (has_role(auth.uid(), 'super_admin'));

-- 3. Nuovi campi order_items
ALTER TABLE order_items
ADD COLUMN supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
ADD COLUMN purchase_price NUMERIC DEFAULT 0;

-- 4. Nuovi campi orders (date cliente e IVA)
ALTER TABLE orders
ADD COLUMN warehouse_arrival_date DATE,
ADD COLUMN work_start_date DATE,
ADD COLUMN work_end_date DATE,
ADD COLUMN vat_rate NUMERIC DEFAULT 22;

-- 5. Aggiornare check constraint status (rimuovere vecchi stati)
-- I nuovi stati saranno: 'da_ordinare', 'ordinato', 'in_magazzino'
ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_status_check;
ALTER TABLE order_items ADD CONSTRAINT order_items_status_check 
  CHECK (status IN ('da_ordinare', 'ordinato', 'in_magazzino'));

-- Aggiornare eventuali record con stati vecchi
UPDATE order_items SET status = 'in_magazzino' 
WHERE status IN ('in_produzione', 'consegnato', 'installato');
```

---

## Interfacce TypeScript Aggiornate

```typescript
export type OrderItemStatus = 'da_ordinare' | 'ordinato' | 'in_magazzino';

export interface OrderItem {
  id?: string;
  name: string;
  description?: string;
  quantity: number;
  status: OrderItemStatus;
  position: number;
  supplier_id?: string;
  supplier_name?: string;
  purchase_price?: number;
  attachments?: OrderItemAttachment[];
}

export interface Supplier {
  id: string;
  name: string;
}

export interface ArticleTemplate {
  id: string;
  name: string;
}
```

---

## Risultato Atteso

1. **Autocomplete articoli** - L'utente puo selezionare nomi usati in precedenza o crearne di nuovi
2. **Gestione fornitori** - Ogni articolo puo avere un fornitore assegnato
3. **Tracciamento costi** - Importo di acquisto per calcolare margini
4. **Vista cliente pulita** - Il cliente vede solo le date importanti e il riepilogo economico con IVA
5. **Conto economico** - L'azienda vede vendita, costi, margine in un colpo d'occhio
6. **Gestione IVA** - Supporto per aliquote 4%, 10%, 22%

