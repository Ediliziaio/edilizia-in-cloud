
# Rimozione icona regalo dal PromoBanner e Restyling Footer

## 1. PromoBanner - Rimuovere icona Gift

### File: `src/pages/Home.tsx`
- Rimuovere `import { Gift } from "lucide-react"` (riga 1)
- Rimuovere `<Gift size={16} />` (riga 36) dal PromoBanner
- Il testo resta invariato, solo senza l'icona

## 2. Footer - Ristrutturazione completa

### File: `src/components/landing/LandingFooter.tsx`

Sostituire il footer attuale con una struttura a 4 colonne (desktop) / stack (mobile):

**Colonna 1 - Brand**
- Logo + tagline (invariato)

**Colonna 2 - Link Utili**
- Invariato (Funzionalita, Prezzi, Confronto, Richiedi Demo)

**Colonna 3 - Contatti**
- Email: info@ediliziaincloud.com
- PEC: domusgroupsrl@legalmail.it

**Colonna 4 - Dati Societari**
- Domus Group S.r.l.
- Sede Legale: Via Aurelio Saffi 29, CAP 20123
- P.IVA: 13132010961
- Capitale Sociale: 20.000,00EUR
- SDI: USAL8PV

**Barra inferiore** (sotto il separatore):
- Copyright "(c) 2025 Domus Group S.r.l. - Tutti i diritti riservati"
- Link: Privacy Policy, Termini di Servizio, Cookie Policy

Rimuovere il numero di telefono placeholder (+39 02 1234567) e le icone social con link "#" (non funzionali).

Layout: `grid md:grid-cols-2 lg:grid-cols-4` per adattarsi bene sia a mobile che desktop.
