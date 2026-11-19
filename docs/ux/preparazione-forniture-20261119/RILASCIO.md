# Preparazione forniture per fornitore — 19 novembre 2026

Il popup unico prepara più articoli, raggruppati per fornitore, prima di salvarli insieme nella commessa. Il listino propone il proprio fornitore; il fornitore di lavoro viene usato sulle nuove righe libere. Le posizioni di infissi, tapparelle, zanzariere, cassonetti, persiane, porte e altri prodotti conservano riferimento, quantità, larghezza, altezza, profondità facoltativa e dettagli.

Il prezzo può essere scritto come unitario, totale riga oppure totale fornitura da ripartire. La base IVA inclusa/esclusa è esplicita per fornitura e ogni riga conserva la propria aliquota. Il campo prezzo modificato determina il calcolo; il prezzo canonico è unitario netto. Campo vuoto e zero esplicito sono distinti. La stima iniziale e l'input originale restano separati dal prezzo successivo dei documenti collegati.

I campi delle righe sono allineati in alto: le misure sotto il nome non spostano quantità, prezzi e IVA. Verificato con 22 righe a 1600 e 1280 px; nessun overflow del popup a 390 px. Script: `verifica-layout.mjs`.

## Servizio dati applicato

Migrazione `20290420110000_preparazione_forniture_atomica.sql`, applicata tramite MCP e riallineata al registro remoto prima del push. La RPC `commessa_prepara_forniture` verifica utente, permesso nell'azienda della commessa, visibilità della commessa e riferimenti ad anagrafiche della stessa azienda. Tutte le righe e la richiesta vengono salvate nella stessa transazione. Un retry identico restituisce gli stessi ID; una richiesta già usata con dati diversi viene rifiutata. Nessun ripiego su inserimenti parziali.

L'accesso anonimo alla RPC e l'accesso diretto degli utenti al registro di idempotenza sono negati. L'advisor segnala l'esecuzione autenticata della funzione SECURITY DEFINER: è intenzionale, protetta dai controlli espliciti e necessaria al registro privato. Riferimento: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable.

Il percorso ODA conserva i prezzi da confermare. La conferma del prezzo aggiorna la fonte anche a importo invariato o zero esplicito, conservando la stima. Anteprima e colonne generate ODA applicano gli stessi arrotondamenti per riga. Se prezzo o quantità superano la precisione del documento corrente, il percorso si ferma anziché perdere centesimi o quantità.

Il rilascio riallinea inoltre cinque file di migrazione già presenti nel registro del database (`20290420100000`–`20290420104000`), senza riapplicarli in produzione. Sono il ripristino dello storico richiesto dal controllo Supabase Preview. I due file sui conflitti usano PT409, coerente con la correzione già applicata dalla migrazione 20290420104000: il gateway non deve ritentare un conflitto applicativo. Gli altri tre coincidono byte per byte con il registro.

## Prova nel gestionale reale

Eseguita su `localhost:8096`, azienda demo, commessa `DEMO-2025-048`. Le 22 nuove righe con prefisso `SIM ·` sono state salvate dal popup reale. Le sei righe precedenti restano presenti. Poi il comando **Prepara tutte le bozze (4)** ha creato:

| ODA | Fornitore | Righe | Netto | IVA | Totale |
|---|---|---:|---:|---:|---:|
| ODA-2026-0056 | Internorm Italia S.r.l. | 5 | 3.080,00 € | 677,60 € | 3.757,60 € |
| ODA-2026-0057 | Griesser Italia | 5 | 670,00 € | 147,40 € | 817,40 € |
| ODA-2026-0058 | Edilmateriali Roma S.r.l. | 6 | 697,00 € | 153,34 € | 850,34 € |
| ODA-2026-0059 | Elettrica Moderna Srl | 6 | 650,00 € | 143,00 € | 793,00 € |
| **Totale** | | **22** | **5.097,00 €** | **1.121,34 €** | **6.218,34 €** |

Verifica SQL successiva: 22 righe salvate, 22 stime iniziali conservate, 22 prezzi con fonte ODA; otto posizioni con misure e riferimenti trasferiti ai due ODA su misura. Gli ordini sono **bozze**, senza invio ai fornitori. I prezzi della simulazione sono inventati e l'IVA al 22% è solo dimostrativa.

## Controlli e perimetro

- 194 test superati in 16 file sul ramo preparato da main; comprende preparazione, prezzi, IVA, rollback e retry SQL, ODA, posizioni, procurement, materiali per fase e DDT/fatture.
- I due test SQL sono eseguiti direttamente sulla migrazione canonica, non su una proposta separata.
- ESLint senza errori sui file del nuovo flusso verificati.
- TypeScript mirato senza errori su popup, dettaglio commessa, materiali per fase, servizi, test e anteprima, con la configurazione inclusa in questa cartella.
- La prova separata sulla porta 8098/8099 usa solo memoria locale; si apre con `/?simulazione=appartamento`. Non fa parte del normale accesso al gestionale in produzione.
- Configuratore, preventivo accettato e sopralluogo non importano ancora automaticamente le misure in questo flusso. Il prelievo di magazzino e i collegamenti DDT/fatture continuano a usare i servizi dedicati.

Il frontend si pubblica con il push su main tramite Cloudflare Pages. Il test locale non modifica lo stato di invio degli ODA della demo.
