# Revisione 8 · Campagne, ricariche SMS e ticket

Allineamento a `4ec75546b` di `origin/main`. I destinatari, gli allegati, il pagamento e le aziende di prova sono sintetici. Alcuni percorsi usano un provider simulato. Tutte le scritture sono su localhost.

## Messaggi programmati · EIC013

Il worker originale è stato eseguito con invio simulato e con i destinatari risolti dal vero PostgreSQL locale. In entrambe le prove, con 201 e 450 destinatari, marcava conclusa l’occorrenza dopo 200 consegne.

Il worker aggiornato ha registrato prima 200 consegne su ciascun gruppo, mantenendo la prossima data e l’elenco dei destinatari in attesa. Ha concluso a 201 e 450, con una riga di consegna per destinatario. Due acquisizioni concorrenti hanno restituito un solo tentativo valido. Dopo un’interruzione simulata, la ripresa ha recuperato il destinatario in corso. Il comando obsoleto e l’accesso dal profilo aziendale sono stati respinti.

Una sessione Chrome autenticata ha letto le 201 consegne nel registro. La pagina amministrativa è tornata ad Attività durante l’apertura su localhost. La visualizzazione del pannello resta da verificare.

Una consegna esterna con risposta incerta viene registrata come «da verificare». Il sistema può continuare le altre consegne senza ripetere automaticamente l’invio incerto. Un rifiuto esplicito consente il canale alternativo. [Migrazione](../../../supabase/migrations/20290502081900_bulk_scheduler_ripresa_destinatari.sql) · [Test](../../../src/test/logic/bulkSchedulerBatch.test.ts)

## Ricarica SMS · EIC029

Da Chrome, prima, il checkout simulato finiva con «Crediti accreditati» mentre il saldo locale era zero. Dopo, il ritorno da Checkout mostrava «Pagamento in verifica» fino alla ricevuta nel database. Un evento non pagato e un importo incoerente non hanno attivato l’accredito. Due conferme concorrenti di uno stesso pagamento simulato da 20 € hanno aggiunto 26,40 € una volta sola e creato un’unica transazione. Verificati anche l’annullamento, la visibilità della ricevuta e il rifiuto della procedura di accredito da un profilo utente. [Migrazione](../../../supabase/migrations/20290502082000_sms_ricarica_checkout_confermata.sql) · [Test](../../../src/test/logic/smsCheckout.test.ts)

Il collaudo ha usato un ritorno Checkout e un evento di pagamento simulati. Resta da completare una prova con il checkout e la consegna del webhook in Stripe Test Mode prima del rilascio. [Documentazione Checkout di Stripe](https://docs.stripe.com/checkout/fulfillment)

## Dettaglio e allegati ticket · EIC072

Prima ESLint segnalava tre effetti che impostavano lo stato durante il caricamento dei campi. Dopo gli interventi, il controllo del file passa. Chrome ha verificato la rilettura di note e intervento al primo accesso e dopo il salvataggio. Salvare l’intervento preserva la bozza delle note e una seconda scheda vuota parte senza i dati del ticket precedente.

Il browser mostrava il vecchio link firmato anche dopo la scadenza. Con i riferimenti storici, il file sintetico è ora scaricabile sia dalla chat sia dal pannello Allegati. Una seconda azienda non può rinnovare l’accesso allo stesso oggetto. I nuovi caricamenti conservano il percorso del file. [Migrazione](../../../supabase/migrations/20290502082100_allegati_ticket_ambito_commessa.sql) · [Test](../../../src/test/logic/allegatoTicket.test.ts)

Da Campo è stato verificato il caricamento di un’immagine come operaio autenticato. Il permesso dedicato all’autore consente il caricamento sul suo ticket e lascia alle regole di lettura del ticket la visibilità del file. Chrome ha verificato anche la rimozione dell’anteprima e PostgreSQL ha confermato un solo file e il messaggio che lo collega.

## Contatori dei mezzi · EIC077

Due sessioni PostgreSQL hanno trasmesso 110 e 105 km partendo da 100. Prima, con 110 scritto per primo, il contatore scendeva a 105 e assumeva la data della lettura inferiore. Chrome in «Il mio mezzo» ha riprodotto 105 dopo la riapertura, con il payload abituale che omette l’azienda.

Dopo la migrazione, la segnalazione acquisisce la stessa guardia per azienda e mezzo usata dal POS. In entrambi gli ordini di invio il contatore rimane a 110 e la sua data è quella della lettura da 110. Le due letture restano nello storico. Anche la prova da Chrome con 105 inviato dopo 110 ha mostrato 110 dopo la riapertura. [Migrazione](../../../supabase/migrations/20290502082200_contatori_mezzi_letture_concorrenti.sql)

## Accesso Campo · EIC075

Con un accesso manuale e una lavorazione attiva sulla stessa commessa, Chrome mostrava una revoca completa e rimuoveva l’unica riga di accesso. L’operazione adesso rimuove la sola abilitazione manuale e segnala la fonte che resta. Chrome ha confermato il messaggio e l’accesso tramite la lavorazione dopo il salvataggio. In PostgreSQL un accesso solo manuale è stato rimosso, mentre l’operaio continuava a leggere l’accesso dalla lavorazione. Il comando è stato respinto per l’operaio, per una seconda azienda e alla ripetizione su una riga ormai automatica.

Verificata anche la rimozione contemporanea della lavorazione e dell’accesso manuale. Prima della serializzazione, una riga automatica poteva sopravvivere senza la sua fonte. Dopo, in entrambi gli ordini di esecuzione, non rimane alcun accesso. [Migrazione](../../../supabase/migrations/20290502082300_commessa_rimozione_accesso_manuale.sql) · [Test interfaccia](../../../src/test/ui/appCantiere.test.tsx)

## Verifiche del codice

Passati 94 test mirati in 12 file, TypeScript sui moduli frontend coinvolti e `git diff --check`. ESLint passa sul dettaglio ticket. Sui file aggiornati segnala un avviso già presente per l’esportazione di una funzione da AppCantiere. Il controllo Deno mirato al runner, al nuovo checkout e al modulo di conferma passa. Il controllo del webhook Stripe completo incontra incompatibilità TypeScript già presenti fra le versioni delle dipendenze.
