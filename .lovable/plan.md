
# Fix Hero Section: Immagine + Layout

## Problemi da risolvere

1. **Posizione immagine**: Spostare l'immagine del dashboard subito dopo il titolo "Smetti di Fatturare al Buio / Inizia a Guadagnare con i Numeri", PRIMA del sottotitolo e dei bottoni CTA
2. **Qualità immagine**: L'attuale mockup generato non è convincente. Creare un render HTML/CSS di una dashboard realistica direttamente nel componente (senza immagine esterna), con dati finti che rappresentano la piattaforma vera (Order Pipeline, grafici, statistiche)
3. **Spaziatura navbar**: Aggiungere `pt-24` o simile alla sezione Hero per evitare che il contenuto venga coperto dalla navbar fissa

## Dettagli tecnici

### File: `src/components/landing/HeroSection.tsx`

**Cambiamento struttura** - il nuovo ordine degli elementi nella Hero:
1. Badge pill "Il Software #1..."
2. Titolo H1 "Smetti di Fatturare al Buio..."
3. **Mockup Dashboard** (spostato qui - render HTML con card, grafici stilizzati, sidebar)
4. Sottotitolo paragrafo
5. Bottoni CTA
6. Gradiente di chiusura

**Render dashboard in HTML/CSS**: Invece di un'immagine esterna, creare un componente "finto dashboard" con:
- Una mini sidebar a sinistra con icone menu (Dashboard, Ordini, Magazzino, ecc.)
- Area principale con:
  - 4 stat cards in riga (Fatturato, Margine, Incassato, Da Incassare) con numeri finti
  - Un grafico a barre stilizzato (barre CSS colorate)
  - Una tabella ordini stilizzata con 3-4 righe
- Tutto dentro un contenitore con `rounded-2xl`, bordo bianco semi-trasparente, ombra, e effetto prospettiva 3D
- Dimensioni ridotte (max-w-4xl) per sembrare un "preview" della piattaforma

**Fix spaziatura**: Cambiare da `min-h-screen flex items-center` a layout con padding top esplicito (`pt-28 pb-20`) per lasciare spazio alla navbar fissa.

### Nessun nuovo file necessario
Il render HTML del dashboard sostituisce l'immagine PNG attuale. Il file `hero-dashboard-mockup.png` non verrà piu utilizzato.
