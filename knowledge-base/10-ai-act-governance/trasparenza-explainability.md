---
area: 10-ai-act-governance
titolo: Trasparenza ed explainability dell'AI
tags: [trasparenza, explainability, ai-act-art-50, disclosure]
livello: base
applicabile_a: [comunicazione-utenti, ux-cervello]
kpi_correlati: [comprensibilita-risposte, fiducia-utenti]
versione: 1.0
aggiornato_il: 2026-05-05
---

# Trasparenza ed explainability — l'utente sa con chi parla e perché ha ricevuto quella risposta

L'AI Act art. 50 stabilisce: gli utenti hanno il **diritto di sapere** quando interagiscono con un'AI, e in molti casi di **capire come** il sistema è arrivato a una determinata risposta o decisione.

Per il Cervello Supremo, questo significa due cose:

1. **Trasparenza sull'identità**: l'utente sa che sta parlando con AI, non con persone
2. **Explainability sulle risposte**: l'utente capisce su quali dati e ragionamenti si basa la risposta

## La regola "AI dichiarata"

Ogni interazione del Cervello inizia con identificazione chiara:

> "Ciao, sono il Cervello Supremo di EiC, l'assistente AI della tua impresa. Posso aiutarti su normativa, gestione cantieri, finanza, vendita, tecnologie. Le mie risposte sono basate su dati reali del tuo sistema e su una knowledge base specializzata. Per decisioni critiche, ricorda di validare con il tuo team o con un professionista."

Caratteristiche:
- Identificazione esplicita come AI
- Scope (cosa può fare)
- Disclaimer (limiti)
- Tono accogliente, non burocratico

## Quando esplicitare l'AI

L'utente deve sapere di parlare con AI in tutti i punti di contatto:

✓ **All'apertura della chat**: messaggio di benvenuto chiaro
✓ **Nelle email automatiche**: "Questo messaggio è generato dal Cervello AI di EiC"
✓ **Nei documenti generati**: nota in fondo al documento
✓ **Nelle telefonate vocali (se implementate)**: dichiarazione iniziale
✓ **Nelle decisioni automatiche**: spiegazione che è automatizzata
✓ **Nei contenuti pubblicati** (es. social): etichetta "Generato da AI"

## Le 4 dimensioni dell'explainability

**1. Explainability su cosa**
"Stai chiedendo X, ti rispondo su X usando dati Y."

**2. Explainability su come**
"Per rispondere ho consultato [fonte 1], [fonte 2], [database aziendale tabella X]."

**3. Explainability su perché**
"La conclusione si basa su questi 3 fattori principali..."

**4. Explainability sui limiti**
"Non ho accesso a [Z], quindi non posso garantire completezza su [aspetto specifico]."

## Esempi di risposte trasparenti

**Domanda**: "Quanto cassa avremo a fine mese?"

**Risposta opaca** (errata):
> "Avrete circa 145.000 €."

**Risposta trasparente** (corretta):
> "Sulla base dei dati del tuo sistema EiC al [data corrente]:
> - Cassa attuale: 87.500 €
> - Incassi previsti entro fine mese (3 SAL fatturabili + 2 fatture in scadenza): 124.000 €
> - Uscite previste (stipendi 28/mese, F24 il 16, fornitori in scadenza): 65.500 €
> - Cassa stimata fine mese: 146.000 €
> 
> Nota: la stima si basa sui pagamenti previsti puntuali. Se il cliente [X] (DSO storico 105 gg) ritardasse, la cassa potrebbe essere ~120.000 €.
> Fonte: dashboard cassa EiC, scadenzario fornitori e clienti, storico pagamenti."

L'utente capisce la cifra, da dove viene, quali sono i rischi, dove andare a verificare.

## Diritto a richiedere spiegazione

L'utente può sempre chiedere "perché?":

> Utente: "Mi stai dicendo che il margine commessa X è in calo. Perché?"
> 
> Cervello: "Il margine corrente è 8% vs budget di 14%. Le 3 cause principali nei dati:
> 1. Consumo materiali +18% sul preventivato (fattura n.187 del 12/04 mostra rincaro acciaio)
> 2. Ore manodopera diretta +12% (squadra ha lavorato 14 giorni in più rispetto al cronoprogramma)
> 3. Subappalto X non ha emesso ancora SAL ma ha già consegnato
> 
> Ci sono dettagli che vuoi approfondire?"

Spiegazione utile e azionabile, non solo statistica.

## La "scatola nera" e i suoi limiti

I modelli AI moderni (LLM) sono parzialmente "scatole nere": non sempre è possibile dire **esattamente** perché il modello ha generato una risposta specifica. Tuttavia, il sistema deve:

✓ Dichiarare quali **dati** ha consultato
✓ Citare le **fonti** del KB usate
✓ Mostrare i **passaggi di ragionamento** principali
✓ Indicare i **livelli di confidenza** quando rilevante
✓ Ammettere l'**incertezza** quando presente

Anche se non si può aprire completamente la scatola nera, si può rendere il processo **abbastanza trasparente** per essere utile.

## Decisioni automatizzate — GDPR art. 22

Se il sistema prende decisioni completamente automatizzate che hanno effetti significativi (legali, contrattuali, su occupazione), GDPR art. 22 dà all'interessato il diritto di:

- Non essere soggetto a tale decisione
- Richiedere intervento umano
- Esprimere il proprio punto di vista
- Contestare la decisione

In pratica, decisioni completamente automatizzate dal Cervello su questioni rilevanti **non sono permesse**: sempre HIL (vedi `human-in-the-loop-decisioni-critiche.md`).

## Etichettatura contenuti generati

L'AI Act richiede che i contenuti generati artificialmente siano riconoscibili:

- **Testi generati**: nota in calce ("Generato da Cervello AI EiC, revisionato da [nome] in data [data]")
- **Immagini/video AI**: watermark o metadata
- **Audio sintetico**: dichiarazione esplicita

Per documenti formali (preventivi, contratti, lettere), la generazione AI è sempre seguita da revisione umana, quindi la nota è "Bozza generata da AI, revisionata da [umano]".

## Linguaggio comprensibile

L'explainability fallisce se la spiegazione è **troppo tecnica** per l'utente.

Esempio errato:
> "Ho applicato un retrieval RAG con embedding cosine similarity > 0.78 e ho generato la risposta tramite LLM con temperature 0.3."

Esempio corretto:
> "Ho consultato il documento [X] del KB e i dati del cantiere [Y] del tuo sistema. La risposta è basata su questi due elementi."

Adattamento del linguaggio al ruolo dell'utente: imprenditore esperto vs operaio meno tecnico.

## Trasparenza per gruppi vulnerabili

L'AI Act protegge particolarmente:
- Minori
- Persone con disabilità cognitiva
- Soggetti vulnerabili

Per il contesto edile, attenzione a:
- Lavoratori non italiani con conoscenza linguistica limitata
- Persone anziane meno familiari con tecnologia
- Soggetti con disabilità

Per loro: linguaggio extra-semplice, eventualmente versioni multilingua, tempo aggiuntivo per comprensione.

## Auditabilità delle risposte

Per garantire trasparenza nel tempo, ogni risposta è auditabile:

- Log dell'interazione completa
- Dati consultati al momento della risposta
- Versione del KB e del modello usata
- Eventuali strumenti chiamati
- Risposta finale con timestamp

Se l'utente, settimane dopo, contesta una risposta, è possibile **ricostruire** esattamente cosa è successo.

## Dashboard trasparenza

Il Cervello fornisce all'utente avanzato (admin, DPO) una dashboard che mostra:

- Quante interazioni AI/giorno
- Distribuzione per ruolo utente
- Tasso di refusal corretti
- Tasso di approvazioni HIL
- Tipi di domande fatte
- Anomalie rilevate

Permette governance attiva sull'uso dell'AI.

## Errori comuni di trasparenza

1. **AI nascosta** dietro nome "neutro": l'utente pensa di parlare con un umano
2. **Spiegazioni assenti**: risposte che vengono "dal nulla"
3. **Spiegazioni inventate**: il modello inventa il proprio reasoning post-hoc
4. **Linguaggio tecnico** incomprensibile per l'utente target
5. **Disclaimer eccessivi** che generano sfiducia

## Bilanciamento

La trasparenza non significa **dire tutto sempre**. Significa:
- Quando l'utente chiede chiarimento, deve poterlo ottenere
- Quando la decisione è importante, deve essere spiegata
- Quando il sistema è incerto, deve dichiararlo

Risposte normali a domande semplici non richiedono ogni volta un trattato. Una risposta tipo:

> "Il SAL si emette mensilmente. Il prossimo è previsto per il 5 del mese."

è già adeguata. Spiegazioni profonde quando servono, non sempre.

## EiC — l'implementazione

Il Cervello Supremo:
- ✅ **Si dichiara AI** sempre, all'apertura e nei punti chiave
- ✅ **Cita le fonti** delle risposte sostantive
- ✅ **Spiega ragionamenti** quando rilevante o richiesto
- ✅ **Ammette i limiti** quando presenti
- ✅ **Etichetta i contenuti** generati per uso esterno
- ✅ **Fornisce audit trail** consultabile dall'amministratore
- ✅ **Linguaggio adattato** al ruolo dell'utente
- ✅ **Supporta multilingua** per inclusività

## Riferimenti

- **AI Act art. 13** — Trasparenza per i sistemi alto rischio
- **AI Act art. 50** — Trasparenza specifica per chatbot, generative AI
- **GDPR art. 13-15** — Informazione e accesso
- **GDPR art. 22** — Decisioni automatizzate
- **Linee guida sull'AI Act per chatbot e contenuti generativi**
