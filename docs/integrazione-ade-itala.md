# Recupero fatture AdE e Fattura Elettronica API

## Modifiche del 27 ottobre 2026

La copia aggiornata del progetto è `/Users/florinandriciuc/edilizia-in-cloud`. La copia in `Documents/New project/edilizia-in-cloud` è precedente: non è stata aggiornata da questa implementazione.

In **Impostazioni → Fatturazione → Con un altro programma**:

1. Il provider Fattura Elettronica API (ITALA) si configura con **Client ID e Client Secret API**, distinti dalle credenziali del portale. L'ambiente è esplicito (predefinito: test).
2. Il server verifica il collegamento con una lettura di `/credito`, associa la partita IVA dell'azienda e cifra le credenziali con AES-GCM usando il modulo di cifratura già presente nel progetto. La lista delle integrazioni non seleziona più i campi contenenti segreti. I vecchi Bearer continuano a essere letti.
3. La sincronizzazione automatica resta disattivata al primo collegamento per consentire il collaudo. Usa il comando di sincronizzazione esistente solo dopo aver verificato i primi documenti.
4. Nella nuova scheda **Recupera da AdE**, scegli ITALA oppure il canale diretto, date, emesse/ricevute e criterio data. Il server ricava la partita IVA dall'azienda autorizzata: il browser non può sostituirla.
5. Per ITALA la creazione richiede conferma di **1 credito**. Il file restituito si scarica e si firma in CAdES `.p7m`; il file firmato viene caricato e inoltrato al provider.
6. Quando lo stato è PRONTO, la conferma del recupero mostra i crediti richiesti per il numero attuale dei documenti. Il server rilegge il conteggio prima di richiedere l'addebito. Nessuna ricarica o acquisto di firme viene eseguito dal codice.
7. Quando i documenti sono disponibili, l'importazione esplicita procede a pagine di 10. Non avanza il cursore se la pagina ha errori; i documenti già salvati vengono riconosciuti al nuovo tentativo. Al termine riparte dalla prima pagina per un successivo giro. Se si chiude la pagina si può ripartire dalla prima senza duplicare intenzionalmente lo storico.

Prima delle richieste ITALA, l'azienda deve essere presente nel suo account e deve aver abilitato **Itala Tecnologia Informatica S.r.l. → Scarico Fatture** nella funzione AdE Censimento canali per forniture massive. Il piano acquistato non sostituisce questa abilitazione e non sostituisce la firma richiesta.

## Correzione dell'importatore ITALA esistente

Prima l'elenco veniva scaricato senza filtro partita IVA e veniva trattato interamente come fatture emesse, con campi ipotizzati e importi mancanti trasformati in zero. Ora:

- richieste filtrate per partita IVA e verifica dell'intestatario e della direzione di ogni documento;
- emesse lette dall'XML e salvate in `invoices`, con righe e originale privato;
- ricevute salvate con il componente condiviso `salvaFatturaRicevuta` in `fatture_ricevute`;
- una ricevuta non può diventare un ricavo; una fattura senza XML/direzione verificabile causa un errore esplicito;
- un documento emesso già presente da altra fonte non viene duplicato se i dati coincidono; se i dati differiscono viene segnalato;
- gli incassi già registrati non vengono azzerati dagli aggiornamenti SdI ITALA;
- il normale import automatico ha ancora un limite esplicito di 2000 documenti: oltre il limite segnala di usare l'importazione manuale a pagine, invece di dichiarare completato un import troncato;
- i file con più corpi vengono segnalati come non supportati in questo connettore, evitando la perdita silenziosa dei corpi successivi. Vanno controllati nel percorso XML esistente; non considerarli automaticamente completati.

## Backend e distribuzione

Funzioni cambiate: `billing-connect`, `billing-import`; funzione nuova: `billing-massive`. La configurazione di quest'ultima usa `verify_jwt=false` perché la funzione verifica esplicitamente JWT, stato utente, accesso all'azienda e ruolo amministrativo. Nessuna modifica allo schema del database è necessaria.

Le nuove credenziali ITALA usano `GOOGLE_TOKEN_ENCRYPTION_KEY` tramite il modulo esistente; rimane il fallback server già previsto alla service-role. Non cambiare questa chiave senza ricifrare i dati. Le credenziali non vanno aggiunte a variabili VITE o documentazione.

Il codice locale non costituisce una distribuzione. Per attivare ITALA occorre pubblicare insieme backend e frontend, configurare le credenziali sul backend dell'azienda corretta e fare un collaudo di lettura. Non è stato ancora fatto un collaudo sul conto reale, un addebito o un recupero fiscale reale.

Per il canale diretto, vedi [README SMTS](../services/smts/README.md). Il suo hosting deve essere predisposto e collegato con i segreti `SMTS_GATEWAY_URL` e `SMTS_GATEWAY_SECRET`. Il canale non può essere dichiarato accreditato dal solo codice.

## Verifiche riproducibili

```sh
npx vitest run src/test/logic/recuperoMassivoAdE.test.ts src/test/ui/recuperoMassivoAdE.test.tsx
npm --prefix services/smts test
npx deno check --no-config supabase/functions/billing-massive/index.ts supabase/functions/billing-connect/index.ts supabase/functions/billing-import/index.ts
```

Verificati anche gli XML emesse/ricevute per i criteri di emissione, ricezione e accoglienza SdI con `xmllint --schema services/smts/contracts/InputMassivo_v1.5.xsd`. I test locali non usano le credenziali del cliente e non consumano crediti.

Esito della verifica locale: 92 test Vitest nei cinque file finali selezionati e 8 test Node del servizio SMTS superati; controlli Deno delle tre funzioni e del servizio superati; lint dei nuovi componenti/test frontend senza errori. La schermata è stata verificata anche nel browser su un'anteprima con dati simulati, inclusa la conferma dei crediti.

Il controllo TypeScript dell'intera applicazione è stato interrotto dopo oltre 16 minuti senza risultato: non è dichiarato superato. Prima della distribuzione frontend completare il normale controllo/build del repository; i controlli mirati non sostituiscono il controllo completo. Non sono stati modificati o pubblicati i cambiamenti preesistenti relativi a preventivi/PDF presenti nella stessa copia di lavoro.
