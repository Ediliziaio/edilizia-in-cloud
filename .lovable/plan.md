

## Piano: Sezione "Categorie Costi" in Impostazioni > Gestione Ordini

### Obiettivo
Creare una tabella `cost_categories` nel database per gestire le categorie costi in modo centralizzato. Aggiungere una pagina dedicata in Impostazioni sotto "Gestione ordini" per CRUD delle categorie. Aggiornare `useCompanyCostsData` e `CostFormDialog` per leggere da questa tabella invece di aggregare dinamicamente.

### 1. Database: nuova tabella `cost_categories`

```sql
CREATE TABLE public.cost_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, name)
);

ALTER TABLE public.cost_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own company cost categories"
ON public.cost_categories FOR ALL TO authenticated
USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
```

### 2. Nuova pagina: `src/pages/azienda/settings/SettingsCostCategories.tsx`

Pagina semplice con:
- Lista delle categorie esistenti (dalla tabella `cost_categories`)
- Form inline per aggiungere nuova categoria (nome + colore opzionale)
- Bottoni modifica/elimina per ogni riga
- Al primo accesso, se la tabella è vuota, mostrare bottone "Importa categorie esistenti" che prende le categorie già usate nei costi e le inserisce nella tabella

### 3. Routing e navigazione

**`src/App.tsx`**: Aggiungere lazy import e route `categorie-costi` dentro il blocco `impostazioni`.

**`src/components/layouts/CompanyLayout.tsx`**: Aggiungere link "Categorie costi" con icona `FolderOpen` nel gruppo "Gestione ordini", sotto "Fornitori".

### 4. Integrazione con il sistema costi

**`src/hooks/useCompanyCostsData.ts`**: 
- Aggiungere query per `cost_categories` dalla tabella
- `dynamicCategories` diventa: categorie dalla tabella DB + eventuali categorie presenti nei costi ma non ancora in tabella (retrocompatibilità)

**`src/components/forecast/CostFormDialog.tsx`**: 
- Quando l'utente crea una nuova categoria "on the fly", inserirla anche nella tabella `cost_categories`

### Dettagli tecnici

- 4 file modificati: `App.tsx`, `CompanyLayout.tsx`, `useCompanyCostsData.ts`, `CostFormDialog.tsx`
- 1 file nuovo: `SettingsCostCategories.tsx`
- 1 migrazione DB

