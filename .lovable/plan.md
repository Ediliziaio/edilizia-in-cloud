

# Verifica date nella vista Carico

## Dati attuali nel database

C'e un solo ordine con date di lavoro:
- **"Cliente 1"** (Enrico Goldoni) — `work_start_date: 2026-04-22`, `work_end_date: 2026-04-24`, nessuna `expected_date`

## Verifica logica

La funzione `getWorkloadForDay()` per questo ordine:
- 22 aprile: `isWithinInterval(22 apr, {22 apr, 24 apr})` → **incluso** (corretto)
- 23 aprile: `isWithinInterval(23 apr, {22 apr, 24 apr})` → **incluso** (corretto)
- 24 aprile: `isWithinInterval(24 apr, {22 apr, 24 apr})` → **incluso** (corretto)
- 25 aprile: fuori intervallo → **escluso** (corretto)

La logica e corretta. L'ordine apparira nei giorni 22, 23, 24 aprile con conteggio 1 per ciascun giorno, icona Wrench (lavoro).

## Piano di verifica

1. **Navigare al calendario nella vista Carico, mese Aprile 2026** e verificare visivamente che i giorni 22-24 mostrino conteggio 1 con icona lavoro
2. **Cliccare su uno dei giorni** per verificare che il popover mostri l'ordine "Cliente 1 — Goldoni"

## Ordine di test

Per testare anche la posa e il doppio conteggio, non posso creare ordini direttamente (servirebbe un `customer_id` valido e un `company_id`). Suggerisco di **usare l'interfaccia dell'app** per creare un ordine di test con:
- Data posa (expected_date): es. 23 aprile 2026
- Lavori dal 21 al 23 aprile 2026

Questo permetterebbe di verificare che il 23 aprile conti 2 ordini (uno per posa, uno per lavoro del Cliente 1) e che non ci sia doppio conteggio se lo stesso ordine ha posa e lavoro lo stesso giorno.

Vuoi che proceda con la verifica visiva nel browser?

