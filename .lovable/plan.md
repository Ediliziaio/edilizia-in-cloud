
# Semplificare la sezione PROVVIGIONI VENDITORI nel Conto Economico

## Cosa cambia

La sezione **PROVVIGIONI VENDITORI** nel Conto Economico attualmente mostra il dettaglio per ogni venditore (provvigione lorda, decurtazione, netto). L'utente vuole che in questa sezione ci sia solo il **totale provvigioni** (netto decurtazioni), senza il dettaglio per singolo venditore.

Il dettaglio per venditore resta visibile nella sezione dedicata alle provvigioni (OrderCommissions), che e separata dal Conto Economico.

## Dettaglio tecnico

### File da modificare
`src/components/orders/OrderEconomics.tsx`

### Modifica (righe 330-373)
Sostituire il blocco che elenca ogni venditore con le relative decurtazioni con una singola riga riepilogativa che mostra:
- Titolo "PROVVIGIONI VENDITORI" (invariato)
- Una sola riga: **Totale Provvigioni** con il valore `totalCommissions` (gia calcolato al netto delle decurtazioni)

Rimuovere:
- Il ciclo `commissionDetails.map(...)` con dettaglio per venditore
- Le righe di decurtazione e netto per singolo venditore

Il calcolo del margine resta invariato perche usa gia `totalCommissions`.
