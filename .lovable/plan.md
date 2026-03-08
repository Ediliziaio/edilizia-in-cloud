

# Sprint 1 — Quick Wins: Piano di Implementazione

5 miglioramenti ad alto impatto e bassa complessita.

---

## 1. Totale aggregato periodo nel tab Previsionale Costi

**File:** `src/components/forecast/CostsForecastTab.tsx`

Aggiungere una card "hero" evidenziata sopra le 3 summary cards esistenti (riga 110) che mostra il **Totale Uscite Periodo** sommando tutte e 4 le sezioni (Squadre + Provvigioni + Fornitori + Costi Az.) nel periodo filtrato. La card usa sfondo `bg-red-50/border-red-200` con testo grande per rispondere alla domanda principale dell'utente. Calcolo: somma di `filteredExpenses + filteredCommissions + filteredSupplier + filteredCosts`.

---

## 2. Eliminare dropdown "Stato" ridondante nella sezione Costi

**File:** `src/components/forecast/CompanyCostsManager.tsx`

Rimuovere il `Select` con value `statusFilter` (righe 348-356) che mostra "Tutti / Da pagare / Pagati / Scaduti". Questa funzione e' gia coperta dai Status Tab Buttons (righe 387-409) che sono piu visibili e interattivi. Rimuovere anche lo state `statusFilter` e il relativo prop passato al data hook, verificando che il filtro di stato operi solo tramite `statusTabFilter`.

**File:** `src/hooks/useCompanyCostsData.ts` — verificare che `statusFilter` possa essere rimosso senza rompere la logica. Se il hook lo usa internamente, mantenere un default `"all"` hardcoded.

---

## 3. KPI card del Cruscotto cliccabili verso le sezioni di dettaglio

**File:** `src/components/cruscotto/ExecutiveOverview.tsx`

Aggiungere un campo opzionale `link?: string` alla interfaccia `KpiDef`. Mappare le KPI a percorsi:
- Fatturato Periodo → `/azienda/ordini`
- Margine Lordo % → `/azienda/previsionale` (tab marginalita)
- Entrate/Uscite Mese → `/azienda/previsionale` (tab cassa)
- Cash Flow → `/azienda/previsionale`
- Da Incassare → `/azienda/previsionale` (tab incassato)
- Debiti Fornitori → `/azienda/costi`
- Lead Nuovi → `/azienda/marketing`
- Appuntamenti → `/azienda/marketing/calendario`
- Contratti Vinti → `/azienda/ordini`

Nel componente `KpiCard`, wrappare la `Card` con `useNavigate` e `onClick` se `link` e' definito. Aggiungere `cursor-pointer` condizionale.

---

## 4. Saldo cumulativo nella Previsione di Cassa

**File:** `src/components/forecast/CashForecastTab.tsx`

Aggiungere sopra le 3 summary cards (riga 144) una card evidenziata "Saldo Cumulativo Periodo" che mostra il running total di tutte le transazioni nel periodo selezionato (`income - expenses` cumulativo). Usa calcolo da `stats.total.net` per il totale, con colore verde/rosso condizionale. Indicazione testuale "Alla fine del periodo il saldo previsto sara'..."

---

## 5. Collassare automaticamente widget Alert Magazzino quando vuoto

**File:** `src/pages/azienda/CompanyDashboard.tsx`

Wrappare il widget "Alert Magazzino" (righe 337-378) in un `Collapsible` che parte chiuso quando `urgentItems.length === 0`. Mostrare solo l'header con un contatore "(0)" e un toggle per espandere. Quando ci sono articoli urgenti, il collapsible parte aperto con badge rosso sul contatore.

---

## Riepilogo file coinvolti

| File | Modifica |
|------|----------|
| `src/components/forecast/CostsForecastTab.tsx` | Card "Totale Uscite Periodo" |
| `src/components/forecast/CompanyCostsManager.tsx` | Rimuovere dropdown Stato |
| `src/hooks/useCompanyCostsData.ts` | Verificare/semplificare statusFilter |
| `src/components/cruscotto/ExecutiveOverview.tsx` | KPI cliccabili con navigazione |
| `src/components/forecast/CashForecastTab.tsx` | Card saldo cumulativo |
| `src/pages/azienda/CompanyDashboard.tsx` | Alert Magazzino collassabile |

