
# Miglioramento Sticky Bottom Bar

## Modifiche al testo

Sostituire il testo attuale abbreviato con la descrizione completa:
- **Da:** "In regalo: Corso Vendita Edile (4 lezioni, +40% vendite)"
- **A:** "In regalo: 4 lezioni in cui ho racchiuso il metodo di vendita per il Settore Edile, come aumentare del 40% le vendite in Edilizia"

## Miglioramenti visivi

### Effetti e animazioni
- **Shimmer animato** sul bordo superiore: una linea luminosa teal che scorre da sinistra a destra in loop, come gia usato nel PromoBanner in alto
- **Glow pulsante** sul bottone CTA: ombra teal animata che pulsa per attirare l'attenzione
- **Pallino rosso pulsante** accanto al countdown per dare senso di "live" e urgenza
- **Gradiente di sfondo** invece del colore piatto: da navy scuro a navy leggermente piu chiaro per dare profondita

### Countdown potenziato
- Box dei numeri con sfondo piu contrastato (bianco/15% invece di 10%) e bordo sottile
- Etichette delle unita scritte per esteso su desktop ("giorni", "ore", "min", "sec") e abbreviate su mobile

### Bottone CTA
- Dimensione leggermente piu grande con padding aumentato
- Aggiunta animazione `hover:scale-105` e `shadow-lg` con glow teal
- Freccia animata (`ArrowRight`) che si muove a destra on hover

### Layout
- Padding verticale leggermente aumentato (`py-4` invece di `py-3`)
- Su mobile: testo troncato con `line-clamp-2` per non occupare troppo spazio

## Dettagli Tecnici

### File modificato: `src/components/landing/StickyBottomBar.tsx`

- Aggiungere import di `ArrowRight` da lucide-react
- Aggiungere una pseudo-animazione shimmer sopra la barra (div assoluto con gradient animato, come nel PromoBanner)
- Aggiornare il testo del paragrafo con la descrizione completa
- Aggiungere `animate-pulse` su un pallino rosso accanto al timer
- Migliorare lo stile del bottone con glow, scala e icona freccia
- Aggiungere keyframe `shimmer` inline o tramite classe Tailwind gia presente (`animate-shimmer` usato in PromoBanner)
