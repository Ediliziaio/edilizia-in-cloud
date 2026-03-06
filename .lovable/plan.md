

# Fix Cumulativo — Curva che cresce all'infinito

## Problema
Il cumulativo somma tutti i costi mese per mese senza mai resettarsi, quindi la curva sale monotonicamente e diventa enorme. Nei mesi senza dati la linea resta piatta in alto, rendendo le barre illeggibili per effetto scala.

## Soluzione
Sostituire il cumulativo "assoluto" con una **media mobile a 3 mesi** (rolling average). Questo mostra il trend senza far esplodere la scala Y, e resta proporzionato alle barre.

### `src/hooks/useCompanyCostsData.ts` (~righe 393-422)
- Rimuovere la variabile `cumulative` che accumula all'infinito
- Calcolare prima tutti i totali mensili in un array
- Poi fare un secondo passaggio per calcolare la media mobile a 3 mesi: `MediaMobile = (Totale[i-1] + Totale[i] + Totale[i+1]) / 3` (con gestione bordi)
- Rinominare il campo da `Cumulativo` a `MediaMobile` (o tenere `Cumulativo` e cambiare solo la label)

### `src/components/forecast/CostsStatsCards.tsx`
- Aggiornare l'interfaccia `MonthlyDistItem`: rinominare `Cumulativo` → `MediaMobile`
- Aggiornare il `dataKey` della `Line` e la label nella Legend

### Alternativa più semplice
Se si preferisce mantenere il concetto di cumulativo ma solo sull'anno corrente: resettare `cumulative = 0` a gennaio di ogni anno. Ma dato lo span di 12 mesi cross-anno, la media mobile è più leggibile.

