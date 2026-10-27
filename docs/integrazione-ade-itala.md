# ITALA centrale e recupero storico AdE

## Collegamento cliente

In Impostazioni → Fatturazione → Con un altro programma, il cliente collega il proprio gestionale quando disponibile. Un collegamento diretto già scelto resta principale; in assenza di un primario diretto, Fatture in Cloud precede ITALA. ITALA è il servizio centrale alternativo di Edilizia in Cloud: i clienti non inseriscono chiavi personali.

La scheda «Recupero fatture con Edilizia in Cloud» legge la partita IVA dall'anagrafica aziendale, con fallback ai dati della società. Solo un amministratore autorizzato può confermare la trasmissione dell'anagrafica a ITALA. Il server verifica/censisce la società sull'account multisoggetto e salva nell'integrazione solo il riferimento `platform:itala`. Un cambio di partita IVA richiede un nuovo collegamento.

Le credenziali centrali sono esclusivamente nei segreti Edge Functions `ITALA_CLIENT_ID`, `ITALA_CLIENT_SECRET`, `ITALA_ENVIRONMENT=prod`. Non inserirle nel frontend, in `platform_settings`, nei log o nel repository. Le vecchie integrazioni con credenziali proprie restano leggibili con il modulo di cifratura esistente.

## Fatture, originali e contabilità

- Il recupero filtra per partita IVA e verifica anche cedente/cessionario nell'XML. Le emesse entrano in `invoices`; le passive in `fatture_ricevute` con il salvataggio condiviso. Autofatture e integrazioni mantengono il tipo TD e non diventano ricavi.
- Ogni corpo di un lotto ha un'identità distinta; l'originale completo rimane nello storage privato. Gli indici per le ricevute distinguono azienda e corpo senza perdere la protezione contro i duplicati.
- L'import delle emesse è atomico: un errore sulle righe annulla l'intera registrazione. Gli importi del riepilogo XML e `ImportoTotaleDocumento` rimangono quelli originali, anche con bollo/ritenute/arrotondamenti.
- Non si azzerano incassi, collegamenti o stati di pagamento. Le copie identiche già importate da un altro programma vengono riconosciute; le discordanti sono segnalate.
- Aliquote, natura N2/N4/N6 ecc. ed esigibilità vengono conservate. La vista `fatture_vendite_iva`, con `security_invoker=true`, alimenta registro e liquidazione insieme ai documenti nativi, eliminando copie native identiche. Il registro legge tutte le pagine e mostra il riepilogo per aliquota/natura. La liquidazione mantiene le ipotesi e le regole già esistenti, inclusi reverse charge e split payment.
- La data di aggiornamento ITALA non viene inventata come data di ricezione SdI. Se la consegna effettiva non è disponibile, il campo resta vuoto e la liquidazione conserva l'avvertenza già prevista.
- I periodi fiscali chiusi non possono ricevere nuovi documenti emessi o modifiche fiscali tramite l'RPC di importazione.

L'importazione procede a pagine di 10 con cursore persistente, controllo di esecuzione concorrente e retry. Non esiste il vecchio troncamento silenzioso a 2000 documenti. Una pagina con errori non avanza; dopo tre errori consecutivi il recupero automatico sospende i tentativi per un'ora. Il cron esistente `billing-import-recupero` continua ogni due minuti, anche a pagina chiusa. I normali giri automatici avviano gli aggiornamenti due volte al giorno. Le letture usano `unread=false` per non consumare lo stato di altri client.

## Storico AdE

Nella scheda «Recupera da AdE» si preparano periodi massimi di tre mesi. Il cliente deve abilitare **Itala Tecnologia Informatica S.r.l. → Scarico Fatture** in Fatture e Corrispettivi. Ogni richiesta XML va firmata dal soggetto ammesso in CAdES `.p7m`.

Creazione: conferma esplicita di 1 credito. Recupero: conferma dei crediti sul conteggio riletto dal server. Nessun acquisto, firma o recupero a pagamento è stato eseguito nel collaudo. Il piano mensile non sostituisce abilitazione, firma o credito ricaricato per lo storico.

Il canale diretto AdE rimane disabilitato nell'interfaccia finché hosting, accreditamento e certificati non sono completati. Il servizio preparato in [services/smts](../services/smts/README.md) usa mTLS, verifica CMS, isolamento azienda e limiti di interrogazione; il codice non costituisce accreditamento.

## Distribuzione e riscontri del 27 ottobre 2026

Nel progetto Supabase Edilizia In Cloud è stata applicata la migrazione `20261027103542_itala_collegamento_iva` e sono state pubblicate `billing-connect`, `billing-import`, `billing-sync`, `billing-massive`. Le funzioni verificano autenticazione e azienda; il recupero massivo richiede un amministratore. L'RPC di importazione è riservata a `service_role`; la vista IVA non è accessibile ad `anon` e rispetta RLS.

Le credenziali di produzione sono state generate dopo conferma del titolare e salvate nei segreti del backend. Il collaudo reale di sola lettura ha verificato autenticazione, piano, lista aziende e fatture filtrate. L'account multisoggetto ha un'azienda e **zero fatture disponibili** al collaudo. Nessuna società fittizia è stata collegata a un tenant dell'applicazione. Non si dichiara completato un recupero di fatture reali assenti dal conto.

## Verifiche riproducibili

```sh
npm run test:billing-itala
npm run test:imported-invoices
npm --prefix services/smts test
npx deno check --no-config supabase/functions/billing-massive/index.ts supabase/functions/billing-connect/index.ts supabase/functions/billing-import/index.ts supabase/functions/billing-sync/index.ts
npm run build:fast
npm run typecheck:ci
```

I test PostgreSQL usano PGlite isolato e lo schema necessario fotografato senza dati dal database. Verificano rollback, incassi, duplicati, lotti, periodi chiusi, liquidazione IVA e accessi. I test UI verificano consenso aziendale e conferma dei crediti senza chiamate reali. La suite è inclusa in `test:critical`. Il build e il controllo generale dei tipi vanno valutati separatamente dai test mirati; non considerarli superati in assenza del loro esito.

Documentazione provider: [REST 2.0](https://www.fattura-elettronica-api.it/documentazione/) e [richieste massive](https://www.fattura-elettronica-api.it/documentazione/richieste-massive/).
