---
area: 02-finanza-cashflow
titolo: Forecasting finanziario a 90 giorni
tags: [forecast, previsione, rolling-forecast, cassa, scenario]
livello: intermedio
applicabile_a: [direzione-finanziaria, controllo-gestione]
kpi_correlati: [scostamento-forecast, accuratezza-previsione]
versione: 1.0
aggiornato_il: 2026-05-04
---

# Forecasting a 90 giorni — sapere cosa succede prima che succeda

Il forecast finanziario è la previsione strutturata di **ricavi, costi e cassa** per i prossimi 90 giorni (3 mesi), aggiornata ogni settimana o quindici giorni. Diverso dal budget annuale (che è una pianificazione di lungo respiro): è uno strumento operativo per anticipare problemi.

## Le tre prospettive del forecast

**1. Forecast P&L (Profit & Loss)** — proiezione di ricavi e costi
- Ricavi attesi (fatturato + variazione lavori in corso)
- Costi diretti (materiali, manodopera, subappalti)
- Costi operativi
- EBITDA atteso

**2. Forecast Cash Flow** — proiezione degli incassi e dei pagamenti
- Incassi previsti per data
- Uscite previste per data
- Saldo cassa giorno per giorno (o settimana per settimana)

**3. Forecast Backlog** — pipeline commerciale
- Contratti firmati e da firmare
- Probabilità di chiusura per ogni opportunità
- Volume atteso di nuovi ordini

## Costruzione del forecast — metodologia

**Step 1: Baseline storica**
Punto di partenza è la media degli ultimi 12-24 mesi per voce. Es. costo materiali medio mensile, manodopera media, costi struttura.

**Step 2: Aggiungi i fatti certi**
- Cantieri attivi con SAL programmati
- Contratti firmati con date di avvio e milestone
- Contratti di forniture quadro
- Stipendi e contributi mensili
- Rate finanziamenti con scadenze

**Step 3: Aggiungi le opportunità**
- Offerte in fase di chiusura, ponderate per probabilità
- Trattative aperte
- Pipeline commerciale

**Step 4: Aggiungi le ipotesi**
- Variazioni stagionali tipiche del settore
- Eventi noti (es. ferie estive con cantieri ridotti)
- Aumenti annunciati di costi materiali

**Step 5: Validazione e affinamento**
Confronto con il forecast precedente e con il consuntivo: dove sono gli scostamenti? Cosa li ha causati?

## Tre scenari obbligatori

Il forecast non è un singolo numero — sono tre scenari:

- **Scenario Base** (probabilità 60%): ipotesi realistiche, andamento medio.
- **Scenario Pessimistico** (probabilità 20%): ritardo incassi 30-60 gg, perdita di un cantiere previsto, costo materiali +10%.
- **Scenario Ottimistico** (probabilità 20%): incassi puntuali, chiusura di una commessa in trattativa, recupero di un margine.

Ogni scenario produce un forecast cassa proprio. Il **valore decisionale** sta nel pessimistico: se anche nello scenario peggiore l'azienda regge, dormi tranquillo. Se il pessimistico va sotto soglia, **devi agire prima** — non quando lo scenario si è realizzato.

## Frequenza e responsabili

- **Aggiornamento**: settimanale o quindicinale
- **Responsabile costruzione**: controller / responsabile amministrativo
- **Responsabile review**: imprenditore + commercialista (mensile)
- **Tempo richiesto a regime**: 2-4 ore a settimana

A regime, il forecast è alimentato dal sistema gestionale: ogni nuova fattura emessa, ogni SAL, ogni ordine fornitore aggiorna automaticamente la proiezione.

## Come si misura l'accuratezza

```
MAPE (Mean Absolute Percentage Error) = media |Forecast − Consuntivo| / Consuntivo
```

Target di accuratezza:
- Cassa a 4 settimane: MAPE < 5%
- Cassa a 8 settimane: MAPE < 10%
- Cassa a 12 settimane: MAPE < 15%

Se l'accuratezza è peggiore, il forecast è da rivedere come metodologia. Spesso il problema è il forecast incassi: clienti che pagano sempre dopo le previsioni.

## Cosa il forecast permette di fare

1. **Anticipare tensioni di cassa** → attivare leve di gestione (vedi `gestione-liquidita-cashflow.md`)
2. **Scegliere se accettare un nuovo lavoro**: se la cassa prevista è già stretta, un nuovo cantiere senza anticipo aggraverebbe.
3. **Negoziare con la banca da posizione informata**: presentando il forecast in banca, ottieni linee di credito anche in fase preventiva.
4. **Pianificare investimenti**: l'acquisto di un mezzo si fa quando il forecast lo permette, non a sentimento.
5. **Gestire le ferie del personale**: nei mesi previsti di basso lavoro, programmare ferie collettive abbassa il costo del personale "improduttivo".
6. **Anticipare azioni straordinarie**: ricapitalizzazione, ristrutturazione debito, composizione negoziata della crisi (D.Lgs 14/2019).

## Errori frequenti

1. **Forecast "ottimista" sistematico**: chi lo costruisce vuole compiacere il titolare. Risultato: ogni mese il consuntivo è peggio del forecast. Fai costruire il forecast con criteri di prudenza esplicita.
2. **Solo uno scenario**: non considerare il pessimistico significa non vedere il rischio.
3. **Forecast mai confrontato con il consuntivo**: senza il confronto, l'accuratezza non migliora.
4. **Forecast disconnesso dal sistema**: se il forecast è un Excel separato dal gestionale, dopo 3 mesi è obsoleto.
5. **Forecast costruito senza l'imprenditore**: il titolare ha informazioni di pipeline non ancora a sistema. Senza il suo input, il forecast vendite è cieco.

## Output tipico

Un forecast operativo si presenta come dashboard / report con:

- Saldo cassa giornaliero/settimanale prossimi 90 gg, scenari base/pessimo/ottimo
- Ricavi e costi per macro-categoria, mese per mese
- EBITDA atteso mensile
- KPI principali (DSO, DPO, PFN/EBITDA atteso)
- Allerta su soglie critiche (cassa < soglia minima, PFN/EBITDA > soglia)
- Lista azioni proposte per gestire le criticità anticipate

Strumenti come EiC integrano nativamente il forecasting; in alternativa, fogli Excel con macro alimentati da export gestionale (più manutentivi).
