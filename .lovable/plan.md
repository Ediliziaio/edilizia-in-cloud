

# Cruscotto Aziendale — Miglioramenti CEO-Level

## Analisi Critica dello Stato Attuale

Il cruscotto attuale e' funzionale ma ha limiti importanti per un CEO che deve decidere in 30 secondi:

1. **Manca il "colpo d'occhio"** — 12+ KPI cards tutte uguali, nessuna gerarchia visiva. Un CEO non sa dove guardare prima.
2. **Nessun indicatore di salute globale** — Manca un semaforo aziendale che dica "stiamo bene" o "attenzione".
3. **KPI senza target** — I numeri sono assoluti, ma un CEO ragiona in "% del target". Fatturato €50k non dice nulla senza sapere che il target e' €80k.
4. **Nessuna narrazione** — I dati sono esposti ma non interpretati. Manca una sintesi automatica tipo "Fatturato in linea, margine sotto soglia, pipeline forte".
5. **Trend assente nelle card** — Le KPI card mostrano solo il valore corrente + delta %, ma nessuna sparkline per capire la direzione visivamente.
6. **Cash Runway mancante** — Il cash flow mostra il netto ma non risponde a "quanti giorni possiamo andare avanti?".
7. **Alert senza priorita' d'azione** — Gli alert segnalano problemi ma non suggeriscono cosa fare.
8. **Sezione Finance troppo basica** — Manca burn rate, break-even, margine netto stimato.

---

## Piano di Miglioramento (7 interventi)

### 1. Semaforo Aziendale (Health Score)

Nuovo componente `CompanyHealthScore.tsx` posizionato in cima, prima degli alert. Un singolo indicatore visivo (cerchio grande con colore + score 0-100) calcolato come media pesata di:
- Margine lordo vs soglia (peso 25%)
- Cash flow positivo/negativo (peso 25%)
- Tasso chiusura vs target (peso 20%)
- Show rate vs target (peso 15%)
- Ordini in ritardo (peso 15%)

Colore: verde (>70), giallo (40-70), rosso (<40). Sotto il cerchio, 3 parole chiave: es. "Margine OK — Cash Critico — Vendite Forti".

### 2. Executive Summary Automatica

Sotto il health score, un box testuale che genera automaticamente 2-3 frasi di sintesi basate sui dati:
- "Il fatturato del periodo e' €X, +Y% rispetto al periodo precedente."
- "Il margine lordo (Z%) e' sotto la soglia del 30%. Verificare i costi commessa."
- "La pipeline attiva vale €W con forecast 30gg di €V."

Logica rule-based nel componente (no AI), analizzando i valori e i delta gia' disponibili.

### 3. KPI Cards con Sparkline e Target

Modificare `ExecutiveOverview.tsx`:
- Aggiungere una mini sparkline (7 punti dal trend data) dentro ogni KPI card per visualizzare la direzione
- Aggiungere una barra di progresso sotto i KPI principali (Fatturato, Contratti) che mostri "X% del target mensile"
- I target possono essere hardcoded inizialmente e in futuro configurabili da settings

Richiede: passare `trend` data all'ExecutiveOverview per estrarre i valori giornalieri.

### 4. Cash Runway e Burn Rate

Modificare `FinanzaCashFlow.tsx`:
- Aggiungere **Burn Rate** = uscite medie giornaliere del mese
- Aggiungere **Cash Runway** = (Incassi previsti - Uscite previste) / burn rate giornaliero = giorni stimati
- Visualizzare con un progress bar colorato (verde >60gg, giallo 30-60gg, rosso <30gg)

I dati sono gia' disponibili in `FinanceData` (thisMonthIncome, thisMonthOutflow).

### 5. Alert con Azioni Suggerite

Modificare `CruscottoAlerts.tsx`:
- Aggiungere un campo `action` a ogni alert con il suggerimento d'azione
- Esempio: "Lead non contattati 48h+" → azione: "Assegnare follow-up immediato"
- Esempio: "Cash flow negativo" → azione: "Sollecitare incassi o posticipare uscite"
- Mostrare l'azione come testo secondario sotto il messaggio

### 6. Sezione Finanza Potenziata

Modificare `FinanzaCashFlow.tsx`:
- Aggiungere **Progress bar visiva** entrate vs uscite (barra doppia orizzontale)
- Aggiungere **Margine Netto stimato** = Margine Lordo - (costi fissi stimati / fatturato)
- Aggiungere **Break-even indicator** = volume ordini necessario per coprire i costi fissi

### 7. Layout Riorganizzato per Priorita' CEO

Modificare `CruscottoAziendale.tsx`:
- **Above the fold** (prima cosa visibile):
  1. Health Score + Executive Summary (nuova riga)
  2. Alert con azioni
  3. Executive Overview KPIs
- **Below the fold** (scroll):
  4. Finance & Operations (affiancati)
  5. Sales & Marketing (affiancati)
  6. Pipeline & Forecast
  7. HR & Performance
  8. Trend

---

## File da Creare/Modificare

| Azione | File |
|--------|------|
| Creare | `src/components/cruscotto/CompanyHealthScore.tsx` — Semaforo + score |
| Creare | `src/components/cruscotto/ExecutiveSummary.tsx` — Sintesi automatica testuale |
| Modificare | `src/components/cruscotto/ExecutiveOverview.tsx` — Sparkline + target bar nelle KPI cards |
| Modificare | `src/components/cruscotto/FinanzaCashFlow.tsx` — Cash runway, burn rate, progress bar |
| Modificare | `src/components/cruscotto/CruscottoAlerts.tsx` — Azioni suggerite per ogni alert |
| Modificare | `src/pages/azienda/CruscottoAziendale.tsx` — Riorganizzazione layout + passaggio trend data |
| Modificare | `src/hooks/useCruscottoData.ts` — Esporre trend data al livello pagina (gia' disponibile da marketing RPC) |

Nessuna migrazione DB necessaria. Nessun cambio comportamentale, solo potenziamento visivo e informativo.

