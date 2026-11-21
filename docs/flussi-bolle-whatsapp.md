# Bolle su WhatsApp

L’operaio invia le foto o il PDF nella chat abituale. Il gestionale conserva gli originali e legge le bolle in background. L’ufficio trova i documenti in **DDT → Documenti in ingresso** e conferma le quantità prima di registrare la merce.

## Più foto per la stessa destinazione

1. L’operaio invia le foto in sequenza. Può indicare la destinazione con un testo o un vocale come «Tutte per SIM-S1».
2. Se la destinazione è univoca e consentita, il bot risponde con le bolle salvate fino a quel momento. Le foto ricevute più tardi si aggiungono allo stesso invio quando l’orario di spedizione o la citazione identifica il gruppo. Conservano la destinazione e il riferimento al vocale.
3. Se manca la destinazione, il bot risponde «Ho salvato 20 bolle. Dove è arrivata la merce?». **Scegli destinazione** apre l’elenco con il cantiere suggerito e il magazzino. Un tocco assegna tutto l’invio.

## Destinazioni diverse

L’operaio può rispondere alla singola foto con il cantiere di quella bolla. Una destinazione comune vale per le bolle ancora da assegnare. Se il documento indica una destinazione diversa, la bolla resta da assegnare. Se la discordanza emerge dopo la scelta, compare un avviso nella revisione in ufficio.

## Un PDF

Il bot conserva il PDF e applica la stessa scelta di destinazione. Il numero del DDT e la numerazione delle pagine aiutano a riconoscere i confini. Per le pagine scansionate, legge le intestazioni con OCR in blocchi da cinque. Una bolla di più pagine rimane insieme. Se un confine è incerto, l’ufficio controlla la divisione partendo dall’originale.

## Documenti in ingresso

Gli ultimi invii mostrano quanti file sono arrivati e quante bolle sono da leggere, da controllare, registrate o da riprovare. Il riepilogo indica anche i file identici già in archivio e quelli da rimandare. **Apri invio** filtra le righe di quell’invio.

Se due immagini diverse riportano lo stesso numero, data e fornitore, la riga mostra **Possibile duplicato** e rimanda alla bolla del confronto.

## Errori durante l’invio

| Caso | Comportamento atteso |
| --- | --- |
| Lo stesso allegato arriva due volte | Il gestionale tiene una sola bolla e la destinazione già salvata. |
| Una foto è sfocata | Il gestionale conserva l’originale. Se serve una nuova foto, la richiesta indica l’allegato preciso. |
| Il file non arriva completo | La risposta distingue il file da rimandare dalle bolle salvate. |
| Il vocale riguarda un rapportino | Il vocale segue il suo flusso e la destinazione delle bolle resta in attesa. |
| Ci sono due invii vicini | Un pulsante agisce solo sulle bolle dell’invio indicato. Una risposta senza riferimento usa il gruppo recente solo quando è univoco. |
| Arrivano un PDF protetto o pagine senza riferimenti leggibili | L’originale resta disponibile per la verifica in ufficio. |

## Prove

- Venti foto distinte e un vocale con la stessa destinazione producono 20 bolle e un riscontro in chat.
- Se 18 foto arrivano dopo il vocale, compaiono nello stesso invio con la destinazione e il vocale già salvati. Una foto spedita successivamente apre un invio separato.
- La scelta dal menu assegna le bolle dell’invio e rispetta le autorizzazioni del mittente.
- Una bolla già destinata e una bolla di un altro invio mantengono la propria destinazione.
- Un PDF con due DDT, di cui uno di più pagine, conserva la distinzione tra documenti.
- Un allegato estraneo o non leggibile segue il proprio flusso senza perdere gli originali.
