

# Aggiornamenti Landing Page: Immagine Hero + Lettera del Fondatore

## 1. Immagine sotto il titolo Hero

Generare un'immagine illustrativa (mockup dashboard / cantiere stilizzato) da posizionare sotto il sottotitolo e i bottoni CTA nella Hero Section. L'immagine verra creata tramite AI e salvata come asset.

### File: `src/components/landing/HeroSection.tsx`
- Aggiungere un'immagine decorativa (mockup dashboard o illustrazione edilizia) sotto i bottoni CTA
- L'immagine avra bordi arrotondati, ombra morbida e un leggero effetto prospettiva con CSS transform
- Animazione fade-in con delay rispetto ai bottoni

---

## 2. Sezione "Lettera dal Fondatore" (seconda posizione)

Creare un nuovo componente che va inserito come **seconda sezione** della pagina (subito dopo la Hero).

### Nuovo file: `src/components/landing/FounderLetterSection.tsx`

- Sfondo bianco con contenitore centrato
- Titolo: "Lettera dal Fondatore" con badge/pill "La nostra storia"
- **Preview visibile**: mostra solo le prime righe della lettera (primi 2-3 paragrafi) con un gradiente di fade-out
- **Bottone "Leggi la lettera completa"**: cliccando, si espande il contenuto completo con un'animazione smooth (usando stato React `expanded`)
- Contenuto completo: tutta la lettera fornita dall'utente, formattata con paragrafi, grassetti per le parole chiave, e spaziatura leggibile
- In fondo alla lettera: firma con nome "Florin", titolo "Fondatore di Edilizia in Cloud", e sottotitolo "Imprenditore nel settore serramenti - Lombardia"
- Dopo la firma: i 3 P.S. con styling distinto
- CTA finale nella lettera: bottone teal "SI, VOGLIO LA MIA DEMO GRATUITA"
- Bottone "Chiudi" per richiudere la lettera se aperta

---

## 3. Lettera in fondo alla pagina (prima del Footer)

Aggiungere la stessa lettera anche in fondo alla pagina, prima del Footer, come sezione di chiusura emotiva.

### Nuovo file: `src/components/landing/FounderLetterBottom.tsx`
- Versione piu compatta della lettera con lo stesso meccanismo expand/collapse
- Sfondo navy scuro per coerenza con le sezioni finali
- Testi in bianco/bianco opaco

---

## 4. Aggiornamento Home.tsx

### File: `src/pages/Home.tsx`
- Importare `FounderLetterSection` e inserirlo come seconda sezione (dopo Hero, prima di PainPoints)
- Importare `FounderLetterBottom` e inserirlo prima del `LandingFooter`

---

## Dettagli Tecnici

### Meccanismo expand/collapse della lettera:
```
const [expanded, setExpanded] = useState(false);
```
- Stato chiuso: max-height limitata (~200px) con `overflow-hidden` e gradiente bianco/trasparente in fondo
- Stato aperto: max-height rimossa, transizione smooth con `transition-all duration-700`
- Bottone toggle con icona freccia che ruota

### Immagine Hero:
- Generata via AI come mockup dashboard stilizzato con tema edilizia
- Salvata in `src/assets/` e importata nel componente Hero
- Posizionata sotto i CTA con `max-w-4xl mx-auto` e bordi arrotondati

### Struttura sezioni aggiornata:
1. Navbar
2. Hero (con immagine sotto)
3. **Lettera dal Fondatore** (nuova - con expand/collapse)
4. Pain Points
5. Tabella Costi
6. Soluzione
7. Moduli
8. Confronto
9. Scenario A/B
10. Target
11. 5 Criteri
12. Pricing
13. Garanzia
14. CTA Finale
15. **Lettera dal Fondatore (versione fondo)** (nuova)
16. Footer

