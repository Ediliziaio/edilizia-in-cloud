# Centralino Fish Audio

L’area Agenti AI include un editor Fish con procedura guidata, flussi pronti,
agenda, simulazioni, prova vocale e richiesta di collegamento del numero.
Il centralino e le schede cliente mostrano storico, trascrizioni, registrazioni
disponibili e collegamenti alle segnalazioni. Le prove con dati dimostrativi
sono distinte dal collaudo amministrativo che salva realmente un ticket.

## Configurazione del servizio

Nel backend Supabase sono richiesti `FISH_API_KEY`, `FISH_WEBHOOK_SECRET`
e `FISH_BACKEND_URL`. Non vanno nelle variabili `VITE_*` o nel browser.
Le funzioni `fish-agent-proxy`, `fish-agent-tools`, `fish-inbound` e
`fish-webhook` usano rispettivamente accesso autenticato, sessione verificata
e firme. Le migrazioni Fish del 10 novembre 2026 sono già versionate.

Il modello vocale predefinito è Drama 3. L’editor permette anche una scelta
esplicita di S2.1 Pro e usa la scelta salvata sia nelle sessioni sia nelle
anteprime audio. Voce, modello di sintesi e modello linguistico sono campi
distinti. Le prove vocali e le simulazioni consumano credito Fish.

## Prove e uso operativo

La prova vocale usa un agente web privato separato, strumenti client
dimostrativi e nessuna registrazione audio. Non chiama numeri, non trasferisce
una tratta telefonica e non modifica il CRM. Il banco del passaggio simula
il primo collega disponibile, accettazione, mancata risposta e ritorno all’AI.
Il collaudo con un cliente reale richiede invece la selezione della scheda,
verifica di nome e indirizzo e consenso prima della segnalazione di prova.

Nel flusso lead si configurano azienda, servizi, comuni e modalità
dell’appuntamento. Il server verifica il consenso nella conversazione
effettiva prima di prenotazioni, richiami e note; non si fida di un semplice
parametro del modello. Una richiesta esplicita di non essere richiamati
viene persistita sul contatto associabile e blocca nuovi tentativi e retry.
In caso di associazione ambigua il sistema richiede verifica manuale.

Il trasferimento telefonico operativo richiede linea, destinazioni approvate,
presenza dei colleghi e collaudo del carrier. Le chiamate Fish in uscita
richiedono un collegamento pubblicato e abilitato, tariffa e credito.
La pubblicazione del frontend non abilita agenti su linee o campagne.

## Verifiche

`npm run test:fish` comprende controlli di configurazione, conversazioni,
isolamento aziendale, consenso, flussi e fixture SQL eseguite con PGlite.
La CI esegue questa suite insieme ai controlli già previsti dal repository.
Per la compilazione locale usare le sole variabili pubbliche Supabase e
`npm run build:fast`. La pipeline di produzione conserva la propria build
e la prerenderizzazione delle pagine pubbliche.
