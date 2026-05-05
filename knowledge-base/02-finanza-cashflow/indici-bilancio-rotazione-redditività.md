---
area: 02-finanza-cashflow
titolo: Indici di bilancio — rotazione e redditività
tags: [indici, redditivita, rotazione, roe, roi, leverage, dupont]
livello: avanzato
applicabile_a: [analisi-bilancio, valutazione-azienda]
kpi_correlati: [roe, roi, ros, asset-turnover, leverage]
versione: 1.0
aggiornato_il: 2026-05-04
---

# Indici di rotazione e redditività — analisi avanzata

Per chi vuole leggere il bilancio in modo professionale, gli indici di redditività e rotazione sono il livello successivo dopo gli indicatori base (`kpi-finanziari-edilizia.md`). Sono utili per benchmarking, valutazione d'azienda, analisi acquisizioni.

## ROE — Return On Equity

```
ROE = Utile Netto / Patrimonio Netto × 100
```

Misura il rendimento per i soci. Range tipico edilizia ben gestita: 8-15%. Sotto il 5% = remunerazione del capitale insufficiente. Sopra il 20% = rendimento alto, da capire se sostenibile o frutto di leverage.

## ROI — Return On Investment

```
ROI = EBIT / Capitale Investito Netto × 100
```

CIN = Patrimonio Netto + PFN. Misura quanto rende il capitale complessivo investito.

Range tipico: 5-12%. Se inferiore al **costo medio del debito**, l'azienda distrugge valore: ogni euro investito rende meno di quanto costa finanziarlo.

## ROS — Return On Sales

```
ROS = EBIT / Ricavi × 100
```

Già visto. Combinato col ROI dà la formula di scomposizione DuPont:

```
ROI = ROS × Asset Turnover
```

Asset Turnover = Ricavi / Capitale Investito Netto

Significa: il ROI nasce dalla **redditività delle vendite** moltiplicata per la **velocità di rotazione del capitale**.

In edilizia, l'asset turnover è basso (0,5-1,5) per via dell'intensità di capitale e del ciclo monetario lungo. Per migliorare il ROI, le leve sono o aumentare ROS (margini), o aumentare l'asset turnover (cassa più rapida, meno LIC).

## DuPont esteso — il leverage entra in gioco

```
ROE = ROS × Asset Turnover × Equity Multiplier
```

Equity Multiplier = Totale Attivo / Patrimonio Netto

Il leverage finanziario amplifica il ROE: più debito → ROE più alto a parità di ROS e turnover. Ma anche più rischio.

In edilizia, leverage tipici: 3-5. Sopra 6 = sotto-capitalizzazione, ROE alto solo per leverage e fragile.

## Indici di rotazione

**Rotazione del capitale circolante**:
```
Ricavi / CCN
```
Più alto = capitale che gira veloce. Tipico edilizia: 3-5 volte/anno.

**Rotazione dei crediti**:
```
Ricavi / Crediti vs clienti = 365 / DSO
```
Più alto = clienti che pagano più rapidamente.

**Rotazione delle scorte**:
```
Costo del venduto / Magazzino
```
In edilizia poco rilevante (magazzino basso). Più importante in produzione.

## Leverage operativo — rischio di volatilità

```
Leva operativa = Margine di Contribuzione / EBIT
```

Misura quanto un cambiamento percentuale dei ricavi si amplifica sull'EBIT. In edilizia con costi fissi alti (mezzi, struttura), la leva operativa può essere 2-4: una caduta dei ricavi del 10% causa una caduta dell'EBIT del 20-40%.

Per ridurre la leva operativa, l'impresa "asset-light" (più subappalti e noleggi, meno mezzi propri e personale stabile) ha vantaggi nelle fasi di crisi.

## Composizione del costo medio del debito

```
Costo medio debito = Oneri finanziari netti / PFN media
```

Range: 4-8% in regime ordinario. Sopra il 10% = condizioni penalizzanti, da rinegoziare.

Confronto con il **WACC** (costo medio ponderato del capitale): se il WACC è al 7% e il ROI è al 9%, l'azienda crea valore. Se ROI < WACC, distrugge valore.

## Indici per valutazione d'azienda

Quando si valuta un'azienda (acquisizione, ingresso socio, eredità), gli indici principali:

- **EV/EBITDA**: enterprise value / EBITDA. Multiplo tipico edilizia: 4-7×.
- **P/E**: prezzo / utile per azione. Per imprese non quotate, applicato al PN.
- **EV/Sales**: enterprise value / fatturato. Tipico: 0,3-0,7× in edilizia.
- **Price to Book Value**: prezzo / patrimonio netto. Tipico: 0,8-1,5×.

Una valutazione corretta combina più metodi:
- Patrimoniale (riferito al PN rivalutato)
- Reddituale (multiplo del reddito normalizzato)
- Finanziario (DCF — Discounted Cash Flow)
- Multipli di mercato (transazioni comparabili)

## Indici prospettici — analisi del piano industriale

In valutazione di un piano:

- **CAGR fatturato** (Compound Annual Growth Rate): tasso di crescita composto annuo. Edilizia in espansione: 8-15%. Sotto 3% = stagnazione.
- **EBITDA attualizzato**: somma di EBITDA prospettici scontati al costo del capitale.
- **Cash Conversion Cycle prospettico**: come evolverà il CCN.
- **Sensitivity analysis**: variazioni del valore aziendale al variare di parametri chiave (volume, prezzo, costi).

## Errori comuni nell'uso degli indici

1. **Calcolarli su valori puntuali** (fine esercizio) invece che su medie del periodo: distorce.
2. **Non normalizzare**: poste straordinarie (plusvalenze, contenziosi chiusi, ammortamenti accelerati) gonfiano o riducono i numeri.
3. **Ignorare il settore**: ROE 10% è eccellente in utility, scarso in software. Confronta con peer di settore.
4. **Indici senza trend**: il valore dell'anno corrente serve poco senza confronto con i 3 anni precedenti.
5. **Sovrastimare la precisione**: un ROI 8,3% e uno 8,7% sono praticamente uguali. Non fare scelte su decimali.

## Strumenti di benchmarking

- Bilanci depositati di concorrenti (Camere di Commercio)
- Studi di settore di associazioni (ANCE, Confartigianato Costruzioni)
- Database commerciali (Cerved, Crif, Mint Italy)
- Software di analisi di bilancio integrati nei gestionali (alcune offerte includono benchmark di settore)

L'indice in sé non risponde mai a una decisione operativa: dà la base per le **giuste domande**. La risposta arriva dal contesto.
