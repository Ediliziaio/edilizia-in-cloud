# Revisione 8 · Confronti, costi comuni, IVA e copie

Il primo confronto è stato eseguito su `491e03ab7`. Il worktree è stato riallineato a `98af7da46` durante il lotto, poi a `c3d079078`. Le ultime due integrazioni su main riguardavano il fotovoltaico. Le prove usano aziende e documenti sintetici in Chrome, Supabase Auth e PostgreSQL locali.

## Confronto economico · EIC078

La procedura PostgreSQL ha restituito le voci del conto economico per tutti e tre gli anni. Nel browser è stata interrotta la sola risposta dell’anno corrente. Prima, l’intero confronto era vuoto anche con due letture riuscite. Dopo, le voci già lette restano visibili e la colonna dell’anno indisponibile viene segnalata. La variazione e il trend richiedono entrambi i valori. «Riprova» ripristina la colonna quando la risposta torna disponibile. [Vista del confronto](../../../src/components/controllo-gestione/tabs/TabCERiclassificato.tsx)

## Preventivi con prezzo manuale · EIC038

Il preventivo di prova ha un prezzo manuale di 1.000 €, sconto del 10%, imponibile di 900 €, IVA di 90 € e totale di 990 €. Il database dava gli importi corretti. Il PDF riportava erroneamente il 22% delle voci con prezzo zero. Il renderer server ora stampa l’aliquota salvata sulla testata e gli importi registrati. Verificati anche 0% e due aliquote, con 36 € al 10% e 118,80 € al 22%.

Il download dalla scheda è stato verificato in Chrome consegnando al browser i bytes prodotti prima e dopo dallo stesso bundle del server. La risposta HTTP della funzione di download è stata simulata in locale. [Adattatore PDF](../../../src/components/preventivi/pdf/adattatoreGenerico.ts) · [Test delle aliquote](../../../src/test/logic/prezziPreventivo.test.ts)

## Costi comuni · EIC050

PostgreSQL ha restituito 600 € di costi comuni e 1.000 € di margine diretto sulla lavorazione. Prima, durante l’interruzione della lettura dei costi comuni, «Margine a oggi» mostrava 1.000 €. Adesso appare «Non disponibile». Al recupero della fonte, la commessa generale e la scheda figlia mostrano 400 €. Il caso con lettura riuscita e zero costi conserva il suo esito. [Panoramica](../../../src/components/orders/generali/CommessaGeneraleDettaglio.tsx) · [Test](../../../src/test/ui/commesseGenerali.test.tsx)

## Copie di bozze fiscali · EIC053

Prima la creazione riusciva e la rilettura falliva. Una nuova pressione su «Duplica» creava una seconda bozza. Il database ora registra l’identificativo della richiesta insieme alla bozza. Due invii concorrenti ricevono lo stesso ID. Una nuova duplicazione esplicita può creare un’altra bozza. Il controllo da una seconda azienda è stato respinto.

L’editor può aprire il percorso della copia usando l’ID ricevuto dalla creazione. Un errore nella lettura successiva propone «Riprova lettura» sullo stesso documento. [Migrazione](../../../supabase/migrations/20290504093100_documento_copia_riprendibile.sql) · [Editor](../../../src/pages/azienda/fatturazione/EditorDocumento.tsx)

In Chrome, la prima richiesta è stata registrata e la sua risposta è stata interrotta. Il tentativo successivo ha aperto l’unica copia. È stata poi interrotta anche la lettura della copia. «Riprova lettura» ha recuperato lo stesso ID.

Il test di caricamento differito della campanella ha segnalato una regressione dopo l’allineamento. Il conteggio ora parte insieme alla lista quando la campanella è abilitata. Il test verifica entrambe le richieste appena la voce diventa disponibile.

## Appuntamenti di assistenza · EIC044

Chrome ha creato un appuntamento partendo dal calendario e scegliendo il ticket. Prima, riaprendo l’appuntamento appariva «Nessun riferimento». Dopo, «Assistenza» e il ticket restano selezionati. Spostando l’orario dalle 16 alle 17, l’appuntamento e il ticket riportano le 17 nel fuso del gestionale e mantengono l’assegnatario. PostgreSQL aggiorna durata, orario e assegnatario nella stessa transazione con i permessi dell’utente.

La migrazione ha ricollegato la coppia storica univoca. Due ticket con gli stessi dati non sono stati attribuiti automaticamente. Il testo storico rimane e il gestionale chiede di selezionare il ticket. [Migrazione](../../../supabase/migrations/20290504100100_appuntamento_ticket_collegato.sql) · [Calendario](../../../src/components/appointments/AppointmentDialog.tsx)

## Copia dei modelli di onboarding · EIC027

Prima, bloccando la lettura dei passaggi in Chrome, il pannello confermava la duplicazione e il modello restava vuoto. Dopo la correzione, la copia riaperta dal pannello conserva passaggi, ordine, obbligatorietà, auto-verifiche e collegamenti. La prova sul database ha bloccato l’inserimento di un passaggio e ha verificato che la testata sia stata annullata. La procedura è riservata agli amministratori di piattaforma. Eliminati cinque errori ESLint negli effetti del pannello. [Migrazione](../../../supabase/migrations/20290504100200_duplica_modello_onboarding_atomico.sql)

## Cambio luogo e risposta interrotta · EIC018

Prima, dopo il commit di un cambio tra due sedi con risposta interrotta in Chrome, il recupero della coda produceva cinque timbri invece di tre, compreso il timbro iniziale. Dopo, entrambe le richieste di recupero riusano gli ID salvati e lo storico conserva tre timbri, con una sola uscita dalla prima sede e una sola entrata nella seconda. La seconda chiamata diretta su PostgreSQL con gli stessi ID restituisce il successo della prima. Verificato anche il cambio con la firma usata dai client precedenti. [Migrazione](../../../supabase/migrations/20290504100300_campo_cambio_luogo_stessi_timbri.sql) · [Test](../../../src/lib/campo/timbra.test.ts)

## Verifiche del codice

Passati 172 test mirati in 18 file, TypeScript nei moduli modificati e `git diff --check`. ESLint non riporta errori sui file verificati. Restano sette avvisi preesistenti nei file del confronto economico e delle bozze fiscali.
