---
area: integrazioni-prezziari
titolo: Fonti dei prezziari italiani
tags: [prezziari, fonti, regioni, dei, camerali]
versione: 1.0
aggiornato_il: 2026-05-05
---

# Fonti dei prezziari italiani — censimento

Documento di riferimento per i prezziari ufficiali italiani da considerare per integrazione programmatica nel Cervello Supremo.

## Prezziari Regionali (panoramica)

Tutte le 20 regioni italiane pubblicano un prezziario regionale per opere pubbliche. Ognuna ha caratteristiche proprie.

| Regione | Aggiornamento tipico | Formato disponibile | Note |
|---|---|---|---|
| Abruzzo | Annuale | PDF | |
| Basilicata | Annuale | PDF | |
| Calabria | Annuale | PDF | |
| Campania | Annuale | PDF | |
| Emilia-Romagna | Annuale | PDF + Excel | Ben strutturato |
| Friuli-Venezia Giulia | Annuale | PDF + Excel | |
| Lazio | Annuale | PDF | Ampio |
| Liguria | Annuale | PDF | |
| Lombardia | Annuale | PDF + Excel | Aggiornato regolarmente |
| Marche | Annuale | PDF | |
| Molise | Periodico | PDF | |
| Piemonte | Annuale | PDF + Excel | |
| Puglia | Annuale | PDF | |
| Sardegna | Annuale | PDF | |
| Sicilia | Periodico | PDF | |
| Toscana | Annuale | PDF + DB online | Tra i migliori organizzati |
| Trentino-Alto Adige | Provinciale (Trento e Bolzano separati) | PDF + Excel | Particolarmente dettagliato |
| Umbria | Annuale | PDF | |
| Valle d'Aosta | Periodico | PDF | |
| Veneto | Annuale | PDF + Excel | |

Per integrazione programmatica, le regioni con formato Excel/strutturato sono prioritarie.

## Prezziario DEI

**Editore**: DEI Tipografia del Genio Civile.

**Caratteristiche**:
- Editoria privata
- Aggiornamento semestrale/annuale
- Diviso in volumi specifici:
  - Recupero
  - Nuove Costruzioni
  - Impianti tecnologici
  - Costi di ricostruzione
  - Edilizia abitativa
- Formato: PDF, Excel, software dedicato (PriMus si interfaccia)
- API/dataset: disponibile per uso software con licenza specifica

**Costo licenza**:
- Licenza utente: 100-300 €/anno per volume
- Licenza software (per integrazioni): da 500 € a diversi migliaia all'anno

**Vantaggio**: copre voci non presenti nei prezziari regionali, soprattutto per impiantistica e finiture.

## Prezziari Camerali (CCIAA)

Alcune Camere di Commercio pubblicano prezziari per il proprio territorio:

- **Camera di Commercio di Milano-Lodi-Monza Brianza**: Prezziario delle Opere Edili
- **Camera di Commercio di Torino**: Prezziario delle Opere Edili
- **Camera di Commercio di Genova**: Prezziario regionale
- **Camera di Commercio di Bologna**: Prezziario opere edili
- **Camera di Commercio di Roma**: Prezziario opere edili
- **Camera di Commercio di Napoli**: Prezziario opere edili
- Altre minori: Bari, Catania, Firenze, ecc.

**Caratteristiche**:
- Aggiornamento variabile (annuale a triennale)
- Formato spesso PDF, alcuni Excel
- Costo: in genere 50-200 €/anno

## Prezziari proprietari grandi committenti

**ANAS** (strade e autostrade):
- Prezziario specifico per opere ANAS
- Aggiornato periodicamente
- Per imprese che lavorano in appalti ANAS

**RFI** (Rete Ferroviaria Italiana):
- Prezziario per opere ferroviarie
- Specifiche tecniche stringenti

**Autostrade per l'Italia, ASPI**:
- Prezziari interni
- Solo per fornitori qualificati

**Acquedotti, gestori utility**:
- Prezziari specifici per opere fognarie, idriche, gas
- Variabili per gestore

## Strumenti di scraping/parsing

Per integrazione programmatica:

**PDF parsing**:
- Tabula (Python/Java) — per tabelle in PDF
- pdfplumber (Python) — estrazione testo strutturato
- Camelot (Python) — alternativa a Tabula
- AWS Textract / Azure Form Recognizer — AI per estrazione tabelle complesse

**Excel/XML**:
- openpyxl, pandas (Python) — Excel
- lxml (Python) — XML
- Più semplice da gestire rispetto a PDF

**Web scraping** (per portali online):
- BeautifulSoup, Scrapy (Python)
- Rispettare robots.txt e termini d'uso

## Considerazioni legali

- **Diritti di riproduzione**: i prezziari sono opere protette. Verificare condizioni d'uso.
- **Prezziari regionali**: pubblicazioni ufficiali, ma riproduzione completa richiede attenzione.
- **DEI e camerali**: licenze specifiche obbligatorie per uso commerciale/software.
- **Citazione delle fonti**: sempre obbligatoria nelle risposte del Cervello.

## Strategie di integrazione

**Approccio 1 — Mass scraping**:
Integrare tutti i prezziari disponibili. Maximum coverage. Rischio: complessità manutentiva alta.

**Approccio 2 — Selezione strategica**:
Iniziare con 3-5 prezziari più rilevanti per la base clienti EiC. Espandere progressivamente.

**Approccio 3 — Aggregatori commerciali**:
Esistono servizi che aggregano prezziari (es. soluzioni integrate in PriMus, STR Vision). Integrazione tramite loro API.

Per V2 del Cervello Supremo, **approccio 2** è quello raccomandato.

## Priorità per integrazione iniziale

Per un'impresa edile italiana media, in ordine di priorità:

1. **Prezziario regionale del territorio prevalente** (es. Lombardia se EiC ha base clienti lombarda)
2. **DEI** (copertura nazionale di voci specialistiche)
3. **Prezziari regioni adiacenti** (per imprese che lavorano in più regioni)
4. **Eventuali camerali** della provincia principale

Con questi 4-5 fonti si copre 80-90% dei casi d'uso tipici.

## Aggiornamenti del documento

Questo documento è da rivedere annualmente per riflettere:
- Pubblicazioni di nuovi prezziari
- Modifiche di formato delle fonti
- Cambiamenti normativi sui prezziari ufficiali
- Nuove opportunità di integrazione (es. open data regionali)
