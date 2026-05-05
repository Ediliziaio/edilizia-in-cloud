---
area: 03-controllo-gestione
titolo: Analisi degli scostamenti — budget vs consuntivo
tags: [scostamenti, varianza, budget, consuntivo, controllo-cantiere]
livello: intermedio
applicabile_a: [controllo-gestione, cantiere-attivo]
kpi_correlati: [scostamento-totale, scostamento-categoria, accuratezza-previsioni]
versione: 1.0
aggiornato_il: 2026-05-04
---

# Analisi degli scostamenti — capire dove va il margine

In ogni cantiere, prima dell'inizio si fa un **budget di commessa**: quanto costerà ogni voce, quanto ricavi, quanto margine. Mese per mese, si confronta con il consuntivo. Lo **scostamento** è la differenza, e la sua analisi è il cuore del controllo di gestione.

## La struttura dello scostamento

Per ogni voce e per il totale:

```
Scostamento = Consuntivo − Budget
```

Un valore negativo (cons. < budget) per i costi è favorevole; un valore negativo per i ricavi è sfavorevole. Il segno cambia significato in base alla voce.

## Le tre componenti dello scostamento

In analisi avanzata, lo scostamento di una voce di costo si scompone in:

1. **Scostamento di prezzo**: dipende dal costo unitario diverso da quello previsto
   ```
   (Prezzo cons. − Prezzo budget) × Quantità cons.
   ```

2. **Scostamento di quantità**: dipende da quantità diverse da quelle previste
   ```
   Prezzo budget × (Quantità cons. − Quantità budget)
   ```

3. **Scostamento di mix**: in voci aggregate, dipende dalla diversa composizione

Capire **quale componente** genera lo scostamento orienta l'azione: se è prezzo, si negozia con i fornitori; se è quantità, si rivede il computo o la squadra.

## Esempio pratico

Voce "Calcestruzzo C25/30":
- Budget: 100 mc × 140 €/mc = 14.000 €
- Consuntivo: 110 mc × 155 €/mc = 17.050 €
- Scostamento totale: +3.050 € (sfavorevole)

Scomposizione:
- Scostamento prezzo: (155 − 140) × 110 = +1.650 €
- Scostamento quantità: 140 × (110 − 100) = +1.400 €

Sui 3.050 €, 1.650 sono dovuti al prezzo (forse aumento mercato non previsto), 1.400 alla quantità (probabilmente errore di computo o sfrido in cantiere).

## Quando uno scostamento è "significativo"

Soglie tipiche per attivare alert:

| Scostamento | Azione |
|---|---|
| < 3% | Tollerato, monitora trend |
| 3-7% | Investigare, capire la causa |
| 7-15% | Intervento correttivo necessario |
| > 15% | Allerta direzione, rivedere il budget complessivo |

Le soglie possono variare per tipologia di voce: voci piccole tollerano più variabilità, voci grandi hanno soglie più strette.

## Dove cercare le cause

**Costi maggiori del previsto**:
- Materiali: aumenti di mercato, errori di acquisto, sfridi alti, qualità superiore non prevista
- Manodopera: ore extra, livelli più alti, squadra meno produttiva, lavorazioni più complesse del previsto
- Subappalti: rincari, varianti contestate, contenziosi
- Noli: tempi più lunghi del previsto, mezzi più costosi
- Trasporti: lontananza, viaggi multipli, traffico

**Ricavi minori del previsto**:
- Voci non riconosciute dal DL
- Varianti non autorizzate
- Penali applicate
- Riserve non accolte

## Analisi mensile — il workflow

Ogni mese, per ogni cantiere attivo:

1. **Stato avanzamento**: quante voci sono state eseguite e in che %.
2. **Consuntivo costi del mese**: estratto dalla contabilità.
3. **Confronto con budget**: voce per voce, scostamenti.
4. **Top 5 scostamenti**: focus sui maggiori.
5. **Analisi causale**: per ciascun top scostamento, perché?
6. **Azione correttiva**: per ogni causa, cosa si fa.
7. **Aggiornamento previsione finale**: lo scostamento attuale come modificherà il margine finale?

Il risultato è una **tabella di sintesi** condivisa con la direzione e con il capocantiere.

## Cantiere fuori budget — gli interventi

Se a metà cantiere lo scostamento totale supera il 10%:

1. **Riserve formali** per ogni causa esterna (varianti, sospensioni, forniture committente).
2. **Riassetto della squadra**: sostituire operatori non performanti, ottimizzare turni.
3. **Rinegoziazione fornitori**: ricontrattare le forniture residue.
4. **Comunicazione al committente**: in alcuni casi, una variante contrattuale equilibra le posizioni.
5. **Calcolo del minimo di danno**: se proseguire causa ulteriori perdite, valutare strutturazione transattiva.

## Strumenti

Software gestionali (EiC, PriMus, STR Vision) collegano:
- Budget di commessa caricato dal preventivo
- Imputazione automatica dei costi al cantiere
- Confronto budget/consuntivo in dashboard
- Allerta automatica su soglie superate
- Esportazione report mensile

## Errori comuni

1. **Confronto solo a fine cantiere**: il margine si è già perso, l'analisi serve solo come lessons learned.
2. **Budget poco dettagliato**: aggregare troppe voci impedisce di vedere dove si scosta.
3. **Imputazione costi imprecisa**: costi indiretti spalmati senza criterio rendono l'analisi inattendibile.
4. **Analisi senza azione**: capire la causa ma non intervenire = numeri inutili.
5. **Non documentare le cause**: a fine cantiere, "perché abbiamo perso?" non ha risposta.
6. **Analizzare solo i numeri**: senza parlare con il capocantiere, mancano le ragioni operative.

## L'output di valore

Il vero valore dell'analisi non è il singolo cantiere: è il **prezziario aziendale che migliora**. Dopo 12-24 mesi di analisi sistematiche:

- I prezzi unitari interni diventano più precisi
- Le offerte diventano più affidabili
- I cantieri marginano in modo più prevedibile
- L'azienda decide meglio quali lavori prendere e quali rifiutare

Senza analisi, ogni cantiere è una sorpresa. Con analisi, si va con cognizione di causa.
