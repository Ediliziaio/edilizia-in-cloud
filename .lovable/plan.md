

## Piano: Sincronizzazione bidirezionale Categorie Costi

### Problema attuale
1. Le categorie create "on the fly" nei costi vengono salvate nella tabella `cost_categories`, ma quelle già presenti nei costi prima della creazione della tabella non compaiono nella pagina Impostazioni
2. Il bottone "Importa" appare solo quando ci sono 0 categorie — dovrebbe essere sempre visibile
3. Manca la sincronizzazione completa: le categorie usate nei costi dovrebbero comparire automaticamente qui

### Modifiche

#### 1. `src/pages/azienda/settings/SettingsCostCategories.tsx`
- **Bottone "Importa"**: renderlo sempre visibile (non solo quando `categories.length === 0`), così l'utente può importare nuove categorie dai costi in qualsiasi momento
- Aggiungere un **conteggio di utilizzo** per ogni categoria: mostrare quanti costi usano quella categoria (query su `company_costs` raggruppata per `category`)
- Proteggere l'eliminazione: se una categoria è usata da costi esistenti, avvisare l'utente

#### 2. `src/components/forecast/CostFormDialog.tsx`
- Già funzionante con l'upsert nella tabella `cost_categories` — nessuna modifica necessaria

#### 3. `src/hooks/useCompanyCostsData.ts`
- Già funzionante con la query `cost-categories` + fallback dinamico — nessuna modifica necessaria

### Riepilogo
Unico file da modificare: `SettingsCostCategories.tsx`. Il bottone importa diventa sempre visibile e il conteggio utilizzo offre visibilità sulla sincronizzazione.

