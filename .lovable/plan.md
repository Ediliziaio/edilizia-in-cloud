

# Fix Overflow e Allineamento Vista Settimana Calendario

## Problemi identificati

1. **Header esce dalla sidebar**: Quando si riduce la finestra e si scrolla orizzontalmente, l'header sticky della griglia si sovrappone alla sidebar perche il container con `overflow-auto` non e contenuto correttamente nel layout della pagina.
2. **Colonne disallineate su schermi piccoli**: L'header e il body perdono l'allineamento quando la finestra e ridotta.

## Soluzione

### File: `src/components/marketing/MarketingCalendarWeekView.tsx`

| Modifica | Dettaglio |
|----------|-----------|
| Container esterno | Aggiungere `overflow-hidden` al wrapper esterno e spostare `overflow-auto` solo sul div interno che contiene header + body. Aggiungere `relative` e `isolate` per creare un nuovo stacking context che impedisca all'header sticky di uscire dai confini del container |
| Sticky header | Mantenere `sticky top-0` sull'header ma assicurarsi che sia contenuto dentro il `overflow-auto` del parent diretto con z-index limitato al contesto locale |

La modifica e minima:
- Riga 89: `overflow-auto` diventa `overflow-hidden` sul container principale, e il div interno (riga 90) riceve `overflow-auto h-full` con `relative isolate` per isolare il contesto di stacking
- In alternativa piu semplice: aggiungere `overflow-x-clip` o `contain: paint` al container esterno per impedire al contenuto sticky di fuoriuscire

### Approccio tecnico preciso

Sostituire la struttura attuale:
```
div.flex-1.overflow-auto.border.rounded-lg
  div.min-w-[900px]
    div.sticky.top-0 (header)
    div (body)
```

Con:
```
div.flex-1.overflow-auto.border.rounded-lg.relative
  div.min-w-[900px]
    div.sticky.top-0.z-10 (header - gia presente)
    div (body)
```

Il fix principale e aggiungere `isolate` al container `overflow-auto` per creare un isolation boundary che impedisca allo sticky header di renderizzarsi sopra la sidebar. Questo risolve entrambi i problemi senza cambiare il layout funzionale.

