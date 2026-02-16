
# Miglioramenti Grafici Completi della Landing Page

## 1. Shimmer Effect sul Badge Hero

**File: `src/components/landing/HeroSection.tsx`**

Applicare un effetto shimmer animato sul badge "Il Software #1 in Italia" per attirare l'attenzione. Il keyframe `shimmer` e l'animazione `animate-shimmer` sono gia configurati in `tailwind.config.ts`. Si aggiungera un background gradient trasparente che scorre da sinistra a destra.

---

## 2. Glow Effect dietro il Dashboard Mockup

**File: `src/components/landing/HeroSection.tsx`**

Aggiungere un elemento `div` posizionato `absolute` dietro il mockup dashboard con un grande blur teal (`bg-[#0fa68c]/15 blur-[80px]`) per creare un effetto "glow" che dia profondita e risalto al mockup. Si animera con un leggero pulsare.

---

## 3. Social Proof sotto i CTA

**File: `src/components/landing/HeroSection.tsx`**

Aggiungere sotto i bottoni CTA una riga di social proof con:
- "150+ Imprese Edili" con icona Users
- "4.9/5 Soddisfazione" con 5 stelline (Star icon)
- "Supporto Italiano" con icona Shield/HeadphonesIcon

Testi in `text-white/50`, piccoli (`text-sm`), con icone `text-[#0fa68c]`. Separati da un trattino verticale o spazio. Animazione fade-in con delay.

---

## 4. Highlight Tipografici nel Sottotitolo

**File: `src/components/landing/HeroSection.tsx`**

Evidenziare le parole chiave "margini", "cassa" e "commesse" nel sottotitolo con colore `text-white` (invece di `text-white/60`) e `font-semibold` per farle risaltare dal resto del testo.

---

## 5. Avatar/Foto Fondatore nella Lettera

**File: `src/components/landing/FounderLetterSection.tsx`**

Aggiungere un avatar placeholder circolare accanto alla firma di Florin. Si usera un cerchio con le iniziali "F" in stile teal (`bg-[#0fa68c]`, testo bianco, `w-14 h-14 rounded-full`), affiancato al nome e titolo con layout `flex items-center gap-4`.

---

## 6. Transizione Fluida Hero-Lettera

**File: `src/components/landing/HeroSection.tsx`**

Il gradiente di chiusura in fondo alla Hero (`from-white to-transparent`) e gia presente. Verificare che la `FounderLetterSection` abbia `bg-white` e aumentare l'altezza del gradiente da `h-32` a `h-40` per una transizione piu morbida.

---

## Riepilogo modifiche per file

| File | Cosa cambia |
|------|-------------|
| `HeroSection.tsx` | Shimmer badge, glow mockup, social proof, highlight sottotitolo, gradiente piu alto |
| `FounderLetterSection.tsx` | Avatar fondatore nella firma |

Nessun nuovo file da creare. Nessuna dipendenza aggiuntiva.
