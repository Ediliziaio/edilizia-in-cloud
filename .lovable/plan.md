

# Sezioni/Zone del Magazzino

## Obiettivo
Permettere alle aziende di organizzare il proprio magazzino in sezioni/zone (es. "Scaffale A", "Area Elettrica", "Piano Interrato") e assegnare ogni articolo di giacenza a una sezione specifica, così da sapere esattamente dove trovare ogni materiale.

## Modifiche

### 1. Database — Nuova tabella `warehouse_sections`

```sql
CREATE TABLE public.warehouse_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  color text DEFAULT '#6b7280',
  position int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(company_id, name)
);

ALTER TABLE public.warehouse_sections ENABLE ROW LEVEL SECURITY;

-- RLS: solo utenti della stessa azienda
CREATE POLICY "Users can manage own company sections"
  ON public.warehouse_sections FOR ALL TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- Aggiungere colonna section_id a warehouse_stock
ALTER TABLE public.warehouse_stock
  ADD COLUMN section_id uuid REFERENCES public.warehouse_sections(id) ON SET NULL;
```

### 2. Gestione Sezioni — Nuovo componente `WarehouseSectionsManager`

Una sezione nell'interfaccia magazzino (tab o pannello laterale nella tab "Giacenze") per:
- Creare/modificare/eliminare sezioni con nome, descrizione e colore
- Riordinare le sezioni (drag o frecce)
- Vedere quanti articoli ci sono in ogni sezione

### 3. Integrazione con articoli di giacenza

- **`StockItemDialog`**: aggiungere un selettore "Sezione" (opzionale) per assegnare l'articolo a una zona
- **`WarehouseStockTab`**: 
  - Aggiungere colonna "Sezione" nella tabella con badge colorato
  - Aggiungere filtro per sezione nella barra di ricerca
  - Opzione di raggruppamento per sezione

### 4. File da creare/modificare

- **Creare** `src/components/warehouse/WarehouseSectionsManager.tsx` — CRUD sezioni
- **Modificare** `src/components/warehouse/WarehouseStockTab.tsx` — colonna sezione, filtro, raggruppamento
- **Modificare** `src/components/warehouse/StockItemDialog.tsx` — selettore sezione
- **Modificare** `src/types/warehouse.ts` — tipo `StockItem` con `section_id`

