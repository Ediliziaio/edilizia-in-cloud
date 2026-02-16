
# Barra Fissa in Basso con Countdown e CTA

## Cosa viene creato

Una barra fissa ("sticky bar") ancorata al fondo della pagina, visibile solo sulla landing page, che contiene:

1. **Countdown** che scade sempre a fine mese corrente e si rigenera automaticamente il 1 del mese successivo
2. **Testo bonus**: "In regalo: Corso Vendita Edile (4 lezioni, +40% vendite)"
3. **CTA**: bottone "Richiedi la Demo Gratuita" che scrolla a `#cta-finale`

La barra appare dopo un leggero scroll (circa 300px) per non coprire subito il contenuto hero.

## Design

- Sfondo scuro navy (`#1a2744`) con bordo superiore teal
- Layout compatto: su desktop testo a sinistra, countdown al centro, CTA a destra
- Su mobile: countdown sopra, testo + CTA sotto in colonna
- Countdown con 4 box (giorni, ore, minuti, secondi) stile "flip clock" minimal
- Z-index alto (z-50) per stare sopra tutto tranne il promo banner

## Countdown

Il timer calcola automaticamente la fine del mese corrente (`new Date(year, month + 1, 0, 23, 59, 59)`). Quando scade, si rigenera per il mese successivo. Usa `setInterval` ogni secondo per aggiornare.

## Dettagli Tecnici

### Nuovo file: `src/components/landing/StickyBottomBar.tsx`

- Componente React con stato per il countdown (giorni, ore, minuti, secondi)
- `useEffect` con `setInterval` ogni 1s per aggiornare il timer
- `useEffect` con scroll listener per mostrare/nascondere la barra (visibile dopo 300px di scroll)
- Calcolo fine mese: `new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)`
- Animazione di entrata dal basso con `translate-y` + `transition`
- Layout responsive con Tailwind (`flex-col` su mobile, `flex-row` su desktop)

### File modificato: `src/pages/Home.tsx`

- Import e aggiunta di `<StickyBottomBar />` nel componente Home, fuori dal flusso principale (posizionato fixed)

### Struttura visiva

```text
Desktop:
+------------------------------------------------------------------------+
| [In regalo: Corso Vendita Edile]  [02g 14h 32m 18s]  [RICHIEDI DEMO] |
+------------------------------------------------------------------------+

Mobile:
+----------------------------------+
|     02g  14h  32m  18s           |
|  In regalo: Corso Vendita Edile  |
|     [ RICHIEDI LA DEMO ]         |
+----------------------------------+
```
