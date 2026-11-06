# Standard documenti operativi

I cinque PDF forniti il 5 novembre 2026 sono il riferimento per tutte le aziende: richiesta di offerta, ordine materiali, ordine servizi e lavori, rapporto trasporti mensile, rapporto lavori in economia.

Il generatore unico è `src/lib/documentiOperativi/pdf.ts`; titoli e sezioni canoniche sono in `standard.ts`. Le schermate OdA, RDO e rapporti usano lo stesso generatore per anteprima, download e allegato email. Non esistono modelli diversi per aziende demo. I dati della singola azienda e del destinatario sono parametri: logo in alto, dati aziendali su due righe nel piè di pagina. Senza logo caricato, compare un marchio testuale dell'azienda corrente. Non si aggiungono timbri o firme di prova ai documenti operativi.

- RDO: colonne economiche vuote, risposta/consegna, pagamento del singolo fornitore, istruzioni per rispondere; nessun totale d'ordine.
- Ordine materiali: fornitore e consegna, commessa, prezzi/sconti concordati, riepilogo IVA e totale; se i prezzi sono da confermare, spazi economici vuoti e richiesta dell'originale del fornitore.
- Servizi e lavori: riferimenti, date, documenti di accesso, condizioni e, quando selezionata, inversione contabile.
- Trasporti: periodo, viaggi, carico e scarico separati, ore uomo e mezzo, DDT e importi.
- Economia: riepilogo per categoria, interventi separati e subtotali, totale IVA esclusa, conferma delle quantità; nessuna tariffa interna inserita automaticamente.

Verifica ripetibile: `npx tsx scripts/qa-standard-documenti.ts`; l'opzione `--logo-vulcano percorso.png` verifica un logo reale su una simulazione offline esplicita. I 14 casi producono PDF e corpi email in `output/pdf/simulazioni-standard`, senza creare record né inviare email. I casi comprendono più pagine, prezzi mancanti e misti, sconti, IVA, due fornitori, un'altra azienda e tutti i cinque tipi di documento. Le prove interattive nel gestionale sono distinte e mantengono lo stato di bozza.
