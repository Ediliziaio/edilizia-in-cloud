

## Piano: Sostituire pills categoria con filtro dropdown + colonna in tabella

### Problema
Le 13 pills di categoria occupano troppo spazio orizzontale e non si integrano bene con la tabella delle automazioni.

### Soluzione
1. Sostituire le pills con un **Select dropdown** accanto alla barra di ricerca
2. Aggiungere una colonna **"Categoria"** nella tabella `AutomationFlowsList`
3. Aggiungere la colonna `category` alla tabella `automation_flows` nel database

### Modifiche

**Migrazione DB**: Aggiungere colonna `category TEXT DEFAULT 'generale'` alla tabella `automation_flows`.

**`AutomazioniUnified.tsx`**:
- Rimuovere il blocco pills con le 13 categorie
- Affiancare alla barra di ricerca un `<Select>` con le categorie (Tutte + le 12 specifiche)
- Mantenere il bottone Template a destra sulla stessa riga
- Layout: `[Search input] [Select categoria] ... [Template button]`

**`AutomationFlowsList.tsx`**:
- Usare `categoryFilter` nella query (`.eq("category", categoryFilter)` quando non null)
- Aggiungere colonna "Categoria" nella tabella tra "Nome" e "Stato"
- Mostrare un badge con emoji + label dalla mappa categorie
- Passare `category` quando si crea/duplica un flow

**`AutomazioniTemplateGallery.tsx`**: Nessuna modifica (usa già `categoriaFiltro` come prop).

