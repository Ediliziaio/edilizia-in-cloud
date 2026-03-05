

# Analisi Cruscotto Aziendale — Spazi Vuoti e Dati Mancanti

Dopo aver analizzato tutti i componenti, ecco cosa risulta vuoto o sottoutilizzato:

---

## 1. KPI senza confronto periodo precedente

5 dei 11 KPI finanziari e 0 dei nuovi hanno `getPrevValue: () => 0`, quindi **non mostrano mai il delta** (freccia verde/rossa):
- N° Ordini, Costo Medio Ordine, Entrate Mese, Uscite Mese, Burn Rate, Da Incassare, Debiti Fornitori

**Fix**: Per i KPI basati su `finance`, calcolare i valori del periodo precedente usando `prevFromStr/prevToStr` già presenti nel hook. Per N° Ordini serve una query aggiuntiva per il conteggio ordini nel periodo precedente.

---

## 2. Dati `weeklyAgenda` recuperati ma mai visualizzati

Il hook `useCruscottoData` carica `weeklyAgenda` (pagamenti in arrivo, costi in scadenza, consegne, appuntamenti prossimi 7 giorni) ma dopo la rimozione del componente WeeklyAgenda **questi dati non appaiono da nessuna parte**.

**Fix**: Creare un widget compatto "Prossimi 7 Giorni" da inserire nella tab **Operazioni** o come strip sotto gli Alerts — 4 mini-card orizzontali: Incassi Attesi, Costi in Scadenza, Consegne, Appuntamenti.

---

## 3. Tab Operazioni troppo scarsa

Mostra solo 4 card (Ordini Attivi, In Ritardo, Ticket Aperti, Pagamenti Scaduti). Manca:
- La sezione "Prossimi 7 giorni" (widget sopra)
- Una timeline/lista degli ordini in scadenza
- Dettaglio importo pagamenti scaduti

**Fix**: Aggiungere il widget WeeklyAgenda compatto + una mini-tabella "Ordini in scadenza questa settimana" con data prevista e stato.

---

## 4. Tab Finanza — manca grafico storico

`FinanzaCashFlow` mostra solo numeri statici del mese corrente. Manca un grafico che mostri l'andamento entrate/uscite nel tempo.

**Fix**: Aggiungere un grafico a barre (Recharts) con entrate vs uscite mensili usando dati storici dagli ordini.

---

## 5. Tab Marketing — nessun grafico ROI

La tab mostra Funnel e tabella Sorgenti. Manca:
- Grafico ROI per sorgente (barre o torta)
- Grafico CPL/CPA nel tempo

**Fix**: Aggiungere un grafico a barre ROI per source usando i dati `sources` già disponibili.

---

## 6. Trend in fondo — potrebbe essere vuoto

Se non ci sono dati nel periodo, il grafico trend è completamente vuoto senza alcun messaggio.

**Fix**: Aggiungere un empty state con messaggio "Dati insufficienti per mostrare il trend".

---

## Piano di intervento proposto

| Priorità | Intervento | File |
|-----------|-----------|------|
| **Alta** | Aggiungere `prevValue` reali ai KPI finanziari (delta %) | `ExecutiveOverview.tsx`, `useCruscottoData.ts` |
| **Alta** | Widget "Prossimi 7 Giorni" compatto nella tab Operazioni | Nuovo `WeeklySnapshot.tsx`, `OperationsDelivery.tsx` |
| **Media** | Grafico entrate/uscite mensile nella tab Finanza | `FinanzaCashFlow.tsx` |
| **Media** | Grafico ROI per sorgente nella tab Marketing | `MarketingControl.tsx` |
| **Bassa** | Empty state per Trend vuoto | `CruscottoTrend.tsx` |
| **Bassa** | Mini-tabella ordini in scadenza | `OperationsDelivery.tsx` |

Vuoi che proceda con tutte le priorità o solo alcune?

