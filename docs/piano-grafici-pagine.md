# Piano grafici delle pagine (14/11/2026)

Il titolare vuole grafici più belli, animazioni d'ingresso, cornici curate e
KPI in evidenza, nello stile dei due esempi concordati: «line-charts-9» (area
sfumata, fondo a puntini, linea con ombra, massimo e minimo evidenziati,
tooltip a scheda, riga alto/basso/variazione) e «advanced-stats» (grafico
grande in cornice, colonna con un riquadro scuro «obiettivo», KPI con la
variazione verde/rossa, comparsa a cascata).

Non lo stesso grafico ovunque: a ogni pagina i grafici e i numeri che servono
a lei.

## Regole per tutte le pagine

- **Solo dati veri.** Niente serie inventate. Euro e italiano da cantiere. Se un
  confronto non regge (anno in corso con i costi già programmati, appuntamenti
  ancora senza esito), la pillola della variazione non si mostra.
- **Pezzi comuni**, in `src/components/charts/grafici/comune.tsx`:
  - `defsGrafico`: sfumature, puntini, ombra.
  - `TooltipScheda`.
  - `Comparsa`: entrata a cascata.
  - `PillolaVariazione`: `%`, oppure `pt` per le percentuali; variante `suScuro` per i fondi scuri.
  - `StatGrafico`.
  - `COLORI_GRAFICO`, sulle variabili `--chart-N`.
- **Grafici pronti**, in `src/components/charts/grafici/`: `GraficoAndamento` e `GraficoRicaviCosti`.
- **Riquadro dei numeri**: `RiquadroNumero` ha la tendenza con area e la variazione.
- **Movimento:** `usePreferisceMenoMovimento` più le classi `motion-safe:`. Le barre e gli anelli crescono con CSS (`cg-barra-cresce`, `tendenza-traccia`, `anello-riempie`): con «riduci movimento» compaiono già fermi.
- **Telefono:** niente recharts sotto i 768 px (regola del progetto). Al loro posto i due o tre numeri che contano, e le query che servono solo ai grafici sono spente.
- **Tema scuro:** colori del tema (`bg-card`, `text-muted-foreground`, `border`), mai `bg-white` o `slate-*` fissi. La conversione meccanica sta in uno script sed, applicato file per file e poi controllato a video.
- Non esiste `src/components/ui/chart.tsx` (il ChartContainer di shadcn): si usa recharts 3 direttamente, con i pezzi comuni qui sopra. `card`, `button` e `badge` restano quelli del progetto.
- **Verifica di ogni lotto:**
  - a video, desktop 1440 e telefono 375, chiaro e scuro, con i dati veri di Demo Azienda 2 letti in sola lettura;
  - `npm run typecheck:ci`;
  - i test delle pagine toccate;
  - poi la pubblicazione su `main`.

## Pagine già fatte (lotto 0, su main)

| Pagina | Commit | Cosa è cambiato |
| --- | --- | --- |
| `/azienda/controllo-gestione` | 314bc0ec6 | Vedi nota 1 sotto la tabella. |
| `/azienda/cruscotto/aziendale` | 315c91da0 | «Venduto, incassato e cassa» con i totali dei 12 mesi, l'area sotto il venduto e le barre della cassa sfumate. Pillola della variazione su venduto e incassato. Obiettivo del mese in riquadro scuro. Pareggio e scadenze nello stesso stile. Testata e tooltip nel tema. |
| `/azienda` (Panoramica operativa) | ae1e0c8c8 | Nuovo «Carico dei prossimi 7 giorni»: barre impilate di lavori, consegne e appuntamenti. Tendenza giorno per giorno nei riquadri. Tema scuro. |
| `/azienda/marketing` | 85956e53e | Pillole della variazione nel quadro commerciale. Totali dei 12 mesi sopra «Lead, appuntamenti e contratti». Dashboard nel tema scuro. |
| `/azienda/call-center` | 326ea7ae3 | Vedi nota 2 sotto la tabella. |

1. **Controllo di gestione:**
   - KPI con la variazione sull'anno prima;
   - «Cassa prevista» in stile line-charts-9;
   - riquadro scuro con l'obiettivo (budget o pareggio);
   - cantieri;
   - «Ricavi e costi mese per mese»;
   - grafici di pareggio e del piano industriale nello stesso stile.
2. **Call center:**
   - percorso «dalla chiamata all'appuntamento»;
   - anelli delle percentuali;
   - variazione sullo stesso numero di giorni subito prima.

## Lotto 1: la cassa futura (2 pagine, un solo motore)

### `/azienda/previsionale` e `/azienda/tesoreria?tab=previsioni`

**Oggi**

Le due pagine sono lo **stesso componente**, `CashFlowForecast` → `ForecastWorkspace`, con lo stesso motore (`useForecastLedger` → `loadForecastDataset` → `projectForecast`). Parole e serie coincidono già.

Mostrano:
- quattro `Metric`: disponibilità oggi, punto più basso, ti mancano, incassi scaduti;
- il riquadro del rischio;
- `ForecastCashChart`: area «a gradini» del saldo, linea tratteggiata «senza stime», soglia, zero, punto più basso, e un secondo grafico con le barre incassi/uscite;
- le schede Scenari, Settimane, Movimenti, Da sistemare.

Dentro Tesoreria la pagina ha **due titoli**: la testata di Tesoreria più l'`<h1>` «Previsionale di cassa». La testata di Tesoreria ha 14 colori fissi chiari. In `ForecastCashChart` l'arancione è scritto a mano (`#f97316`).

**Cosa si fa** (una modifica sola, che vale per entrambe; la coerenza è garantita dal componente unico):
- **`ForecastCashChart` nello stile line-charts-9.**
  - Fondo a puntini, linea del saldo con ombra, area sfumata.
  - Punto più basso e più alto evidenziati, ognuno con la data.
  - Tooltip a scheda con il saldo e la differenza dal punto prima.
  - Sopra il grafico la riga «più alto / più basso / a fine orizzonte», con la pillola rispetto a oggi.
  - Colori dal tema: uscite su `--chart-5`, incassi su `--chart-2`.
- **Barre incassi/uscite:** sfumate, arrotondate, con lo zero nel colore del bordo.
- **I quattro `Metric` diventano `RiquadroNumero`:**
  - stato per colore (rosso se si va sotto la soglia);
  - tendenza della cassa sulle prossime settimane (`forecastWeeks`) nel riquadro «Disponibilità oggi»;
  - gli altri tre riquadri restano senza tendenza.
- **Riquadro scuro «Copertura fino al punto più basso»** (stile advanced-stats): barra di quanto la cassa di oggi copre le uscite fino al minimo, e la data in cui si torna sopra la soglia.
- **Dentro Tesoreria:** il titolo interno sparisce (resta quello di Tesoreria) e la testata di Tesoreria passa ai colori del tema.
- **Telefono:**
  - Previsionale: tre numeri (oggi, minimo con la data, fine orizzonte) al posto dei grafici.
  - La scheda Previsioni di Tesoreria resta nascosta sul telefono, com'è oggi.

### `/azienda/analisi-acquisti`

**Oggi**
- Quattro KpiCard: Ordinato e Fatturato con la variazione sull'anno prima, Scaduto, In scadenza 30 gg.
- Barre «Spesa mese per mese», quest'anno contro l'anno prima.
- Primi 5 fornitori e prime 5 commesse.
- Le schede Fornitori, Commesse, Prezzi, Scadenze.
- Già nei colori del tema. Le categorie (`categorie[]`) ci sono nei dati ma non sono disegnate.

**Cosa si fa**
- **Spesa mese per mese:**
  - le barre dell'anno prima diventano un'area sfumata dietro, quelle di quest'anno restano barre sfumate;
  - sopra, la riga «mese più caro / totale / rispetto all'anno prima», da `mesi[]` e `totali.annoPrima`.
- **Nuovo «Dove va la spesa»:** ciambella per categoria (`categorie[]`, fatturato) con la legenda in euro e percentuale; accanto, barre orizzontali dei primi 5 fornitori con la quota sul totale.
- **Nuovo riquadro scuro «Da pagare»:**
  - scaduto e in scadenza a 30 giorni, sul totale fatturato;
  - barra che cresce;
  - collegamento alla scheda Scadenze.
- **KpiCard:** pillola della variazione nello stile comune, comparsa a cascata.
- **Telefono:** i quattro numeri e i primi 5 fornitori in lista, senza grafici.

### Cosa è cambiato rispetto al piano (lotto 1, fatto)

- **Previsionale, riquadro scuro «Copertura»:** non fatto. Il riquadro del rischio, che c'è già, dice la data del minimo, i giorni sotto la soglia e il rientro: un secondo riquadro avrebbe ripetuto le stesse cose.
- **Previsionale, tendenza in «Disponibilità oggi»:** non fatta. Al suo posto la riga sopra il grafico dice «più alto / più basso / rispetto a oggi». Il «Punto più basso» ha la pillola rispetto alla disponibilità di oggi.
- **Previsionale sul telefono:** il grafico della cassa resta com'era, perché è il contenuto della pagina ed era già fatto per il telefono. I quattro riquadri vanno due per riga.
- **Analisi acquisti, «Dove va la spesa»:** ciambella dell'ordinato per categoria, e accanto le stesse categorie in barre con l'importo e la quota (fanno da legenda). I primi fornitori in barre no, perché sono già nella tabella subito sotto.
- **Analisi acquisti, riquadro scuro «Da pagare entro 30 giorni»:** scaduto e prossimi 30 giorni in una barra divisa, più «Chi aspetta di più» (i fornitori con lo scaduto più alto).
- **Analisi acquisti, variazione della spesa sull'anno prima:** pillola grigia, perché una spesa che sale non è né un bene né un male.
- **KpiCard (usata in undici pagine):** passa ai colori del tema e ha la pillola della variazione.

## Lotto 2: costi e contabilità (2 pagine)

### `/azienda/costi`

**Oggi**
- Cinque schede.
- **Panoramica:**
  - tre `NavyStatCard`: totale con la variazione sul periodo prima, pagato, da pagare;
  - ripartizione per voce;
  - andamento a 12 mesi (barre personale/altro più una linea, con l'arancione e il grigio fissi).
- **Personale:** riquadro scuro, tabelle, niente grafici, 48 colori fissi.
- **Spese fisse/variabili:** riquadri, grafico «Andamento 12 mesi», tabella.
- **Pianificazione:**
  - «Situazione {anno}»;
  - distribuzione mensile;
  - torta per categoria;
  - tendenza dei fissi in percentuale;
  - «Budget vs Effettivo» (`cost_budgets`).
- Più di 110 colori fissi chiari in tutto.

**Cosa si fa**
- **Panoramica:**
  - andamento a 12 mesi con barre impilate sfumate, linea del totale con ombra e fondo a puntini;
  - sopra, la riga «mese più caro / media / ultimo mese contro la media»;
  - la ripartizione per voce diventa barre orizzontali con la quota;
  - i tre riquadri diventano `RiquadroNumero` con la pillola (totale contro il periodo prima) e la tendenza dei 12 mesi.
- **Budget:** riquadro scuro «Budget dell'anno» con speso contro budget (`cost_budgets` contro l'effettivo), barra che cresce e categorie fuori budget in rosso.
- **Pianificazione:**
  - torta → ciambella;
  - «Budget vs Effettivo» con le barre affiancate sfumate e lo scostamento nel tooltip;
  - tendenza dei fissi come area sfumata.
- **Personale:** barre orizzontali del costo per commessa (dalla tabella che c'è già) e una ciambella ore ordinarie/straordinari.
- **Tema scuro:**
  - CostsOverviewTab;
  - PersonnelCostsTab;
  - CompanyCostsManager;
  - CostsStatsCards;
  - testata «Costi Aziendali».
- **Telefono:** come oggi, solo Panoramica, Fisse e Variabili, con i riquadri e senza grafici.

### `/azienda/contabilita-generale`

**Oggi**
- Sette viste a tabelle: Scritture, Giornale, Mastrini, Liquidazione IVA, Bilancio, Fine anno, Piano dei conti.
- Nessun grafico.
- Il Bilancio ha tre riquadri semplici: attivo, passivo e netto, utile.
- Nessuna gestione del telefono.

**Cosa si fa**
- **Bilancio:**
  - i tre riquadri diventano `RiquadroNumero`, con lo stato per colore (utile o perdita) e la quadratura attivo/passivo;
  - nuovo «Ricavi e costi mese per mese» (`GraficoRicaviCosti`), con i saldi dei conti di ricavo e di costo raggruppati per mese dalla data delle scritture (`saldiPerConto` per mese, nel browser, senza query nuove);
  - nuova ciambella «Com'è fatto l'attivo» e «Com'è fatto il passivo» dalle voci CEE (`bilancioCee`).
- **Liquidazione IVA:** barre per periodo, IVA a debito contro IVA a credito, con il saldo da versare sopra.
- **Scritture:** riga dei numeri (scritture dell'esercizio, da registrare, ultima registrazione).
- **Tema scuro** (5 colori fissi) e **telefono:** viste in un selettore, tabelle che scorrono, niente grafici.

### Cosa è cambiato rispetto al piano (lotto 2, fatto)

- **Costi, riquadro scuro «Budget dell'anno»:** non fatto. Il budget per categoria e mese vive nella scheda Pianificazione, dove «Budget vs Effettivo» ora ha le barre rosse e verdi sfumate; un riquadro annuale avrebbe richiesto una lettura nuova di `cost_budgets` per tutto l'anno.
- **Costi, «Ripartizione per voce»:** era già a barre con la quota, quindi è passata solo ai colori del tema.
- **Costi, torta delle categorie (Pianificazione):** resta una torta con le etichette, perché la ciambella senza etichette chiedeva una legenda nuova; ha il bordo del tema e l'animazione.
- **Personale:** la ciambella ore ordinarie/straordinari è diventata un riquadro scuro con una barra divisa e la saturazione media. Le ore per commessa contano anche gli straordinari.
- **Contabilità, ciambelle di attivo e passivo, barre della Liquidazione IVA e riga dei numeri nelle Scritture:** non fatti in questo lotto. Il Bilancio ha i riquadri e il grafico mensile; restano da fare.
- **Demo Azienda 2** non ha né conti né scritture contabili: il Bilancio è stato provato a video con scritture di prova. I costi invece sono quelli veri, raggruppati per mese.

## Lotto 3: reportistica marketing (3 schede della stessa pagina)

### `/azienda/marketing/reportistica`, scheda CRM e vendite

**Oggi**
- Hero con quattro numeri.
- «Confronto periodo» con mini linee SVG fatte a mano.
- Funnel a barre CSS.
- «Andamento nel tempo»: una linea arancione fissa con il cambio di metrica e di granularità.
- Dettaglio operativo, «Cosa guardare», «Da fare adesso».
- Circa 75 colori fissi chiari: il file peggiore per il tema scuro.
- La pagina ha già i valori del periodo prima (`buildPeriodComparison`) e un obiettivo mensile (`report.forecast.monthlyTargetCents`).

**Cosa si fa**
- **Andamento nel tempo:** `GraficoAndamento`, con area sfumata, puntini, massimo e minimo, e riga alto/basso/variazione sulla metrica scelta. La metrica e la granularità restano come sono.
- **Confronto periodo:** le mini linee passano alla `Tendenza` comune (area più tracciato animato), con la pillola della variazione.
- **Nuovo riquadro scuro «Obiettivo del mese»:** fatturato contro `monthlyTargetCents`, barra che cresce, quanto manca e i giorni rimasti. Si mostra solo se l'obiettivo c'è.
- **Funnel:** barre che crescono a cascata, con la quota sul passaggio prima (come il percorso del Call center).
- **Tema scuro** su tutto il pannello e sulla barra delle schede della pagina.

### `?tab=calls` (Report Call Center)

**Oggi**
- Otto `KPICard` senza il periodo prima.
- Diagnosi operativa (24 colori fissi).
- Lavorazione lead in fasce d'età.
- Trend giornaliero: barre più la linea del tasso, e i giorni della settimana.
- Speed to lead in barre orizzontali.
- Ranking e confronto fatti a mano. Colori hsl fissi.

**Cosa si fa**
- **Variazione sulle otto KPI:** una seconda chiamata a `get_callcenter_kpi_per_operatore` sullo stesso numero di giorni subito prima, come già fa la dashboard Call center. Punti per i tassi, percentuale per i volumi; lo speed to lead più basso è verde.
- **Trend giornaliero:**
  - barre sfumate e linea del tasso con ombra, fondo a puntini;
  - sopra, la riga «giorno migliore / media al giorno / tasso di contatto».
- **Speed to lead:** barre sfumate dal verde (entro 5 minuti) al rosso (oltre un giorno).
- **Anelli** per tasso di contatto e show-up.
- **Tema scuro** nella diagnosi.

### `?tab=venditori` (Performance venditori)

**Oggi**
- Sei KPI già con la variazione.
- Diagnosi (26 colori fissi).
- Scorecard, radar «agente contro media del team», funnel fatto a mano.
- Trend mensile: barre del fatturato più le linee dei tassi.
- Obiettivi per agente e mese (`sales_targets`).

**Cosa si fa**
- **Nuovo riquadro scuro «Obiettivo del team»:**
  - fatturato del periodo contro la somma degli obiettivi (`useObiettiviVenditori`), barra che cresce;
  - sotto, i tre agenti più vicini all'obiettivo e i tre più lontani.
- **Trend mensile:** barre sfumate del fatturato, linee dei tassi con ombra, fondo a puntini, tooltip a scheda. Sopra, la riga «mese migliore / media / ultimo mese contro la media».
- **Radar:** colori del tema e area sfumata.
- **KPI:** pillole della variazione nello stile comune, comparsa a cascata.
- **Tema scuro** in diagnosi e scorecard.

## Ordine

| Lotto | Pagine | Perché in questo ordine |
| --- | --- | --- |
| 0 | Controllo di gestione, Cruscotto, Panoramica, Marketing, Call center | Fatto. |
| 1 | Previsionale + Tesoreria Previsioni, Analisi acquisti | La cassa futura è la domanda più frequente del titolare. Le due pagine vanno insieme perché sono lo stesso componente. |
| 2 | Costi, Contabilità generale | Molti colori fissi (tema scuro rotto). La contabilità oggi non ha nessun grafico. |
| 3 | Reportistica: CRM e vendite, Call center, Venditori | Stessa pagina e stesse regole. La CRM ha il file peggiore per il tema scuro. |

Ogni lotto si pubblica su `main` appena è verde. Prima di pubblicare un lotto
si aggiorna qui la tabella del lotto 0 con il commit.
