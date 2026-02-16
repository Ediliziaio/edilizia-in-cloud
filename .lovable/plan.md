
# Nuova Sezione "Bonus Regalo" nella Landing Page

## Cosa cambia

Aggiungere una nuova sezione tra GuaranteeSection e FinalCtaSection che evidenzia il bonus gratuito legato alla richiesta demo: il **Corso Metodo Vendita Edile**.

## Contenuto della sezione

- **Titolo:** "Se richiedi ora la tua Dimostrazione riceverai subito questo regalo:"
- **Card regalo:**
  - Icona regalo animata
  - **Nome:** "Corso Metodo Vendita Edile"
  - **Descrizione:** "4 lezioni in cui ho racchiuso il metodo di vendita per il Settore Edile, come aumentare del 40% le vendite in Edilizia"
  - CTA che rimanda alla sezione finale (#cta-finale)

## Design

- Sfondo bianco (coerente con le sezioni alternate della landing)
- Card centrale con bordo teal, icona Gift animata con glow
- Badge "+40% vendite" in evidenza
- Stile coerente con il resto della landing (rounded-2xl, palette navy/teal)

## Dettagli Tecnici

### Nuovo file: `src/components/landing/BonusGiftSection.tsx`
- Componente standalone con `useScrollAnimation` per le animazioni on-scroll
- Card con icona `Gift` e `BookOpen` da lucide-react
- Badge "+40% VENDITE" con sfondo teal
- CTA "Richiedi la Demo e Ricevi il Corso" che scrolla a #cta-finale
- Responsive: testo e padding ridotti su mobile

### File modificato: `src/pages/Home.tsx`
- Import del nuovo componente `BonusGiftSection`
- Inserimento tra `<GuaranteeSection />` e `<FinalCtaSection />`

### Struttura della sezione

```text
+--------------------------------------------------+
|  Se richiedi ora la tua Dimostrazione             |
|  riceverai subito questo regalo:                  |
|                                                   |
|  +--------------------------------------------+  |
|  |  [Gift icon]                                |  |
|  |  BONUS GRATUITO                             |  |
|  |                                             |  |
|  |  Corso Metodo Vendita Edile                 |  |
|  |                                             |  |
|  |  4 lezioni in cui ho racchiuso il metodo    |  |
|  |  di vendita per il Settore Edile, come      |  |
|  |  aumentare del 40% le vendite in Edilizia   |  |
|  |                                             |  |
|  |  [+40% VENDITE]                             |  |
|  +--------------------------------------------+  |
|                                                   |
|  [ Richiedi la Demo e Ricevi il Corso ]           |
+--------------------------------------------------+
```
