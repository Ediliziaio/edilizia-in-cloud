

# Pannelli Magazzino — Versione Minimal con Dialog

## Problema
I pannelli `BlockedOrdersPanel` e `LowStockAlertsPanel` occupano troppo spazio nella pagina principale del magazzino, risultando invasivi.

## Soluzione
Sostituire i due pannelli con una **barra compatta** (una singola riga) che mostra solo i conteggi, e al click apre un **Dialog** con il contenuto completo.

### Dettaglio implementazione

**`Warehouse.tsx`** (linee 255-259): Sostituire i due pannelli grid con un componente inline compatto:
- Una singola riga con due indicatori cliccabili:
  - Icona AlertTriangle + "X ordini bloccati" (rosso se > 0)
  - Icona TrendingDown + "X sottoscorta" (ambra se > 0)
- Se entrambi sono a zero, mostrare un semplice messaggio verde "Magazzino OK"

**`BlockedOrdersPanel.tsx`**: Aggiungere una prop `minimal?: boolean` (default false).
- Se `minimal=true`: render solo un `<button>` inline con icona + badge conteggio, niente Card
- Wrappare il tutto in un `<Dialog>`: il click sul bottone apre il dialog con il pannello completo (compact=false)

**`LowStockAlertsPanel.tsx`**: Stesso pattern:
- Prop `minimal?: boolean`
- Minimal = bottone inline con conteggio
- Click apre Dialog con lista completa

### In `Warehouse.tsx`
Cambiare da grid a una singola riga flex con i due pannelli in modalita' `minimal`:
```
<div className="flex items-center gap-3 print:hidden">
  <BlockedOrdersPanel companyId={...} minimal />
  <LowStockAlertsPanel companyId={...} minimal />
</div>
```

### File da modificare
1. `src/components/warehouse/BlockedOrdersPanel.tsx` — aggiungere mode minimal + Dialog
2. `src/components/warehouse/LowStockAlertsPanel.tsx` — aggiungere mode minimal + Dialog
3. `src/pages/azienda/Warehouse.tsx` — usare minimal invece di compact nel grid

