---
area: 03-controllo-gestione
titolo: Forecast economico mensile a 12 mesi
tags: [forecast, rolling-forecast, conto-economico, previsione]
livello: intermedio
applicabile_a: [direzione-aziendale, controller]
kpi_correlati: [accuratezza-forecast, scostamento-rolling]
versione: 1.0
aggiornato_il: 2026-05-04
---

# Forecast economico mensile — il budget aggiornato

Il budget annuale è la fotografia di novembre/dicembre. Il **forecast** è la fotografia aggiornata del mese. Differenza: il budget non si ritocca, il forecast si rivede.

## La logica del rolling forecast

Ogni mese, il forecast si ricostruisce partendo dal **consuntivo cumulato** + **previsione dei mesi residui**. La previsione dei mesi residui usa:

- Il backlog aggiornato (cantieri in essere)
- La pipeline aggiornata (opportunità con probabilità)
- Eventi noti che impatteranno (es. ferie estive, scadenze fiscali)
- Aggiustamenti per scostamenti già rilevati nei primi mesi

## Differenza budget vs forecast

| Aspetto | Budget | Forecast |
|---|---|---|
| Periodicità revisione | Annuale | Mensile |
| Funzione | Target / motivazione | Vista realistica |
| Cosa cambia | Niente, è fissato | Si aggiorna ad ogni revisione |
| Confronto | Consuntivo vs budget | Forecast vs forecast precedente |

I due coesistono: il budget resta come riferimento (cosa avevamo deciso), il forecast aggiorna l'aspettativa (cosa pensiamo accadrà oggi).

## Output tipico

| Voce | Cons. M1-M5 | Forecast M6-M12 | Totale anno | Budget anno | Δ |
|---|---|---|---|---|---|
| Fatturato | 1.450k | 1.880k | 3.330k | 3.500k | -170k |
| Costi diretti | 1.150k | 1.530k | 2.680k | 2.800k | -120k |
| EBITDA | 220k | 240k | 460k | 510k | -50k |

Lo scostamento finale (-50k EBITDA) attiva la conversazione: cosa fare per recuperare? È accettabile?

## Aggiornamento e disciplina

Tempi: il forecast del mese N si chiude entro il 10 del mese N+1.

Responsabili:
- Controller: costruisce
- Direzione finanziaria: valida
- Direzione commerciale: aggiorna pipeline
- CEO/Imprenditore: review finale

Senza disciplina di tempi, il forecast diventa "il consuntivo dei 3 mesi precedenti": inutile per decidere.

## Errori tipici

1. **Forecast = consuntivo del mese**: si ricalcolano cifre già note senza aggiornare le previsioni residue.
2. **Pipeline non aggiornata**: si copia il valore del mese precedente perché "tanto cambia poco".
3. **Forecast solo top-line**: si proietta il fatturato ma non i costi corrispondenti.
4. **Una sola persona**: senza coinvolgere commerciale e operations, il forecast è cieco.

## Strumenti

Modelli Excel collegati al gestionale (export consuntivo, input pipeline) sono lo standard per imprese < 10M. Software dedicati per imprese più grandi.
