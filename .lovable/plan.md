
# Fix colonna sinistra tagliata nel dettaglio contatto

## Problema

La colonna sinistra a 300px e troppo stretta. Come si vede dallo screenshot:
- "Call Center" e troncato in "Call C..."
- La tab "Azioni" e troncata in "Azi..."
- L'email e troncata
- I select Titolare/Follower/Call Center sono compressi

## Soluzione

### 1. Ripristinare larghezza colonna sinistra e usare layout flessibile

**File: `src/pages/azienda/marketing/MarketingContactDetail.tsx`**

- Cambiare la colonna sinistra da `w-[300px] min-w-[300px]` a `w-[340px] min-w-[340px]` (ripristino)
- Cambiare la riga Titolare/Follower/Call Center da `grid-cols-3` a un layout piu adattivo: usare `grid-cols-2` con Call Center sotto, oppure ridurre le label per farlo stare in 3 colonne
- Approccio scelto: mantenere `grid-cols-3` ma abbreviare le label ("Titol." e "Follow.") e ridurre il gap

### 2. Dettaglio modifiche

**Larghezza colonna** (riga 455):
- `w-[300px] min-w-[300px]` diventa `w-[360px] min-w-[360px]`

**Griglia Titolare/Follower/Call Center** (riga 495):
- Cambiare il padding della colonna da `p-4` a `p-3` per recuperare spazio laterale
- Mantenere `grid-cols-3` con `gap-1.5` invece di `gap-2`

Questo approccio da 360px alla colonna sinistra (20px in piu rispetto al primo tentativo), sufficiente per mostrare tutto il contenuto senza troncare le tab e le label, mantenendo abbastanza spazio per la timeline centrale.

## Riepilogo

| Modifica | Dettaglio |
|----------|-----------|
| Larghezza colonna | Da 300px a 360px |
| Griglia assegnazione | Gap ridotto da 2 a 1.5 |
| Padding colonna | Da p-4 a p-3 per guadagnare 8px |
