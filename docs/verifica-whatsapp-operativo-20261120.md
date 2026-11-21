# WhatsApp Operativo · verifica in sviluppo

## Dal messaggio al gestionale

Il webhook verifica la firma Meta e identifica l’azienda dal numero aziendale ricevente. Salva l’ID univoco del messaggio, il riferimento dell’eventuale risposta e l’orario dichiarato dal provider. Il processore identifica il mittente, serializza il lavoro per azienda, numero e mittente, recupera gli allegati e rilegge i permessi a ogni turno. Gli esiti passano dal servizio WhatsApp esistente. L’accettazione da parte di Meta e l’effettiva consegna sono stati distinti.

| Priorità | Problema e conseguenza | Intervento locale e verifica |
| --- | --- | --- |
| P0 · Alta | Il confronto delle sole cifre finali poteva identificare un numero di un altro Paese. Un duplicato fuori dalla prima pagina di anagrafiche poteva passare inosservato. | Confronto con prefisso, normalizzazione dei formati italiani e ricerca paginata. Provati doppioni, utenze disattivate, ruoli revocati e sola lettura. |
| P0 · Alta | Le scritture dirette dei messaggi non erano riservate al servizio. Le regole di squadra andavano applicate anche a WhatsApp. | Migrazione `20290422230000_whatsapp_rapportini_squadra.sql`, scritture dei messaggi riservate al servizio, controllo del contesto Campo e provenienza del vocale vincolata all’azienda. Test SQL locale su ruoli, azienda, avvio ripetuto e doppio inserimento. |
| P0 · Alta | Una richiesta scaduta o un allegato fuori limite potevano fallire senza una spiegazione. | Download associato al numero Meta, verifica dell’URL, delle dimensioni e dell’impronta quando disponibile. Una rilettura del riferimento in caso di URL scaduto. I vocali riusano la trascrizione già salvata e la chiave di contabilizzazione associata al messaggio. |
| P1 · Alta | La destinazione inviata con un vocale non chiudeva l’acquisizione partita con una foto. Più bolle recenti potevano provocare associazioni errate. | La coda DDT conserva l’originale. Foto, PDF, testo e vocale possono determinare cantiere o deposito. Provati il vocale dopo l’allegato, il riferimento esplicito arrivato prima dell’allegato, due bolle aperte, una destinazione in conflitto e l’aggiunta di una pagina citando il primo invio. |
| P1 · Alta | Il vocale di squadra registrava le ore del mittente. | Il rapportino conserva le presenze individuali verificate sulle anagrafiche di Campo. Il caso di prova registra 8 + 8 + 4 ore, cinque finestre e due portefinestre nella descrizione e il controtelaio mancante nelle note. Nei casi con commessa, giorno, persone e ore espliciti si salva subito una bozza. La conferma invia lo stesso record all’ufficio. |

Il PDF o la foto poco leggibile restano nella coda, quando la didascalia identifica il file come DDT. Il gestionale conserva l’originale e i dati estratti per la revisione. Il riferimento esatto all’ODA o un indirizzo univoco con civico possono bastare già con la prima foto. Se l’ordine e l’indirizzo indicano cantieri diversi, il bot chiede la destinazione. L’effettiva registrazione delle quantità e dei movimenti resta nella procedura DDT. Il rapporto conserva il riferimento al messaggio sorgente, dove si trovano audio e trascrizione.

## Limiti del canale e misure

- **Media.** Meta supporta immagini fino a 5 MB, audio fino a 16 MB e documenti fino a 100 MB. Il riferimento dei media ricevuti dura fino a sette giorni e l’URL di download circa cinque minuti. Il gestionale impone 25 MiB per i media WhatsApp e 18 MiB complessivi per il DDT, fino a 12 file associati. La resa di foto reali, la compressione del telefono e la trascrizione dei singoli codec vanno misurate sulla linea di prova. [Documentazione Meta sui media](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/media)
- **Messaggistica.** La finestra di servizio di 24 ore permette risposte libere e liste interattive fino a dieci opzioni. Fuori finestra serve un template approvato. Le tariffe dipendono da categoria e mercato. Gli esiti di consegna arrivano via webhook e vanno riconciliati con l’invio. Il mittente privo di numero verificabile richiede un’associazione esplicita dell’identificativo Meta. [Liste interattive](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/interactive-list-messages), [Tariffe Meta](https://whatsappbusiness.com/products/platform-pricing/), [Eventi in ingresso](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages)
- **Misure disponibili.** L’orario in ingresso e quello di aggiornamento del DDT o del rapportino permettono di calcolare il tempo di registrazione. Stato di elaborazione e registro delle operazioni aiutano a distinguere download, estrazione, scrittura e invio. Per misurare in modo stabile completamento al primo invio, chiarimenti e costo totale AI per pratica serve un ID di pratica condiviso fra i turni e le chiamate. I test con fixture verificano la logica e non producono una misura della latenza o del costo di produzione.

## Comandi di collaudo locale

```sh
node_modules/.bin/vitest run src/test/logic/whatsapp*.test.ts src/test/logic/ddtWhatsappPersistente.test.ts src/test/logic/bollaWhatsAppPagineCliente.test.ts src/test/security/whatsapp*.test.ts --maxWorkers=2
node scripts/check-whatsapp-rapportini-local.mjs
PGLITE_ENTRY=$(node -p "require.resolve('@electric-sql/pglite')")
node scripts/check-whatsapp-operations-local.mjs "$PGLITE_ENTRY"
node scripts/check-whatsapp-sessions-local.mjs "$PGLITE_ENTRY"
```

La prova DDT simula un payload Meta e usa il codice del webhook, l’acquisizione nel bucket DDT e il salvataggio della destinazione dopo la trascrizione simulata. La prova rapportino riproduce la trascrizione d’esempio e passa dal tool del gestionale. Il test SQL usa un database isolato con fixture. Il collaudo su una linea Meta dedicata deve ancora verificare webhook firmato, download effettivo dei media, OCR e trascrizione sul contenuto reale, visualizzazione nelle due schermate del gestionale e ricezione degli esiti sul telefono.

## Prova locale su Demo Azienda 2

- L’originale della bolla passa in Documenti in ingresso appena riconosciuto. Se il vocale è già in coda, l’assistente gli lascia risolvere la destinazione. La prova di PROVA-SIMULA simula sette secondi fra foto e vocale e un errore OCR. Risultano una bozza, una risposta e il collegamento al vocale nella bozza. L’accesso al player e alla trascrizione usa i permessi esistenti di WhatsApp.
- La prova con 20 cantieri apre tre pagine. La timbratura di oggi porta il cantiere suggerito in cima. Le scelte sono rilette dai permessi correnti al momento dell’associazione.
- I rapportini di squadra in rumeno e polacco mantengono l’audio, la trascrizione e la traduzione. Il riepilogo di prova mostra 8 ore e 4 ore distinte. Dopo il Sì il record italiano arriva in Campo in stato inviato.
- La richiesta di tre controtelai compare in Attività e nella commessa con scadenza e ufficio Acquisti. Il collaudo locale usa un ufficio di prova.
- La routine delle 07:00 usa gli assegnati, le fasi e le attività del giorno. L’anteprima locale mostra cantiere, indirizzo e colleghi senza chiamare l’AI o inviare messaggi. Via chat, «Dove lavoro oggi?» consulta le assegnazioni del mittente.
- Per chi può consultare i Documenti fiscali, la ricerca fatture restituisce collegamenti al dettaglio autenticato. Il menu «Aiuto» mostra gli esempi per il ruolo. I preventivi conservano la conferma della bozza e i computi seguono i modelli supportati.

## Interventi successivi per impatto

1. Associare le singole righe DDT a uno o più ODA con quantità residue e verificare i carichi parziali attraverso il flusso esistente del Magazzino.
2. Estendere la bozza da vocale alle ore individuali frazionarie e alla ripartizione su più cantieri. Collegare le attività a fasi, mezzi e listini deterministici già in uso. Le rettifiche di rapportini chiusi passano dall’ufficio.
3. Rendere riproducibile il vocale direttamente dal rapportino per i ruoli autorizzati e misurare il costo completo di ciascuna pratica. Le pagine aggiuntive di un DDT si collegano citando l’invio iniziale. L’abbinamento automatico di pagine inviate senza riferimenti e la scelta tra pratiche parallele restano da completare.
