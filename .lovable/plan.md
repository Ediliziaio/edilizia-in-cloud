

# Ottimizzazione Cruscotto Aziendale — Pulizia, Bug Fix e UX

## 1. Codice morto da rimuovere

4 file orfani nella cartella `src/components/cruscotto/` non importati da nessuna parte:

| File | Motivo |
|------|--------|
| `DailyPriorities.tsx` | Rimosso dal layout, nessun import |
| `ExecutiveSummary.tsx` | Rimosso dal layout, nessun import |
| `WeeklyAgenda.tsx` | Sostituito da `WeeklySnapshot.tsx`, nessun import |
| `QuickActions.tsx` | Rimosso dal layout, nessun import |

Import inutile in `CruscottoAziendale.tsx`: `Loader2` importato da lucide ma mai usato.

## 2. Bug fix

| Bug | File | Fix |
|-----|------|-----|
| `(marketingAlerts as any).stale_leads_2h` e `pending_appointments` — cast `as any` inutili, il tipo `AlertsData` ha già quei campi | `CruscottoAlerts.tsx` | Rimuovere tutti i cast `as any` (righe 44, 49, 54, 59) |
| KPI "Proiezione Mese" mostra `getPrevValue: () => 0` — delta mai visibile ma semanticamente corretto (è una proiezione, non ha "precedente") | `ExecutiveOverview.tsx` | Nessuna modifica necessaria — è intenzionale |
| `FinanzaCashFlow.tsx` importa `fmt` ma non lo usa | `FinanzaCashFlow.tsx` | Rimuovere import inutile |

## 3. Miglioramenti UX

| Miglioramento | File | Dettaglio |
|---------------|------|-----------|
| Empty state nelle tab quando dati assenti | Tutti i tab content | Aggiungere messaggi guida quando `sales`, `funnel`, `sources` sono vuoti — evita schermate bianche |
| Tab Vendite: empty state per HRPerformance già presente (riga 36) — OK | — | — |
| Tab Finanza: aggiungere empty state quando entrate e uscite sono entrambe 0 | `FinanzaCashFlow.tsx` | Messaggio "Nessun dato finanziario nel periodo" |
| Tab Marketing: aggiungere empty state quando sources e funnel vuoti | `MarketingControl.tsx` | Messaggio con CTA |
| Tab Operazioni: il layout è solido, nessun dead-end | — | — |
| Loading skeleton per il grafico ROI in MarketingControl | `MarketingControl.tsx` | Aggiungere `isLoading` check prima del grafico |

## 4. File da modificare

| File | Intervento |
|------|-----------|
| `CruscottoAziendale.tsx` | Rimuovere import `Loader2` |
| `CruscottoAlerts.tsx` | Rimuovere 4 cast `as any` |
| `FinanzaCashFlow.tsx` | Rimuovere import `fmt` inutile, aggiungere empty state quando tutto è 0 |
| `MarketingControl.tsx` | Aggiungere empty state per tab vuota, skeleton per loading grafico |

## 5. File da eliminare

- `src/components/cruscotto/DailyPriorities.tsx`
- `src/components/cruscotto/ExecutiveSummary.tsx`
- `src/components/cruscotto/WeeklyAgenda.tsx`
- `src/components/cruscotto/QuickActions.tsx`

## Output atteso

- **Rimossi**: 4 file orfani, 1 import inutile (`Loader2`), 1 import inutile (`fmt`), 4 cast `as any`
- **Bug corretti**: Type safety in CruscottoAlerts, import puliti
- **UX migliorata**: Empty state in tab Finanza e Marketing, nessun vicolo cieco
- **Console**: Nessun warning/errore aggiuntivo introdotto
- **Comportamento funzionale**: invariato

