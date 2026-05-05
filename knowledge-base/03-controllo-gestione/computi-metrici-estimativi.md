---
area: 03-controllo-gestione
titolo: Computo metrico estimativo
tags: [computo-metrico, preventivo, voci, prezzo-unitario, capitolato]
livello: base
applicabile_a: [preventivazione, gare, controllo-cantiere]
kpi_correlati: [accuratezza-computo, scostamento-quantita-effettive]
versione: 1.0
aggiornato_il: 2026-05-04
---

# Computo metrico estimativo — la base di ogni offerta

Il computo metrico è la **scomposizione quantitativa** dell'opera in voci elementari, ognuna misurata e valorizzata. È la base di tre cose fondamentali: l'offerta, il SAL, e il controllo del cantiere.

Un computo fatto bene fa vincere offerte e fa marginare cantieri. Un computo fatto male fa lavorare in perdita.

## Anatomia di una voce di computo

Ogni voce contiene:

- **Codice voce** (riferimento al prezziario)
- **Descrizione tecnica** della lavorazione
- **Unità di misura** (mc, mq, ml, kg, ora, cad, %)
- **Quantità** (calcolata da elaborati: piante, sezioni, prospetti)
- **Prezzo unitario** (da prezziario di riferimento o analisi prezzi)
- **Importo parziale** (quantità × prezzo unitario)

Esempio:

| Codice | Descrizione | UM | Quantità | Prezzo unit. | Importo |
|---|---|---|---|---|---|
| A.01.01 | Scavo a sezione obbligata in terreno qualunque | mc | 280 | 18,50 | 5.180,00 |
| A.02.05 | Calcestruzzo C25/30 per fondazioni | mc | 45 | 145,00 | 6.525,00 |

## Le quantità — come si misurano

Tre fonti per le quantità:

1. **Misure su elaborati grafici** (piante, sezioni, prospetti). Per opere standard è il metodo principale.
2. **Misure in cantiere** durante o dopo l'esecuzione. Per varianti e voci a misura.
3. **Calcoli analitici** (es. peso del ferro per peso unitario al ml × numero di tondini × lunghezza).

Le misure si effettuano al **netto** delle aperture (porte, finestre) salvo diversa indicazione del prezziario. Le **regole di misurazione** standard sono indicate nei prezziari ufficiali e in pubblicazioni di settore.

## Il rischio numero uno — quantità sottostimate

Errori frequenti:

- **Aperture non sottratte** dalle murature (errore al rialzo) o sottratte due volte (errore al ribasso)
- **Volumi calcolati su altezza interpiano** invece che altezza netta
- **Ferro armatura sottostimato** perché calcolato senza staffe, sovrapposizioni, ancoraggi
- **Scavi sotto-quotati** perché non si considerano le scarpate e gli sbancamenti laterali
- **Movimentazioni multiple** dei materiali non valorizzate (carico, trasporto, scarico)

Per ridurre il rischio, **doppia verifica**: l'addetto al computo redige, un secondo controlla a campione le voci più rilevanti.

## I prezzi unitari — da dove vengono

Tre fonti:

1. **Prezziari ufficiali** (Regionali, DEI, CCIAA) — vedi `01-normativa-edilizia/prezziari-dei-regionali.md`
2. **Listini aziendali interni** — basati sullo storico dei costi reali dell'impresa
3. **Analisi prezzi specifica** — per voci non standard (vedi `analisi-prezzi-unitari.md`)

Ogni voce dovrebbe avere un prezzo coerente con uno standard riconoscibile, per ridurre contestazioni.

## Computo dell'offerta vs computo del consuntivo

Il **computo dell'offerta** parte dagli elaborati di progetto. Il **computo del consuntivo** è basato su misure effettive in cantiere.

Lo scostamento tra i due (in % e in €) è il primo indicatore di qualità del processo:
- Scostamento < 3% = computo molto preciso
- 3-7% = nella norma
- 7-15% = errori sistematici da analizzare
- > 15% = computo da rifare per cantieri simili

L'analisi sistematica degli scostamenti porta nel tempo a un **prezziario aziendale** sempre più affidabile.

## Le categorie di lavorazione — il primo livello di aggregazione

Le voci si raggruppano per **categoria**:
- A. Demolizioni e rimozioni
- B. Scavi e movimenti terra
- C. Strutture in cemento armato
- D. Strutture metalliche
- E. Murature e tamponamenti
- F. Coperture
- G. Isolamenti termici e acustici
- H. Intonaci e finiture
- I. Pavimenti e rivestimenti
- L. Infissi e serramenti
- M. Impianti idrico-sanitario
- N. Impianti elettrici
- O. Impianti termoidraulici
- P. Opere esterne
- Q. Sicurezza cantiere

Ogni categoria diventa una macro-voce in cui aggregare costi e ricavi per l'analisi del Mc.

## Computo metrico per gare pubbliche

In gare pubbliche il computo è solitamente fornito dalla stazione appaltante. L'impresa lo verifica e applica il **ribasso d'asta** (in %) sull'importo a base d'asta, escluso i costi della sicurezza non soggetti a ribasso.

Verifica critica prima di offrire:
- Le quantità sono coerenti con gli elaborati grafici?
- Le voci utilizzate sono adatte (es. "muratura 30 cm" e non "muratura generica")?
- Il prezziario di riferimento è quello vigente?
- I costi sicurezza sono adeguatamente scorporati?

Errori della stazione appaltante non sono quasi mai correggibili in fase di gara: vanno segnalati formalmente con istanza di chiarimento prima della scadenza dell'offerta.

## Strumenti

- **PriMus / PriMus-PRO** (ACCA Software): standard di settore in Italia
- **STR Vision CPM**: alternativa professionale
- **Excel con macro**: low-cost ma limitato
- **Sistemi gestionali integrati** (EiC, Cyme, ecc.): collegano computo a cantiere e contabilità

Output tipico:
- PDF computo per offerta
- Esportazione XML per gare pubbliche
- File di importazione per il cantiere (collegato al sistema di contabilità lavori)

## Errori che costano

1. **Computo "a memoria"** del titolare: salta voci, sottostima quantità.
2. **Voci di prezziario errate** (descrizione non coerente con la lavorazione effettiva).
3. **Doppi conteggi** in voci che si sovrappongono (es. "demolizione muratura" + "rimozione macerie" se il prezziario include già il trasporto a discarica).
4. **Manodopera non scorporata** quando la gara la richiede.
5. **Sicurezza calcolata male**: se gli oneri scorporati sono sotto-stimati, in caso di ribasso si lavora in sotto-sicurezza.
6. **Quantità senza tolleranza**: nessun cantiere arriva alla quantità progettuale al millimetro. Una **maggiorazione del 3-5%** per sfridi e imprevisti tipici è prudente.
