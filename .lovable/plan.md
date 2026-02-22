
# Fix: Campi card non si aggiornano dopo modifica

## Problema

Ogni `OpportunityCard` chiama `useCardFieldPreferences()` che legge da `localStorage` solo al mount iniziale. Quando modifichi i campi nel pannello "Personalizza scheda" e clicchi "Applica", il `localStorage` viene aggiornato ma le card gia renderizzate NON si aggiornano perche `useState` con inizializzatore legge il valore solo una volta.

## Soluzione

Convertire `useCardFieldPreferences` in un React Context condiviso. In questo modo tutte le card leggono dallo stesso stato e si aggiornano immediatamente quando si clicca "Applica".

## Modifiche

### 1. Creare `CardFieldPreferencesProvider` (modifica `src/hooks/useCardFieldPreferences.ts`)

- Aggiungere un `CardFieldPreferencesContext` e un `CardFieldPreferencesProvider`
- Il Provider wrappa la pagina e gestisce lo stato centralizzato
- L'hook `useCardFieldPreferences()` legge dal context invece che da `localStorage` direttamente
- Il salvataggio su `localStorage` resta per persistenza tra sessioni

### 2. Wrappare `MarketingOpportunities` col Provider (modifica `src/pages/azienda/marketing/MarketingOpportunities.tsx`)

- Wrappare il contenuto con `<CardFieldPreferencesProvider>`
- Rimuovere la chiamata diretta a `useCardFieldPreferences()` nel componente pagina (il Provider lo gestisce)
- Semplificare il passaggio di props al `CardCustomizeSheet`

### 3. `OpportunityCard` resta invariato

- Continua a usare `useCardFieldPreferences()` ma ora legge dal Context condiviso
- Si aggiorna automaticamente quando il Provider aggiorna lo stato

## Dettagli tecnici

Il pattern e:

```
MarketingOpportunities
  └─ CardFieldPreferencesProvider  <-- stato centralizzato
       ├─ CardCustomizeSheet       <-- scrive nel Provider
       └─ OpportunityKanbanView
            └─ OpportunityCard     <-- legge dal Provider (reattivo)
```

Il `localStorage` viene usato solo per inizializzare il Provider e per persistere le modifiche. Tutte le letture passano dal Context React, garantendo aggiornamenti immediati.
