# Conferme fornitore, ordini, DDT e fatture — piano di sviluppo

Data: 11 novembre 2026. Ambito: tutte le aziende, inclusa Demo; desktop e mobile.

## Obiettivo

Un percorso unico per verificare richiesta inviata, conferma ufficiale del fornitore,
merce ricevuta e fattura. Ogni confronto permette di consultare righe e originali,
mostra i dati mancanti e conserva le decisioni senza modificare automaticamente
quantità ordinate, magazzino, costi o stato di ricezione.

## Regole del flusso

- Richiesta inviata, conferma ricevuta, conferma approvata e ricezione fisica sono
  fatti distinti. La lettura AI non equivale a un'approvazione.
- Le versioni inviate sono conservate nello storico esistente. Le bozze e gli
  invii falliti non sono presentati come richieste spedite.
- Ogni controllo conserva la base usata e l'impronta commerciale dell'ordine.
  Cambiare misure, quantità, prezzo, fornitore o condizioni invalida il controllo;
  ricevere merce, aggiornare lo stato logistico o riaprire il documento non lo invalida.
- Lo stesso PDF su una nuova revisione richiede un nuovo confronto, riutilizzando
  la trascrizione quando possibile. Risultati e approvazioni precedenti restano nello storico.
- Una conferma parziale mantiene aperte le quantità non confermate; una riga
  assente non viene considerata annullata. Le variazioni richiedono una decisione esplicita.
- Le quantità di DDT/fatture possono riferirsi a più ordini. I collegamenti documentali
  non registrano arrivi né duplicano quantità o costi.

## Fase 1 — revisioni, originali e salvataggi

- [x] Conservare i metadati tecnici e l'identità delle righe nel documento inviato.
- [x] Selezionare come base l'ultimo invio riuscito o dichiarare esplicitamente
      che si usano i dati correnti in assenza di una versione inviata.
- [x] Salvare base, impronta commerciale e revisione del controllo.
- [x] Controllare l'impronta al termine dell'AI e prima di ogni approvazione.
- [x] Conservare il documento anche quando l'analisi fallisce; permettere di riprovare.
- [x] Elaborare in background i documenti lunghi, conservando identità del lavoro e risultato; la pagina può essere chiusa e riaperta.
- [x] Distinguere PDF inviati, conferme ricevute/approvate e documenti storici.
- [x] Rendere caricamento e consultazione delle conferme disponibili nell'ordine
      indipendentemente dalla modalità con cui è stato richiesto al fornitore.

Accettazione: stesso PDF + ordine modificato non restituisce una vecchia approvazione;
un DDT ricevuto non rende obsoleta una conferma; invii falliti esclusi dagli originali inviati.

## Fase 2 — lettura e confronto affidabile

- [x] Leggere quantità, codici, riferimento posizione, misure e configurazione tecnica.
- [x] Conservare pagina e valore originale; dati illeggibili/assenti restano da verificare.
- [x] Verificare riferimenti al fornitore e all'ordine, segnalando documenti misti
      o riconducibili a più ordini senza attribuirli automaticamente.
- [x] Gestire PDF, immagini e scansioni tramite il percorso di preparazione esistente.
- [x] Confrontare misure e varianti separatamente dalle condizioni commerciali.
- [x] Evitare la scelta arbitraria fra più articoli compatibili.
- [x] Applicare tolleranze esplicite: una differenza resta visibile anche entro soglia.
- [x] Non convertire confezioni o kit senza un rapporto noto e confermato.
- [x] Mantenere residui per conferme parziali; evidenziare quantità aggiuntive e prezzi proposti.
- [x] Consentire correzioni manuali verificabili, con motivazione e autore.

Accettazione: due finestre identiche nelle misure ma diverse per configurazione non
vengono abbinate automaticamente; misure invertite e aperture differenti emergono;
prezzo inizialmente assente resta una proposta; lettura incompleta non diventa conforme.

## Fase 3 — interfaccia condivisa dei confronti

Tre modalità con la medesima struttura:

| Modalità | Sinistra | Destra |
| --- | --- | --- |
| Conferma fornitore | Richiesta/versione inviata | Conferma ricevuta, righe e originale |
| DDT e ordini | Bolla, righe e originale | Ordini, PDF inviati e conferme del fornitore |
| Fattura, DDT e ordini | Fattura, righe e originale | Documenti collegati, righe e originali |

- [x] Azione AI nella barra superiore, con stato di elaborazione e messaggi brevi.
- [x] Tre indicatori compatti, etichette contestuali e filtri cliccabili.
- [x] Selettore dell'ordine e della revisione sopra il documento.
- [x] Tabelle compatte, testo completo al passaggio o apertura della riga.
- [x] Mostrare solo differenze e passare alla differenza successiva.
- [x] Evidenziare le corrispondenze mantenendo visibili quantità e unità.
- [x] Consultare originali senza cambiare pagina o perdere il confronto.
- [x] Su mobile permettere di alternare i pannelli mantenendo documento e selezione.
- [x] Azioni distinte: controlla, correggi, prepara richiesta di correzione, approva.

Accettazione: PDF della conferma visibile a destra nel confronto DDT; azione AI in alto;
stessi controlli e gerarchia visiva nel confronto fattura; nessuna colonna essenziale nascosta.

## Fase 4 — integrazione operativa

- [x] Riutilizzare il controllo canonico del fornitore; eliminare i percorsi UI duplicati.
- [x] Mostrare quale conferma è approvata e se è ancora riferita alla revisione corrente.
- [x] Mantenere separati dati richiesti, proposti dal fornitore e accettati.
- [x] Gli articoli non confermati restano in attesa; una riduzione o sostituzione
      non può cancellare merce già ricevuta.
- [x] DDT e fatture consultano gli stessi originali e le stesse revisioni.
- [x] Preparare eventuale email di correzione per la revisione dell'utente.
- [x] Salvare decisioni con autore, data e versione; rifiutare salvataggi obsoleti.
- [x] Conservare isolamento aziendale e permessi Acquisti/sola lettura.

## Fase 5 — simulazioni e rilascio

Campioni dimostrativi con risultato atteso verificabile:

1. Conferma corretta di un ordine senza prezzi iniziali.
2. Finestra P3: 1200 × 1400 richiesta, 1200 × 1450 confermata.
3. Apertura destra richiesta, sinistra confermata; colore o vetro differente.
4. Due posizioni con stesse misure e codici/riferimenti incompleti.
5. Quantità 10 richiesta, 8 confermata, 2 ancora in attesa.
6. Riga suddivisa, kit/confezione e unità incompatibili.
7. Revisione dell'ordine dopo analisi e dopo approvazione; decisioni concorrenti.
8. Stesso file ricaricato, errore AI recuperabile, immagine e PDF multipagina.
9. DDT multipli/ordini multipli, consegna in cantiere e reso.
10. Fattura cumulativa, documenti mancanti e utenti Acquisti reali.

- Test significativi di logica, SQL/RLS e interfaccia.
- Lint, TypeScript, build e ricostruzione completa delle migrazioni.
- Simulazioni reali su documenti dimostrativi; nessuna email inviata automaticamente.
- Controllo visivo desktop/mobile con originali e differenze.
- Rilascio allineato alle modifiche degli altri terminali su main e online.
- Verifica pubblicazione, funzioni, migrazioni e persistenza dei salvataggi.

## Base di partenza

Piano approvato dall'utente; implementazione avviata in checkout isolato.
Esistono già storico degli invii, lettura della conferma, campi di misura,
decisioni manuali, originali PDF/foto, relazioni DDT–OdA multiple e confronto fatture.
Questi elementi vengono estesi, mantenendo un solo registro degli arrivi fisici.


## Implementazione e prove

Implementazione nella [PR 129](https://github.com/Ediliziaio/edilizia-in-cloud/pull/129).
La checklist delle fasi 1–4 descrive le funzioni implementate; i controlli della fase 5
sono i criteri obbligatori prima del merge e della pubblicazione.

- Confronto reale: conferma con altezza 1450 anziché 1400 mm, apertura invertita,
  quantità inferiore e posizione assente rilevate separatamente.
- Conferma corretta: due posizioni riconosciute; prezzi 700 e 650 euro applicati
  soltanto dopo approvazione e conferma dedicata. Quantità e arrivi invariati.
- Multipagina reale: 10 pagine lette, 20 posizioni riconosciute; pagina e testo
  d'origine conservati. Avvisi del documento Demo restano da valutare.
- Foto HEIC: conversione per la lettura e conservazione dell'originale; stessa
  verifica delle differenze di misura, apertura e quantità.
- Verifica delle nuove RPC con entrambe le identità Acquisti di Vulcano,
  ruolo authenticated, in transazioni concluse con rollback: lettura,
  decisione, approvazione e applicazione prezzi riuscite senza registrare arrivi.
- Ricostruzione offline completa: 5.804 migrazioni e 74 fondazioni Storage,
  nessuna patch rinviata. Build di produzione riuscita nella prima esecuzione CI;
  le correzioni TypeScript e del caricamento vengono ricontrollate sull'ultimo commit.

Gli originali inviati sono identificati anche per evento d'invio. Una revisione
precedente non deve mostrare il PDF corrente: se l'originale o lo snapshot completo
non esistono, l'interfaccia lo dichiara e conserva comunque le righe verificate.
Le letture interrotte restano riprovabili; due elaborazioni non possono sovrascriversi
quando una nuova lettura ha già preso in carico la stessa revisione.

La seconda simulazione multipagina è stata avviata in background e recuperata dopo
la chiusura del confronto: 10/10 pagine e 20 posizioni lette. Nel confronto della
fattura, DDT e OdA selezionati insieme non raddoppiano la quantità consegnata.
Il comando Aggiorna ricarica decisione aperta, base e originali.
