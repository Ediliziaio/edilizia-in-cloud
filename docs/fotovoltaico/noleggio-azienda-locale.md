# Fotovoltaico azienda e tabelle noleggio — anteprima locale

Implementazione del 10 novembre 2026 nel worktree `fotovoltaico-tetto-facoltativo`. Nessuna pubblicazione e nessuna modifica al database remoto.

## Percorso dell’utente

1. **Fase 1 → Cliente**: scelta Privato/Azienda/PA e anagrafica. La modalità di pagamento si sceglie esclusivamente nella Fase 6.
2. Configurazione e disegno restano nel percorso esistente. Quantità, potenza, produzione e imponibile alimentano l’analisi.
3. **Impostazioni → Finanziamenti → Noleggio operativo**: archivia condizioni GRENKE o di altri fornitori. La scheda Finanziamenti preesistente rimane disponibile.
4. **Fase 6 → Finanza → Come vuole procedere l’azienda?**: scegli Acquisto diretto, Finanziamento, Leasing oppure Noleggio operativo. Seleziona tabella/offerta e durata, completa consumi e costi, confronta modalità e conferma il calcolo. Ogni variazione di prezzo, produzione, committente o ipotesi rende il prospetto da riconfermare.
5. Il prospetto HTML si scarica e si può stampare in PDF dal browser. Il renderer del documento completo ha sezioni aziendali dedicate e non usa le proiezioni residenziali per i nuovi conti. La funzione server controlla il prezzo, la produzione e l’originale della tabella prima di generare il documento. La pubblicazione di questi consumer richiede lo schema proposto e il collaudo remoto descritto sotto.

Anteprima: `http://127.0.0.1:8087/?esempio=capannone&fase=cliente`. Le fasi disponibili nell’anteprima sono Cliente, Tetto, Impianto e Finanza; il progetto completo conserva le sue otto fasi. Il CRM remoto non è collegato all’anteprima.

## Importazione delle tabelle

CSV e XLSX, foglio Excel selezionabile, massimo 12 MB, 1.000 righe e 80 colonne. Le colonne si associano esplicitamente e l’anteprima mostra i valori prima della conferma. Un PDF può essere conservato insieme al file tabellare come riferimento: non si estraggono coefficienti automaticamente dal PDF. Gli originali e le loro impronte SHA-256 vengono conservati. Le formule Excel sono rifiutate anche se hanno un risultato memorizzato.

Campi: `importo_da`, `importo_a`, `durata_mesi`, `periodo_mesi`, `coefficiente`, `unita`. Periodicità 1 o 3 mesi. Unità ammesse:

- `percentuale_mese`: percentuale del capitale per mese, moltiplicata per la periodicità.
- `percentuale_periodo`: percentuale del capitale per singolo canone.
- `euro_mille_mese`: euro per 1.000 euro di capitale al mese.
- `euro_mille_periodo`: euro per 1.000 euro di capitale per canone.
- `canone_periodo`: canone fisso in euro per periodo nella fascia indicata.

La fascia si verifica sul valore netto del bene; il coefficiente si applica al netto dell’anticipo dichiarato. Le fasce sovrapposte per durata e periodicità sono rifiutate. Nessuna interpolazione tra durate o fasce del noleggio. `1.000` è ambiguo e viene rifiutato: usare `1000`, `1000.00` oppure `1.000,00`.

Fornitore, nome, versione, decorrenza/scadenza, anticipo, spese iniziali, prelocazione, manutenzione, assicurazione e fine contratto sono espliciti. Le condizioni non si sovrascrivono: una modifica richiede una nuova versione; si può disattivare una versione conservando i preventivi precedenti. Una tabella dimostrativa è contrassegnata PROVA e la funzione server ne impedisce l’emissione commerciale.

## Ipotesi del motore economico

- Produzione annua dal calcolo del preventivo e dalla località; consumi e distribuzione della produzione sono mensili. In assenza di un profilo stagionale si usa una distribuzione uniforme dichiarata, da affinare con dati del cliente. Non è una simulazione oraria delle ombre o dell’autoconsumo.
- Acquisto diretto: pagamento del bene all’avvio. Finanziamento: capitale netto dopo anticipo, IVA del bene pagata all’avvio, rata completa dell’offerta. Capitale e fonte sono obbligatori: se cambia l’importo, occorre aggiornare l’offerta. Le condizioni scadute/future non sono applicabili a nuovi calcoli B2B. Le rate interpolate dalle tabelle prestiti esistenti sono indicate come stime da confermare.
- Leasing: offerta distinta con valore del bene, fonte/validità, maxicanone percentuale, importo dei canoni, numero dei canoni escluso maxicanone, mese della prima scadenza, periodicità e durata contrattuale. IVA alle scadenze, riscatto facoltativo con prezzo esplicito. I dati devono corrispondere al preventivo corrente; nessun canone è ricavato da tassi presunti. Le proiezioni oltre contratto sono consentite solo nello scenario con esercizio esplicito del riscatto. L’ipotesi fiscale sui canoni è una ripartizione per competenza degli importi inseriti: non verifica requisiti o durate minime fiscali del singolo contratto.
- Noleggio: vere scadenze mensili/trimestrali, anticipate o posticipate; l’equivalente mensile è informativo. Nessuna proprietà automatica alla scadenza. Con restituzione o fine da definire, i benefici si fermano alla durata contrattuale. Un acquisto finale richiede importo e condizione concordati.
- Bolletta residua, costi fissi, risparmio, cessione energia, gestione, IVA, pagamenti e saldi rimangono distinti. I saldi negativi non vengono azzerati. Il recupero rappresenta il primo saldo cumulato non negativo che rimane tale nel periodo osservato, non un rendimento garantito.
- Fiscalità inizialmente esclusa. Per includerla occorrono aliquota, quota deducibile, tassabilità di risparmi/ricavi e capienza annua. I conguagli sono rappresentati a fine anno, senza simulare acconti o deduzione degli interessi. L’ultimo periodo parziale non anticipa un conguaglio non rappresentato. IVA recuperabile e ritardo sono inseriti esplicitamente.
- L’ammortamento contabile è una distinta ipotesi sul costo di proprietà; anni modificabili anche senza benefici fiscali. Non è il piano capitale/interessi del finanziamento. Non viene inventata una scomposizione delle rate se l’offerta non la fornisce.

## Salvataggio e limiti di pubblicazione

L’anteprima usa IndexedDB (`fv-noleggio-locale-v1`) per tabelle e originali e localStorage per il preventivo. Nessuna chiamata al database di produzione. I file e le versioni sono isolati per azienda anche nell’adattatore locale.

L’adattatore applicativo è predisposto per `eic_tabelle_noleggio` e `fv_progetti.economia_azienda`. Lo schema SQL è una **proposta non applicata** in `dev/fotovoltaico-locale/sql/noleggio-operativo-proposta.sql`, fuori da `supabase/migrations`. Prima di pubblicare occorrono collaudo PostgreSQL di staging, verifica RLS con utenti lettura/modifica/cliente esterno e cambio azienda, verifica delle policy Storage e della copertura del backup aziendale. Solo dopo questi controlli si può creare/applicare una migrazione con il flusso del repository e pubblicare frontend e funzione PDF insieme. La build locale e i test del motore non sostituiscono questo collaudo del database.

Per usare condizioni commerciali reali manca la tabella GRENKE effettiva con unità, fasce, validità e condizioni accessorie. Le prove eseguite usano solo valori sintetici dichiarati e dati di capannone dimostrativi.
