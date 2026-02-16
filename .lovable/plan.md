
# Miglioramento Tab "Previsione di Cassa"

## Cosa cambia

### 1. Filtro per date nella tabella movimenti
Aggiungere un filtro con date range (Da / A) nella sezione "Tutti i movimenti previsti" per filtrare le transazioni per periodo specifico. Il filtro si aggiunge accanto al filtro categoria gia esistente (Tutti / Solo entrate / Solo uscite).

### 2. Card "Prossimi 3 mesi" diventa personalizzabile
La terza card attualmente mostra un periodo fisso di 3 mesi. Verra aggiunto un selettore numerico (dropdown) che permette di scegliere il numero di mesi da visualizzare: da 1 a 12 mesi. Il titolo della card si aggiornera di conseguenza (es. "Prossimi 6 mesi").

## Dettagli tecnici

### File: `src/components/forecast/CashForecastTab.tsx`

**Filtro date:**
- Aggiungere due Popover con Calendar (datepicker) per selezionare "Da" e "A"
- I movimenti nella tabella verranno filtrati anche per il range di date selezionato
- Se nessuna data selezionata, mostra tutto (comportamento attuale)

**Card personalizzabile:**
- Aggiungere uno state `customMonths` (default: 3)
- Aggiungere un Select dropdown nella terza card con opzioni 1-12 mesi
- Il calcolo entrate/uscite/netto della terza card si basera sul periodo personalizzato

### File: `src/hooks/useCashFlowData.ts`

- Attualmente `stats.next3Months` e calcolato con un intervallo fisso di 3 mesi
- Il calcolo del periodo personalizzato verra fatto direttamente nel componente `CashForecastTab` usando i dati grezzi (`expectedPayments`, `expectedExpenses`, ecc.) e le funzioni di date-fns, senza modificare il hook. Questo mantiene il hook semplice e sposta la logica di personalizzazione nel componente.

### File: `src/lib/forecastTypes.ts`
- Nessuna modifica necessaria

## Risultato visivo

La tab "Previsione di Cassa" avra:
- 3 card in alto: "Questo mese", "Prossimo mese", "Prossimi X mesi" (con dropdown per scegliere X)
- Sotto: tabella movimenti con filtri per categoria E per range di date
