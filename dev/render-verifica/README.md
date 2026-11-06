# Verifica render locale

Pagina di sviluppo: `/azienda/render/verifica-completa`, protetta dagli stessi accessi di Render AI. Non viene inclusa nelle rotte di produzione. Le generazioni sono limitate all'azienda Demo 2.

Le nove sorgenti in `scene/` sono fotografie sintetiche generate con lo strumento integrato imagegen il 5 novembre 2026. I prompt sono in `scene/provenienza.json`. Non contengono dati di clienti. Sono foto **prima dell'intervento**, non risultati dimostrativi.

Le prove chiamano le funzioni e il provider effettivi dell'app in qualità Alta: otto tipi di stanza, tredici moduli dedicati, più la coerenza di due stanze della stessa pianta salvata. Cucina e soggiorno erano già stati verificati dalle planimetrie. Le analisi di bagno, persiane e infissi passano dai rispettivi endpoint. Le tavole materiali vengono preparate con il codice normale della stanza.

Il progresso viene salvato prima dell'aggiornamento React. Le generazioni già prese in carico si possono riagganciare dopo un aggiornamento della pagina; claim e addebiti restano gestiti dal server. Non esporre JSON, UUID, percorsi storage, prompt o errori del provider nell'interfaccia. Le immagini rifiutate dal controllo restano in storage privato e richiedono una verifica; non sono render approvati.

Il collaudo è una copertura dei moduli e dei tipi di ambiente, non di ogni combinazione possibile del catalogo, inquadratura o dispositivo.
