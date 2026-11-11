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

- [ ] Conservare i metadati tecnici e l'identità delle righe nel documento inviato.
- [ ] Selezionare come base l'ultimo invio riuscito o dichiarare esplicitamente
      che si usano i dati correnti in assenza di una versione inviata.
- [ ] Salvare base, impronta commerciale e revisione del controllo.
- [ ] Controllare l'impronta al termine dell'AI e prima di ogni approvazione.
- [ ] Conservare il documento anche quando l'analisi fallisce; permettere di riprovare.
- [ ] Distinguere PDF inviati, conferme ricevute/approvate e documenti storici.
- [ ] Rendere caricamento e consultazione delle conferme disponibili nell'ordine
      indipendentemente dalla modalità con cui è stato richiesto al fornitore.

Accettazione: stesso PDF + ordine modificato non restituisce una vecchia approvazione;
un DDT ricevuto non rende obsoleta una conferma; invii falliti esclusi dagli originali inviati.

## Fase 2 — lettura e confronto affidabile

- [ ] Leggere quantità, codici, riferimento posizione, misure e configurazione tecnica.
- [ ] Conservare pagina e valore originale; dati illeggibili/assenti restano da verificare.
- [ ] Verificare riferimenti al fornitore e all'ordine, segnalando documenti misti
      o riconducibili a più ordini senza attribuirli automaticamente.
- [ ] Gestire PDF, immagini e scansioni tramite il percorso di preparazione esistente.
- [ ] Confrontare misure e varianti separatamente dalle condizioni commerciali.
- [ ] Evitare la scelta arbitraria fra più articoli compatibili.
- [ ] Applicare tolleranze esplicite: una differenza resta visibile anche entro soglia.
- [ ] Non convertire confezioni o kit senza un rapporto noto e confermato.
- [ ] Mantenere residui per conferme parziali; evidenziare quantità aggiuntive e prezzi proposti.
- [ ] Consentire correzioni manuali verificabili, con motivazione e autore.

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

- [ ] Azione AI nella barra superiore, con stato di elaborazione e messaggi brevi.
- [ ] Tre indicatori compatti, etichette contestuali e filtri cliccabili.
- [ ] Selettore dell'ordine e della revisione sopra il documento.
- [ ] Tabelle compatte, testo completo al passaggio o apertura della riga.
- [ ] Mostrare solo differenze e passare alla differenza successiva.
- [ ] Evidenziare le corrispondenze mantenendo visibili quantità e unità.
- [ ] Consultare originali senza cambiare pagina o perdere il confronto.
- [ ] Su mobile permettere di alternare i pannelli mantenendo documento e selezione.
- [ ] Azioni distinte: controlla, correggi, prepara richiesta di correzione, approva.

Accettazione: PDF della conferma visibile a destra nel confronto DDT; azione AI in alto;
stessi controlli e gerarchia visiva nel confronto fattura; nessuna colonna essenziale nascosta.

## Fase 4 — integrazione operativa

- [ ] Riutilizzare il controllo canonico del fornitore; eliminare i percorsi UI duplicati.
- [ ] Mostrare quale conferma è approvata e se è ancora riferita alla revisione corrente.
- [ ] Mantenere separati dati richiesti, proposti dal fornitore e accettati.
- [ ] Gli articoli non confermati restano in attesa; una riduzione o sostituzione
      non può cancellare merce già ricevuta.
- [ ] DDT e fatture consultano gli stessi originali e le stesse revisioni.
- [ ] Preparare eventuale email di correzione per la revisione dell'utente.
- [ ] Salvare decisioni con autore, data e versione; rifiutare salvataggi obsoleti.
- [ ] Conservare isolamento aziendale e permessi Acquisti/sola lettura.

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

- [ ] Test significativi di logica, SQL/RLS e interfaccia.
- [ ] Lint, TypeScript, build e ricostruzione completa delle migrazioni.
- [ ] Simulazioni reali su documenti dimostrativi; nessuna email inviata automaticamente.
- [ ] Controllo visivo desktop/mobile con originali e differenze.
- [ ] Rilascio allineato alle modifiche degli altri terminali su main e online.
- [ ] Verifica pubblicazione, funzioni, migrazioni e persistenza dei salvataggi.

## Stato iniziale

Piano approvato dall'utente; implementazione avviata in checkout isolato.
Esistono già storico degli invii, lettura della conferma, campi di misura,
decisioni manuali, originali PDF/foto, relazioni DDT–OdA multiple e confronto fatture.
Questi elementi vengono estesi, mantenendo un solo registro degli arrivi fisici.
