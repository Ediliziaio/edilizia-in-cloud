---
area: casi-studio
tipo: indice-area
versione: 1.0
aggiornato_il: 2026-05-05
---

# Casi studio — dal Company Brain al Cervello Supremo

Quest'area è progettata per accogliere **casi studio reali** estratti dai dati delle imprese clienti del Cervello (con anonimizzazione dei dati sensibili). Sono il "data layer" che permette al Cervello Supremo di apprendere dall'esperienza concreta del settore — non solo dalla teoria.

## Differenza con le altre aree

Le aree 00-meta e 01-09 contengono **conoscenza universale** (principi, framework, normative). I casi studio contengono **esperienza specifica** anonimizzata: cosa è realmente successo a imprese reali in situazioni concrete, e come hanno risposto.

## Tipologie di casi studio

**1. Caso di scaling**
"Come l'impresa X (3 a 8M in 4 anni) ha gestito la transizione fase 2→3"

**2. Caso di crisi**
"Come l'impresa Y ha gestito un infortunio mortale e ne è uscita strutturata meglio"

**3. Caso di vendita strategica**
"Come l'impresa Z è entrata nel mercato XX e ha conquistato 30% di market share locale"

**4. Caso di trasformazione digitale**
"Implementazione completa BIM in impresa W in 24 mesi: cosa è andato bene, cosa no"

**5. Caso fiscale/normativo**
"Come l'impresa K ha gestito una contestazione AdE su bonus 110% per 1.2M €"

**6. Caso HR**
"Come l'impresa Q ha trattenuto 15 capocantieri di valore in fase di mercato del lavoro tirato"

## Anonimizzazione

Ogni caso studio segue una procedura di anonimizzazione:
- Nome impresa: pseudonimo
- Località: solo macro-area (Nord, Centro, Sud)
- Importi: arrotondati o resi in range
- Nomi persone: pseudonimi o generici
- Eventuali dettagli specifici riconoscibili: alterati

Il consenso del cliente alla pubblicazione (anche anonimizzata) è raccolto formalmente.

## Struttura tipica di un caso studio

```yaml
---
area: casi-studio
titolo: [Descrizione anonimizzata]
tipologia: [scaling | crisi | vendita | digitalizzazione | fiscale | hr | strategica]
fase_aziendale: [artigiana | piccola | strutturata | consolidata]
durata: [orizzonte temporale del caso]
outcome: [positivo | misto | negativo]
tags: [tags per recupero]
versione: 1.0
aggiornato_il: 2026-XX-XX
---

# [Titolo]

## Contesto
- Profilo dell'impresa
- Situazione di partenza
- Sfida principale

## Sfida
Descrizione del problema o opportunità affrontata.

## Decisioni e azioni
Cosa hanno deciso e perché. Cosa hanno fatto, in che ordine.

## Strumenti utilizzati
Software, consulenti, partner.

## Difficoltà incontrate
Cosa è andato male, cosa hanno dovuto correggere.

## Risultati
KPI prima/dopo, impatto concreto.

## Lessons learned
Cosa rifarebbero, cosa non rifarebbero, cosa consiglierebbero.

## Trasferibilità
A quale tipo di imprese questo caso è applicabile e a quale no.
```

## Stato V2 — placeholder

Quest'area è attualmente **placeholder strutturato**: la struttura è pronta, i casi studio si aggiungono via via che:

1. Il Cervello Supremo viene integrato con Company Brain di clienti reali
2. I clienti acconsentono alla pubblicazione anonimizzata
3. Casi significativi emergono dall'attività operativa

## Roadmap di popolamento

**V2.1 (Q3 2026)**: 5-10 casi studio iniziali da clienti pilota EiC, focus su scaling e digitalizzazione.

**V2.2 (Q4 2026)**: 15-25 casi totali, copertura di tutte le 9 aree principali.

**V3 (2027)**: 50+ casi studio, indicizzati per ricerca AI, integrati nel retrieval del Cervello.

## Come contribuire

Imprese clienti EiC possono proporre casi studio:
1. Segnalano un'esperienza significativa
2. Cervello Supremo (con human-in-the-loop) propone bozza anonimizzata
3. Cliente revisiona e approva
4. Caso studio entra nel KB

## Valore del case study layer

I casi studio aggiungono al KB:
- **Realismo**: non solo teoria, ma cosa è davvero successo
- **Contesto**: situazioni specifiche che la teoria non sempre cattura
- **Apprendimento**: il Cervello impara da pattern reali
- **Credibilità**: rispondere "lo abbiamo visto succedere a 12 imprese clienti" è più potente di "in teoria"

I casi studio sono uno dei vantaggi competitivi unici di un'AI specializzata su un settore con base di clienti significativa.
