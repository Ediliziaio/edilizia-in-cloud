# Articoli, computo e acquisti — piano operativo

L'obiettivo è usare la stessa struttura della pagina Lavorazioni: navigazione a sinistra,
articoli e azioni a destra. Il materiale mantiene la propria fase, anche quando si guarda per fornitore o magazzino.

1. **Tre viste nella colonna sinistra.** Fasi, Fornitori, Magazzino. Ogni voce mostra quanti articoli contiene.
   La ricerca e i filtri di stato agiscono sulla vista scelta. Su telefono si usa un selettore compatto.
2. **Area di lavoro a destra.** Quantità e unità, specifiche, fornitore, stato, consegna, prezzo e verifiche.
   Le funzioni esistenti di modifica, allegati, misure, assegnazione e ordini restano disponibili.
   La selezione per acquisto riguarda soltanto gli articoli visibili; cambiare vista azzera la selezione.
3. **Acquisto per fornitore.** Scegli il fornitore, seleziona i suoi articoli da ordinare, prepara l'ordine.
   Le fasi originarie restano collegate. Verifiche tecniche, ordini già fatti e disponibilità vengono controllati
   con le regole del gestionale, senza sommare nuovamente ciò che è coperto.
4. **Strumenti del computo.** Un unico accesso raccoglie piano acquisti, abaco, noleggi/servizi e documento.
   L'accesso dalla fase apre i dati collegati a quella fase. Le risorse condivise non vengono moltiplicate.
5. **Genera dal computo.** Voci modificabili, aggiunte manuali, ricerca e accesso diretto da un avviso alla voce.
   Le correzioni salvate aggiornano la proposta; le misure originali restano consultabili.
   Si distinguono proposte totali, preselezionate e dati da verificare.
6. **Qualità AI e ricette.** Completare i quattro PDF pubblici rimasti; recuperare unità mancanti solo con riscontri
   univoci sul testo; riconoscere prodotti già definiti e prestazioni; aggiungere ricette riutilizzabili,
   lasciando esplicite le rese stimate e i dati di progetto mancanti.
7. **Operazioni sulla selezione.** Assegnare un fornitore agli articoli selezionati oppure preparare
   una richiesta d'offerta agli stessi articoli per più fornitori. Le alternative commerciali
   non dividono né moltiplicano il fabbisogno. Modifica multipla di fase, data e specifiche,
   conservando quantità, provenienza e verifiche tecniche.
8. **Revisione guidata dei dati mancanti.** Il filtro «Solo da completare» mantiene fase, fornitore
   e ricerca; «Inizia revisione» apre un articolo alla volta e «Salva e continua» passa al successivo.
   Quantità fonte e proposta restano separate, con istruzioni su dove trovare il dato e testo originale
   delle voci consultabile. Il piano acquisti permette di aprire direttamente la correzione.
   Su telefono le spiegazioni si aprono a richiesta e il modulo resta subito raggiungibile.
9. **Proseguire senza perdere il lavoro.** «Salta per ora» lascia irrisolta una riga e apre la
   successiva; «Pausa» riprende dalla riga corrente. Le bozze restano in memoria nella pagina,
   non vengono approvate né salvate sul database. Non si riapplicano dopo un cambiamento della
   fonte. Ricerca estesa ai codici fonte e alle misure, azzeramento dei filtri nella vista scelta,
   motivi di blocco distinti fra dati mancanti e fase da validare. Caratteristiche documentate
   riutilizzate quando univoche, con conferma esplicita ancora necessaria.
10. **Piano operativo leggibile.** Riepiloghi filtrabili per quantità da comprare, dati da completare,
    assenza di nuovo ordine e date mancanti. Avvisi e fonti nei dettagli, dati sintetici nelle righe,
    selezione trasferibile alla barra articoli e data di fabbisogno modificabile dal piano.
    Fabbisogno e creazione ordini condividono il controllo tecnico. Tavole PDF suggerite dal nome,
    senza selezionare da soli preventivi o documenti generici. Calcolo assistito di consumo/copertura,
    mani, sfrido e confezioni con formula e fonte registrate nella proposta, senza approvazione automatica.

Verifiche: filtri che non selezionano articoli nascosti, stessa giacenza usata una sola volta,
righe senza dati tecnici non acquistabili, correzioni concorrenti rilevate, computo contrattuale protetto,
prove desktop/mobile e regressioni sui PDF e sulle commesse di prova. Misurare costo provider e crediti
gestionale separatamente. Lavoro in locale, senza pubblicazione.

Stato del 20 novembre: interfaccia aggiornata e verificata su desktop e a 390 px, quattro nuove
commesse salvate in Demo Azienda 2, con analisi circoscritte alla relativa commessa. SP107,
Via Toscana e Rotatoria si leggono ora tramite tabelle locali, senza AI. Quantità, prezzi e importi
delle 215 voci coincidono con i dati fonte degli Excel; il confronto non certifica ancora la distinta
esecutiva. Corretta anche la conservazione dell'importo stampato nel salvataggio.

Restano da automatizzare il recupero delle misure, la corrispondenza fra modello e codice di acquisto
nelle schede tecniche e diverse ricette di impianti e opere stradali. Calendario, rese, inclusioni,
confezioni e dati di fornitore devono rimanere espliciti quando assenti dal documento.
La facilità d'uso va misurata con utenti reali, senza attribuire un 100% non verificato.

Risultati, commesse, confronto e costi:
[rapporto del 20 novembre](/Users/andriciuc/reports/eic-nuovi-computi-2026-11-20/CONFRONTO-E-PIANO.md).

Revisione dei dati mancanti verificata su ECO e Trovato: conteggi coerenti fra elenco e piano
(70 su ECO, incluse 11 proposte storiche precedentemente poco visibili; 6 su Trovato), nessuna
nuova lettura AI e nessuna modifica alle commesse in questa prova. Evidenze e limiti:
[verifica UX](/Users/andriciuc/reports/eic-ux-dati-mancanti-2026-11-20/VERIFICA.md).

Seconda serie di prove: 273 test passati e controlli browser sulle quattro nuove commesse,
con 79 articoli presenti nei piani acquisti e 46 verifiche tecniche ancora pendenti. Esiti, limiti
e schermate in [prove successive](/Users/andriciuc/reports/eic-ux-prove2-2026-11-20/VERIFICA.md).

Terza revisione sulle finestre Piano acquisti, Fabbisogno e Tavole: 316 test superati,
controllo browser su Trovato e sul calcolo in ECO, nessuna scrittura alle commesse e nessuna
chiamata AI. [Esito e schermate](/Users/andriciuc/reports/eic-piano-acquisti-ux-2026-11-20/VERIFICA.md).

Lettura DWG collegata al pannello Tavole in sviluppo locale: conversione nativa
in DXF, annullamento, limiti, verifica della provenienza e conservazione del DWG
originale. Le misure richiedono calibrazione e i blocchi richiedono classificazione.
467 test superati su CAD, computi e materiali; nessuna pubblicazione, scrittura
di prova sulle commesse o chiamata AI.
[Prova sul DWG e limiti](/Users/andriciuc/reports/eic-dwg-automatico-2026-11-20/VERIFICA.md).

Completamento per il rilascio: lettura DWG protetta anche sul backend, PDF per pagina
e legenda delle scansioni assistita dall’AI. I conteggi confermati si confrontano
con gli articoli esistenti e possono sostituirne il fabbisogno; ordini, prezzi e
fonti originali restano conservati. Un conteggio modificato invalida il riscontro
per nuovi acquisti. Il documento identico viene riusato senza duplicare i conteggi.
Migrazione `20290422194000_tavole_quantita_acquisti` applicata e registro allineato.
