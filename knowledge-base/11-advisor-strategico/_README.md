---
area: 11-advisor-strategico
tipo: indice-area-stub
versione: 0.1
aggiornato_il: 2026-05-05
stato: STUB STRUTTURALE — popolamento progressivo nelle versioni V3.x
---

# Area 11 — Advisor Strategico Proattivo (STUB)

## Cosa sarà quest'area

L'evoluzione naturale del Cervello Supremo: dalla **risposta** alla **proposta**. Mentre le aree 01-10 contengono **conoscenza universale del settore** e **regole di governance**, quest'area codifica il modo in cui il Cervello passa da "enciclopedia interrogabile" a **partner strategico** dell'imprenditore.

L'idea centrale: il Cervello osserva i dati dell'azienda quotidianamente, riconosce situazioni che meritano attenzione, e propone mosse concrete. Sempre con confronti, alternative, costi e rischi. Mai decidendo in autonomia. Sempre lasciando all'imprenditore la scelta finale.

## Il principio operativo

> **Suggerisci, non decidere. Proponi opzioni, non imponi soluzioni. Osserva proattivamente, ma rispetta sempre human-in-the-loop.**

Questa area lavora a stretto contatto con:
- **Area 10 — AI Act e Governance**: i confini del "fin dove può spingersi l'AI"
- **Area 02 — Finanza & Cashflow**: la materia prima dei suggerimenti tattici
- **Area 03 — Controllo Gestione**: i KPI che fanno scattare le proposte
- **Area 07 — Strategia Imprenditoriale**: gli orizzonti di lungo periodo

## I 5 livelli di advisory

**Livello 1 — Reattivo informativo**
L'utente chiede, il Cervello risponde dal Knowledge Base. È il livello base, già coperto.

**Livello 2 — Monitoraggio proattivo**
Il Cervello osserva dati e segnala anomalie senza essere interrogato.
Esempio: *"Margine commessa X sceso di 6 punti questo mese vs target. Vuoi vedere il dettaglio?"*

**Livello 3 — Advisor tattico**
Su richiesta o in situazioni rilevate, propone azioni concrete con valutazione costi/rischi.
Esempio: *"Hai 120k in scadenza nei prossimi 30 giorni. Cassa proiettata −45k a metà mese. Ti propongo 4 mosse con costi e tempi: [opzioni]. Quale approfondiamo?"*

**Livello 4 — Advisor strategico**
Su orizzonti più lunghi, identifica opportunità o rischi che richiedono ripensamenti strutturali.
Esempio: *"Il 40% del fatturato dipende da 1 cliente che paga a 150 giorni. È rischio di concentrazione. Vediamo come diversificare?"*

**Livello 5 — Crisis advisor**
Quando i segnali di crisi (Codice Crisi D.Lgs 14/2019, indici di sofferenza) superano soglie, attiva una conversazione strutturata con ipotesi di intervento.
Esempio: *"DSCR a 6 mesi sotto 1.0. Indicatori di crisi attivati. Ti propongo 3 percorsi: ristrutturazione debito, composizione negoziata, ricapitalizzazione. Da dove cominciamo?"*

## Cosa conterrà l'area (roadmap di popolamento)

### Documenti di framework (V3.0)
- `framework-advisor-proattivo.md` — Architettura: trigger system, playbook, data network aggregato, interaction patterns
- `etica-suggerimenti-confini.md` — Cosa l'AI può suggerire e cosa no, con casi limite
- `data-network-aggregato.md` — Come usare dati anonimizzati del network EiC senza violare multi-tenancy
- `decision-log-tracciabilita.md` — Tracciamento di proposte AI vs decisioni umane

### Playbook tattici (V3.x — ~20-30 playbook progressivi)

**Cassa e finanza**:
- `playbook-tensione-cassa-30-giorni.md`
- `playbook-cliente-grosso-non-paga.md`
- `playbook-fido-bancario-ridotto.md`
- `playbook-crescita-non-sostenibile.md`
- `playbook-saldi-arretrati-recupero.md`

**Margini e operations**:
- `playbook-margine-commessa-erosione.md`
- `playbook-fornitore-troppo-caro.md`
- `playbook-subappalto-non-performante.md`
- `playbook-cantiere-fuori-budget.md`

**Commerciale**:
- `playbook-pipeline-vuota.md`
- `playbook-concorrente-aggressivo.md`
- `playbook-pricing-troppo-basso.md`
- `playbook-cliente-vuole-sconto.md`

**HR e organizzazione**:
- `playbook-capocantiere-da-licenziare.md`
- `playbook-difficolta-trovare-operai.md`
- `playbook-turnover-eccessivo.md`

**Strategia**:
- `playbook-saturazione-mercato-locale.md`
- `playbook-opportunita-acquisizione.md`
- `playbook-ingresso-nuovo-segmento.md`
- `playbook-passaggio-generazionale-imminente.md`

**Crisi**:
- `playbook-indici-crisi-attivati.md`
- `playbook-blocco-cantiere-per-infortunio.md`
- `playbook-perdita-cliente-strategico.md`

### Template e schemi
- `playbook-template.md` — Schema riusabile per ogni playbook
- `trigger-event-schema.md` — Specifica tecnica dei trigger
- `interaction-pattern-library.md` — Pattern di interazione UI/UX

## Stato attuale

**V0.1 (questo rilascio)**: stub strutturale con vision, 5 livelli, framework architetturale di alto livello, template riusabile per playbook futuri.

**V3.0 prevista**: 4-6 documenti di framework + 5-10 playbook tattici core (cassa, margini, commerciale).

**V3.x progressive**: espansione progressiva dei playbook fino a copertura completa di 25-30 situazioni ricorrenti.

**V4 evolutiva**: integrazione con dati aggregati del network EiC, advisor di crescita basato su benchmarking di settore.

## Differenza con altre aree

Le aree 01-10 sono **statiche**: contengono conoscenza che vale per tutte le imprese del settore.

Quest'area è **dinamica**: codifica il modo in cui il Cervello mette in relazione la conoscenza universale con i dati specifici dell'azienda **al momento giusto**. È la "logica di mestiere" del consulente strategico, espressa in modo che un sistema AI possa applicarla.

## I 3 nodi aperti che guidano lo sviluppo

Quando popoleremo quest'area, dovremo decidere su 3 nodi:

**1. Proattività: sempre on o su richiesta?**
Notifiche spontanee del Cervello vs digest periodico. Trade-off tra utilità e invasività.

**2. Data network aggregato: opt-in o opt-out?**
Quanti dati anonimizzati conferiscono i clienti al network condiviso. Trade-off tra valore di benchmarking e velocità di adozione.

**3. Confine "creatività" dei suggerimenti**
Quanto in zona grigia può spingersi un suggerimento prima che l'AI lo flaghi come "rivedi con consulente". Trade-off tra utilità tattica e rischio etico/legale.

Questi nodi sono volutamente lasciati aperti nello stub. Andranno decisi prima di V3.0 con confronto strategico tra Florin (CEO), team prodotto, DPO, eventualmente avvocato.

## Documenti già presenti in V0.1

- `_README.md` (questo file)
- `framework-advisor-proattivo.md` — Architettura del sistema advisor
- `playbook-template.md` — Template riusabile per ogni playbook futuro

## Quando si attiva quest'area

Pre-requisiti per iniziare a popolare V3.0:
- Cervello base (V1) stabile e in produzione
- Architettura RBAC implementata (Area 10)
- Almeno 6 mesi di dati di clienti pilota su cui testare i trigger
- Decisione strategica sui 3 nodi aperti
- Allocazione di risorse dev per implementazione tecnica del trigger system

Quando si attiva, è probabilmente il **fattore di differenziazione più forte** di EiC sul mercato.
