

# Logo con Cambio Colore allo Scroll nella Navbar

## Problema
Il logo attuale ha testo navy scuro, che non si vede bene sullo sfondo navy della Hero quando la navbar e trasparente.

## Soluzione
Usare un filtro CSS `brightness(0) invert(1)` sul logo quando la navbar e in modalita trasparente (sopra la Hero scura). Quando l'utente scrolla e la navbar diventa bianca, il filtro viene rimosso e il logo torna ai colori originali (navy + teal).

## Dettagli Tecnici

### File da modificare:
**`src/components/landing/LandingNavbar.tsx`** - Aggiungere una classe CSS condizionale sull'immagine del logo:

- **Non scrollato** (sfondo trasparente su Hero navy): applicare `brightness(0) invert(1)` per rendere il logo completamente bianco
- **Scrollato** (sfondo bianco): rimuovere il filtro, logo con colori originali (navy + teal)
- Aggiungere `transition-all duration-300` per una transizione fluida tra i due stati

La modifica riguarda solo la riga dell'`<img>` del logo, aggiungendo:
```
className={`h-9 transition-all duration-300 ${scrolled ? "" : "brightness-0 invert"}`}
```

Nessun file aggiuntivo necessario, nessuna nuova immagine da caricare.
