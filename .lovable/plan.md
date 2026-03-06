

# Ottimizzazione UX Costi Aziendali

## 1. Riepilogo Annuale in alto con switch Anno

**Cosa**: Aggiungere una sezione "Riepilogo Annuale" sopra le stats cards attuali, con un selettore anno (anno corrente / anno precedente). Mostra i KPI chiave dell'anno selezionato: totale costi, pagati, da pagare, % pagato.

**Implementazione**:

### `src/hooks/useCompanyCostsData.ts`
- Aggiungere un parametro `selectedYear` ai filtri
- Calcolare `yearlyStats` separatamente (non influenzato dai filtri periodo): filtra tutti i costi + order-derived per l'anno selezionato e calcola totale, pagati, da pagare, scaduti
- Restituire `yearlyStats` dal hook

### `src/components/forecast/CostsStatsCards.tsx`
- Aggiungere una nuova sezione in cima: una barra con titolo "Situazione {anno}" e due bottoni toggle (anno corrente / anno precedente)
- Sotto la barra, 4 card orizzontali grandi: Totale Anno, Pagato, Da Pagare, Scaduto — con barra di progresso pagato/totale
- Le 6 stats cards piccole esistenti restano sotto, filtrate per periodo

### `src/components/forecast/CompanyCostsManager.tsx`
- Aggiungere stato `selectedYear` (default: anno corrente)
- Passarlo al hook e al componente stats

## 2. Miglioramento Distribuzione Mensile Costi Futuri

**Cosa**: Il grafico attuale mostra solo 6 mesi futuri con barre stacked. Miglioramenti:

### `src/hooks/useCompanyCostsData.ts`
- Estendere `monthlyDistribution` per mostrare 12 mesi (6 passati + 6 futuri) o in alternativa tutti i mesi dell'anno selezionato
- Aggiungere il totale per mese come terzo dato per il tooltip
- Includere anche i costi pagati come terza serie per confronto

### `src/components/forecast/CostsStatsCards.tsx`
- Ridisegnare il grafico: usare barre raggruppate (non stacked) con colori più distinti
- Aggiungere una linea trend sovrapposta per il totale cumulativo
- Migliorare il tooltip con breakdown dettagliato (Fissi, Variabili, Totale)
- Aggiungere indicatore del mese corrente (evidenziazione della barra)
- Rendere il grafico più alto (da 200px a 280px) per leggibilità

## Riepilogo modifiche per file

| File | Modifiche |
|------|-----------|
| `useCompanyCostsData.ts` | + `selectedYear` param, + `yearlyStats` output, estensione `monthlyDistribution` a 12 mesi con trend |
| `CostsStatsCards.tsx` | + Sezione riepilogo annuale con toggle anno, + progress bar, miglioramento chart |
| `CompanyCostsManager.tsx` | + stato `selectedYear`, passaggio a hook e componente |

