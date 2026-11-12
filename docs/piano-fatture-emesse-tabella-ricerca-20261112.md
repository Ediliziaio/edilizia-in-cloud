# Fatture emesse: tabella compatta e ricerca completa

Piano del 12 novembre 2026, basato sugli screenshot forniti e sui sorgenti di
`main` verificati al commit `980e758e4766516d78900fd86aa6176f1cc091fc`.
Questo documento definisce lo sviluppo; non modifica fatture o procedure fiscali.

## Obiettivo

Una fattura occupa una sola riga nella tabella desktop, con lo stesso stile
dell'elenco delle fatture ricevute. Data e numero hanno colonne separate;
emissione, trasmissione SDI e incasso hanno significati distinti. La ricerca
deve trovare i documenti nell'intero archivio accessibile dell'azienda.

## Situazione verificata

- `DocumentiFiscaliList.tsx` mostra Stato, Cliente, Data / Numero, Prossima
  scadenza e Importo. Data e numero sono disposti su due righe; la cella Stato
  può contenere sia badge di incasso sia badge SDI.
- `FattureRicevutePage.tsx` dispone già di tabella compatta, intestazione fissa,
  colonne selezionabili, scorrimento orizzontale e collegamenti/allegati.
- `DocumentoFiscale` e il relativo mapping hanno già imponibile, IVA, totale
  documento, totale da pagare, importo pagato, note documento e note interne.
  Non tutti questi dati sono esposti allo stesso modo dall'elenco misto di
  documenti nativi e importati: la disponibilità va verificata per ogni origine.
- `ricercaDocumenti` ricerca numero, note del documento, cliente, codice fiscale
  e partita IVA. Non interpreta date e importi come campi tipizzati.
- Le note interne vengono cercate con una seconda RPC,
  `ricerca_note_fatture`, che limita gli ID restituiti a 200. Questo limite non
  deve diventare una perdita silenziosa di risultati nella nuova ricerca.
- I collegamenti alle commesse esistono, anche attraverso `fattura_ordine`:
  una fattura può essere collegata a più lavori e deve comunque restare una riga.

## 1. Colonne e presentazione

Colonne richieste disponibili all'apertura; possibilità di scegliere quali
vedere tramite il pulsante **Colonne**, coerente con le fatture ricevute.

| Colonna | Contenuto e comportamento |
|---------|--------------------------|
| Selezione | Checkbox, mantenendo le azioni multiple esistenti. |
| Cliente | Ragione sociale o nome completo; testo lungo abbreviato, nome completo accessibile. |
| Numero | Numero originale, inclusi serie, barre e prefissi; nessun cambio di numerazione. |
| Data | Data di emissione, su una sola riga e distinta dal numero. |
| Imponibile | `imponibile_totale`. |
| Totale | `totale_documento`, coerente con il dettaglio. |
| Netto a pagare | `totale_da_pagare`: importo dovuto dal cliente, distinto dall'imponibile e dal residuo. |
| SDI | Badge della fase effettiva di trasmissione/esito, riusando il calcolo esistente. |
| Stato incasso | Da incassare, parzialmente incassata, incassata; scaduta evidenziata con la relativa data. |
| Incassato | Importo registrato secondo la fonte del documento. |
| Residuo | Valore canonico ancora da incassare, coerente con incassi, storni e note di credito. |
| Prossima scadenza | Data della rata aperta pertinente; ritardo o urgenza senza confondere stato SDI e pagamento. |
| Collegata a | Codice della commessa/lavoro cliccabile. Con più collegamenti: primo codice e `+N`, con elenco apribile. |
| Note | Anteprima testuale abbreviata, apertura del testo completo. Note documento e interne riconoscibili. |
| Allegati | Icona e numero dei file, con apertura dell'elenco esistente. |
| Azioni | Azioni correnti autorizzate, con nomi/tooltip comprensibili e menu compatto. |

Ulteriori colonne selezionabili: stato documento (bozza/emessa/annullata e
altri stati applicabili), IVA, modalità di pagamento, origine del documento.
Non forzare valori fiscali mancanti a zero: distinguere dato assente e zero reale.

Regole di layout:

- Celle su una riga; nomi, numeri e note lunghi non aumentano l'altezza.
- Importi allineati a destra e formattati in italiano.
- Intestazioni fisse e scorrimento orizzontale contenuto nella tabella, come
  nelle ricevute; su schermi stretti restano leggibili le colonne identificative.
- Cliente/numero e azioni restano facilmente raggiungibili nello scorrimento.
- Le preferenze delle colonne sono memorizzate senza interferire con quelle
  delle ricevute; il perimetro utente/azienda va esplicitato nella chiave.
- Il layout mobile conserva una lettura adatta al telefono e l'accesso ai
  dettagli: non si restringono sedici colonne fino a renderle illeggibili.
- Si mantiene l'ordinamento predefinito anno/numero decrescente, con bozze senza
  numero gestite come oggi. Aggiungere ordinamento esplicito dove utile.

## 2. Regole dei dati

- Riutilizzare la logica SDI esistente (`faseSdi`, `FaseSdiBadge`). “Emessa” non
  prova l'invio a SDI e l'incasso non modifica lo stato della trasmissione.
- Per fatture importate/provider esterni mostrare gli esiti disponibili e
  distinguere stato sconosciuto o gestito esternamente; nessun esito inventato.
- Riutilizzare i calcoli canonici di residuo/storno e i dati degli incassi.
  Evitare una nuova formula nella tabella, in particolare sui documenti
  importati che hanno già importi normalizzati.
- Caricare note, allegati e collegamenti con dati aggregati o richieste in
  blocco. Nessuna richiesta separata per ogni riga della pagina.
- Aggregare i collegamenti multipli senza duplicare fatture, conteggi,
  paginazione o totali.
- Rispettare azienda attiva e permessi sia nella lista sia nella ricerca;
  note interne restano interne e non vengono aggiunte automaticamente a PDF,
  XML o comunicazioni al cliente.

## 3. Ricerca unica

Testo guida: **Cliente, numero, importo, data o note…**

| Input | Comportamento atteso |
|-------|----------------------|
| Nome o ragione sociale | Ricerca testuale parziale, senza distinzione maiuscole/minuscole. |
| Numero/prefisso | Ricerca sul numero originale, inclusi `/` e prefissi. |
| Importo | Interpretazione dei formati italiani e con punto decimale, confronti numerici sugli importi pertinenti. |
| Data | Riconoscimento di `12/11/2026`, `12-11-2026` e `2026-11-12`, con validazione della data. |
| Testo nota | Ricerca sia nelle note del documento sia nelle note interne autorizzate. |
| Partita IVA / CF | Conservare la capacità già esistente. |

Esempio importi equivalenti: `3.235,00`, `3235,00`, `3235.00` e `€ 3.235,00`.
Per un input riconoscibile come importo o data si conserva anche la ricerca
testuale utile sul numero fattura: evitare che un numero diventi ambiguo e
faccia sparire documenti che prima si trovavano.

La ricerca:

- viene applicata sul server prima di conteggio e paginazione;
- lavora su tutte le pagine, sui documenti nativi e importati;
- conserva filtri attivi e ordinamento e torna alla prima pagina quando cambia;
- tratta i caratteri speciali come testo, senza alterare la query;
- non carica tutto l'archivio nel browser;
- non tronca silenziosamente i risultati delle note ai primi 200 ID;
- segnala un errore della ricerca, distinguendolo da “nessun risultato”.

Le note strutturate sono ricercabili. Il testo presente soltanto dentro un PDF
o altro allegato richiede un'estrazione/indicizzazione dedicata: non va promesso
come parte già disponibile della ricerca sulle note.

## 4. Filtri

Rendere indipendenti: cliente, periodo di emissione, stato documento, SDI,
stato incasso e commessa/lavoro. Aggiungere, se utile alla vista, “Con note” e
“Con allegati”. Filtri attivi visibili e rimovibili; azione “Azzera filtri”.
Valutare min/max importo come filtro esplicito, senza introdurre una sintassi
complessa nella barra libera.

## 5. Sequenza di sviluppo

1. **Contratto dati dell'elenco:** controllare cosa espongono viste e mapping
   per entrambe le origini; aggiungere solo i campi/aggregati mancanti.
2. **Tabella:** separare le colonne, riusare lo stile delle ricevute e
   introdurre configurazione delle colonne, note e collegamenti.
3. **Ricerca:** normalizzazione numeri/date, query completa e rimozione del
   limite silenzioso sulle note interne, con conteggio/pagine coerenti.
4. **Filtri e ordinamento:** separare SDI e incasso, mantenere selezioni e
   azioni autorizzate; evitare ricerche/aggiornamenti duplicati.
5. **Verifica nell'app reale:** controllare la corrispondenza con dettaglio,
   registro incassi e collegamenti esistenti. Nessuna schermata sostitutiva
   con dati inventati; test automatici separati con dati controllati.
6. **Rilascio:** verifiche appropriate, revisione delle sole modifiche di
   questo intervento e pubblicazione secondo le istruzioni della sessione.

## 6. Criteri di accettazione

- Ogni documento occupa una sola riga desktop, anche con cliente/numero/note
  lunghi, due badge applicabili, più allegati o più commesse.
- Fattura pagata ma non inviata: incasso e SDI risultano entrambi corretti.
- Parzialmente incassata/scaduta: importi e prossima scadenza coincidono con il
  dettaglio e non cambiano per effetto dell'impaginazione.
- Note di credito, storni e credito cliente non generano residui falsi.
- Importata con informazioni SDI mancanti: stato esplicitamente non noto o
  esterno, senza attribuire automaticamente “Inviata”.
- Cliente, numero, data, importo e nota trovano fatture anche oltre la prima
  pagina; oltre 200 corrispondenze sulle note restano paginabili.
- Più commesse associate non moltiplicano documenti o totali; i link rispettano
  i permessi dell'utente.
- Cambio azienda: nessun risultato, nota o preferenza impropriamente ereditata.
- Le altre liste che riusano `DocumentiFiscaliList` (DDT, note di credito,
  proforma, cestino) mantengono le proprie colonne e azioni appropriate.
- La lettura dell'elenco non invia fatture, non registra incassi e non cambia
  documenti fiscali.

## File principali interessati

- `src/pages/azienda/fatturazione/DocumentiFiscaliList.tsx`
- `src/pages/azienda/fatturazione/FattureRicevutePage.tsx` (riferimento visivo)
- `src/hooks/useDocumentiFiscali.ts`
- `src/lib/fatturazione/filtriDocumenti.ts`
- `src/lib/fatturazione/incassi.ts` e `sdiCassetto.ts` (regole da riusare)
- `src/lib/fatturazione/colonneRicevute.ts` (riferimento per preferenze)
- `src/hooks/billing/useFatturaOrdineLink.ts` (collegamenti esistenti)
- Viste/RPC dell'elenco, solo se servono campi o ricerca non esponibili con le
  strutture correnti; nessuna modifica preventiva alle procedure SDI.
