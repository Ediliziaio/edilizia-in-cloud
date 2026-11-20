# Piano di lavoro: dal computo alle risorse della commessa

Obiettivo autorizzato: correggere e completare in locale il flusso che riconosce fasi, sottofasi, materiali, noleggi e prestazioni. Il riferimento di collaudo è il computo di Genzano e il confronto con i due Excel del 19 novembre. Le verifiche operative usano esclusivamente le commesse di prova di Demo Azienda 2.

## 1. Correttezza delle risorse e delle specifiche

- [x] Correggere esclusioni spurie («non praticabili», prezzo di un euro, lotti a corpo irrisolti).
- [x] Usare le misure per distinguere unità contabili, quantità fisiche e multipli commerciali.
- [x] Conservare taglia, potenza, modello e zona: cinque tipi di ventilconvettore e due inverter distinti.
- [x] Applicare gli incrementi di spessore alla superficie corretta; segnalare i limiti contraddittori della tariffa.
- [x] Evitare componenti già compresi in kit o forniture e doppioni nel montaggio FV.
- [x] Distinguere quantità documentate da stime e dati mancanti; mantenere avvertenze e stato dopo il salvataggio.

Accettazione: XPS sottotetto riconosciuto; 135 barre FV da 3 m come interpretazione da confermare, mai 405 barre; taglie dei 40 ventilconvettori separate; isolante falde da 100 mm; nessuna quantità certa di pittura in m² o di sacchi da una ricetta incompatibile.

## 2. Piano operativo dei noleggi e delle prestazioni

- [x] Generare proposte collegate a commessa, computo, fasi e voci di origine.
- [x] Conservare quantità e periodi distinti, raggruppando montaggio/rinnovi/smontaggio dello stesso noleggio.
- [x] Salvare le proposte e le scelte senza modificare la lettura originale del documento, con controllo dei conflitti.
- [x] Mostrarle nelle fasi e nelle risorse della commessa, con accesso ai moduli esistenti Mezzi e noleggi / Ditte e contratti.
- [x] Mantenere esplicita la distinzione fra proposta da completare e prenotazione/affidamento confermato.

Accettazione: ponteggio 2.407,80 m² per nove mesi, con otto rinnovi; quattro trabattelli con i rispettivi periodi; cartelli da un euro conservati; nessun noleggio moltiplicato per le fasi servite.

## 3. Collaudo dei materiali e del piano netto

- [x] Testare le regole con dati reali del computo e casi indipendenti, includendo documenti futuri con unità e descrizioni diverse.
- [x] Verificare magazzino, riserve, ordini in bozza/emessi/annullati e conversioni di confezione.
- [x] Verificare che righe incomplete e stime non diventino ordini pronti dopo la riapertura.
- [x] Conservare correzioni manuali, decisioni già prese e isolamento delle analisi nella propria commessa.

## 4. Verifiche finali e consegna

- [x] Eseguire test mirati, TypeScript sul flusso interessato, lint e controllo del diff.
- [x] Riprova nel browser locale su preventivo firmato e computo, con salvataggio/rilettura delle proposte nella sola Demo Azienda 2.
- [x] Confrontare i risultati con i 17 casi emersi e produrre un resoconto prima/dopo.
- [x] Aggiornare questo piano con esiti e limiti residui.

Nessun ordine d'acquisto, prenotazione di mezzi, affidamento reale, push o deploy fa parte del collaudo. Gli attributi non documentati richiedono completamento dell'utente: non diventano certi per effetto di una nuova analisi AI.

## Esito del collaudo

Eseguiti i quattro lotti in locale. 155 test in 14 file superati; TypeScript superato, lint senza errori e due avvisi Fast Refresh preesistenti. Browser verificato su entrambe le commesse. Nel test ECO: 13 fasi, 177 sottofasi, 173 articoli in bozza, 6 componenti AI ancora proposti e 33 proposte di risorse salvate/rilette. 64 articoli richiedono ancora dati tecnici. Nessun ordine, riserva o prenotazione.

Report completo: `/Users/andriciuc/reports/eic-confronto-chatgpt-2026-11-19/collaudo-intervento-locale.md`.

## Dati e sviluppi ancora necessari per avvicinarsi a 10/10

- [ ] Completare l’abaco acquistabile per posizione, con rilievo dei vani e distinzione dai minimi di fatturazione.
- [ ] Completare rese dei prodotti, geometria delle spallette/copertura, recuperabilità dei coppi, compatibilità dei modelli e contraddizioni tariffarie. Le proposte restano in verifica.
- [ ] Inserire calendario delle fasi, fornitori e tempi di consegna effettivi.
- [ ] Prima del rilascio cloud, replicare il controllo tecnico nella transazione server degli ordini e collaudare gli altri ingressi/API. Il codice resta locale: nessuna migrazione o distribuzione eseguita.

## Secondo collaudo: completamento delle 64 righe dai documenti

- [x] Censire le 64 righe con riferimenti a voce/pagina e distinguere quantità documentate, ricette stimate e contraddizioni.
- [x] Generare l'abaco per posizione dalle misure, mantenendo distinti minimi contabili e misure dimensionali.
- [x] Arricchire materiali e lotti con i dati espliciti del PDF; correggere conversioni e inclusioni, conservando ciò che non è deducibile.
- [x] Salvare i completamenti delle sole commesse di prova senza approvare dati mancanti o sovrascrivere modifiche manuali.
- [x] Ricalcolare piano netto, rieseguire i test e confrontare i risultati con entrambi gli Excel originali.
- [x] Rendicontare costi OpenRouter effettivi, crediti del gestionale e costo stimato di una nuova lettura, con prezzi e fonte verificati.

Esito del secondo collaudo: 64 righe censite (58 arricchite con verifiche residue, 5 ipotesi generiche rimosse, 1 fornitura tecnicamente completata); 169 articoli, 59 verifiche e 6 proposte AI sospese. Abaco di 154 righe: 100 con dimensioni, 54 da rilevare; 147 serramenti da dimensioni/formule +1 ipotizzato. 172 test in 16 file superati, TypeScript e lint verificati. Zero nuove chiamate OpenRouter. Consumo API delle prove precedenti registrato: 0,30435562 USD, distinto dall'addebito del gestionale (1,10524641 EUR dopo rimborso).

Dettagli e file Excel: `/Users/andriciuc/reports/eic-verifica-64-righe-2026-11-19/esito-completamento.md` e `Riscontro_Genzano_64_righe_abaco_costi.xlsx` nella stessa cartella. I dati ancora assenti o contraddittori sono esplicitati riga per riga; non è stata simulata una validazione tecnica.
