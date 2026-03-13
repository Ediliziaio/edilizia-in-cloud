

## Piano: Sottocategorie collassabili nella sidebar

### Situazione attuale
I `groupLabel` (es. "FATTURAZIONE E DOCUMENTI", "CONTABILITÀ") sono renderizzati come semplici etichette statiche. Esiste già un componente `SidebarSubcategory` con logica di apertura/chiusura e animazione, ma non è usato.

### Modifiche

**File: `src/components/layouts/CompanyLayout.tsx`**

1. Importare `SidebarSubcategory` da `@/components/layouts/SidebarSubcategory`

2. **Expanded mode** (linee 275-307): Sostituire il `<div>` statico con etichetta `group.label` con il componente `<SidebarSubcategory>`. Gestire lo stato open/closed per ogni gruppo tramite un `useState<Record<string, boolean>>` inizializzato con tutti i gruppi aperti di default (o aperto se contiene la route attiva).

3. **Collapsed mode / HoverCard** (linee 207-236): Stessa logica — wrappare gli item di ogni gruppo con `<SidebarSubcategory>` per permettere il toggle anche nel flyout.

4. Lo stato di apertura delle sottocategorie sarà locale al componente (non persistito in localStorage come le macro-aree), con auto-open del gruppo che contiene la route attiva.

### Risultato
Le sottocategorie "FATTURAZIONE E DOCUMENTI" e "CONTABILITÀ" avranno un chevron cliccabile e si apriranno/chiuderanno con animazione, esattamente come le macro-aree.

