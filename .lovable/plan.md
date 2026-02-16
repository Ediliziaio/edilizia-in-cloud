

# Fix Landing Page: Mobile Polish + Scenario Illustrations

## Problemi Identificati

### 1. Immagini Scenario A e B mancanti
Le immagini negli scenari usano il componente `AIImage` che chiama una funzione backend per generare immagini con AI. Questa chiamata sta fallendo (rate limit o errori API), mostrando solo un'icona placeholder grigia. Entrambe le immagini (Scenario A e Scenario B) sono assenti, non solo la B.

**Soluzione**: Sostituire le `AIImage` con illustrazioni statiche CSS/HTML (approccio coerente con il mockup dashboard della Hero, che usa HTML invece di immagini). Creare due mini-illustrazioni inline:
- **Scenario A**: Sfondo rosso/grigio con icone di "perdita" (TrendingDown, AlertTriangle, FileX) disposte in un layout visuale
- **Scenario B**: Sfondo verde/teal con icone di "successo" (TrendingUp, CheckCircle, BarChart3) e un mini grafico ascendente

### 2. Mobile: Tabella confronto Pricing troppo stretta
La riga `flex items-center justify-between` nella tabella confronto alternative mostra testo e prezzo affiancati, risultando compressa su schermi piccoli.

**Soluzione**: Su mobile, stackare verticalmente il nome dell'alternativa e il costo (`flex-col` su mobile, `flex-row` su desktop).

### 3. Mobile: Padding e spacing generali
Alcuni padding (`p-8`) nelle card sono eccessivi su mobile.

**Soluzione**: Usare `p-5 md:p-8` nelle card Scenario e Garanzie per dare piu respiro su schermi piccoli.

---

## Dettagli Tecnici

### File 1: `src/components/landing/ScenarioSection.tsx`

- Rimuovere l'import di `AIImage`
- Creare due componenti inline `ScenarioIllustrationA` e `ScenarioIllustrationB` che rendono mini-illustrazioni CSS con icone lucide-react:
  - **A**: Box con sfondo `bg-red-100` e bordo, contenente icone `TrendingDown`, `AlertTriangle`, `XCircle` disposte in griglia con toni rossi, e un mini "grafico" discendente fatto con div colorati
  - **B**: Box con sfondo `bg-[#0fa68c]/10` e bordo, contenente icone `TrendingUp`, `CheckCircle`, `BarChart3` con toni teal, e un mini "grafico" ascendente
- Sostituire i due `<AIImage>` con questi nuovi componenti
- Aggiornare i padding delle card da `p-8` a `p-5 md:p-8`

### File 2: `src/components/landing/PricingSection.tsx`

- Nella tabella confronto alternative (riga 96), cambiare il layout da `flex items-center justify-between` a `flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-0` per stackare su mobile
- Aggiornare i padding delle card pricing da `p-8` a `p-5 md:p-8`

### File 3: `src/components/landing/GuaranteeSection.tsx`

- Aggiornare padding card da `p-8` a `p-5 md:p-8`

### Riepilogo modifiche:

| File | Azione |
|---|---|
| `ScenarioSection.tsx` | Sostituire AIImage con illustrazioni CSS statiche + fix padding mobile |
| `PricingSection.tsx` | Fix tabella confronto mobile + fix padding |
| `GuaranteeSection.tsx` | Fix padding mobile |

