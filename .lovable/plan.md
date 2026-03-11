

# Vista Compatta per Card Opportunità

## Problema
Con migliaia di opportunità le card occupano troppo spazio. Serve un toggle per ridurre drasticamente le informazioni visualizzate.

## Approccio
Aggiungere un bottone toggle nella toolbar (accanto a Kanban/Lista) che attiva una modalità **"mini"** delle card. In modalità mini la card mostra solo:
- **Nome** (con checkbox e avatar owner)
- **Valore** (EUR in verde)
- **Telefono**
- **"Agg. X giorni"** piccolo nello spazio a destra

Niente action bar, niente fonte, niente email, niente motivo perdita. Card molto più bassa.

## File da modificare

### 1. `src/hooks/useCardFieldPreferences.tsx`
- Estendere `CardLayout` da `"default" | "compact" | "no-label"` a includere `"mini"`
- Aggiungere tipo: `export type CardLayout = "default" | "compact" | "no-label" | "mini";`

### 2. `src/components/opportunities/OpportunityCard.tsx`
- Se `layout === "mini"`: renderizzare una versione ridotta della card:
  - Riga 1: checkbox + nome (troncato) + "Agg. Xgg" a destra in grigio piccolo
  - Riga 2: valore EUR in primary + telefono a destra
  - Niente `CardDetailRows`, niente action bar, niente owner avatar
  - Padding ridotto (`p-2`), `space-y-1`

### 3. `src/pages/azienda/marketing/MarketingOpportunities.tsx`
- Aggiungere un bottone toggle nella toolbar (icona `Minimize2`/`Maximize2`) accanto ai bottoni Kanban/Lista
- Il bottone alterna `layout` tra `"default"` e `"mini"` tramite `setLayout` dal context
- Tooltip: "Vista compatta" / "Vista estesa"

### 4. `src/components/opportunities/OpportunityKanbanView.tsx`
- Ridurre `min-w` delle colonne a `240px` quando layout è mini, per far stare più colonne

## Risultato
Un solo bottone nella toolbar che toglie/mette la vista compatta. Le card diventano ~40px di altezza invece di ~180px, permettendo di vedere molte più opportunità per colonna.

