# Compatibilità dei workflow migrati Solaria

Un rilascio del motore generico aveva sostituito l’estensione già testata e applicata. Questo intervento conserva nel repository l’adattatore e i punti di integrazione, affinché anche i deploy successivi lo includano.

L’adattatore richiede contemporaneamente l’azienda esplicitamente migrata e il marcatore `migration_source_node_id`. Gestisce note idempotenti, rilascio a lotti tramite RPC, aggiornamento opportunità secondo i flag originali, condizioni sul testo della risposta, timeout di 12 ore e promemoria relativi allo specifico appuntamento del trigger. I nodi ordinari e le altre aziende seguono i percorsi nativi.

Dipendenza database già applicata: `20261110221044_solaria_workflow_compatibility.sql`, ripristinata nello storico con PR 115. Non riapplicare lo SQL manualmente.

Verifica: 735 regressioni native e 26 casi dedicati, con database in memoria e provider simulati. I casi includono isolamento tra aziende, retry senza duplicati, opt-out WhatsApp, appuntamento mancante, errore del provider, assenza di scritture in prova e precedenza di una successiva modifica esplicita del timeout. Il test del motore carica l’adattatore reale nella VM isolata.

`npm run test:automations` esegue entrambe le suite; il pool Vitest è limitato a due processi. Nessun test invia messaggi reali o iscrive contatti.
