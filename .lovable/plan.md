

# Miglioramento Landing Page - Grafica, Animazioni e Sezioni Bianche

Upgrade completo della landing page con sfondo edilizia nella Hero, sezioni a colori alternati (dark/bianco), animazioni avanzate e immagini illustrative.

---

## 1. Hero Section - Sfondo Edilizia

Aggiungere elementi SVG decorativi a tema edilizia come sfondo della Hero:
- **Icone edili stilizzate** in opacita molto bassa (3-5%): gru, mattoni, casco, righello, casa in costruzione
- Posizionate in modo sparso con `position: absolute` e diverse dimensioni/rotazioni
- **Animazione floating** lenta (su/giu) con keyframes CSS per dare vita allo sfondo
- Mantenere il gradiente scuro attuale come base, con le icone sopra in overlay

---

## 2. Sezioni Bianche Alternate

Alternare le sezioni tra dark e bianco per spezzare la monotonia:

| Sezione | Sfondo |
|---------|--------|
| Hero | Dark (con icone edilizia) |
| Pain Points | Dark |
| Tabella Costi | **Bianco** |
| Soluzione | Dark |
| Moduli | **Bianco** |
| Confronto | Dark |
| Target (Per chi e) | **Bianco** |
| 5 Criteri | Dark |
| Pricing | **Bianco** |
| Garanzia | Dark |
| CTA Finale | Dark |

Le sezioni bianche avranno: sfondo `#f8f9fa` / `white`, testi in grigio scuro/nero, card con bordi grigi e ombre sottili, accenti lime adattati.

---

## 3. Animazioni Migliorate

### Nuovi keyframes in tailwind.config.ts:
- **`float`**: movimento verticale lento (per icone sfondo Hero)
- **`slide-in-left`** / **`slide-in-right`**: entrata laterale per le colonne Target
- **`scale-fade-in`**: zoom + fade per la card Garanzia
- **`pulse-glow`**: pulsazione luminosa per i bottoni CTA

### Miglioramenti per sezione:
- **Pain Points**: icone che ruotano leggermente al hover
- **Moduli**: card con effetto "lift" piu pronunciato + ombra colorata lime
- **Confronto**: righe della tabella che si animano una per una (stagger)
- **CTA Finale**: bottone con animazione pulse-glow continua

---

## 4. Immagini e Elementi Visivi

### Immagini generate/placeholder:
- **Sezione Soluzione**: mockup dashboard stilizzato (SVG inline o immagine placeholder che rappresenta un'interfaccia)
- **Sezione Moduli**: icone piu grandi e colorate con sfondo gradient
- **Sezione Pricing**: badge "Piu Popolare" animato
- **Sezione Garanzia**: scudo/badge con effetto brillantezza

### Elementi decorativi:
- **Divider ondulati** (SVG wave) tra sezioni dark e bianche per transizioni morbide
- **Gradient orbs** sfocati (blob decorativi) in alcune sezioni
- **Numeri grandi decorativi** nelle card dei criteri con gradient lime
- **Contatori animati** nella sezione Tabella Costi (i numeri si "contano" all'apparizione)

---

## 5. Miglioramenti Grafici per Sezione

### Pain Points:
- Card con bordo sinistro colorato lime invece del bordo completo
- Icona con sfondo gradient invece che piatto

### Tabella Costi (ora su sfondo bianco):
- Tabella con righe alternate grigio chiaro/bianco
- Riga totale con sfondo rosso/arancione piu vivace
- Ombra sulla tabella per effetto "sollevato"

### Moduli (ora su sfondo bianco):
- Card con ombra morbida e bordo superiore colorato lime
- Hover: ombra piu ampia + leggero bordo lime

### Confronto:
- Colonna "Edilizia in Cloud" con sfondo lime sfumato
- Check animati (scale-in) al trigger dello scroll

### Target (Per chi e - ora su sfondo bianco):
- Card "Perfetto per te" con bordo e sfondo verde chiaro pastello
- Card "Non per te" con bordo e sfondo rosso chiaro pastello
- Animazione slide-in dai lati opposti

### Pricing (ora su sfondo bianco):
- Card "Edilizia in Cloud" con bordo lime spesso e badge "CONSIGLIATO"
- Effetto ombra lime sulla card principale

### Footer:
- Aggiungere link social e una mini-sezione "Contatti"

---

## Dettagli Tecnici

### File da modificare:
1. **`src/components/landing/HeroSection.tsx`** - Aggiungere icone SVG edilizia come sfondo animato
2. **`src/components/landing/CostTableSection.tsx`** - Sfondo bianco, stile tabella aggiornato
3. **`src/components/landing/ModulesSection.tsx`** - Sfondo bianco, card con ombre
4. **`src/components/landing/TargetSection.tsx`** - Sfondo bianco, animazioni laterali
5. **`src/components/landing/PricingSection.tsx`** - Sfondo bianco, badge consigliato
6. **`src/components/landing/PainPointsSection.tsx`** - Bordo laterale, icone migliorate
7. **`src/components/landing/SolutionSection.tsx`** - Aggiunta mockup dashboard decorativo
8. **`src/components/landing/ComparisonSection.tsx`** - Colonna evidenziata, animazioni righe
9. **`src/components/landing/GuaranteeSection.tsx`** - Effetto brillantezza sullo scudo
10. **`src/components/landing/FinalCtaSection.tsx`** - Bottone con pulse-glow
11. **`src/components/landing/CriteriaSection.tsx`** - Numeri con gradient
12. **`src/components/landing/LandingFooter.tsx`** - Link social aggiunti
13. **`tailwind.config.ts`** - Nuovi keyframes (float, slide-in, pulse-glow, scale-fade-in)
14. **`src/pages/Home.tsx`** - Aggiungere divider SVG ondulati tra sezioni

### Nessun nuovo file da creare, solo modifiche ai componenti esistenti.

