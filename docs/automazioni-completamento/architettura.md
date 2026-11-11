# Completamento automazioni, calendari e webhook — 11 novembre 2026

## Campi personalizzati

`automation_write_custom_field` è una RPC invocabile solo dal servizio: controlla azienda, oggetto, definizione attiva e iscrizione, applica il validatore esistente e registra l'evento nella stessa transazione. Un retry identico non genera un secondo evento. La catena dei flussi si propaga per impedire rientri ciclici. Modifiche ordinarie e cancellazioni dei valori emettono lo stesso evento. I documenti consolidati restano protetti. La capability generica è versione 1. Corretto anche il controllo email che respingeva indirizzi validi.

## Calendari di squadra

Un pool seleziona calendari personali attivi della stessa azienda, uno per persona. Supporta rotazione o priorità alta/media/bassa; a parità di priorità ruota. Gli orari personali, chiusure specifiche, preavviso, margini, limiti e impegni interni/esterni sono verificati nel database. Le disponibilità offerte e la prenotazione usano le stesse regole, anche per i calendari personali. Lock ordinati per persona/giorno impediscono doppie prenotazioni tra squadre diverse. Una chiave stabile impedisce duplicazioni dopo retry; lo spostamento conserva la persona assegnata e ignora il proprio evento esterno.

Google, Apple e Outlook ricevono l'evento nel calendario personale prenotato; Outlook mantiene una relazione evento/appuntamento server-only e non invia inviti. Nessun collegamento OAuth viene creato automaticamente.

Configurazione Solaria applicata: telefono Roberto/Mattia; videocall e sopralluoghi Roberto/Marco/Mattia/Mirco. Priorità ricavate dall'esportazione originale. Tre calendari di servizio Roberto 09–17 aggiunti; il calendario generale 09–19 resta invariato. Mattia conserva 09–24. Abilitata la sola visibilità calendario per i tre venditori già autorizzati. I link pubblici restano non esposti; nessuna prenotazione reale è creata dai test.

## Webhook in ingresso

Impostazioni → Integrazioni → Webhook: nuovo ingresso, flusso di destinazione fisso, mapping annidato, segreto mostrato una volta, rotazione, sospensione e ricevute senza corpo/segreti. Il server richiede permessi Integrazioni in modifica e respinge accessi in sola lettura. Il trigger mostra solo gli ingressi del flusso corrente.

POST con `Authorization: Bearer SEGRETO`, `X-Event-ID` e `X-Webhook-Timestamp` in secondi Unix entro cinque minuti. Corpo massimo 64 KB; massimo 60 eventi/minuto/ingresso. ID ripetuto e corpo identico: nessuna seconda esecuzione. Corpo diverso: 409. `X-Webhook-Test: 1` registra soltanto una ricevuta.

Mapping per record esistente oppure acquisizione contatto esplicita per email/telefono internazionale, con permesso Contatti in modifica. L'acquisizione completa solo campi mancanti, conserva opt-out e modifiche degli operatori e rifiuta identità ambigue. La normale creazione/variazione contatto produce anche gli eventi CRM. Nessun ingresso live è creato senza il servizio esterno e il relativo formato dati.

## Cosa collega il titolare

- Email: autorizzazione della casella (termob2b@gmail.com o caselle dei venditori); eventuale dominio di invio con DNS verificati e mittente scelto. Password/consenso restano al titolare.
- WhatsApp: proprio account Meta Business/WABA, numero e verifica, account nel gestionale e approvazione/associazione dei 35 modelli unici. L'abilitazione commerciale non è stata effettuata.
- Calendari esterni: ciascun partecipante collega Google/Outlook/Apple e sceglie il calendario nel proprio calendario personale; videocall Google Meet richiedono account Google autorizzato.
- Webhook: il servizio esterno riceve URL e segreto generati dall'interfaccia e invia il formato mappato. I 10 collegamenti Consolidata in uscita richiedono ancora URL/credenziali del titolare; non sono sostituiti dai webhook in ingresso.
- Meta Lead Ads e altri account originali: riconnessione e scelta dei moduli dell'azienda.

Le 45 bozze e i quattro flussi archiviati non sono pubblicati da questo intervento. Squadd è solo fonte di confronto; nessun servizio a pagamento viene attivato.
