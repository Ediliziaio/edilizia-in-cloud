

# Barra Promozionale Fissa in Alto

## Cosa
Aggiungere una barra orizzontale fissa in cima alla landing page con il messaggio "SE NON FUNZIONA, IL PROGRAMMA È GRATIS PER SEMPRE" -- un richiamo immediato alla garanzia ROI 90 giorni.

## Design
- Sfondo teal (`bg-[#0fa68c]`) con testo bianco bold, centrato
- Altezza compatta (py-2), font piccolo ma leggibile (text-xs md:text-sm)
- Icona `Gift` o `ShieldCheck` a sinistra del testo
- Posizione fissa in cima (`fixed top-0 z-50 w-full`)
- Eventuale link che scrolla alla sezione Garanzie al click

## Impatto sul Layout
- La navbar attuale ha `pt-28` nella Hero e la navbar stessa e fissata in alto. Bisogna aggiungere un offset per evitare sovrapposizioni: spostare la navbar verso il basso di ~36px (altezza della barra) aggiungendo `top-9` alla navbar e aumentando il `pt` della Hero di conseguenza.

## Dettagli Tecnici

### File 1: `src/components/landing/HeroSection.tsx`
- Aumentare il `pt-28` a `pt-36` per compensare lo spazio della barra aggiuntiva

### File 2: `src/components/landing/LandingNavbar.tsx`
- Aggiungere `top-9` invece di `top-0` per posizionare la navbar sotto la barra promo

### File 3: `src/pages/Home.tsx`
- Aggiungere un nuovo componente `PromoBanner` prima di `LandingNavbar`:
  - `fixed top-0 left-0 right-0 z-[60]` (sopra la navbar)
  - Sfondo `bg-[#0fa68c]` con testo bianco
  - Icona `Gift` + testo "SE NON FUNZIONA, IL PROGRAMMA È GRATIS PER SEMPRE"
  - Click che scrolla a `#garanzie` (sezione garanzie)
  - Animazione shimmer sottile sullo sfondo per attirare l'attenzione

### Riepilogo

| File | Modifica |
|---|---|
| `Home.tsx` | Aggiunta componente `PromoBanner` fisso in cima |
| `LandingNavbar.tsx` | Offset `top-9` per stare sotto la barra |
| `HeroSection.tsx` | Aumento padding-top per compensare |

