

# Ottimizzazione Mobile: Fix Scroll Orizzontale, Copy Corto e UX per Sezione

## 1. Fix Scroll Orizzontale (BUG CRITICO)

Il problema dello swipe orizzontale e causato da elementi che fuoriescono dal viewport. Fix necessari:

### File: `src/pages/Home.tsx`
- Aggiungere `overflow-x-hidden` al container principale `<div>` per bloccare qualsiasi overflow orizzontale a livello root

### File: `src/components/landing/HeroSection.tsx`
- Le icone flottanti con posizioni `right: "5%"` e `left: "3%"` possono fuoriuscire su schermi piccoli
- Nascondere le icone flottanti su mobile (`hidden md:block`)
- I gradient orbs (`w-96`, `w-80`) sono troppo grandi su mobile -- ridurli o nasconderli

### File: `src/components/landing/SolutionSection.tsx`
- La griglia delle barre decorative (`grid-cols-6`) puo debordare su mobile
- Aggiungere `overflow-hidden` al container del dashboard mockup

### File: `src/components/landing/ComparisonSection.tsx`
- La tabella a 3 colonne puo debordare -- rendere scrollabile orizzontalmente con `overflow-x-auto` wrapper
- Su mobile, ridurre il padding delle celle

### File: `src/components/landing/CostTableSection.tsx`
- Stessa cosa: aggiungere wrapper `overflow-x-auto` attorno alla tabella

## 2. Accorciare il Copy della StickyBottomBar

### File: `src/components/landing/StickyBottomBar.tsx`
- **Su mobile**: mostrare un testo piu corto tipo "In regalo: Corso Vendita Edile -- +40% vendite (val. 497EUR)"
- **Su desktop**: mostrare la versione completa ma comunque piu concisa: "In regalo: 4 lezioni sul Metodo Vendita Edile -- +40% vendite in Edilizia (valore 497EUR)"
- Usare classi `hidden md:inline` / `md:hidden` per differenziare mobile e desktop

## 3. Miglioramenti Mobile per Sezione

### HeroSection
- Nascondere icone flottanti su mobile (occupano spazio e causano overflow)
- Ridurre padding top da `pt-28` a `pt-24` su mobile
- Social proof: gia responsive con `flex-col sm:flex-row`

### FounderLetterSection
- Gia ben ottimizzata con collapsible. Nessun intervento necessario.

### BonusGiftSection
- Ridurre il padding della card su mobile (`p-5` gia presente)
- Countdown gia responsive con label short/long

### PainPointsSection
- L'immagine AI e gia nascosta su mobile (`hidden md:block`). OK.

### CostTableSection
- Aggiungere `overflow-x-auto` con `-webkit-overflow-scrolling: touch` per la tabella
- La colonna "Descrizione" e gia nascosta su mobile (`hidden sm:table-cell`). OK.

### SolutionSection
- Le 3 card delle domande: passare da `md:grid-cols-3` a un layout piu compatto su mobile (gia single-col). OK.
- Dashboard mockup: aggiungere `overflow-hidden` per evitare debordamento delle barre

### ModulesSection
- Gia responsive con `sm:grid-cols-2 lg:grid-cols-3`. OK.

### ComparisonSection
- Tabella: su mobile le celle sono troppo strette. Aggiungere `overflow-x-auto` e `min-w-[600px]` sulla tabella
- Oppure: su mobile, trasformare in card layout anziche tabella (piu complesso, opzionale)

### ScenarioSection
- Gia responsive con `md:grid-cols-2`. OK.
- Ridurre padding su mobile per le card scenario

### TargetSection
- Gia responsive. OK.

### CriteriaSection
- Gia responsive. OK.

### PricingSection
- Le 3 card pricing: gia `grid-cols-1 lg:grid-cols-3`. OK.
- La comparison list sopra e gia responsive.

### TestimonialsSection
- Gia responsive con `md:grid-cols-2`. OK.

### GuaranteeSection
- Le 3 card garanzia: gia `grid-cols-1 md:grid-cols-3`. OK.

### FinalCtaSection
- Ridurre la dimensione del font del CTA button su mobile (text-lg su mobile e troppo grande)
- Il bottone con `px-12 py-5` e troppo largo su mobile: ridurre a `px-8 py-4` su mobile

### LandingNavbar
- `top-9` per compensare il PromoBanner: OK
- Menu mobile gia implementato. OK.

### StickyBottomBar
- Su mobile la barra e troppo alta con countdown + testo + CTA in colonna
- Ricompattare: countdown e testo sulla stessa riga, CTA sotto
- Testo piu corto su mobile (vedi punto 2)

## 4. Riepilogo File da Modificare

1. **`src/pages/Home.tsx`** -- Aggiungere `overflow-x-hidden`
2. **`src/components/landing/HeroSection.tsx`** -- Nascondere icone flottanti su mobile, ridurre gradient orbs
3. **`src/components/landing/StickyBottomBar.tsx`** -- Copy piu corto mobile/desktop, layout piu compatto
4. **`src/components/landing/SolutionSection.tsx`** -- `overflow-hidden` sul mockup
5. **`src/components/landing/ComparisonSection.tsx`** -- `overflow-x-auto` sulla tabella
6. **`src/components/landing/CostTableSection.tsx`** -- `overflow-x-auto` sulla tabella
7. **`src/components/landing/FinalCtaSection.tsx`** -- CTA button sizing responsive

