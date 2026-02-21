
# Spostare Automazioni dalla Tab Impostazioni alla Sidebar

## Cosa cambia
La tab "Automazioni" viene rimossa dalla pagina Impostazioni e diventa una voce indipendente nella sidebar, accessibile solo agli admin (company_admin e super_admin).

## Modifiche

### 1. Nuova pagina `src/pages/azienda/Automations.tsx`
- Pagina wrapper che importa e renderizza il componente `AutomationsConfig` gia esistente

### 2. Sidebar - `src/components/layouts/CompanyLayout.tsx`
- Aggiungere la voce "Automazioni" nella lista `allNavItems` con:
  - URL: `/azienda/automazioni`
  - Icona: `Zap`
  - Posizionata prima di "Impostazioni"
  - Visibile solo per chi ha permesso `canViewSettings`

### 3. Router - `src/App.tsx`
- Aggiungere la route `/azienda/automazioni` che punta alla nuova pagina

### 4. Pagina Impostazioni - `src/pages/azienda/Settings.tsx`
- Rimuovere la tab "Automazioni" dal `TabsList`
- Rimuovere il `TabsContent` corrispondente
- Rimuovere l'import di `AutomationsConfig` e l'icona `Zap`
- Aggiornare la griglia dei tab (da `grid-cols-10` a `grid-cols-9` per admin)

### File coinvolti
| File | Azione |
|------|--------|
| `src/pages/azienda/Automations.tsx` | Nuovo - pagina wrapper |
| `src/components/layouts/CompanyLayout.tsx` | Aggiunge voce sidebar |
| `src/App.tsx` | Aggiunge route |
| `src/pages/azienda/Settings.tsx` | Rimuove tab automazioni |
