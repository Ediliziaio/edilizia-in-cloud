

## Piano: Sidebar chiusa di default per l'area Azienda

L'utente vuole che tutte le sezioni collassabili della sidebar siano **chiuse** quando accede alla piattaforma come azienda.

### Modifiche

**1. `src/hooks/useSidebarSections.ts`**
- Cambiare il `DEFAULT_STATE` da `true` a `false` per tutte le sottocategorie, così le sezioni partono chiuse.
- L'auto-expand su navigazione continuerà a funzionare: quando l'utente clicca su una voce, la sezione corrispondente si apre automaticamente.

**2. `src/components/layouts/CompanyLayout.tsx`**
- Cambiare `defaultOpen` dei due `Collapsible` principali ("Gestione Interna" e "Marketing e Vendita") da condizionale a `false`, così anche le macro-sezioni partono chiuse.
- L'utente potrà aprirle cliccando sul titolo della sezione.

Nessun impatto su routing, dati o altre aree della piattaforma.

