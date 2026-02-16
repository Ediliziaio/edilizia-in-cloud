
# Spostamento Sezione Bonus e Immagine AI

## Modifiche

### 1. Spostare BonusGiftSection dopo FounderLetterSection

Nel file `src/pages/Home.tsx`, la sezione `<BonusGiftSection />` viene spostata dalla riga 60 (dopo GuaranteeSection) alla riga 49 (subito dopo `<FounderLetterSection />`).

Ordine risultante:
```text
HeroSection
FounderLetterSection
BonusGiftSection        <-- spostata qui
PainPointsSection
CostTableSection
...
```

### 2. Sostituire l'icona Gift con un'immagine AI

Nel file `src/components/landing/BonusGiftSection.tsx`, il blocco con l'icona `Gift` animata (righe 25-29) viene sostituito con il componente `AIImage` gia esistente nel progetto (`src/components/landing/AIImage.tsx`).

- Rimuovere il cerchio con icona `Gift` e `animate-pulse`
- Inserire `<AIImage>` con un prompt descrittivo, ad esempio: "A professional flat illustration of a golden gift box opening with light rays, representing a free bonus sales course for construction industry, teal and navy color scheme, clean modern style, white background"
- L'immagine verra generata automaticamente e cachata in localStorage
- Dimensioni: `w-40 h-40 mx-auto mb-5 rounded-xl`

## Dettagli Tecnici

### File: `src/pages/Home.tsx`
- Rimuovere `<BonusGiftSection />` dalla riga 60
- Aggiungerlo dopo `<FounderLetterSection />` alla riga 49

### File: `src/components/landing/BonusGiftSection.tsx`
- Aggiungere import di `AIImage` da `@/components/landing/AIImage`
- Rimuovere import di `Gift` da lucide-react (non piu usato nella card)
- Sostituire il div con l'icona Gift (righe 25-29) con il componente `AIImage`
- Mantenere tutto il resto invariato (badge, titolo, descrizione, CTA)
