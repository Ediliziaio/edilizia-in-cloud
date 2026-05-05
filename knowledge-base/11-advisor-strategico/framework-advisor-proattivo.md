---
area: 11-advisor-strategico
titolo: Framework dell'advisor proattivo — architettura del sistema
tags: [advisor, proattivo, trigger, playbook, architettura]
livello: avanzato
applicabile_a: [progettazione-sistema, dev-team-eic]
versione: 0.1
aggiornato_il: 2026-05-05
stato: framework di alto livello — dettagli implementativi in V3.0
---

# Framework dell'advisor proattivo — l'architettura

Questo documento descrive l'architettura del Cervello come **advisor strategico proattivo**. Non è ancora specifica implementativa, ma il framework di riferimento entro cui costruire i playbook tattici e il sistema di trigger.

## Le 4 componenti del sistema

```
        ┌─────────────────────────────────────────┐
        │  COMPANY BRAIN (dati specifici azienda) │
        │  + KB UNIVERSALE (aree 01-10)           │
        │  + DATA NETWORK AGGREGATO (opzionale)   │
        └─────────────────────────────────────────┘
                        │
                        ▼
        ┌─────────────────────────────────────────┐
        │  1. TRIGGER ENGINE                      │
        │  Osserva eventi, soglie, pattern        │
        │  Decide se attivare un playbook         │
        └─────────────────────────────────────────┘
                        │
                        ▼
        ┌─────────────────────────────────────────┐
        │  2. PLAYBOOK LIBRARY                    │
        │  Set di "ricette tattiche" codificate   │
        │  Una per ogni situazione ricorrente     │
        └─────────────────────────────────────────┘
                        │
                        ▼
        ┌─────────────────────────────────────────┐
        │  3. PROPOSAL GENERATOR                  │
        │  Costruisce proposta strutturata:       │
        │  diagnosi + opzioni + costi/rischi      │
        └─────────────────────────────────────────┘
                        │
                        ▼
        ┌─────────────────────────────────────────┐
        │  4. INTERACTION LAYER                   │
        │  Presenta all'utente, raccoglie scelta, │
        │  registra in decision log               │
        └─────────────────────────────────────────┘
                        │
                        ▼
        ┌─────────────────────────────────────────┐
        │  AZIONE (umana, supportata da AI)       │
        └─────────────────────────────────────────┘
```

## 1. Trigger Engine

### Tipi di trigger

**Event-based** (qualcosa è successo):
- Nuova fattura passiva registrata sopra soglia
- SAL accettato dal DL
- Cliente segnala contestazione
- Dipendente che fa richiesta ferie/dimissioni
- Cantiere che entra in nuova fase
- Scadenza fiscale che si avvicina

**Threshold-based** (un valore ha superato una soglia):
- Cassa proiettata sotto livello critico
- DSO oltre N giorni
- Margine commessa sotto target
- PFN/EBITDA oltre soglia di sostenibilità
- Tasso assenteismo sopra norma
- DSCR sotto 1.0

**Pattern-based** (qualcosa si ripete o evolve in modo notevole):
- 3 settimane consecutive di calo margine
- 5 cantieri con la stessa categoria di scostamento
- Ripetuti pagamenti ritardati dello stesso cliente
- Aumento progressivo del DPO che potrebbe segnalare difficoltà

**Time-based** (è il momento di rivedere qualcosa):
- Fine mese: review KPI
- Fine trimestre: analisi commesse chiuse
- Annuale: revisione policy, contratti, posizionamento
- Eventuale anniversario di assunzioni o contratti

**Comparative** (rispetto a benchmark):
- Costi materiali sopra benchmark di settore
- Margini sotto media imprese simili
- Crescita più lenta di mercato di riferimento

### Logica del trigger

Ogni trigger ha:
- **Condizione di attivazione** (espressione logica sui dati)
- **Severità** (info / warning / alert / critical)
- **Cooldown** (non riattivare lo stesso trigger per X giorni)
- **Pre-requisiti** (dati minimi necessari per attivazione affidabile)
- **Playbook associato** (quale ricetta innescare)

Esempio di trigger:
```yaml
trigger_id: tensione-cassa-30-giorni
type: threshold-based
condition: |
  cassa_proiettata_30gg < (costi_operativi_mensili * 0.5)
severity: alert
cooldown: 7 giorni
prerequisiti:
  - forecast_cassa abilitato
  - almeno 90 giorni di storico
playbook: tensione-cassa-30-giorni
```

### Anti-fatigue

Il rischio della proattività è il **alert fatigue**: troppe notifiche → utente le ignora tutte. Mitigazioni:
- Ranking degli alert per priorità (max 3 attivi contemporaneamente)
- Cooldown rispettato rigorosamente
- Digest periodico invece di notifica continua
- Capacità dell'utente di "snooze" un alert
- Apprendimento dei pattern dell'utente (se ignora sistematicamente certi alert, abbassare priorità)

## 2. Playbook Library

Un **playbook** è una "ricetta tattica" per una specifica situazione. Codifica:
- Quando si attiva (link al trigger)
- Come fare diagnosi
- Quali sono le opzioni standard
- Quali costi/rischi/tempi associati
- Quando coinvolgere quali figure
- Cosa misurare per valutare se la mossa funziona

Vedi `playbook-template.md` per la struttura standard.

### Tassonomia dei playbook

I playbook si raggruppano per area decisionale:

**Cassa & finanza** — situazioni di tensione di cassa, gestione DSO/DPO, accesso al credito
**Margini & operations** — erosione margini commessa, fornitori non competitivi, cantieri fuori budget
**Commerciale** — pipeline vuota, perdita clienti, pricing pressure
**HR & organizzazione** — turnover, difficoltà reclutamento, conflitti operativi
**Strategia** — saturazione mercato, opportunità acquisizione, ingresso nuovi segmenti
**Crisi** — indici di crisi, blocchi cantiere, perdita cliente strategico
**Compliance** — scadenze normative, controlli imminenti, contestazioni
**Opportunità** — bandi pubblici interessanti, partnership emergenti, finestre di mercato

Target V3.0: 20-30 playbook coprono ~80% delle situazioni ricorrenti per impresa edile media.

## 3. Proposal Generator

Quando un trigger attiva un playbook, il sistema genera una **proposta strutturata** in formato standard:

```
SITUAZIONE
[Descrizione di cosa il sistema ha rilevato e perché è significativo]

DIAGNOSI
[Analisi delle cause probabili sulla base dei dati]

OPZIONI
1. [Opzione A]
   - Pro: ...
   - Contro: ...
   - Costo stimato: ...
   - Tempo: ...
   - Rischio: ...
2. [Opzione B]
   ...
3. [Opzione C]
   ...

RACCOMANDAZIONE
[Se il sistema ha confidence sufficiente, indica preferita con motivazione. 
Altrimenti dichiara: "Non ho elementi per raccomandare una opzione su un'altra, valuta tu."]

PROSSIMI PASSI
[Lista di 2-4 azioni concrete da fare nelle prossime 24-72 ore]

QUANDO COINVOLGERE
[Quale figura aziendale + eventuale professionista esterno]

KPI DA OSSERVARE
[2-4 metriche per valutare se la mossa funziona]
```

Questo formato standard rende le proposte **comparabili**, **verificabili** e **auditabili**.

### Confidence calibration

Per ogni proposta, il sistema dichiara il proprio livello di fiducia:
- **Alta confidence**: dati completi, situazione standard, playbook con storia di successi → raccomandazione chiara
- **Media confidence**: dati parziali, situazione mista → presenta opzioni senza raccomandare
- **Bassa confidence**: dati scarsi, situazione atipica → flag esplicito ("ho elementi limitati, prendi questo come spunto, non come analisi completa")

L'onesta sui propri limiti è parte della governance (vedi `10-ai-act-governance/anti-hallucination-grounding.md`).

## 4. Interaction Layer

### Modalità di presentazione

**Notifica push** (per alert critici): banner visibile + suono opzionale
**Notifica in-app** (per alert standard): pillola nella dashboard
**Digest periodico** (per situazioni accumulate): email/in-app, settimanale o quindicinale
**On-demand** (utente chiede): "Cervello, fai il punto della settimana"

L'utente configura le proprie preferenze per categoria (es. "alert critici sempre push, alert standard solo digest settimanale").

### Risposta dell'utente

Per ogni proposta, l'utente può:
- **Approvare un'opzione** → eseguibile (con HIL se decisione critica)
- **Modificare l'opzione** → variante personalizzata
- **Rifiutare tutte** → con motivazione opzionale
- **Posticipare** → "ne parliamo fra 2 settimane"
- **Chiedere chiarimenti** → loop conversazionale

### Decision log

Ogni interazione viene registrata:
- Data, ora, trigger che ha attivato
- Proposta generata
- Scelta dell'utente
- Eventuale azione eseguita
- Outcome a 30/60/90 giorni (se misurabile)

Il decision log alimenta:
- Audit interno (chi ha deciso cosa, quando)
- Compliance AI Act (tracciabilità)
- Apprendimento del sistema (quali proposte funzionano, quali no)
- Reportistica al management (dashboard delle decisioni)

## Il data network aggregato

Per playbook di **livello 4 (advisor strategico)** e **5 (crisis advisor)**, il valore aumenta drammaticamente quando il Cervello può attingere a benchmark di settore costruiti dai dati anonimizzati del network EiC.

### Come funziona (alto livello)

1. Cliente firma contratto EiC con clausola di partecipazione al data network (opt-in)
2. Pipeline ETL estrae dati aggregati anonimizzati: KPI economici, operativi, finanziari per categoria di impresa
3. Aggregati pubblicati al network solo con **k-anonymity** (es. k=10): nessuna statistica con campione inferiore
4. Cervello consulta benchmark quando rilevante per il suggerimento
5. Risposta cita la fonte aggregata e dichiara il campione

Esempio: *"Le imprese edili medio-piccole del Centro Italia (campione di 47 aziende) hanno DSO mediano di 92 giorni. Il tuo è 138. Vuoi che analizziamo i 3 clienti che alzano la media?"*

### Salvaguardie

- **Tenant isolation rispettata**: il Cervello del cliente A non vede mai dati del cliente B, solo aggregati
- **Pseudonymization** alla fonte
- **Differential privacy** dove applicabile (rumore statistico per ulteriore sicurezza)
- **Categorie sufficientemente larghe**: non "imprese edili di Roma con 12 dipendenti" (troppo specifico) ma "PMI edili Centro Italia"
- **Audit periodico** del processo di anonimizzazione
- **Trasparenza**: il cliente può chiedere quali aggregati alimenta e ottenere elenco

Vedi documento futuro `data-network-aggregato.md` per dettaglio tecnico.

## I confini etici (per riferimento)

Quest'area opera entro limiti definiti in `10-ai-act-governance/`. Riassunto:

- L'AI **suggerisce, non decide**: ogni mossa critica richiede HIL
- L'AI **mai propone azioni illegali o eticamente borderline**: niente evasioni, niente furberie, niente lavoro nero
- L'AI **flagga le zone grigie**: "questa mossa è al limite, valuta con commercialista/avvocato"
- L'AI **non comunica autonomamente verso esterni**: prepara bozze, l'umano invia
- L'AI **mai esegue azioni distruttive**: niente cancellazioni, mai
- L'AI **trasparente sulle proprie incertezze**: dichiara confidence

Vedi documento futuro `etica-suggerimenti-confini.md` per casi pratici.

## Roadmap di sviluppo

**V0.1 (questo rilascio - 2026-05-05)**: stub strutturale, framework, template

**V3.0 (target post-stabilizzazione Cervello base)**:
- 4-6 documenti di framework (incluso etica e data network)
- 5-10 playbook core (cassa, margini, commerciale)
- Specifica tecnica trigger engine
- Mockup UI/UX dell'interaction layer

**V3.1-V3.x**: espansione progressiva playbook (1-2 nuovi al mese, sulla base di feedback clienti pilota)

**V4.0**: integrazione live con data network aggregato, advisor con benchmark di settore

**V5.0**: auto-apprendimento dai decision log (quali playbook generano risultati migliori, raffinamento delle raccomandazioni)

## Connessioni con altre aree del KB

Quest'area è il "tessuto connettivo" che mette in moto le altre:

- I **trigger** osservano dati alimentati da Area 02 (finanza), 03 (controllo gestione), 06 (HR), ecc.
- I **playbook** applicano principi codificati nelle aree tematiche (es. playbook tensione cassa applica `02-finanza-cashflow/gestione-liquidita-cashflow.md`)
- Le **proposte** rispettano i confini di Area 10 (governance)
- Il **decision log** alimenta i casi-studio futuri (Area `casi-studio/`)

Quest'area trasforma le altre aree da "biblioteca consultabile" a "advisor che parla quando serve".
