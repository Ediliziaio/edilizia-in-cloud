
# Ottimizzazione Mobile della Landing Page

## Problemi Identificati

1. **Titolo H1 troppo grande su mobile** -- `text-4xl` e troppo spazio, occupa metà schermo
2. **Badge troppo lungo** -- il testo lungo va su 3 righe su mobile con tracking-widest
3. **Sottotitolo troppo lungo** -- il paragrafo con il consulente dedicato e troppo denso su mobile
4. **CTA buttons troppo grandi** -- `px-8 py-4 text-lg` sono sovradimensionati su mobile
5. **Dashboard mockup** -- il mockup occupa troppo spazio verticale, la perspective trasforma bene ma il padding interno potrebbe essere ridotto
6. **Social proof** -- i 3 elementi sono in colonna (`flex-col`) senza separatori, manca un po' di compattezza
7. **Marquee partner** -- `mx-6` troppo largo su mobile, nomi lunghi poco leggibili

## Modifiche Pianificate

### File: `src/components/landing/HeroSection.tsx`

**Badge (riga ~198)**
- Ridurre `tracking-widest` a `tracking-wider` su mobile
- Ridurre `text-xs` a `text-[10px]` su mobile per evitare il wrapping su 3 righe
- Ridurre `px-5` a `px-3` su mobile

**Titolo H1 (righe ~206-214)**
- Ridurre da `text-4xl` a `text-3xl` su mobile (mantenere `md:text-6xl lg:text-7xl`)
- Aggiungere `mb-0` su mobile per ridurre lo spazio

**Sottotitolo (righe ~220-227)**
- Ridurre da `text-lg` a `text-base` su mobile
- Aggiungere `max-w-sm` su mobile per migliorare la leggibilità

**CTA Buttons (righe ~230-248)**
- Ridurre da `px-8 py-4 text-lg` a `px-6 py-3 text-base` su mobile
- Rendere i bottoni full-width su mobile con `w-full sm:w-auto`

**Social Proof (righe ~252-273)**
- Ridurre `gap-6` a `gap-3` su mobile
- Ridurre `mt-8` a `mt-6` su mobile
- Usare `text-xs` su mobile per i testi

**Marquee (righe ~276-301)**
- Ridurre `mx-6` a `mx-4` su mobile
- Ridurre `mt-10` a `mt-6` su mobile

**Padding sezione (riga ~166)**
- Ridurre da `pt-36 pb-20` a `pt-28 pb-14` su mobile (`pt-28 md:pt-36 pb-14 md:pb-20`)

### Riepilogo modifiche

| Elemento | Desktop (invariato) | Mobile (ottimizzato) |
|---|---|---|
| Sezione padding | pt-36 pb-20 | pt-28 pb-14 |
| Badge | tracking-widest, px-5, text-xs | tracking-wider, px-3, text-[10px] |
| Titolo H1 | text-6xl / text-7xl | text-3xl |
| Sottotitolo | text-lg, max-w-2xl | text-base |
| CTA | px-8 py-4 text-lg | px-6 py-3 text-base, full-width |
| Social proof | gap-6, text-sm | gap-3, text-xs |
| Marquee | mx-6, mt-10 | mx-4, mt-6 |

Tutte le modifiche sono nel singolo file `src/components/landing/HeroSection.tsx` e usano classi responsive Tailwind (`sm:` / `md:`) senza alterare la versione desktop.
