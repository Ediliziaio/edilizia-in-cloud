---
area: 09-tecnologie-digitalizzazione
titolo: Business Intelligence e dashboard direzionali
tags: [bi, dashboard, kpi, looker-studio, power-bi]
livello: avanzato
applicabile_a: [direzione, controller]
kpi_correlati: [tempo-decisionale, accuratezza-decisioni]
versione: 1.0
aggiornato_il: 2026-05-05
---

# Business Intelligence — dashboard che fanno decidere

La BI trasforma dati grezzi (da ERP, CRM, app cantiere, banca) in **dashboard** consultabili: una pagina dove vedi i KPI principali, trend, allarmi. Per un'impresa edile strutturata è la differenza tra "decidere a sentimento" e "decidere su evidenze".

## Cosa è una dashboard

Un cruscotto digitale che aggrega:
- KPI numerici (fatturato, EBITDA, cassa, margini)
- Grafici di trend (settimanale, mensile, annuale)
- Comparazioni (target vs actual, anno corrente vs precedente)
- Allerta su soglie critiche
- Drill-down (cliccare sul numero per vedere il dettaglio)

Aggiornata automaticamente da fonti dati (ERP, CRM, banca, app cantiere).

## Le 3 dashboard tipiche per impresa edile

**1. Dashboard Direzione (CEO/CFO)**
Vista alta livello, mensile/trimestrale:
- Fatturato YTD e trend
- EBITDA assoluto e %
- Cassa attuale e proiezione 90 giorni
- PFN / EBITDA
- Top 5 cantieri per margine e fatturato
- Pipeline commerciale ponderata

**2. Dashboard Operations**
Vista operativa, settimanale:
- Cantieri attivi con % completamento e margine corrente
- Scostamenti budget vs consuntivo
- KPI cantiere (produttività, scarti, infortuni)
- Pipeline SAL (cosa fattureremo nelle prossime 4 settimane)
- Top 5 problemi aperti

**3. Dashboard Commerciale**
Vista per il responsabile vendite, settimanale:
- Pipeline per fase
- Lead della settimana per fonte
- Tasso conversione per ogni fase
- CAC per canale
- Forecast mese in chiusura

## Strumenti per costruire BI

**Gratuiti / low-cost**:
- **Looker Studio** (ex Google Data Studio): gratuito, integrazione Google nativa
- **Microsoft Power BI Desktop**: gratuito su PC, Pro per condivisione (~10 €/mese/utente)
- **Metabase open source**: self-hosted, gratuito

**Premium**:
- **Power BI Pro/Premium**: 10-20 €/mese per utente
- **Tableau**: 70-200 €/mese per utente
- **Qlik Sense**: enterprise, 200+ €/mese

**Soluzioni native**:
- Dashboard incluse nei moduli BI di gestionali edili (EiC ha dashboard native)

Per impresa edile media: Looker Studio o Power BI sono i più indicati.

## Le sorgenti dati

Una BI vera è alimentata da più fonti:

- **Database ERP**: contabilità, cantieri, fatturato
- **CRM**: lead, opportunità, pipeline
- **App cantiere**: ore lavorate, presenze
- **Banca**: estratti conto, saldi
- **Marketing tools**: Google Analytics, Meta, Mailchimp
- **Excel/Sheets**: dati di area che non sono ancora in sistemi

Connessioni:
- **Native** (es. Looker Studio + Google Sheets): semplici
- **API** (es. Power BI + ERP via API): più robuste
- **ETL/middleware** (es. Zapier, Make, Power Query): per trasformare e collegare

## Costruire la prima dashboard

**Step 1**: definire i 5-8 KPI critici per la direzione
**Step 2**: identificare le sorgenti dati per ciascuno
**Step 3**: pulire e standardizzare i dati (qui sta il 60% del lavoro)
**Step 4**: connettere lo strumento BI alle fonti
**Step 5**: costruire visualizzazioni
**Step 6**: condividere con utenti chiave
**Step 7**: iterare in base ai feedback

Tempi tipici per prima dashboard funzionante: 4-12 settimane.

## La sfida della "qualità dati"

BI funziona solo se i dati sono buoni. Problemi tipici:
- ERP con anagrafiche duplicate o incomplete
- Dati mancanti (es. cantieri senza data inizio/fine)
- Convenzioni di nomenclatura disomogenee
- Errori di imputazione costi
- Sistemi disconnessi che non si parlano

Prima di costruire la BI, **investire nella qualità dati**. Senza, dashboard mostra numeri sbagliati e perde credibilità.

## Self-service BI vs analisti dedicati

**Self-service**: ogni manager si fa la propria vista. Strumenti pensati per essere usati da non tecnici.
- Pro: velocità, autonomia
- Contro: rischio di analisi superficiali, duplicazione

**Analisti dedicati** (controller, data analyst): figura specializzata costruisce le viste.
- Pro: rigore, standardizzazione
- Contro: costo, eventuale collo di bottiglia

Soluzione mista: 1 analista dedicato + manager che fanno self-service per analisi quotidiane.

## Errori frequenti

1. **Dashboard "decorative"**: belle ma inutili. Servono per decidere, non per impressionare.
2. **Troppi KPI**: 50 numeri = nessuno guardato. Massimo 10-15 per dashboard.
3. **Niente target**: il numero solo non dice se è buono o cattivo.
4. **Dati non aggiornati**: dashboard di 6 settimane fa = inutile.
5. **Niente azione collegata**: si vede il problema ma non si interviene.
6. **Dashboard non condivise**: solo l'analista le vede, la direzione resta cieca.

## Rituali di lettura

Le dashboard funzionano se vengono usate. Rituali tipici:

- **Lunedì mattina**: review settimanale operations 30 min
- **Primo del mese**: review mensile direzione 2 ore
- **Trimestrale**: deep dive con analisi di scostamenti e azioni 1/2 giornata
- **Annuale**: revisione strategica con benchmark settoriali

Senza rituali, le dashboard si aprono "quando ho tempo" → mai.

## Investimento

Per impresa edile media:
- Software BI: 0-300 €/mese (gratuito è spesso sufficiente)
- Integrazione dati e setup iniziale: 5.000-25.000 €
- Analista dedicato (se internalizzato): 35-60k €/anno
- Consulente esterno BI: 1.500-6.000 €/mese (per progetti)

ROI: difficile da quantificare puntualmente, ma decisioni basate su dati riducono errori del 30-50% sulle scelte strategiche e operative.

## La direzione del settore

Tendenze 2026+:
- **AI generativa** integrata nelle dashboard (chiedere "perché il margine è sceso a marzo" e ricevere analisi automatica)
- **Predictive analytics**: previsioni automatiche basate su storico
- **Anomaly detection**: allerta automatica su scostamenti anomali
- **Mobile-first**: dashboard ottimizzate per smartphone, perfette per il titolare in mobilità
- **Real-time**: dati che si aggiornano in continua, non quotidianamente

Le imprese che adottano queste evoluzioni costruiscono il "cervello digitale" del business — esattamente l'evoluzione naturale del Cervello Supremo di EiC.
