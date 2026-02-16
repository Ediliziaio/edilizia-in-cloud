
# Miglioramento Garanzia + Immagini AI per le Sezioni

## 1. Sezione Garanzia - Redesign Completo

**File: `src/components/landing/GuaranteeSection.tsx`**

La sezione attuale e troppo semplice (solo icona + testo). Il redesign include:

- **Sigillo visivo**: Un cerchio decorativo con bordo dorato/teal animato che fa da "timbro di garanzia" attorno all'icona ShieldCheck, con anelli concentrici
- **3 bullet point** sotto il titolo per specificare cosa copre la garanzia:
  - "Identifica dove perdi margine nei tuoi cantieri"
  - "Setup completo e supporto dedicato inclusi"
  - "Rimborso totale, zero domande, zero complicazioni"
- **Badge "30 GIORNI"** stilizzato come un sigillo circolare con bordo animato (rotating border gradient)
- **CTA nella garanzia**: Bottone "Prova Senza Rischi" sotto i bullet point
- **Glow effect** piu pronunciato dietro il card, con pulsazione
- **Border animato**: Il bordo del card avra un gradiente che ruota (conic-gradient animato)

---

## 2. Edge Function per Generare Immagini AI

**Nuovo file: `supabase/functions/generate-landing-image/index.ts`**

Edge function che usa Lovable AI (modello `google/gemini-2.5-flash-image`) per generare immagini. Riceve un prompt, restituisce l'immagine base64.

---

## 3. Componente per Caricare e Mostrare Immagini AI

**Nuovo file: `src/components/landing/AIImage.tsx`**

Componente riutilizzabile che:
- Chiama l'edge function con un prompt specifico
- Mostra uno skeleton/placeholder durante il caricamento
- Salva l'immagine in cache (localStorage) per non rigenerarla ogni volta
- Mostra l'immagine generata con bordi arrotondati e ombra

---

## 4. Immagini AI nelle Sezioni

Aggiungere immagini generate dall'AI nelle seguenti sezioni:

### PainPointsSection.tsx
- Immagine laterale: "Imprenditore edile stressato alla scrivania con fogli e fatture sparsi, stile illustrazione moderna minimalista, palette navy e teal"
- Posizionata a destra del testo su desktop, sopra su mobile

### SolutionSection.tsx
- Immagine decorativa: "Dashboard digitale moderna con grafici su tablet, cantiere edile sullo sfondo sfocato, stile illustrazione flat professionale"
- Posizionata accanto alle 3 card domande

### ScenarioSection.tsx
- Due immagini piccole, una per scenario:
  - Scenario A: "Imprenditore preoccupato con conti in rosso, stile illustrazione minimalista, toni rossi e grigi"
  - Scenario B: "Imprenditore soddisfatto che guarda grafici in crescita su schermo, stile illustrazione, toni verdi e teal"

### TargetSection.tsx
- Immagine hero in cima alla sezione: "Gruppo di imprenditori edili italiani sorridenti in cantiere con tablet, stile illustrazione moderna professionale"

---

## 5. Aggiornamento config.toml

**File: `supabase/config.toml`**

Aggiungere la configurazione per la nuova edge function:
```
[functions.generate-landing-image]
verify_jwt = false
```

---

## Dettagli Tecnici

### Edge Function (generate-landing-image):
```text
- Riceve: { prompt: string }
- Chiama Lovable AI con modello google/gemini-2.5-flash-image
- Modalities: ["image", "text"]
- Restituisce: { imageUrl: "data:image/png;base64,..." }
```

### Componente AIImage:
```text
- Props: prompt (string), alt (string), className (string)
- Caching: localStorage con chiave basata su hash del prompt
- Stati: loading (skeleton), loaded (immagine), error (placeholder)
- Skeleton: div animato con pulse che occupa lo spazio
```

### Garanzia - Border animato:
```text
- Usa @keyframes rotate per ruotare un conic-gradient sul bordo
- Pseudo-elemento ::before con gradient conico che ruota
- Implementato con un wrapper div e overflow hidden
```

### Riepilogo file:

| File | Azione |
|------|--------|
| `GuaranteeSection.tsx` | Redesign completo |
| `supabase/functions/generate-landing-image/index.ts` | Nuova edge function |
| `src/components/landing/AIImage.tsx` | Nuovo componente |
| `PainPointsSection.tsx` | Aggiunta immagine AI |
| `SolutionSection.tsx` | Aggiunta immagine AI |
| `ScenarioSection.tsx` | Aggiunta 2 immagini AI |
| `TargetSection.tsx` | Aggiunta immagine AI |
| `supabase/config.toml` | Aggiunta funzione |
