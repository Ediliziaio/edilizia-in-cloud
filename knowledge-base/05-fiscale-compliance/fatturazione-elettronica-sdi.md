---
area: 05-fiscale-compliance
titolo: Fatturazione elettronica e SDI
tags: [fattura-elettronica, sdi, xml-fatturapa, dlgs-127-2015]
livello: base
applicabile_a: [fatturazione-quotidiana, b2b, b2c, pa]
kpi_correlati: [tempi-emissione-fattura, % fatture-scartate]
versione: 1.0
aggiornato_il: 2026-05-04
---

# Fatturazione elettronica — il sistema SDI

In Italia la fattura elettronica via **Sistema di Interscambio (SDI)** è obbligatoria per quasi tutte le transazioni B2B, B2C e verso PA (D.Lgs 127/2015 e successivi). L'impresa edile non emette più fatture cartacee.

## Schema del flusso

1. L'impresa genera la fattura in formato **XML FatturaPA**.
2. La invia al SDI tramite il proprio canale (gestionale, intermediario, portale AdE).
3. SDI verifica la fattura.
4. Se conforme, SDI la **trasmette al destinatario** (via codice destinatario o PEC).
5. SDI invia all'impresa la **ricevuta di consegna** (RC) o la **ricevuta di mancata consegna** (MC).
6. SDI archivia la fattura per 10 anni.

Tempi: emissione → consegna in genere pochi minuti, fino a 5 giorni in casi rari.

## Codice destinatario e PEC

Per ricevere la fattura, il destinatario fornisce:

- **Codice destinatario** (7 caratteri alfanumerici): assegnato a chi ha sistema gestionale collegato al SDI
- In alternativa, **indirizzo PEC** comunicato in fattura
- Per privati senza partita IVA: codice convenzionale "0000000" + invio cartaceo del cliente o accesso al cassetto fiscale

L'impresa è responsabile di **chiedere** al cliente i dati di consegna corretti.

## I tempi di emissione

Per le imprese edili tipicamente:

- **Fatture immediate**: entro 12 giorni dalla data dell'operazione
- **Fatture differite**: entro il 15 del mese successivo a quello dell'operazione (per servizi documentati da DDT, contabilità lavori SAL)

Errore frequente: fatturare in ritardo. Ogni ritardo comporta sanzioni.

## La struttura del file XML

Il file XML FatturaPA contiene:
- Dati identificativi cedente / cessionario
- Dati operazione (data, numero, importi)
- Dettaglio righe (descrizione, quantità, prezzi, IVA, sconti)
- Dati pagamento (modalità, scadenze)
- Allegati (DDT, contratto, ordine)
- Codici di **natura** dell'operazione (per IVA)
- Codici **TipoDocumento** (TD01 fattura, TD04 nota credito, TD17 autofattura, ecc.)

Software gestionali (come EiC) generano automaticamente il file XML conforme.

## Ricevute di consegna

Tre stati possibili:

**RC — Ricevuta di Consegna**: SDI ha consegnato al destinatario. Tutto ok.

**MC — Ricevuta di Mancata Consegna**: SDI non riesce a consegnare (es. PEC non funzionante). Il destinatario può comunque accedere al proprio cassetto fiscale.

**NS — Notifica di Scarto**: SDI ha **scartato** la fattura per errori (formali, normativi). L'impresa deve correggere e ri-emettere. Tempi tipici: 5 giorni.

Senza monitoraggio degli scarti, le fatture restano "non emesse" e si rischia ritardo nei pagamenti.

## I codici Natura

Per fatture senza IVA (esenti, fuori campo, reverse charge), si indica il codice **Natura** dell'operazione:

- **N1**: escluse ex art. 15 DPR 633/72
- **N2.1**: non soggette ad IVA
- **N2.2**: non soggette ad IVA - altri casi
- **N3.1**: non imponibili - esportazioni
- **N3.2**: non imponibili - cessioni intracomunitarie
- **N3.3**: non imponibili - cessioni verso San Marino
- **N3.4**: non imponibili - operazioni assimilate
- **N3.5**: non imponibili - dichiarazione d'intento
- **N3.6**: non imponibili - altre
- **N4**: esenti
- **N5**: regime del margine
- **N6.1-N6.9**: inversione contabile (reverse charge, vari sotto-codici)
- **N7**: IVA assolta in altro Stato UE

L'edilizia usa frequentemente N6 (reverse charge) e N3 (esportazioni rare ma possibili).

## Conservazione

L'AdE conserva la fattura per **10 anni** ma:
- L'impresa **deve fare conservazione sostitutiva** per legge fiscale
- Conservazione presso conservatore autorizzato AgID
- Costo: in genere incluso nel canone gestionale, o 50-300 €/anno se separato

Senza conservazione corretta, in caso di controllo le fatture non sono "valide" ai fini fiscali → sanzioni.

## Errori comuni

1. **Codice destinatario errato**: la fattura viene rifiutata o consegnata male.
2. **PEC del destinatario non funzionante**: MC, il cliente non vede subito.
3. **Ritardi di emissione** oltre i termini: sanzioni per fattura tardiva.
4. **Codice natura sbagliato** per operazioni reverse charge: contestazione fiscale.
5. **TipoDocumento errato**: es. TD01 per autofattura quando serve TD17.
6. **Mancata risposta a NS**: fattura scartata che resta non emessa, e cassa bloccata.
7. **Conservazione sostitutiva non attivata**: sanzioni amministrative pesanti.

## Strumenti

Software dedicati alla fatturazione elettronica:
- Gestionali integrati (EiC, Aruba, TeamSystem, ecc.)
- Portali standalone (Aruba Fattura, Fatture in Cloud, ecc.)
- Portale gratuito **Fatture e Corrispettivi** dell'Agenzia delle Entrate (per imprese piccole)

Per imprese edili, conviene gestionale integrato che colleghi: anagrafica clienti, SAL/contratti, fattura, registrazione contabile, conservazione.

## Riferimenti normativi

- **D.Lgs 127/2015** — disciplina fatturazione elettronica
- **Provvedimenti AdE** annuali — specifiche tecniche
- **Manuale Tecnico SDI** sul sito AgID
- **Decreto MEF 17 giugno 2014** — conservazione sostitutiva
