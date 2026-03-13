

## Piano: Rimozione Tab Operative/Regole + Ristrutturazione Pagina Automazioni

### Situazione attuale

`AutomazioniUnified.tsx` ha 3 tab:
- **Operative** → lazy-loads `InternalAutomations` (vecchio builder)
- **Marketing** → lazy-loads `MarketingAutomations` (lista flow con folders, crea/modifica via `MarketingAutomationBuilder` che ora usa `FlowBuilderPage`)
- **Regole** → card-based `AutomazioniList` + `AutomazioniTemplateGallery` (sistema `automation_rules`)

L'unico sistema che conta è `automation_flows` + il nuovo `FlowBuilderPage`. Tutto il resto è legacy.

### Approccio

Riscrivere `AutomazioniUnified.tsx` come pagina flat (senza tab) con:
- Filtri categoria come pill orizzontali (riutilizzando il pattern già presente nella tab Regole)
- Toggle Attive/Template
- Ricerca
- La lista flow riutilizza `AutomationFlowsList` esistente (query su `automation_flows`, già con folders, pagination, enrollment counts)
- Il bottone "Crea" naviga a `/azienda/marketing/automazioni/nuova` (route già configurata → `FlowBuilderPage`)

**Non** serve creare RPCs (`get_flows`) o nuovi componenti FlowCard — `AutomationFlowsList` è già un componente maturo (504 righe, tabella con bulk actions, pagination, folders).

### File da modificare

1. **`src/pages/azienda/AutomazioniUnified.tsx`** — Riscrittura completa:
   - Rimuovere tab Operative/Marketing/Regole
   - Layout: Header → Filtri categoria pill → Search + Toggle Template → `AutomationFlowsList`
   - Categorie: Tutte, CRM & Vendite, Marketing, Cantieri, Task, Generale
   - Il filtro categoria non è ancora supportato da `AutomationFlowsList`, quindi lo aggiungeremo come prop

2. **`src/components/marketing/automations/AutomationFlowsList.tsx`** — Aggiungere prop `categoryFilter?: string | null` opzionale per filtrare i flow per categoria (campo `category` o tag nella `config_json`)

3. **`src/routes/companyRoutes.tsx`** — Cleanup:
   - Rimuovere import `InternalAutomations`, `TaskAutomationsPage`, `Automations` (legacy)
   - Rimuovere route `automazioni/:id` (vecchio operative builder) e `automazioni-legacy`
   - Mantenere route `automazioni` → `AutomazioniUnified`
   - Mantenere route `marketing/automazioni/nuova` e `marketing/automazioni/:id` → `FlowBuilderPage`

4. **Non eliminare** i file `InternalAutomations.tsx`, `TaskAutomationsPage.tsx`, ecc. — li scolleghiamo solo dalle route. Eliminarli è un passo separato per sicurezza.

### Dettagli tecnici

**`AutomazioniUnified.tsx` nuova struttura:**
- Stato: `categoriaAttiva`, `searchQuery`, `vistaTemplates`
- Categorie pill: array di oggetti `{id, label, emoji}` (Tutte=null, crm, marketing, cantieri, task, generale)
- Header con titolo + bottone "Crea Automazione" che naviga al flow builder
- Passa `searchQuery` e `categoriaAttiva` a `AutomationFlowsList`
- Toggle Template mostra `AutomazioniTemplateGallery` con filtro categoria

**`AutomationFlowsList` modifica minima:**
- Nuova prop opzionale `categoryFilter?: string | null`
- Se presente, aggiunge `.eq("category", categoryFilter)` alla query (se la colonna esiste) — altrimenti filtra client-side sul `config_json` o `name` pattern

**Route cleanup in `companyRoutes.tsx`:**
- Rimuovere 3 lazy import (InternalAutomations, TaskAutomationsPage, Automations)
- Rimuovere 3 route (`automazioni/:id`, `automazioni-legacy`, redirect `automazioni-task`)
- Redirect `marketing/automazioni` → `/azienda/automazioni` (invece di `?tab=marketing`)

