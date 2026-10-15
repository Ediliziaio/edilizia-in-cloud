# Anteprime PDF e salvataggio in vista azienda — 15/10/2026

## Cause osservate in produzione

- Il visore canvas effettuava fetch di un URL blob dopo gli import asincroni.
  La CSP di produzione non abilita blob in connect-src; inoltre il ritardo fisso
  di revoca (1,2 secondi) non protegge import lenti e cambi rapidi di modello.
- Lo stato «Aggiornata» indicava la sola generazione, anche se il disegno falliva.
- Il salvataggio atomico delle righe rispetta RLS, ma quote_items imponeva
  l'azienda originaria anche al superadmin autorizzato a creare preventivi altrove.
  La compensazione della testata aveva la stessa incoerenza.

## Correzioni condivise

- Conservare il Blob originale per il visore, senza fetch della object URL e senza
  modificare la CSP. URL di download e Blob vengono liberati insieme.
- Acquisire la sorgente prima degli import; ignorare generazioni obsolete.
- Dichiarare l'anteprima aggiornata soltanto dopo il disegno del documento corrente.
  Un errore non diventa più un falso successo; liberare anche i risultati dopo timeout.
- Anche allegati e documenti delle varianti usano la sorgente Blob condivisa.
  Il pulsante di aggiornamento non revoca una sorgente statica ancora in uso;
  il documento conservato della variante produce un URL nuovo a ogni apertura.
- Allineare le policy delle righe al ruolo superadmin già previsto sulle testate.
  Conservare isolamento aziendale degli utenti normali, permesso preventivi,
  visibilità staff e blocco clienti esterni. Controllare sempre che azienda
  della riga e azienda della testata coincidano. La RPC resta SECURITY INVOKER.

Le prove online usano solo la bozza tecnica NON INVIARE, senza destinatario.
Nessuna modifica ai preventivi reali, nessun invio, firma o modifica dei listini.

## Verifiche

- Test mirati: sorgenti PDF senza rete, revoca durante lettura, timeout tardivo,
  errore di refresh senza falso stato aggiornato, visore canvas e otto moduli.
- Test DB in transazione con ROLLBACK: superadmin legge/aggiorna le righe QA,
  riga con azienda diversa dalla testata respinta, utente estraneo non legge
  né inserisce righe Palma, compensazione testata autorizzata. Nessun dato
  persistente cambiato da questi test.
- Prova browser produzione: bozza tecnica OFF-2026-004, due righe, descrizione
  generale di 4.069 caratteri e lavorazione di 6.713 caratteri. PDF scaricato:
  sei pagine, marcatori OG001-OG045 e QA001-QA060 integri, totali 48,19 euro.
  Tutte le pagine renderizzate e ispezionate.
- La precedente testata QA parziale OFF-2026-003 resta riconoscibile come test;
  non è stata cancellata automaticamente.
- Produzione dopo il deploy 91cdef47d: copertina PDF caricata nuovamente,
  canvas di tutte e tre le pagine visibili, modifiche rapide del footer risolte
  nell'ultima versione. Download corrispondente verificato su tutte le pagine.
  Zoom e aggiornamento manuale completati senza errori live-preview in console.
- Controlli CI 91cdef47d: Cloudflare Pages, Supabase Preview, Critical tests
  e TypeScript check riusciti. Le verifiche locali complete build/typecheck
  sono state interrotte dopo lunga contesa di risorse; non dichiarate superate.
- Suite mirate eseguite separatamente: 27 test più 8 del canvas e 11 del renderer
  nativo passati. Un'attesa UI sotto carico è stata riprovata isolatamente
  senza modificare il codice del componente. Ulteriore suite varianti,
  sorgenti e timeout: 28 test passati con timeout di test di 15 secondi.
