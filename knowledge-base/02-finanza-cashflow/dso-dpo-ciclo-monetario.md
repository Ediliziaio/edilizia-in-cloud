---
area: 02-finanza-cashflow
titolo: DSO, DPO e ciclo monetario
tags: [dso, dpo, ciclo-monetario, capitale-circolante, incassi, pagamenti, liquidita]
livello: intermedio
applicabile_a: [tutte-imprese-edili, gestione-finanziaria, rapporto-banca]
kpi_correlati: [dso-clienti, dpo-fornitori, ciclo-monetario, capitale-circolante]
versione: 1.0
aggiornato_il: 2026-05-04
---

# DSO, DPO e ciclo monetario — la matematica della cassa

Tre numeri spiegano se la tua azienda incassa prima di pagare o paga prima di incassare. Sono il **DSO**, il **DPO** e — derivato da loro — il **ciclo monetario**. Se il ciclo monetario è troppo lungo, l'azienda finanzia clienti e produzione con il proprio capitale, oppure con il debito bancario, oppure (peggio) con i debiti verso fornitori e fisco.

## DSO — Days Sales Outstanding

È il numero medio di giorni che passano tra l'emissione di una fattura e il suo incasso.

**Formula base**:
```
DSO = (Crediti vs clienti / Fatturato annuo) × 365
```

Esempio: impresa edile con € 2.400.000 di fatturato annuo, € 600.000 di crediti vs clienti a fine anno.
DSO = (600.000 / 2.400.000) × 365 = **91 giorni**.

**Range tipici per impresa edile italiana**:

| Tipo cliente | DSO tipico |
|---|---|
| Privato consumatore con bonus fiscali | 30-60 gg |
| Privato cantiere senza bonus | 60-90 gg |
| Imprese private medie | 60-90 gg |
| Grandi committenti privati | 90-120 gg |
| Pubblica amministrazione | 90-180 gg |
| Subappalti da imprese edili | 120-180 gg |

Un DSO sopra i 120 giorni è critico: l'impresa sta finanziando i clienti per 4 mesi, e questo costa.

## DPO — Days Payable Outstanding

È il numero medio di giorni che passano tra l'arrivo di una fattura passiva (fornitore) e il suo pagamento.

**Formula base**:
```
DPO = (Debiti vs fornitori / Acquisti annui) × 365
```

Esempio: impresa con € 1.200.000 di acquisti, € 200.000 di debiti vs fornitori.
DPO = (200.000 / 1.200.000) × 365 = **61 giorni**.

**Range tipici**:

| Tipo fornitore | DPO tipico in edilizia |
|---|---|
| Materiali standard (ferramenta, calcestruzzo) | 30-60 gg |
| Materiali speciali su ordine | 60-90 gg |
| Subappaltatori | 60-120 gg |
| Noleggi | 30-60 gg |
| Consulenze tecniche | 60-90 gg |

Un DPO superiore a 120 giorni segnala che l'azienda sta usando i fornitori come banca. Conseguenze: contestazioni, blocco forniture, addebito interessi di mora.

## Ciclo monetario — il numero che conta

```
Ciclo monetario = DSO + Giorni di magazzino - DPO
```

In edilizia il magazzino è basso (i materiali si comprano per cantiere), quindi una versione semplificata:

```
Ciclo monetario ≈ DSO − DPO
```

**Interpretazione**:
- Ciclo positivo: l'azienda paga prima di incassare. Serve **capitale circolante** per coprire il gap. Sopra 30 giorni di ciclo positivo, serve liquidità o debito a breve.
- Ciclo negativo: l'azienda incassa prima di pagare. Tipico delle distribuzioni cash (es. ristorazione). In edilizia è raro.
- Ciclo zero: equilibrio. Possibile in alcune nicchie con anticipi clienti consistenti.

**Esempio impresa edile media**:
- DSO: 90 gg
- DPO: 60 gg
- Ciclo monetario: **30 gg**

Significa: per ogni giorno di lavoro, devi avere in cassa 30 giorni di costi anticipati. Su un costo operativo di € 6.000/giorno, servono € 180.000 di capitale circolante.

## Calcolo del fabbisogno di capitale circolante

```
Capitale circolante necessario = Costo operativo giornaliero × Ciclo monetario in giorni
```

Esempio:
- Fatturato annuo: € 3.000.000
- Costo operativo annuo: € 2.700.000 (90% del fatturato)
- Costo giornaliero: € 7.400
- Ciclo monetario: 45 gg
- Capitale circolante necessario: 7.400 × 45 = **€ 333.000**

Questi 333.000 € l'impresa li deve avere o in cassa propria o in fido bancario. Se non ce li ha, sta finanziando le operazioni con i debiti verso fornitori e fisco — strategia che funziona finché non scoppia.

## Migliorare il DSO — i 6 leveraggi

1. **Acconto in fattura iniziale** — 10-30% all'avvio. Riduce drasticamente il DSO medio dei clienti.
2. **SAL frequenti** — mensili invece di trimestrali. Il fatturato si distribuisce, gli incassi si accelerano.
3. **Termini di pagamento più stretti** — 30 gg invece di 60-90. Negoziabile in fase di offerta, soprattutto se il cliente ha forte fabbisogno di te.
4. **Scadenza certa, non "fine mese ricezione fattura"** — il "FMR" allunga di 15-20 giorni in media.
5. **Sollecito proattivo** — chiamata 5 giorni prima della scadenza, non dopo. Riduce ritardi del 30-40%.
6. **Solleciti escalation** — 3-7-15 gg, da soft a duro, con PEC e diffida formale. Senza escalation programmata, il cliente ritarda all'infinito.

## Migliorare il DPO — i 4 leveraggi

1. **Accordi quadro con fornitori** — termini standard 60-90 gg per il volume annuo.
2. **Pagamenti programmati** — rispetta sempre la scadenza concordata, mai oltre. Costruisci affidabilità per chiedere termini lunghi.
3. **Sconti commerciali per pagamento anticipato** (es. -2% per pagamento a 30 gg invece di 90). Conviene **solo** se il rendimento del capitale circolante alternativo è inferiore al rendimento implicito dello sconto. Lo sconto del 2% per anticipare di 60 giorni equivale ad un tasso annuo del ~12%: se la banca ti finanzia al 6%, accetta lo sconto e paga prima.
4. **Concentrazione fornitori** — meno fornitori, volumi più alti, più potere negoziale.

## Trappola del ciclo monetario "espandente"

In fase di crescita rapida, il ciclo monetario peggiora prima di migliorare. Esempio:

- Anno 0: fatturato 1M, DSO 60, DPO 60, ciclo 0, CC necessario zero.
- Anno 1: fatturato 2M, DSO 75 (clienti più grossi pagano più tardi), DPO 60 (fornitori non si fidano ad allungare), ciclo 15.
- CC necessario: € 75.000 in più rispetto all'anno prima.

Se cresci e non hai capitale o fido per coprire l'extra, vai in tensione. Molte imprese edili **falliscono crescendo**: ordini in aumento, marginalità in aumento, ma cassa in deflazione. Si chiama crisi di crescita.

## Calcolo settimanale operativo

Ogni venerdì, l'imprenditore (o l'amministrativo) calcola:

| Voce | Settimana |
|---|---|
| Crediti vs clienti scaduti | Lista per anzianità |
| Crediti vs clienti a scadere prossimi 30 gg | Lista per data |
| Debiti vs fornitori scaduti | Lista per priorità |
| Debiti vs fornitori a scadere prossimi 30 gg | Lista per data |
| Cassa attuale | Saldo banche + cassa |
| Cassa prevista a 30/60/90 gg | Proiezione |

Strumenti come EiC permettono di vedere tutto questo in dashboard, senza fogli Excel manuali che si aggiornano una volta al mese.

## Cosa fare se il ciclo monetario è troppo lungo

Hai 4 leve:

1. **Ridurre DSO** (incassare prima): vedi sopra.
2. **Aumentare DPO** (pagare dopo): vedi sopra. Limite: non rovinare il rapporto con i fornitori chiave.
3. **Ridurre intensità di capitale**: meno mezzi di proprietà, più noleggio. Trasferisce capitale immobilizzato a costo operativo.
4. **Aumentare il fido bancario**: scelta veloce ma costosa. Sempre come ponte, mai come soluzione strutturale.

Ridurre il ciclo monetario di 10 giorni su un'impresa da € 3M libera ~€ 80.000 di capitale. È una manovra che vale **un'assunzione qualificata** o **l'acquisto di un mezzo**.

## KPI mensili da monitorare

- DSO medio mese (giorni)
- DSO ponderato per cliente principale (i 5 clienti più grandi)
- DPO medio mese
- Ciclo monetario
- Capitale circolante netto (CC effettivo)
- % crediti scaduti / totale crediti
- Insoluti dell'anno / fatturato

Trend di 6-12 mesi sono più importanti del valore puntuale: l'azione si valuta sulla direzione, non sul singolo mese.
