

# Fix Import Wizard - Sidebar Visibile + Stabilizzazione

## Problema

Il wizard di importazione usa `absolute inset-0 z-40` dentro `<main>` che causa problemi grafici con la sidebar (testo troncato, overlay). Il wizard dovrebbe essere contenuto inline nell'area di contenuto senza posizionamento assoluto.

## Soluzione

Rendere il wizard un componente **inline** che sostituisce il contenuto della pagina quando attivo, invece di un overlay posizionato.

## Modifiche

### 1. ImportWizard.tsx - Da overlay a contenuto inline

Rimuovere `absolute inset-0 z-40 bg-background` dal wrapper root. Usare un semplice `div` con `flex flex-col h-full` che occupa lo spazio naturale del parent. Rimuovere anche `overflow-hidden` dal wrapper. Il wizard diventa semplicemente un componente che prende tutto lo spazio disponibile nel flusso normale del layout.

Cambiare:
- `absolute inset-0 z-40 bg-background flex flex-col overflow-hidden` diventa `flex flex-col min-h-[calc(100vh-8rem)] -m-6 bg-background`
- Il `-m-6` compensa il `p-6` del `<main>`, cosi il wizard si estende bordo a bordo nell'area di contenuto
- Nessun z-index, nessun posizionamento assoluto

### 2. MarketingContacts.tsx - Rendering condizionale

Quando `importOpen` e true, rendere SOLO il wizard (senza il resto della pagina). Il wizard sostituisce il contenuto della pagina invece di sovrapporsi.

Spostare il rendering del wizard prima del contenuto principale con un `if (importOpen) return <ImportWizard ... />` pattern.

### 3. MarketingOpportunities.tsx - Rendering condizionale

Stessa logica: quando `importOpen` e true, rendere solo il wizard al posto del contenuto della pagina.

### 4. CompanyLayout.tsx - Rimuovere relative overflow-hidden

Rimuovere `relative overflow-hidden` dal `<main>` dato che non serve piu (il wizard non usa piu posizionamento assoluto). Mantenere solo `flex-1 p-6 bg-muted/30`.

### 5. StepIndicator.tsx - Gia corretto con forwardRef

Verificato: gia usa `React.forwardRef`, il warning in console dovrebbe essere risolto.

## Riepilogo file

| File | Tipo | Descrizione |
|------|------|-------------|
| `src/components/shared/ImportWizard.tsx` | Fix | Rimuovere posizionamento assoluto, usare layout inline con margini negativi |
| `src/pages/azienda/marketing/MarketingContacts.tsx` | Fix | Rendering condizionale: wizard sostituisce contenuto pagina |
| `src/pages/azienda/marketing/MarketingOpportunities.tsx` | Fix | Rendering condizionale: wizard sostituisce contenuto pagina |
| `src/components/layouts/CompanyLayout.tsx` | Cleanup | Rimuovere `relative overflow-hidden` dal main |

## Risultato atteso

- Sidebar sempre completamente visibile e funzionante durante l'importazione
- Wizard occupa solo l'area di contenuto principale
- Nessun problema di z-index o posizionamento
- Header della pagina (con nome azienda) resta visibile sopra il wizard
- UX fluida: il wizard sostituisce il contenuto come una "sotto-pagina"
