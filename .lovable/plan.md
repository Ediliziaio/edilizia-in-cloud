
# 3 Piani di Pricing + 3 Garanzie Forti

## 1. Redesign PricingSection con 3 Piani

**File: `src/components/landing/PricingSection.tsx`**

Sostituire il layout attuale (lista confronto + singola riga "da 99 euro") con una struttura a **3 card affiancate** (griglia 1 colonna mobile, 3 colonne desktop).

### I 3 Piani:

| | Starter | Professional (Consigliato) | Enterprise |
|---|---|---|---|
| **Prezzo** | 99 euro/mese | 199 euro/mese | 399 euro/mese |
| **Target** | Imprese fino a 500K | Imprese da 500K a 2M | Imprese oltre 2M |
| **Ordini** | Fino a 50 commesse | Commesse illimitate | Commesse illimitate |
| **Utenti** | 3 utenti | 10 utenti | Utenti illimitati |
| **Moduli** | 4 moduli base (Ordini, Clienti, Calendario, Dashboard) | Tutti i 7 moduli | Tutti i 7 moduli + API |
| **Supporto** | Email | Prioritario (chat + email) | Dedicato (telefono + onboarding) |
| **Forecast** | No | Si | Si |
| **Magazzino** | No | Si | Si |
| **Report** | Base | Avanzati | Custom |

### Design delle card:
- Card **Starter** e **Enterprise**: bordo grigio, sfondo bianco
- Card **Professional**: bordo teal `border-[#0fa68c]`, badge "Piu Popolare" in alto, scala leggermente piu grande (`scale-105`), ombra teal
- Ogni card ha: nome piano, prezzo grande, descrizione target, lista feature con icone Check (verde) o X (grigio), bottone CTA
- CTA Starter: "Inizia Gratis" (outline), Professional: "Scegli Professional" (filled teal), Enterprise: "Contattaci" (outline)
- La tabella di confronto con le alternative resta sopra le card come contesto

### Animazioni:
- Scroll animation con stagger: card centrale appare per prima, poi le laterali

---

## 2. Redesign GuaranteeSection con 3 Garanzie

**File: `src/components/landing/GuaranteeSection.tsx`**

Trasformare la singola garanzia in **3 garanzie forti** disposte in griglia (1 colonna mobile, 3 desktop).

### Le 3 Garanzie:

**Garanzia 1 - "Margine o Rimborsato" (30 giorni)**
- Icona: ShieldCheck
- Testo: Se nei primi 30 giorni non identifichi almeno un'area dove perdi margine, rimborso totale senza domande
- Badge: "30 GIORNI"

**Garanzia 2 - "Setup Garantito" (60 giorni)**
- Icona: Settings/Wrench
- Testo: Se in 60 giorni il tuo team non e operativo sulla piattaforma, ti estendiamo gratis fino a quando non lo sei
- Badge: "60 GIORNI"

**Garanzia 3 - "ROI Garantito" (90 giorni)**
- Icona: TrendingUp
- Testo: Se in 90 giorni non hai recuperato almeno 3x il costo dell'abbonamento in efficienza e margini recuperati, ti rimborsiamo la differenza
- Badge: "90 GIORNI"

### Design:
- Titolo sezione: "3 Garanzie. Zero Rischi."
- 3 card con bordo animato (rotating conic-gradient come gia presente)
- Ogni card ha: badge giorni, icona grande con anelli concentrici, titolo garanzia, descrizione, 2-3 bullet point specifici
- Sfondo resta navy `bg-[#1a2744]` con glow effect
- CTA finale sotto le 3 card: "Prova Senza Rischi"

---

## Dettagli Tecnici

### PricingSection.tsx - Struttura:
- Array `plans` con 3 oggetti contenenti: name, price, period, description, features (array di {text, included}), highlighted (boolean), cta
- Griglia `grid grid-cols-1 lg:grid-cols-3 gap-6 items-center`
- Card centrale con `lg:scale-105` e `z-10`
- Badge "Piu Popolare" posizionato absolute `-top-4`
- Feature list con icone Check (teal) per incluse, X (gray-300) per escluse

### GuaranteeSection.tsx - Struttura:
- Array `guarantees` con 3 oggetti contenenti: icon, title, days, description, points (array)
- Griglia `grid grid-cols-1 md:grid-cols-3 gap-6`
- Ogni card mantiene il rotating border gia implementato
- Sigillo con anelli concentrici per ogni icona

### File modificati:

| File | Azione |
|---|---|
| `PricingSection.tsx` | Riscrittura con 3 piani pricing |
| `GuaranteeSection.tsx` | Riscrittura con 3 garanzie |
