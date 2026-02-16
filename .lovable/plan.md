

# Homepage "Edilizia in Cloud" - Landing Page

Creazione di una landing page di vendita professionale con design dark, animazioni fluide e sezioni derivate dal PDF della sales letter, ispirata allo stile visivo di theoryholding.com.

---

## Design e Stile

- **Tema scuro** (sfondo nero/grigio scuro) come theoryholding.com
- **Accenti colore**: verde teal del logo Edilizia in Cloud + giallo/lime per le CTA (come theoryholding.com)
- **Tipografia bold**: titoli grandi e impattanti, testi secondari in grigio chiaro
- **Animazioni scroll-based**: elementi che appaiono con fade-in e slide-up quando entrano nel viewport (Intersection Observer)
- **Effetti hover**: pulsanti con scale e glow, card con lift effect
- **Spaziatura generosa** tra le sezioni per un look premium

---

## Struttura della Pagina (Sezioni)

### 1. Navbar (fissa, trasparente -> scura allo scroll)
- Logo Edilizia in Cloud a sinistra
- Link: Funzionalita, Vantaggi, Confronto, Prezzi
- CTA "Richiedi Demo" (bottone lime/giallo)
- Link "Accedi" per utenti esistenti (va a /login)

### 2. Hero Section (fullscreen)
- Sfondo scuro con gradiente sottile
- Badge: "IL 1 SOFTWARE IN ITALIA PER IMPRENDITORI EDILI"
- Titolo grande: "Smetti di Fatturare al Buio. Inizia a Guadagnare con i Numeri."
- Sottotitolo: testo sulla proposta di valore
- Due CTA: "Richiedi Demo Gratuita" (lime) + "Scopri le Funzionalita" (outline)
- Animazione fade-in staggerata sugli elementi

### 3. Pain Points (Problemi)
- Titolo: "Stai Fatturando... Ma i Soldi Dove Sono?"
- Lista dei 7 problemi del PDF con icone animate
- Conclusione empatica

### 4. Tabella Costi dell'Inazione
- Titolo: "Quanto Ti Costa NON Controllare i Numeri?"
- Tabella stilizzata (sfondo scuro, bordi sottili) con i 5 errori e i relativi costi
- Totale evidenziato in rosso/arancione: "20.000 - 100.000 EUR/anno"

### 5. La Soluzione
- Titolo: "La Soluzione: Edilizia in Cloud"
- 3 domande chiave in card evidenziate (margine reale, previsione cassa, perdite)
- Testo di spiegazione sulla semplicita

### 6. I 7 Moduli (Feature showcase)
- Titolo: "7 Strumenti Integrati. Zero Complicazioni."
- Card per ogni modulo con:
  - Icona
  - Nome modulo
  - Descrizione breve
  - Obiettivo quantificabile
  - Risparmio stimato
- Layout griglia con animazione staggerata all'ingresso

### 7. Confronto (Competitor Table)
- Titolo: "Perche Edilizia in Cloud e Diverso"
- Tabella "Gli Altri vs Edilizia in Cloud" con check/x icons
- Design dark con riga Edilizia in Cloud evidenziata

### 8. Per Chi E / Non E
- Due colonne: "Perfetto per te se..." (verde) / "NON e per te se..." (rosso)
- Lista con check e X

### 9. 5 Criteri di Scelta
- Titolo: "5 Criteri per Scegliere il Software Giusto"
- Cards numerate con i 5 punti dal PDF

### 10. Pricing / Investimento
- Titolo: "L'Investimento (e Perche NON e un Costo)"
- Confronto costi: commercialista, controller, ERP vs Edilizia in Cloud
- CTA grande

### 11. Garanzia
- Badge/card evidenziata: "Garanzia Margine o Rimborsato - 30 Giorni"
- Testo dal PDF

### 12. CTA Finale + PS
- Titolo: "SMETTI DI FATTURARE AL BUIO."
- CTA grande "RICHIEDI LA TUA DEMO GRATUITA ORA"
- I 3 P.S. dal PDF come testo sotto

### 13. Footer
- Logo, copyright, link utili

---

## Dettagli Tecnici

### File da creare:
1. **`src/pages/Home.tsx`** - Pagina principale che importa tutte le sezioni
2. **`src/components/landing/LandingNavbar.tsx`** - Navbar con scroll effect
3. **`src/components/landing/HeroSection.tsx`** - Hero fullscreen
4. **`src/components/landing/PainPointsSection.tsx`** - Problemi
5. **`src/components/landing/CostTableSection.tsx`** - Tabella costi inazione
6. **`src/components/landing/SolutionSection.tsx`** - La soluzione
7. **`src/components/landing/ModulesSection.tsx`** - I 7 moduli
8. **`src/components/landing/ComparisonSection.tsx`** - Confronto competitor
9. **`src/components/landing/TargetSection.tsx`** - Per chi e / non e
10. **`src/components/landing/CriteriaSection.tsx`** - 5 criteri
11. **`src/components/landing/PricingSection.tsx`** - Investimento
12. **`src/components/landing/GuaranteeSection.tsx`** - Garanzia
13. **`src/components/landing/FinalCtaSection.tsx`** - CTA finale
14. **`src/components/landing/LandingFooter.tsx`** - Footer
15. **`src/hooks/useScrollAnimation.ts`** - Hook per animazioni Intersection Observer

### File da modificare:
- **`src/App.tsx`** - Aggiungere rotta `/home` per la landing page
- **`tailwind.config.ts`** - Aggiungere keyframes per le animazioni (fade-in-up, stagger)

### Animazioni:
- **Intersection Observer hook** personalizzato per triggerare animazioni quando gli elementi entrano nel viewport
- **Fade-in-up** staggerato per liste e card
- **Navbar** che diventa opaca allo scroll (scroll listener)
- **Counter animation** per i numeri nella sezione costi
- **Hover effects** sulle card dei moduli (scale + shadow)
- **Smooth scroll** per i link interni della navbar

### Routing:
- La rotta `/home` mostrera la landing page (accessibile senza autenticazione)
- Il bottone "Accedi" nella navbar portera a `/login`
- La CTA "Richiedi Demo" scrollera alla sezione CTA finale o aprira un link esterno

