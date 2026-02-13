

# Piano: Gestione Giacenze Magazzino

## Panoramica

Aggiungere un sistema di inventario reale al magazzino, con articoli in giacenza, quantita, costi unitari e la possibilita di prelevare articoli dal magazzino quando si crea un ordine. Il flusso economico si calcola automaticamente.

---

## Architettura

Il sistema si compone di due parti:

1. **Inventario (warehouse_stock)**: tabella con gli articoli fisicamente in magazzino, le quantita disponibili e il costo unitario
2. **Prelievo da giacenza**: quando si aggiunge un articolo a un ordine, si puo scegliere se prelevarlo dal magazzino (decrementando la giacenza) oppure ordinarlo da fornitore

---

## 1. Nuova Tabella `warehouse_stock`

| Colonna | Tipo | Descrizione |
|---------|------|-------------|
| id | uuid (PK) | |
| company_id | uuid (FK) | Azienda |
| name | text | Nome articolo |
| description | text | Descrizione (opzionale) |
| quantity | integer | Quantita disponibile |
| unit_cost | numeric | Costo unitario di acquisto |
| vat_rate | numeric | Aliquota IVA (default 22) |
| supplier_id | uuid (FK) | Fornitore (opzionale) |
| min_stock_level | integer | Soglia minima per alert (default 0) |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**RLS**: stesse policy delle altre tabelle aziendali (company_admin + super_admin).

---

## 2. Nuova Tabella `warehouse_movements`

Traccia ogni movimento di magazzino (carico/scarico) per storico e audit.

| Colonna | Tipo | Descrizione |
|---------|------|-------------|
| id | uuid (PK) | |
| stock_item_id | uuid (FK) | Articolo di magazzino |
| order_item_id | uuid (FK) | Articolo ordine (se scarico per ordine) |
| movement_type | text | "carico" o "scarico" |
| quantity | integer | Quantita movimentata |
| notes | text | Note (opzionale) |
| performed_by | uuid | Utente che ha eseguito |
| created_at | timestamptz | |

---

## 3. UI Magazzino - Nuova Sezione "Giacenze"

Aggiungere un tab "Giacenze" nella pagina Magazzino (accanto a Lista/Kanban/Calendario), con:

- **Tabella articoli in giacenza**: nome, quantita disponibile, costo unitario, fornitore, soglia minima
- **Bottone "Aggiungi Articolo"**: dialog per inserire nuovo articolo in magazzino
- **Modifica inline**: modifica quantita (carico/scarico manuale)
- **Alert sotto-scorta**: evidenziazione articoli sotto la soglia minima
- **Ricerca e filtri**: per nome, fornitore

---

## 4. Prelievo da Giacenza negli Ordini

Nel dialog di aggiunta articolo (`OrderItemsList`), aggiungere un'opzione **"Preleva da Magazzino"**:

- Un toggle/tab "Nuovo" vs "Da Magazzino"
- Se "Da Magazzino": mostra combobox con articoli disponibili in giacenza, la quantita disponibile e il costo unitario
- Selezionando un articolo, il costo si compila automaticamente
- Al salvataggio: la quantita in `warehouse_stock` diminuisce e viene creato un record in `warehouse_movements`
- L'articolo dell'ordine viene collegato tramite un campo `stock_item_id` su `order_items`

---

## 5. Modifiche alla Tabella `order_items`

Aggiungere una colonna:

| Colonna | Tipo | Descrizione |
|---------|------|-------------|
| stock_item_id | uuid (FK, nullable) | Se l'articolo proviene da giacenza |

Quando `stock_item_id` e valorizzato, l'articolo e stato prelevato dal magazzino. Il badge nell'ordine mostrera "Da Magazzino" con icona diversa.

---

## 6. Flusso Economico Automatico

- Il costo dell'articolo prelevato da magazzino viene copiato dal `unit_cost` dello stock
- Il calcolo del margine nell'ordine (Conto Economico) funziona gia con `purchase_price` su `order_items`, quindi nessuna modifica necessaria a `OrderEconomics`
- Nel previsionale cassa, gli articoli prelevati da magazzino non generano uscite future (sono gia pagati)

---

## File da Creare/Modificare

| File | Azione | Descrizione |
|------|--------|-------------|
| Migrazione DB | Crea | Tabelle `warehouse_stock`, `warehouse_movements`, colonna `stock_item_id` su `order_items` |
| `src/components/warehouse/WarehouseStockTab.tsx` | Crea | UI gestione giacenze (tabella, CRUD, alert sotto-scorta) |
| `src/components/warehouse/StockItemDialog.tsx` | Crea | Dialog creazione/modifica articolo di magazzino |
| `src/components/warehouse/StockMovementDialog.tsx` | Crea | Dialog per carico/scarico manuale |
| `src/pages/azienda/Warehouse.tsx` | Modifica | Aggiungere tab "Giacenze" |
| `src/components/orders/OrderItemsList.tsx` | Modifica | Aggiungere opzione "Preleva da Magazzino" nel dialog articolo |
| `src/types/warehouse.ts` | Modifica | Aggiungere tipi per stock e movimenti |

---

## Dettagli Tecnici

### Migrazione SQL

```text
-- Tabella giacenze
CREATE TABLE warehouse_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  name text NOT NULL,
  description text,
  quantity integer NOT NULL DEFAULT 0,
  unit_cost numeric NOT NULL DEFAULT 0,
  vat_rate numeric DEFAULT 22,
  supplier_id uuid REFERENCES suppliers(id),
  min_stock_level integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Tabella movimenti
CREATE TABLE warehouse_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_item_id uuid NOT NULL REFERENCES warehouse_stock(id),
  order_item_id uuid REFERENCES order_items(id),
  movement_type text NOT NULL CHECK (movement_type IN ('carico', 'scarico')),
  quantity integer NOT NULL,
  notes text,
  performed_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Colonna su order_items
ALTER TABLE order_items ADD COLUMN stock_item_id uuid REFERENCES warehouse_stock(id);

-- RLS warehouse_stock
ALTER TABLE warehouse_stock ENABLE ROW LEVEL SECURITY;
-- (policy company_admin + super_admin come le altre tabelle)

-- RLS warehouse_movements
ALTER TABLE warehouse_movements ENABLE ROW LEVEL SECURITY;

-- Trigger updated_at
CREATE TRIGGER update_warehouse_stock_updated_at
  BEFORE UPDATE ON warehouse_stock
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### UI Giacenze - WarehouseStockTab

- Tabella con colonne: Nome, Quantita, Costo Unitario, Fornitore, Soglia, Azioni
- Righe con quantita sotto soglia evidenziate in rosso/ambra
- Bottoni: Aggiungi, Modifica, Carico, Scarico
- Filtri: ricerca per nome, filtro per fornitore

### Prelievo da Magazzino nel Dialog Articolo

Nel dialog di `OrderItemsList`, aggiungere sopra il form:

```text
[Tab: Nuovo Articolo] [Tab: Da Magazzino]

Se "Da Magazzino":
  - Combobox con articoli in giacenza (nome + quantita disponibile)
  - Quantita da prelevare (max = disponibile)
  - Costo auto-compilato dal unit_cost
  - Al salvataggio: insert order_item + update warehouse_stock.quantity + insert warehouse_movement
```

### Integrazione con Previsionale Cassa

Nessuna modifica necessaria: gli articoli con `stock_item_id` hanno gia il `purchase_price` valorizzato. Il previsionale usa gli articoli con status "da_ordinare"/"ordinato" per le uscite future -- gli articoli prelevati da magazzino avranno status "in_magazzino" e quindi non rientrano nelle uscite previste.

