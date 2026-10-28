# Matrice di copertura — Excel documenti per implementazione

Fonte: `/Users/agenteai/Downloads/FILE DOCUMENTI PER IMPLEMENTAZIONE.xlsx`, foglio `Foglio1`. Analisi del 26 ottobre 2026.

Un foglio, sei elenchi, **124 righe documentali**. Le righe comprendono rinnovi e ripetizioni: non rappresentano 124 tipi unici, né 124 obblighi universali. Non sono presenti documenti effettivi, persone, date di rilascio, formule o esiti di verifica. L'Excel è una lista di richieste da tradurre in requisiti configurabili.

Tutte le righe sono conservate sotto con cella sorgente e testo originale. La colonna Scadenza è **la prescrizione dell'Excel, non una regola normativa convalidata**. “Non indicata” significa cella vuota; “NO” non significa automaticamente assenza di revisioni o verifiche.

## Correzioni e questioni da risolvere prima della configurazione

- **H25/I25 contro B61:C62:** antincendio indicato a 3 anni nella prima sezione e 5 nella seconda. Aggiornamento quinquennale nel DM 2/9/2021; distinguere incarico, corso e idoneità tecnica ove richiesta. [Vigili del Fuoco](https://www.vigilfuoco.it/media/notizie/decreto-servizi-prevenzione-e-protezione-antincendio-sui-luoghi-di-lavoro-decreto-e-la-circolare).
- **B55:C56:** la formazione lavoratori rischio alto è indicata con aggiornamento triennale; l'accordo 2025 prevede per i lavoratori aggiornamento almeno quinquennale di 6 ore, oltre alle necessità determinate dalle variazioni. L'eventuale frequenza aziendale più restrittiva deve essere etichettata interna/contrattuale. [Accordo ufficiale, parte III 1.1](https://www.statoregioni.it/media/e3ij2uj1/p-9-csr-atto-rep-n-59-17apr2025.pdf).
- **B20/C20:** DURC “ogni 4 mesi” va distinto dalla validità di 120 giorni e dalla data riportata nell'esito. [INAIL](https://www.inail.it/portale/it/supporto/faq/dettaglio-faq.2022.8.KB0013204.html).
- **B29/C29:** non confondere iscrizione all'Albo Gestori Ambientali con diritto annuale. Modellare separatamente durata dell'iscrizione, categoria, classe, condizioni e pagamento annuale; non inserire un'unica scadenza annuale per tutto. [Albo, diritti annuali](https://www.albonazionalegestoriambientali.it/Public/Iscrizione/Diritti).
- **B25/C25:** distinguere verifica triennale e scadenza quinquennale SOA, dati dell'attestazione e stato; il “mantenimento annuale” non diventa per questo un rinnovo SOA generale. [Dataset pubblico delle attestazioni](https://www.dati.gov.it/node/view-dataset/dataset?id=a51abc7d-6026-4e59-9492-5cadad362ef0).
- **B22/C22 D.O.M.A. e B70:C71 PLAC:** sigle non spiegate nel file. La risposta alla richiesta di chiarimento non ne ha definito il significato: mantenerle da classificare, senza espansioni inventate.
- **B57:C58:** distinguere corso per addetti ai ponteggi e PiMUS del cantiere. L'aggiornamento del corso non è la revisione del piano.
- **B69:** “patente edilizia” non dimostra da sola che si tratti della patente a crediti INL. Confermare documento e soggetto emittente.
- **B74:B75:** preservare “ambienti confinanti” come dicitura originale, proponendo la classificazione “ambienti sospetti di inquinamento o confinati” solo dopo riscontro sul documento.
- **H63:H64 e H75:H76:** ripetizione di Analisi rischi e relativo aggiornamento nella stessa sezione. Un solo tipo canonico con più versioni, conservando entrambi i riferimenti.
- **B34 e H20; B59 e H23; B35 e H85/H60:** lo stesso attestato o contratto può essere consultato da più contesti. Collegamenti al documento canonico, non caricamenti duplicati.
- **Visura semestrale, ISO/ESCO, antimafia, white list, LEI, RLS, nomina medico, linea vita e lavori in quota:** verificare applicabilità, schema/certificato, settore, contratto e causa dell'aggiornamento. Non applicare le scadenze del foglio in modo universale.

## Punto di ingresso del fascicolo subappaltatore: la scheda dettaglio esistente

Per le imprese esterne, documenti aziendali, referenti e operai vengono inseriti nella scheda dettaglio canonica `/azienda/subappaltatori/:id`. La commessa recupera i dati pertinenti quando viene selezionata l’impresa; gli addetti si confermano per attività e periodo. I POS sono caricabili dalla stessa scheda, ma restano collegati al relativo cantiere e alla specifica revisione. Non duplicare i file né trattare un POS di un’altra commessa come evidenza valida per la nuova. Si veda il capitolo dedicato nel [piano principale](2026-10-26-pos-sicurezza-cantiere.md).

## Inventario completo con destinazione proposta


### Controllo fatture — 6 righe

Intervallo: `Foglio1!B4:C9`. Destinazione: Amministrazione / Contratti / Fatture.

| Cella | Documento originale | Scadenza originale | Trattamento proposto |
|---|---|---|---|
| B4 | LUL | Non indicata | Impresa + contratto + mese di competenza; accesso amministrativo riservato; verifica umana. |
| B5 | BONIFICO LUL | Non indicata | Impresa + contratto + mese di competenza; accesso amministrativo riservato; verifica umana. |
| B6 | QUIETANZA F24 MENSILE PER RITENUTE FISCALI E CONTRIBUTI SUI REDDITI DI LAVORO DIPENDENTI | Non indicata | Impresa + contratto + mese di competenza; accesso amministrativo riservato; verifica umana. |
| B7 | COPIA DENUNCIA CASSA EDILE | Non indicata | Impresa + contratto + mese di competenza; accesso amministrativo riservato; verifica umana. |
| B8 | BONIFICO VERSAMENTO CASSA EDILE | Non indicata | Impresa + contratto + mese di competenza; accesso amministrativo riservato; verifica umana. |
| B9 | RICEVUTA/UNIEMENS MENSILE | Non indicata | Impresa + contratto + mese di competenza; accesso amministrativo riservato; verifica umana. |

### Documenti aziendali — 18 righe

Intervallo: `Foglio1!B19:C36`. Destinazione: Anagrafica impresa / Qualificazioni.

| Cella | Documento originale | Scadenza originale | Trattamento proposto |
|---|---|---|---|
| B19 | VISURA CAMERALE AGGIORNATA | OGNI SEI MESI | Documento canonico d’impresa; applicabilità e scadenza da convalidare per il caso. |
| B20 | DURC | OGNI 4 MESI | Usare data effettiva dell’esito e validità di 120 giorni. |
| B21 | DOCUMENTO DI RICONOSCIMENTO LEGALE RAPP.TE/TITOLARE | ALLA SCADENZA DEL DOCUMENTO | Documento canonico d’impresa; applicabilità e scadenza da convalidare per il caso. |
| B22 | D.O.M.A. | OGNI VOLTA CHE CAMBIANO I DIPENDENTI IN FORZA | Significato/documento da confermare; nessuna equivalenza automatica. |
| B23 | CERTIFICAZIONE ESCO | VALIDITA' 3 ANNI - SORVEGLIANZA ANNUALE | Documento canonico d’impresa; applicabilità e scadenza da convalidare per il caso. |
| B24 | CERTIFICAZIONE ISO | SCADENZA TRIENNALE - MANTENIMENTO ANNUALE | Documento canonico d’impresa; applicabilità e scadenza da convalidare per il caso. |
| B25 | ATTESTATI SOA | SCADENZA TRIENNALE E QUINQUENNALE - MANTENIMENTO ANNUALE | Verifica triennale e scadenza quinquennale distinte; mantenimento da chiarire. |
| B26 | ISCRIZIONE ANAGRAFE ANTIMAFIA | SCADENZA ANNUALE | Documento canonico d’impresa; applicabilità e scadenza da convalidare per il caso. |
| B27 | ISCRIZIONE WHITE LIST | SCADENZA ANNUALE | Documento canonico d’impresa; applicabilità e scadenza da convalidare per il caso. |
| B28 | ATTESTATO LEI | SCADENZA ANNUALE | Tipo strutturato, requisiti, titolare, ente, date ed evidenza; non dal solo titolo. |
| B29 | ISCRIZIONE ALBO NAZIONALE GESTORI AMBIENTALI | SCADENZA ANNUALE | Separare iscrizione per categoria/classe dal diritto annuale. |
| B30 | NOMINA MEDICO COMPETENTE | FINO A REVOCA / ANNUALE | Incarico con soggetto nominante, ambito, decorrenza, sostituzione/revoca ed evidenza. |
| B31 | VERBALE NOMINA RLS | NO SCADENZA - SOLO SE DEVE ESSERE SOSTITUITO | Incarico con soggetto nominante, ambito, decorrenza, sostituzione/revoca ed evidenza. |
| B32 | ISCRIZIONE INAIL RLS | NO SCADENZA - SOLO SE DEVE ESSERE SOSTITUITO | Documento canonico d’impresa; applicabilità e scadenza da convalidare per il caso. |
| B33 | ATTESTATO RLS | SCADENZA ANNUALE | Tipo strutturato, requisiti, titolare, ente, date ed evidenza; non dal solo titolo. |
| B34 | ATTESTATO RSPP | OGNI 5 ANNI | Tipo strutturato, requisiti, titolare, ente, date ed evidenza; non dal solo titolo. |
| B35 | CONTRATTO DI APPALTO/SUBAPPALTO | Non indicata | Documento canonico d’impresa; applicabilità e scadenza da convalidare per il caso. |
| B36 | DVR | OGNI VOLTA CHE C'E' UN CAMBIAMENTO | Documento canonico d’impresa; applicabilità e scadenza da convalidare per il caso. |

### Dipendenti — 45 righe

Intervallo: `Foglio1!B39:C83`. Destinazione: Personale / Formazione / DPI.

| Cella | Documento originale | Scadenza originale | Trattamento proposto |
|---|---|---|---|
| B39 | UNILAV DI ASSUNZIONE | NO | Riusare profilo HR e documento privato; visibilità del cantiere limitata ai dati pertinenti. |
| B40 | LETTERA DI ASSUNZIONE | NO | Riusare profilo HR e documento privato; visibilità del cantiere limitata ai dati pertinenti. |
| B41 | UNILAV DI TRASFORMAZIONE | Non indicata | Riusare profilo HR e documento privato; visibilità del cantiere limitata ai dati pertinenti. |
| B42 | LETTERA DI TRASFORMAZIONE | Non indicata | Riusare profilo HR e documento privato; visibilità del cantiere limitata ai dati pertinenti. |
| B43 | UNILAV DI PROROGA | Non indicata | Riusare profilo HR e documento privato; visibilità del cantiere limitata ai dati pertinenti. |
| B44 | LETTERA DI PROROGA | Non indicata | Riusare profilo HR e documento privato; visibilità del cantiere limitata ai dati pertinenti. |
| B45 | IDONEITA' VISITA MEDICA LAVORO | ALLA SCADENZA | Giudizio di idoneità e prescrizioni pertinenti; non diagnosi o cartella clinica. |
| B46 | IDONEITA' PER CAMBIO MANSIONE | AL CAMBIO MANSIONE | Giudizio di idoneità e prescrizioni pertinenti; non diagnosi o cartella clinica. |
| B47 | IDONEITA' RINNOVO VISITA MEDICA | ALLA SCADENZA | Nuova versione/evento del documento precedente; evitare un archivio separato. |
| B48 | DOCUMENTO DI RICONOSCIMENTO | ALLA SCADENZA | Riusare profilo HR e documento privato; visibilità del cantiere limitata ai dati pertinenti. |
| B49 | TESSERA SANITARIA | ALLA SCADENZA | Riusare profilo HR e documento privato; visibilità del cantiere limitata ai dati pertinenti. |
| B50 | VERBALE DI FORMAZIONE ED INFORMAZIONE ART. 36  D. LGS. 81/2008 | NO | Riusare profilo HR e documento privato; visibilità del cantiere limitata ai dati pertinenti. |
| B51 | VERBALE CONSEGNA D.P.I. | NO | Riusare profilo HR e documento privato; visibilità del cantiere limitata ai dati pertinenti. |
| B52 | RINNOVO VERBALE CONSEGNA D.P.I. | OGNI VOLTA CHE SI PROCEDE ALLA CONSEGNA DI NUOVI DPI | Nuova versione/evento del documento precedente; evitare un archivio separato. |
| B53 | VERBALE DI CONSEGNA TESSERINO | NO | Riusare profilo HR e documento privato; visibilità del cantiere limitata ai dati pertinenti. |
| B54 | RINNOVO VERBALE CONSEGNA TESSERINO | Non indicata | Nuova versione/evento del documento precedente; evitare un archivio separato. |
| B55 | ATTESTATO CORSO DI FORMAZIONE ALTO RISCHIO 16 ORE | OGNI 3 ANNI | Scadenza da correggere/distinguere da eventuale regola interna più restrittiva. |
| B56 | AGG. ATTESTATO CORSO DI FORMAZIONE ALTO RISCHIO 16 ORE | OGNI 3 ANNI | Scadenza da correggere/distinguere da eventuale regola interna più restrittiva. |
| B57 | ATTESTATO PIMUS | OGNI 4 ANNI | Attestato addetto ponteggi distinto dal PiMUS della commessa. |
| B58 | AGG. ATTESTATO PIMUS | OGNI 4 ANNI | Attestato addetto ponteggi distinto dal PiMUS della commessa. |
| B59 | ATTESTATO PREPOSTO | OGNI 2 ANNI | Tipo strutturato, requisiti, titolare, ente, date ed evidenza; non dal solo titolo. |
| B60 | AGG. ATTESTATO PREPOSTO | OGNI 2 ANNI | Nuova versione/evento del documento precedente; evitare un archivio separato. |
| B61 | ATTESTATO ADDETTI ANTINCENDIO | OGNI 5 ANNI | Tipo strutturato, requisiti, titolare, ente, date ed evidenza; non dal solo titolo. |
| B62 | AGG. ATTESTATO ADDETTI ANTINCENDIO | OGNI 5 ANNI | Nuova versione/evento del documento precedente; evitare un archivio separato. |
| B63 | ATTESTATO ADDETTI AL PRIMO SOCCORSO ED EMERGENZE | OGNI 3 ANNI | Tipo strutturato, requisiti, titolare, ente, date ed evidenza; non dal solo titolo. |
| B64 | AGG. ATTESTATO ADDETTI AL PRIMO SOCCORSO ED EMERGENZE | OGNI 3 ANNI | Nuova versione/evento del documento precedente; evitare un archivio separato. |
| B65 | ATTESTATO ADDETTI ALLA CONDUZIONE DI PLE CON E SENZA STABILIZZATORI | OGNI 5 ANNI | Tipo strutturato, requisiti, titolare, ente, date ed evidenza; non dal solo titolo. |
| B66 | AGG. ATTESTATO ADDETTI ALLA CONDUZIONE DI PLE CON E SENZA STABILIZZATORI | OGNI 5 ANNI | Nuova versione/evento del documento precedente; evitare un archivio separato. |
| B67 | ATTESTATO MANUTENZIONE ED INSTALLAZIONE LINEA VITA | NO | Tipo strutturato, requisiti, titolare, ente, date ed evidenza; non dal solo titolo. |
| B68 | AGG. ATTESTATO MANUTENZIONE ED INSTALLAZIONE LINEA VITA | NO | Nuova versione/evento del documento precedente; evitare un archivio separato. |
| B69 | ATTESTATO PATENTE EDILIZIA | NO | Significato/documento da confermare; nessuna equivalenza automatica. |
| B70 | ATTESTATO PLAC | OGNI 5 ANNI | Significato/documento da confermare; nessuna equivalenza automatica. |
| B71 | AGG. ATTESTATO PLAC | OGNI 5 ANNI | Significato/documento da confermare; nessuna equivalenza automatica. |
| B72 | ATTESTATO LAVORI IN QUOTA ED UTILIZZO DPI III CATEGORIA | OGNI 5 ANNI | Tipo strutturato, requisiti, titolare, ente, date ed evidenza; non dal solo titolo. |
| B73 | AGG.ATTESTATO LAVORI IN QUOTA ED UTILIZZO DPI III CATEGORIA | OGNI 5 ANNI | Nuova versione/evento del documento precedente; evitare un archivio separato. |
| B74 | AMBIENTI CONFINANTI  | OGNI 5 ANNI | Classificazione e corso da confermare; mantenere la dicitura originale. |
| B75 | AGG. AMBIENTI CONFINANTI  | OGNI 5 ANNI | Classificazione e corso da confermare; mantenere la dicitura originale. |
| B76 | ATTESTATO ADDETTI MACCHINE E MOVIMENTO TERRA | OGNI 5 ANNI | Tipo strutturato, requisiti, titolare, ente, date ed evidenza; non dal solo titolo. |
| B77 | AGG. ATTESTATO ADDETTI MACCHINE E MOVIMENTO TERRA | OGNI 5 ANNI | Nuova versione/evento del documento precedente; evitare un archivio separato. |
| B78 | ATTESTATO ADDETTI ALLA CONDUZIONE GRU A TORRE | OGNI 5 ANNI | Tipo strutturato, requisiti, titolare, ente, date ed evidenza; non dal solo titolo. |
| B79 | AGG. ATTESTATO ADDETTI ALLA CONDUZIONE GRU A TORRE | OGNI 5 ANNI | Nuova versione/evento del documento precedente; evitare un archivio separato. |
| B80 | ATTESTATO ADDETTI ALLA CONDUZIONE DI GRU PER AUTOCARRO | OGNI 5 ANNI | Tipo strutturato, requisiti, titolare, ente, date ed evidenza; non dal solo titolo. |
| B81 | AGG. ATTESTATO ADDETTI ALLA CONDUZIONE DI GRU PER AUTOCARRO | OGNI 5 ANNI | Nuova versione/evento del documento precedente; evitare un archivio separato. |
| B82 | ATTESTATO ADDETTI ALLA CONDUZIONE DI GRU MOBILI | OGNI 5 ANNI | Tipo strutturato, requisiti, titolare, ente, date ed evidenza; non dal solo titolo. |
| B83 | AGG. ATTESTATO ADDETTI ALLA CONDUZIONE DI GRU MOBILI | OGNI 5 ANNI | Nuova versione/evento del documento precedente; evitare un archivio separato. |

### Aziendali in cantiere — 11 righe

Intervallo: `Foglio1!H19:I29`. Destinazione: Commessa / Incarichi e requisiti.

| Cella | Documento originale | Scadenza originale | Trattamento proposto |
|---|---|---|---|
| H19 | NOMINA RSPP | NO SCADENZA - SE CI SONO CAMBIAMENTI | Incarico con soggetto nominante, ambito, decorrenza, sostituzione/revoca ed evidenza. |
| H20 | ATTESTATO RSPP | OGNI 5 ANNI | Tipo strutturato, requisiti, titolare, ente, date ed evidenza; non dal solo titolo. |
| H21 | ATTESTATO DATORE DI LAVORO | OGNI 5 ANNI | Tipo strutturato, requisiti, titolare, ente, date ed evidenza; non dal solo titolo. |
| H22 | NOMINA PREPOSTO | NO SCADENZA- IN CANTIERE | Incarico con soggetto nominante, ambito, decorrenza, sostituzione/revoca ed evidenza. |
| H23 | ATTESTATO PREPOSTO | OGNI DUE ANNI | Tipo strutturato, requisiti, titolare, ente, date ed evidenza; non dal solo titolo. |
| H24 | NOMINA ADDETTO ANTINCENDIO | NO SCADENZA- IN CANTIERE | Incarico con soggetto nominante, ambito, decorrenza, sostituzione/revoca ed evidenza. |
| H25 | ATTESTATO ADDETTO ANTINCENDIO | OGNI 3 ANNI | Conflitto con B61:B62: verificare regola quinquennale; nomina separata. |
| H26 | NOMINA ADDETTO AL PRIMO SOCCORSO/EMERGENZE | NO SCADENZA- IN CANTIERE | Incarico con soggetto nominante, ambito, decorrenza, sostituzione/revoca ed evidenza. |
| H27 | ATTESTATO ADDETTO AL PRIMO SOCCORSO /EMERGENZE | OGNI 3 ANNI | Tipo strutturato, requisiti, titolare, ente, date ed evidenza; non dal solo titolo. |
| H28 | DICHIARAZIONE DI CONFORMITA' MACCHINE ED ATTREZZATURE | NO SCADENZA- IN CANTIERE | Documento canonico aziendale collegato al cantiere/attrezzatura e verificato nel contesto. |
| H29 | DICHIARAZIONE DI NON ESSERE OGGETTO DI PROVVEDIMENTI DI SOSPENSIONE O INTERDITTIVI | NO SCADENZA- IN CANTIERE | Documento canonico aziendale collegato al cantiere/attrezzatura e verificato nel contesto. |

### Tecnici appaltatrice — 38 righe

Intervallo: `Foglio1!H39:I76`. Destinazione: Commessa / Lavori / Fascicolo tecnico.

| Cella | Documento originale | Scadenza originale | Trattamento proposto |
|---|---|---|---|
| H39 | TITOLO ABILITATIVO PER ESEGUIRE I LAVORI | NO | Collegamento a commessa/fase, autore, revisione, eventuali invii/ricevute ed esiti. |
| H40 | PROGETTI | NO | Collegamento a commessa/fase, autore, revisione, eventuali invii/ricevute ed esiti. |
| H41 | PROTOCOLLO PRATICA O AUTORIZZAZIONE | NO | Collegamento a commessa/fase, autore, revisione, eventuali invii/ricevute ed esiti. |
| H42 | NOTIFICA PRELIMINARE+PEC+CONSEGNA+ACCETTAZIONE | OGNI VOLTA CHE SI DEVE COMUNICARE UN CAMBIAMENTO | Collegamento a commessa/fase, autore, revisione, eventuali invii/ricevute ed esiti. |
| H43 | AGG. NOTIFICA PRELIMINARE+PEC+CONSEGNA+ACCETTAZIONE | OGNI VOLTA CHE SI DEVE COMUNICARE UN CAMBIAMENTO | Nuova versione/evento del documento precedente; evitare un archivio separato. |
| H44 | NOMINA DEL RESPONSABILE DEI LAVORI | OGNI VOLTA CHE SI DEVE COMUNICARE UN CAMBIAMENTO | Incarico con soggetto nominante, ambito, decorrenza, sostituzione/revoca ed evidenza. |
| H45 | NOMINA DEL PROGETTISTA | OGNI VOLTA CHE SI DEVE COMUNICARE UN CAMBIAMENTO | Incarico con soggetto nominante, ambito, decorrenza, sostituzione/revoca ed evidenza. |
| H46 | NOMINA DEL DIRETTORE DEI LAVORI | OGNI VOLTA CHE SI DEVE COMUNICARE UN CAMBIAMENTO | Incarico con soggetto nominante, ambito, decorrenza, sostituzione/revoca ed evidenza. |
| H47 | NOMINA DEL CSP | OGNI VOLTA CHE SI DEVE COMUNICARE UN CAMBIAMENTO | Incarico con soggetto nominante, ambito, decorrenza, sostituzione/revoca ed evidenza. |
| H48 | NOMINA DEL CSE | OGNI VOLTA CHE SI DEVE COMUNICARE UN CAMBIAMENTO | Incarico con soggetto nominante, ambito, decorrenza, sostituzione/revoca ed evidenza. |
| H49 | DICHIARAZIONE REQUISITI PROFESSIONALI CSP | OGNI VOLTA CHE SI DEVE COMUNICARE UN CAMBIAMENTO | Collegamento a commessa/fase, autore, revisione, eventuali invii/ricevute ed esiti. |
| H50 | ATTESTATO REQUISITI PROFESSIONALI CSP | OGNI VOLTA CHE SI DEVE COMUNICARE UN CAMBIAMENTO | Tipo strutturato, requisiti, titolare, ente, date ed evidenza; non dal solo titolo. |
| H51 | DICHIARAZIONE REQUISITI PROFESSIONALI CSE | OGNI VOLTA CHE SI DEVE COMUNICARE UN CAMBIAMENTO | Collegamento a commessa/fase, autore, revisione, eventuali invii/ricevute ed esiti. |
| H52 | ATTESTATO REQUISITI PROFESSIONALI CSE | OGNI VOLTA CHE SI DEVE COMUNICARE UN CAMBIAMENTO | Tipo strutturato, requisiti, titolare, ente, date ed evidenza; non dal solo titolo. |
| H53 | AGG. NOMINE | OGNI VOLTA CHE SI DEVE COMUNICARE UN CAMBIAMENTO | Incarico con soggetto nominante, ambito, decorrenza, sostituzione/revoca ed evidenza. |
| H54 | RICHIESTA OCCUPAZIONE SUOLO PUBBLICO E PAGAMENTO | A SCADENZA | Collegamento a commessa/fase, autore, revisione, eventuali invii/ricevute ed esiti. |
| H55 | RINNOVO RICHIESTA OCCUPAZIONE SUOLO PUBBLICO E PAGAMENTO | A SCADENZA | Nuova versione/evento del documento precedente; evitare un archivio separato. |
| H56 | DENUNCIA DI IMPIANTO MESSA A TERRA INAIL E PAGAMENTO | NO | Collegamento a commessa/fase, autore, revisione, eventuali invii/ricevute ed esiti. |
| H57 | VERBALE DI SOPRALLUOGO | OGNI VOLTA  | Collegamento a commessa/fase, autore, revisione, eventuali invii/ricevute ed esiti. |
| H58 | VERBALE DI COORDINAMENTO | OGNI VOLTA  | Collegamento a commessa/fase, autore, revisione, eventuali invii/ricevute ed esiti. |
| H59 | ORDINI DI SOSPENSIONE O DI ADEGUAMENTO DELLE LAVORAZIONI | OGNI VOLTA  | Collegare alle lavorazioni interessate e tracciare prescrizioni e ripresa. |
| H60 | CONTRATTO DI APPALTO | NO | Collegamento a commessa/fase, autore, revisione, eventuali invii/ricevute ed esiti. |
| H61 | PSC | NO | Collegamento a commessa/fase, autore, revisione, eventuali invii/ricevute ed esiti. |
| H62 | AGG. PSC | OGNI VOLTA CHE SI DEVE COMUNICARE UN CAMBIAMENTO | Nuova versione/evento del documento precedente; evitare un archivio separato. |
| H63 | ANALISI RISCHI | NO | Collegamento a commessa/fase, autore, revisione, eventuali invii/ricevute ed esiti. |
| H64 | AGG. ANALISI RISCHI | OGNI VOLTA CHE SI DEVE COMUNICARE UN CAMBIAMENTO | Nuova versione/evento del documento precedente; evitare un archivio separato. |
| H65 | FASCICOLO DELL'OPERA | NO | Collegamento a commessa/fase, autore, revisione, eventuali invii/ricevute ed esiti. |
| H66 | AGG. FASCICOLO DELL'OPERA | OGNI VOLTA CHE SI DEVE COMUNICARE UN CAMBIAMENTO | Nuova versione/evento del documento precedente; evitare un archivio separato. |
| H67 | DIAGRAMMA DI GANTT | NO | Collegamento a commessa/fase, autore, revisione, eventuali invii/ricevute ed esiti. |
| H68 | AGG. DIAGRAMMA DI GANTT | OGNI VOLTA CHE SI DEVE COMUNICARE UN CAMBIAMENTO | Nuova versione/evento del documento precedente; evitare un archivio separato. |
| H69 | COSTI DELLA SICUREZZA | NO | Collegamento a commessa/fase, autore, revisione, eventuali invii/ricevute ed esiti. |
| H70 | AGG. COSTI DELLA SICUREZZA | OGNI VOLTA CHE SI DEVE COMUNICARE UN CAMBIAMENTO | Nuova versione/evento del documento precedente; evitare un archivio separato. |
| H71 | PIMUS+TAVOLE+ATTESTATI PONTEGGIATORI+AUTORIZZAZIONE MINISTERIALE E RELAZIONE TECNICA DEL TIPO DI PONTEGGIO | NO | Collegamento a commessa/fase, autore, revisione, eventuali invii/ricevute ed esiti. |
| H72 | AGG. PIMUS | OGNI VOLTA CHE SI DEVE COMUNICARE UN CAMBIAMENTO | Nuova versione/evento del documento precedente; evitare un archivio separato. |
| H73 | POS | NO | Collegamento a commessa/fase, autore, revisione, eventuali invii/ricevute ed esiti. |
| H74 | AGG. POS | OGNI VOLTA CHE SI DEVE COMUNICARE UN CAMBIAMENTO | Nuova versione/evento del documento precedente; evitare un archivio separato. |
| H75 | ANALISI RISCHI | NO | Duplicato H63:H64: stesso tipo canonico, versioni collegate. |
| H76 | AGG. ANALISI RISCHI | OGNI VOLTA CHE SI DEVE COMUNICARE UN CAMBIAMENTO | Duplicato H63:H64: stesso tipo canonico, versioni collegate. |

### Subappaltatrice — 6 righe

Intervallo: `Foglio1!H80:I85`. Destinazione: Subappalti / Fascicolo impresa.

| Cella | Documento originale | Scadenza originale | Trattamento proposto |
|---|---|---|---|
| H80 | RICHIESTA DOCUMENTAZIONE REQUISITI TECNICO-PROFESSIONALI | NO | Impresa corretta e commessa/contratto; non sostituisce il POS della propria impresa. |
| H81 | POS | NO | Impresa corretta e commessa/contratto; non sostituisce il POS della propria impresa. |
| H82 | AGG. POS | OGNI VOLTA CHE SI DEVE COMUNICARE UN CAMBIAMENTO | Nuova versione/evento del documento precedente; evitare un archivio separato. |
| H83 | ANALISI RISCHI | NO | Impresa corretta e commessa/contratto; non sostituisce il POS della propria impresa. |
| H84 | AGG. ANALISI RISCHI | OGNI VOLTA CHE SI DEVE COMUNICARE UN CAMBIAMENTO | Nuova versione/evento del documento precedente; evitare un archivio separato. |
| H85 | CONTRATTO DI SUBAPPALTO | NO | Impresa corretta e commessa/contratto; non sostituisce il POS della propria impresa. |

## Verifica di copertura

6 + 18 + 45 + 11 + 38 + 6 = **124 righe documentali**, tutte associate alla cella sorgente. Le intestazioni e le celle solo formattate sono escluse. Nessuna modifica al file Excel originale.

Questa matrice è un backlog di classificazione e collegamento: non attesta che l’azienda possieda i documenti né che tutti siano richiesti in ogni commessa.


## Attuazione del catalogo — 27 ottobre

Le 124 celle sono presenti nel catalogo operativo v1 in `src/lib/sicurezza/catalogoDocumenti.json`, ricondotte a 82 tipi mantenendo tutti i riferimenti originali. Catalogo e database sono stati confrontati integralmente; titoli e frequenze sono stati ricontrollati direttamente nel workbook, senza differenze. Le righe non sono diventate obblighi universali o scadenze automatiche. La classificazione permette di preparare una richiesta e collegarla al soggetto pertinente; il motore per attività/fase/periodo e le integrazioni riservate ancora mancanti sono elencati nel blocco H del piano principale.

## Collegamento alle valutazioni dell’impresa — 27 ottobre

Le voci del catalogo con destinazione Sicurezza possono essere selezionate esplicitamente come criteri di una valutazione ITP impresa/commessa/fase/periodo. Il titolo documentale non stabilisce da solo l’applicabilità: responsabile, riferimento, motivazione, esito ed evidenze sono registrati distintamente. Lo storico conserva anche versione della classificazione e metadati delle fonti esaminate; file mensili/personali riservati e sigle non chiarite non vengono inclusi automaticamente. Questo collegamento non completa ancora i profili di requisiti per attività/ruolo e non trasforma la matrice in una lista universale di obblighi. Attuazione e limiti nel blocco J del piano principale.

## Profili riutilizzabili — 27 ottobre

I titoli destinati al fascicolo Sicurezza possono entrare nei profili aziendali versionati insieme a criteri liberi, attività, ruoli e limiti. Nessuna classificazione riservata o sigla da chiarire viene promossa a criterio operativo. Il profilo selezionato nella verifica ITP conserva la propria versione e tutti i criteri da esaminare; applicabilità, esito, motivazione ed evidenze restano del caso concreto. Il passaggio dai ruoli descritti alla copertura nominativa di persone/assegnazioni non è completato in questo blocco: non si deduce che un attestato di un addetto copra l’intera squadra. Attuazione e prove nel blocco K del piano e nell’undicesimo blocco del registro.

## Destinatari nominativi — 27 ottobre, blocco L

I criteri del catalogo possono ora riferirsi all'impresa, alla commessa, a un operaio assegnato o a un incarico pertinente. Le evidenze personali sono utilizzabili soltanto per il titolare esatto. L'estensione esplicita agli addetti della data/fase o alle nomine di un ruolo crea valutazioni separate e il server controlla le omissioni del gruppo dichiarato. I profili restano privi di nominativi; la matrice non genera automaticamente obblighi per mansione né attesta aggiornamento/validità di un corso dal titolo. Nessuna importazione automatica di documenti retributivi/sanitari o classificazione automatica di D.O.M.A./PLAC. Per prove e limiti, vedere blocco L del piano e dodicesimo blocco del registro.

## DPI previsti e consegne registrate — 27 ottobre, blocco M

La sicurezza della commessa consulta le consegne canoniche dei dipendenti interni collegati, con stato/date e presenza del riferimento al modulo, accanto ai testi DPI di una versione POS selezionata. Il verbale nel catalogo, il riferimento a un file, una consegna e l'adeguatezza rispetto alla lavorazione restano evidenze distinte: nessun abbinamento o esito positivo automatico. Non vengono importati i file privati dei dipendenti né assimilate le dotazioni degli operai esterni a quelle dell'impresa principale. Scritture del registro, dotazioni esterne e conservazione nelle emissioni POS sono ancora da completare; dettagli nel blocco M del piano e tredicesimo blocco del registro.

## Rettifiche del registro DPI interno — 27 ottobre, blocco N

Le consegne interne possono essere registrate e rettificate dalla commessa nello stesso registro canonico, con versioni e storico prima/dopo, motivo, autore disponibile e annullamento recuperabile. Non vengono trasferite ad altro titolare o impresa e le anagrafiche legacy di subappalto sono escluse dal registro interno. Il riferimento a un modulo già presente viene conservato senza esporre o copiare il file; la registrazione non genera un verbale firmato né soddisfa automaticamente la voce documentale della matrice. Moduli/file controllati, dotazioni esterne e inclusione nelle emissioni rimangono aperti. Dettagli e prove nel blocco N del piano e quattordicesimo blocco del registro.


## Dotazioni e verbali degli operai esterni — 27 ottobre, blocco O

La voce **Verbale di consegna DPI** può essere collegata esplicitamente alle dotazioni del suo operaio nel fascicolo del subappaltatore e consultata nelle commesse pertinenti per data/fase. Identità e versione dei metadati sono controllate senza confondere omonimi o archivi interni; la rilettura conserva le modifiche del modulo e richiede conferma della nuova versione del verbale. Annullamento e rettifiche conservano lo storico. Il collegamento a un file ricevuto non equivale a firma, consegna effettiva, idoneità o soddisfacimento automatico del requisito. Generazione/firma dei moduli, qualifiche tecniche e byte nelle emissioni restano aperti. Per implementazione e prove vedere blocco O del piano e quindicesimo blocco del registro.


## Prodotti impiegati e schede di sicurezza — 27 ottobre, blocco P

L'inventario di commessa propone materiali canonici e permette di registrare consumabili, indicando impresa, fase, periodo e impiego. Per ogni prodotto la necessità della SDS rimane da valutare oppure esplicitamente sì/no motivato. Il file del fascicolo è collegato per ID e versione letta, senza attribuirlo automaticamente ai prodotti omonimi o agli altri materiali. Revisione, stato documentale e corrispondenza dichiarata restano distinti da valutazione del rischio e idoneità. Non viene attribuita una scadenza automatica alla SDS. Il collegamento alle singole lavorazioni ed emissioni POS, l'archivio SDS aziendale proprio riutilizzabile tra commesse e la riconciliazione dei file precedenti restano da completare. Il catalogo delle 124 celle originali non è stato riscritto né è stata aggiunta una presunta riga Excel: questa integrazione deriva dal piano tecnico. Dettagli e prove nel blocco P e nel sedicesimo blocco del registro.


## SDS nelle singole lavorazioni ed emissioni POS — 27 ottobre, blocco Q

Per i documenti con il nuovo protocollo prodotti, la SDS viene associata all'impiego identificato nella lavorazione, con versione fotografata e conferme esplicite. Gli impieghi propri registrati nel periodo non possono essere omessi dall'approvazione; documento, fase, corrispondenza e copertura dell'intero periodo sono ricontrollati al server. Il pacchetto conserva i byte originali delle SDS autorizzate e le impronte dei byte, distinte da quelle dei metadati. Un allegato generico non copre gli altri prodotti. Nessun cambiamento retroattivo alle revisioni già emesse; scelta dei rischi/misure e completezza dell'inventario restano da riesaminare tecnicamente. Rimangono libreria SDS comune, archivi precedenti ed estensione all'emittente esterno; i vecchi editor conservano compatibilità fino al rilascio frontend coordinato. Nessuna riga Excel riscritta. Prove e limiti nel blocco Q del piano e diciassettesimo blocco del registro.


### Aggiornamento R — SDS aziendali e revisioni

Le schede di sicurezza della propria impresa possono ora essere archiviate una sola volta e selezionate in più commesse. La provenienza delle revisioni è immutabile e distingue le due versioni documentali. Il quadro mostra gli impieghi collegati e i periodi da riesaminare, senza sostituzione automatica, attestazioni di verifica implicite o modifica di POS storici. Il fascicolo del subappaltatore conserva separatamente le sue SDS. Non sono stati importati automaticamente file dell'Excel o riconciliati originali omonimi. Dettagli/prove/limiti nel blocco R del piano e nel diciottesimo blocco del registro. Le altre 124 righe documentali mantengono destinazione e condizioni già definite; DOMA e PLAC restano da chiarire.


### Aggiornamento S — dati tecnici del POS e documenti di supporto

Le schede di lavorazione possono ora contenere rischi/misure/valutazioni distinti, organizzazione/sequenza e attrezzature effettive, con riesame per cantiere. Sono conservate nelle revisioni e riportate nel PDF. Le voci dell'Excel relative a manuali, manutenzioni, formazione/abilitazione, valutazioni e procedure **non sono considerate soddisfatte dai nuovi campi testuali**: restano da collegare le evidenze canoniche, verificare versioni/periodi e documentare gli esiti pertinenti. Il riuso non porta automaticamente fonti, identificativi effettivi o conferme del cantiere precedente. Dettagli e limiti nel blocco S e nel diciannovesimo blocco del registro; nessuna delle 124 righe è stata dichiarata completata sulla sola base della presenza di testo nel POS.


### Aggiornamento T — originali tecnici collegati alle schede

Rischi/attrezzature possono riferire originali del fascicolo della propria impresa/commessa: DVR, PSC, PiMUS, documenti attrezzatura e Analisi dei rischi classificata (catalogo v1). Fotografia/metadati, pertinenza, fase e periodo vengono controllati; il pacchetto conserva gli originali e la provenienza. Le dichiarazioni senza originale sono separate e motivate. Non si deduce da ciò che un manuale appartenga alla specifica macchina o che un attestato abiliti la persona: legami canonici e verifiche dei requisiti restano da implementare. I documenti personali/HR/amministrativi e del subappaltatore non passano da questa proiezione. Nessuna riga dell'Excel è considerata automaticamente soddisfatta dalla selezione di un titolo. Dettagli/prove/limiti nel blocco T del piano e nel ventesimo blocco del registro.


### Aggiornamento U — attrezzatura effettiva, assegnazione e impiego

La scheda attrezzatura POS può riferire l'identità del modulo Mezzi con fonte d'assegnazione/allocazione, quantità e periodo d'uso dichiarati; omonimi distinti, fotografie conservate in fonti/manifest e ricontrollo atomico. Una collocazione corrente non prova assegnazione storica, presenza oraria o idoneità. Il riuso rimuove i legami al precedente cantiere. La proiezione esclude dati economici, assegnatari HR, note e percorsi file.

**Le voci Excel su manuali, libretti, verifiche periodiche, PiMUS/autorizzazioni, manutenzioni e formazione restano da soddisfare con evidenze pertinenti**: la scelta di una macchina non collega ancora i suoi `mezzi_documenti` o verbali di manutenzione. I documenti di commessa del blocco T non diventano automaticamente documenti della macchina selezionata. Servono il collegamento canonico, la selezione delle revisioni applicabili, gli originali conservati, le verifiche di date/contatori/esiti e il riesame del referente. Nessuna delle 124 voci dell'Excel è chiusa dal solo collegamento d'inventario. Prove/limiti nel blocco U del piano e nel ventunesimo blocco del registro; rilascio frontend coordinato ancora aperto.


### Aggiornamento V — originali della specifica macchina e controlli registrati

Documenti tecnici nativi della macchina (manuale/CE, libretto, revisione, verifica periodica, taratura, PiMUS, autorizzazione ministeriale) possono essere selezionati per ID, letti/riesaminati e conservati nel pacchetto POS con provenienza. La revisione è esplicitamente letta e dichiarata dal compilatore, non attestata da un campo inesistente dell'archivio. Periodo dell'originale confrontato con uso effettivo; metadati dell'oggetto Storage e byte conservati hanno impronte distinte. Costi, note private, HR e documenti economici non passano nella proiezione.

Il quadro manutenzioni/segnalazioni è acquisito e riesaminato esplicitamente; non certifica idoneità o formazione. Le righe dell'Excel relative ai verbali tecnici delle manutenzioni non sono chiuse dai soli dati degli interventi: gli allegati vanno classificati/collegati evitando fatture. Anche pertinenza, requisiti applicabili, esiti effettivi e successione dei controlli richiedono riesame tecnico. Non tutte le124 voci diventano soddisfatte selezionando una macchina o un documento. Prove e limiti nel bloccoV e nel ventiduesimo blocco del registro; Storage fisico/end-to-end e rilascio frontend coordinato restano aperti.


## Aggiornamento W — verbali tecnici da manutenzione (27 ottobre)

I documenti tecnici delle attrezzature possono provenire dall’allegato di un intervento, con lettura e classificazione esplicite, copia indipendente verificata, registro della fonte/autore e mantenimento del riferimento dopo rimozione dell’intervento. Nessuna fattura viene classificata automaticamente e nessuna conferma equivale a idoneità. La copia entra nell’archivio della macchina ed è selezionabile dai controlli POS V; costi e note della manutenzione non vengono proiettati. Migrazione 245 e servizio mezzi-verbali 1 distribuiti; frontend locale.

Prove: 390 test POS/mezzi, 9 Deno, fixture nativa con rollback e scrittura sotto service_role, tipi mirati/lint; dettagli e limiti nel blocco W del registro. Restano trasferimento fisico Storage end-to-end, verifica professionale, successione dei controlli, requisiti di formazione/addestramento, gestione orfani e rilascio main, oltre alle altre voci aperte del piano. Nessun documento reale classificato o POS approvato nel collaudo.


## Aggiornamento X — qualifiche nominative documentate (27 ottobre)

Per le voci relative a formazione, abilitazione, addestramento e qualifiche degli addetti è disponibile una registrazione nominativa con ambito, ente, date e limiti, originale HR o fascicolo esterno, revisioni e revoca motivata. Nessun requisito è dedotto dal titolo e nessuna periodicità dell’Excel è applicata automaticamente. Dati e originali clinici/contrattuali/identità non sono sorgenti ammesse dal collegamento; il contenuto effettivo dei file resta da classificare professionalmente. La proiezione di Sicurezza senza Personale non espone i percorsi degli originali HR.

Migrazione 246 applicata/allineata; frontend locale. 438 test sulle aree interessate, di cui 26 specifici; fixture nativa con rollback e permessi effettivi, tipi mirati/lint e build 243/243 superati. Browser sul profilo demo: RPC letta e registrazione impossibile senza originale, nessun dato reale modificato. Restano associazione a requisiti di ruolo/lavorazione/attrezzatura/fase, copertura nominativa, byte congelati per emissione, politica di archivio/retention e tutti gli altri lavori aperti del piano. Dettagli e limiti nel blocco X del registro.


### Aggiornamento Y — qualifiche contestualizzate per gli addetti (27 ottobre)

Le qualifiche nominative dei gruppi dipendenti (B39:C83) e subappaltatrice (H80:I85) possono essere confrontate con requisiti selezionati per l’organico realmente collegato alla commessa, periodo/fase e macchina canonica facoltativa. Profilo e criterio sono versionati, ogni evidenza è selezionata per ID e riesaminata esplicitamente; scadenze, persona e limiti dell’originale sono verificati dal server. Non è un’autorizzazione all’ingresso né una verifica automatica di tutti i documenti Excel. I collegamenti ambigui e le persone non riconciliate mantengono lo stato parziale. Migrazione 247 applicata, frontend locale; 514 test mirati/54 file e fixture SQL con rollback superati, lettura browser reale verificata. Registro append-only, nessuna esportazione automatica nel POS o fusione dell’organico esterno con l’emittente. Mancano ancora qualifiche dei professionisti/autonomi, originali fisici congelati, mobile/concorrenza e rilascio main. Dettagli e limiti nel blocco Y del piano e nel venticinquesimo blocco del registro. D.O.M.A. e PLAC restano sigle da chiarire, senza obblighi attribuiti automaticamente.


### Aggiornamento Z1 — identità della formazione nel POS (27 ottobre)

La preparazione distingue le identità HR senza risolvere duplicati per primo risultato e senza importare lavoratori esterni legacy nell’organico dell’emittente. Il riferimento HR nella riga formazione resta una fonte da validare, non sostituisce attestati o riesame dei requisiti. Cambiare il nominativo nell’editor rimuove attestati e conferme precedenti. `genera-pos` 91 ACTIVE, 30 file riletti identici; frontend locale, 526 test mirati/55 file e 36 test Deno superati. Il blocco Z rimane aperto: selezione dei riscontri Y, ambiti temporali e tecnici nel POS, guardie native, matrice PDF e originali fisici congelati non ancora implementati. Nessuna copertura aggiuntiva delle sigle D.O.M.A./PLAC o dei requisiti sanitari/amministrativi viene dedotta da questo riferimento.


### Grafica ed esempio POS (27 ottobre)

Aggiunte 11 icone editoriali originali per le sezioni, copertina bozza e pagina avvertenze separate, con protezione dei titoli isolati. `genera-pos` 92 ACTIVE, renderer `pos-pdf-6-icone-editoriali/pdfmake-0.3.9`, 31 file riletti identici. Esempio dimostrativo finale di 21 pagine con tre lavorazioni, nove rischi, sei attrezzature e riquadri delle fonti/documenti ancora da scegliere. Nessun originale o firma reale. 531 test mirati/56 file, 36 test Deno, build isolata e controllo visivo superati. Il set grafico non è segnaletica e non attesta copertura di nuove righe Excel. Le evidenze reali, le planimetrie e le aree aperte nei blocchi Y/Z restano da completare; nessun requisito viene dedotto dalle icone.

## Aggiornamento 27 ottobre — riscontri nominativi della propria impresa nel POS

La catena X (qualifica documentale) → Y (persona/requisito nel periodo/fase/attrezzatura della commessa) → Z2 (lavorazione POS e originali nell’emissione) ora è collegata per gli addetti HR della propria impresa. La selezione non raccoglie operai e attestati dei subappaltatori nel POS emittente, non unisce omonimi né sceglie soltanto righe positive di un riesame. Per una lavorazione interamente esterna si dichiara impresa e motivazione, senza generare il suo POS. La ripresa da standard/duplicazione conserva il protocollo ma esclude persone, riscontri e conferme della sorgente. Il PDF riporta la matrice nominativa; lo ZIP conserva solo i pertinenti originali formativi con byte e impronte distinti da quelli dei metadati.

Migrazioni 248/249 applicate/allineate, `genera-pos` 93 ACTIVE; frontend locale senza push main. 557 test applicativi, 43 Deno e fixture native con rollback, senza dati fittizi conservati. Non ancora coperti da questa catena: tutti gli incarichi professionali/autonomi, DPI e ricevute nell’emissione, firme/consultazioni, organizzazione ed emergenze/planimetrie, PSC e prescrizioni, emittente esterno, collaudo fisico con referente, ACL per caso/retention e rilascio coordinato. Queste voci restano aperte; le sigle D.O.M.A./PLAC non diventano obblighi per deduzione. Dettagli e limiti nel piano principale, blocchi Z2a/Z2b.


## Collaudo demo e segnaletica — 27 ottobre

Due commesse, sei fasi, due operai esterni, quattro assegnazioni, due bozze POS persistenti e nove upload fisici autorizzati in Demo Azienda 2. Difetto MIME degli import ZIP corretto e verificato con nuovo upload. Otto pittogrammi espliciti per lavorazione e ubicazione, nessuna prescrizione automatica; tre PDF di 22 pagine con filigrana BOZZA, non approvati. 584 test/63 file e 43 Deno verdi; TypeScript/lint/check/build riusciti. `genera-pos` 94 ACTIVE, JWT attivo, renderer8; frontend/MIME locali. Dettagli, ID, limiti e test nel blocco Z3 del piano principale. Restano 47 dati/decisioni da completare nei due POS demo e tutti i requisiti ancora aperti del piano; nessuna dichiarazione di 10/10 o di rilascio su main.


## Importazione archivio precedente — 27 ottobre

Disponibile Porta nel fascicolo per documenti_subappaltatore: ambito esplicito, copia privata dei byte, SHA-256 informativa, nessuna verifica ereditata, recupero delle interruzioni e chiave deterministica per evitare duplicati. Copia demo reale verificata (visura 76d4bff5-a16d-45d2-9e9a-94890e99bcda, 2621 byte, stesso eTag, ricevuto non verificato). 600 test/65 file, TypeScript, lint e build riusciti. Nessuna migrazione/policy/Edge modificata; frontend locale. Dettagli e limiti nel blocco Z4 del piano principale: restano secondo archivio Campo, provenienza nativa immutabile, emissione con originali e tutti i requisiti non chiusi del piano.

### Z5 · PSC–POS (27/10)
Il PSC può essere caricato nella commessa e scelto nel POS con revisione e SHA dei byte; le prescrizioni manuali riportano pagina, lavorazione e responsabile. Originale preservato nello ZIP secondo i controlli della nuova emissione; fonti o impronte incoerenti bloccate. Nessuna interpretazione AI, vigenza o approvazione tecnica automatica. Migrazione 20281027225000 e funzione 95 online; editor locale. Restano estrazione/OCR, revisioni applicabili, ricevute, portale e collaudo completo reale. D.O.M.A./PLAC rimangono da chiarire.

### Z6 / D1 · Indice operativo del fascicolo
Il nuovo quadro della commessa distingue evidenze registrate, ricezione/verifica/integrazione/scadenze ed archivi da riconciliare, con data/fase/titolare e azione verso la fonte. Usa catalogo e fascicolo esistenti, senza generare obblighi dai titoli dell’Excel. I file delle ditte collegate da contratto/assegnazione sono ora letti anche quando l’anagrafica è generale. Restano distinti gli archivi e la verifica del caso. Dettagli e roadmap D1–D7 nel piano principale; D.O.M.A./PLAC ancora da definire.
