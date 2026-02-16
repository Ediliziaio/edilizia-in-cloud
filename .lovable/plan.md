

# Aggiunta Filtri Date a Tab "Incassato" e "Previsionale Costi"

## Cosa cambia

Aggiungere gli stessi filtri per date (Da / A) gia presenti nella tab "Previsione di Cassa" anche alle altre due tab, con la stessa card personalizzabile per il periodo.

### Tab "Incassato" (`CollectedTab.tsx`)
- Aggiungere filtri data (Da / A) nella sezione "Gia incassato" per filtrare i pagamenti ricevuti per periodo (non piu solo mese corrente)
- Rendere la card "Prossimi 3 mesi" personalizzabile con dropdown 1-12 mesi (come nella tab Cassa)
- Aggiornare le tabelle "Da ricevere" per rispettare il periodo personalizzato

### Tab "Previsionale Costi" (`CostsForecastTab.tsx`)
- Aggiungere filtri data (Da / A) per filtrare tutte le tabelle costi per periodo specifico
- Rendere la terza card ("Prossimi 3 mesi") personalizzabile con dropdown 1-12 mesi
- Aggiornare i totali delle card in base ai filtri selezionati

## Dettagli tecnici

### `src/components/forecast/CollectedTab.tsx`
- Aggiungere stati: `dateFrom`, `dateTo`, `customMonths`
- Riutilizzare il pattern `DatePickerButton` dalla tab Cassa (componente inline)
- Filtrare `collectedThisMonth` e `expectedPayments` in base al range selezionato
- La quarta card diventa dinamica: mostra il totale da ricevere nei prossimi X mesi scelti dall'utente

### `src/components/forecast/CostsForecastTab.tsx`
- Aggiungere stati: `dateFrom`, `dateTo`, `customMonths`
- Filtrare tutte le categorie di costi (squadre, provvigioni, fornitori, costi aziendali) per il range selezionato
- La terza card diventa dinamica con dropdown 1-12 mesi
- I filtri date si applicano alle tabelle dettaglio sotto le card

### Componente `DatePickerButton`
- Ricreare lo stesso componente helper gia usato in `CashForecastTab.tsx` come funzione locale in ogni file (per mantenere i componenti autonomi)

## File da modificare
- `src/components/forecast/CollectedTab.tsx`
- `src/components/forecast/CostsForecastTab.tsx`

Nessun file da creare o eliminare.

