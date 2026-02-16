

# Aggiunta prezzo futuro (497€) e Countdown nella sezione Regalo

## Modifiche

### 1. BonusGiftSection.tsx - Aggiungere prezzo futuro e countdown

- Importare e riutilizzare la funzione `getTimeLeft()` gia presente in `StickyBottomBar.tsx` (copiarla o estrarla)
- Aggiungere un `useState` + `useEffect` con `setInterval` ogni secondo per il countdown
- Sotto il badge "+40% VENDITE", aggiungere:
  - Un testo di scarsita: "Dopo il [ultimo giorno del mese], il corso tornera in vendita a ~~497€~~"
  - Un countdown visivo con i 4 box (giorni, ore, minuti, secondi) in stile coerente con la sticky bar
- Il countdown usa la stessa logica di fine mese gia implementata

### 2. StickyBottomBar.tsx - Aggiungere nota sul prezzo 497€

- Nel testo della barra, aggiungere un riferimento al valore del corso: "...aumentare del 40% le vendite in Edilizia (valore 497€)"

## Dettagli Tecnici

### File: src/components/landing/BonusGiftSection.tsx

- Aggiungere import di `useState, useEffect` da react
- Copiare la funzione `getTimeLeft()` (calcolo fine mese) dentro il file
- Dentro il componente, aggiungere stato e interval per il countdown
- Dopo lo `<span>` con "+40% VENDITE" (circa riga 50), inserire:
  - Un div con il countdown (4 box stile navy/teal)
  - Un paragrafo con testo barrato "497€" e data di scadenza (nome mese italiano + anno)
- Per il nome del mese usare un array di mesi italiani: ["Gennaio", "Febbraio", ...]

### File: src/components/landing/StickyBottomBar.tsx

- Aggiornare il testo del paragrafo aggiungendo "(valore 497€)" alla fine della frase

### Struttura visiva nella card regalo (dopo il badge +40%):

```
[  12g  08h  45m  32s  ]

Dopo il 28 Febbraio 2026, il corso tornera in vendita a 497€
```

