---
area: integrazioni-prezziari
tipo: indice-area
versione: 1.0
aggiornato_il: 2026-05-05
---

# Integrazioni Prezziari — aggiornamento programmatico

Quest'area documenta l'integrazione del Cervello Supremo con i **prezziari ufficiali** italiani (regionali, DEI, camerali) per accesso programmatico ai dati di prezzo unitari aggiornati. È un componente tecnico necessario per:

- Risposte AI basate su prezzi reali e attuali
- Verifiche di congruità per bonus fiscali
- Confronti automatici con offerte di concorrenti
- Suggerimenti per analisi prezzi specifica

## Stato V2

Quest'area è **specifica tecnica** + **placeholder per implementazione**. Contiene:

1. Specifica tecnica dell'integrazione (in questo README)
2. Documentazione delle fonti dati (`fonti-prezziari.md`)
3. Schema dati standard (`schema-dati-prezziario.md`)
4. Modulo di ingestion (codice da implementare)

L'implementazione effettiva richiede sviluppo software (non parte di questo KB) e accordi con i fornitori dei prezziari.

## I prezziari da integrare

### Prezziari Regionali
Ogni Regione italiana pubblica annualmente il proprio prezziario delle opere pubbliche. Formati tipici:
- PDF (sempre)
- Excel/XML (variabili)
- Database online (pochi)

Esempi:
- Regione Lombardia: pubblicazione annuale, sito Regione
- Regione Lazio: aggiornamento periodico, portale dedicato
- Regione Toscana: editoria specifica
- Regione Sicilia: pubblicazione D.G.R.
- Tutte le altre regioni con frequenze e formati variabili

### Prezziario DEI Tipografia del Genio Civile
- Editoria privata con abbonamento
- Aggiornamento semestrale/annuale
- Diviso per tipologie: Recupero, Nuove Costruzioni, Impianti, ecc.
- Disponibile in formato XML per integrazione

### Prezziari Camerali (CCIAA)
- Alcune Camere di Commercio pubblicano prezziari di settore
- Formati e disponibilità variabili
- Esempi: Milano, Torino, Genova, Bologna

### Prezziari ANAS / RFI
- Prezziari proprietari di grandi committenti pubblici
- Per imprese che lavorano con questi enti

## Architettura di integrazione

```
[Fonti Prezziari]
  ├── Web scraping (siti regionali)
  ├── API ufficiali (dove esistono)
  ├── Acquisto dataset (DEI, camerali)
  └── Manual upload (PDF parsati)
        ↓
[Pipeline ETL]
  ├── Estrazione (parsing PDF/Excel/XML)
  ├── Normalizzazione (schema unificato)
  ├── Validazione (controllo qualità)
  └── Indicizzazione (database)
        ↓
[Database Prezziari]
  ├── Tabella voci (ID, codice, descrizione, UM)
  ├── Tabella prezzi (voce_id, fonte, prezzo, data, validità)
  ├── Tabella categorie (gerarchia)
  └── Tabella tag/keywords (per ricerca)
        ↓
[API Cervello Supremo]
  ├── Search per descrizione (semantica)
  ├── Lookup per codice (esatta)
  ├── Confronto multi-fonte (per stessa voce)
  └── Trend storico (variazione prezzi nel tempo)
        ↓
[Sistema AI]
  └── Risposte arricchite con prezzi attuali
```

## Frequenza di aggiornamento

- **Prezziari regionali**: aggiornamento annuale (gennaio-marzo tipicamente)
- **Prezziario DEI**: aggiornamento semestrale o trimestrale
- **Eventi straordinari**: legge bilancio annuale, decreti d'urgenza che modificano prezzi
- **Crisi inflattive**: aggiornamenti straordinari (es. 2022-2023 post-pandemia)

Il sistema deve gestire:
- Versioning dei prezziari (storico)
- Indicazione di vigenza
- Allerta automatici quando un prezziario nuovo è pubblicato

## Casi d'uso del sistema integrato

**1. Risposta a domande di prezzo**
Utente: "Quanto costa al mq un cappotto termico in [provincia]?"
Cervello: query al database prezziari → risposta con range realistico, fonte e data dei dati.

**2. Verifica congruità bonus**
Sistema: cliente sta presentando una asseverazione con prezzi sopra il prezziario regionale. Cervello Supremo segnala la potenziale anomalia.

**3. Generazione preventivi base**
A partire da un computo metrico, il sistema può proporre prezzi unitari da prezziari ufficiali come base per offerta.

**4. Confronti tra mercato e listino aziendale**
Imprese che hanno listino interno possono confrontare con il prezziario ufficiale per identificare anomalie.

## Schema dati standard

Documento separato in `schema-dati-prezziario.md` (da creare nell'implementazione).

Sintesi:
```yaml
voce_prezziario:
  id_unico: # generato da sistema
  codice_originale: # codice da prezziario fonte
  fonte:
    tipo: regionale | dei | camerale | anas | rfi
    nome: # es. "Prezziario Regione Lombardia 2026"
    versione: # data o numero
    URL: # link alla fonte ufficiale
  classificazione:
    macro_categoria: # es. "B - Scavi e movimenti terra"
    categoria: # es. "B.01 - Scavi a sezione obbligata"
    sotto_categoria: # se applicabile
  descrizione:
    titolo: # breve
    descrizione_completa: # come da prezziario
    note: # eventuali note
  unita_misura:
    codice: # es. "mc"
    descrizione: # "metro cubo"
  prezzi:
    prezzo_unitario: # in €
    valuta: EUR
    data_validita_da: # YYYY-MM-DD
    data_validita_a: # null o data
  scomposizione: # per gare pubbliche
    materiale: # %
    manodopera: # %
    noli: # %
    spese_generali: # %
    utile: # %
  tag: # ["calcestruzzo", "armato", "C25/30", ecc.]
  embedding: # vector per ricerca semantica
```

## Sviluppo proposto

**Fase 1 — MVP (3-4 mesi)**:
- Integrazione 3-5 prezziari regionali principali
- Integrazione DEI
- Database base + ricerca testuale
- Prima versione API

**Fase 2 — Estensione (4-6 mesi successivi)**:
- Tutti i prezziari regionali
- Camerali principali
- Ricerca semantica via embedding
- Integrazione completa con Cervello Supremo

**Fase 3 — Avanzamento (oltre)**:
- Aggiornamento automatico
- Storico e trend
- Confronti tra fonti
- AI per disambiguazione voci simili tra prezziari

## Costi e risorse

Investimento stimato:
- Sviluppo MVP: 30-80k €
- Acquisto dataset DEI: 1.500-5.000 €/anno
- Manutenzione e aggiornamenti annuali: 10-25k €/anno
- Infrastruttura cloud: 200-1.000 €/mese

Team:
- 1 developer full-stack
- 1 ingegnere/perito edile per validazione dati
- 0,5 data engineer per pipeline ETL

## Aspetti legali

- Verificare condizioni d'uso di ciascun prezziario (alcuni hanno restrizioni)
- DEI ha contratti di licenza specifici per uso software
- Citazione delle fonti negli output del Cervello
- Eventuali accordi con regioni per accesso a dati strutturati

## Stato attuale

V2 stub: documentazione tecnica e roadmap. L'implementazione richiede:
1. Decisione strategica EiC (priorità rispetto ad altri sviluppi)
2. Allocazione budget
3. Selezione partner/fornitori dataset
4. Sviluppo software dedicato

Quando implementato, sarà uno dei moduli più potenti del Cervello Supremo, perché collegherà il KB universale (principi, normative) con dati di mercato vivi.
