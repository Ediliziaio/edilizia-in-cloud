# Controlli isolati delle funzioni Edge

`npm run check:edge-runtime` e `npm run test:pdf-runtime` usano Deno 2.9.6 con un lock dedicato e immutabile. Questa directory non eredita i moduli Node del frontend: il client usa PDF.js 6, mentre il lettore server conserva PDF.js 4.0.379, la versione già impiegata e collaudata in produzione.

Il lettore server importa il pacchetto ufficiale npm, verificato mediante l'integrità SHA-512. Il precedente bundle di esm.sh non coincideva più con il checksum registrato. Non vengono ignorate le verifiche di integrità né abilitate dipendenze native o script di installazione.

Il controllo compila le funzioni webhook e fotovoltaiche effettive. Lo smoke test importa il lettore reale e genera PDF in memoria: verifica testo nativo, copertura di otto pagine non testuali e separazione delle pagine per il callback OCR. Il callback è locale: non chiama AI, database o servizi a pagamento.

Per aggiornare una dipendenza, rieseguire i due comandi senza `--frozen`, esaminare il diff del solo lock di questa directory e ripetere entrambi con `--frozen`. Il lock principale del repository resta indipendente.
