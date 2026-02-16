

# Miglioramento Garanzie: Nuove Animazioni + "Software a Vita"

## Problema Attuale
Il bordo che ruota con `conic-gradient` + `@keyframes rotateBorder` risulta pesante e distraente. Va sostituito con animazioni piu eleganti e moderne.

## Modifiche

### 1. Rimuovere il rotating border
Eliminare completamente il `conic-gradient` animato sui bordi delle card e sul badge. Rimuovere il blocco `<style>` con `@keyframes rotateBorder`.

### 2. Nuove animazioni per le card
Sostituire con un design piu pulito e moderno:
- **Bordo statico** con gradiente teal sottile (`border border-[#0fa68c]/30`) e un leggero `hover:border-[#0fa68c]/60` per interattivita
- **Glow on hover**: ombra teal che si accende al passaggio del mouse (`hover:shadow-[0_0_30px_rgba(15,166,140,0.15)]`)
- **Shimmer effect** sottile sull'icona: un riflesso luminoso che scorre orizzontalmente una volta (gia presente in tailwind config come `animate-shimmer`)
- **Badge giorni**: bordo statico `border border-[#0fa68c]/50` con sfondo `bg-[#0fa68c]/10`, senza rotazione

### 3. Icona con pulse glow
Le icone centrali avranno un leggero `animate-pulse-glow` (gia definito in tailwind config) invece degli anelli statici concentrici. Un singolo cerchio con glow pulsante.

### 4. Terza garanzia: "Software a Vita"
Aggiornare il contenuto della garanzia ROI:
- **Titolo**: "ROI Garantito"
- **Descrizione**: "Se in 90 giorni non hai recuperato almeno 3x il costo dell'abbonamento in efficienza e margini recuperati, ti REGALO il software a vita. Gratis. Per sempre."
- **Punti**:
  - "Tracciamento ROI integrato nella dashboard"
  - "Report automatici di efficienza"
  - "Nessun ROI? Il software e tuo, per sempre"
- Aggiungere un **badge extra** sotto la card o evidenziato nel testo: "REGALO A VITA" con icona Gift

### 5. Card ROI evidenziata
La terza card (ROI) avra un trattamento speciale per sottolineare la forza dell'offerta:
- Bordo piu spesso teal (`border-2 border-[#0fa68c]`)
- Badge "REGALO A VITA" dorato/teal posizionato in basso nella card
- Leggera scala maggiore su hover rispetto alle altre

---

## Dettagli Tecnici

**File modificato: `src/components/landing/GuaranteeSection.tsx`**

- Rimozione del div con `conic-gradient` e `animation: rotateBorder` (righe 75-81)
- Rimozione del badge con rotating border (righe 86-95)
- Rimozione del blocco `<style>` in fondo (righe 145-150)
- Sostituzione con bordi statici + transizioni hover CSS standard (Tailwind)
- Aggiunta icona `Gift` da lucide-react per la card ROI
- Aggiornamento testo garanzia 3: descrizione e punti con "regalo software a vita"
- Card wrapper: da `p-[2px]` con pseudo-bordo a semplice `border` Tailwind con hover effects

| Elemento | Prima | Dopo |
|---|---|---|
| Bordo card | conic-gradient rotante | border statico + hover glow |
| Badge giorni | conic-gradient rotante | bg teal/10 + border statico |
| Icona | anelli concentrici statici | cerchio singolo con pulse-glow |
| Garanzia 3 testo | "rimborsiamo la differenza" | "ti REGALO il software a vita" |
| Card 3 | uguale alle altre | bordo piu spesso + badge "REGALO A VITA" |

