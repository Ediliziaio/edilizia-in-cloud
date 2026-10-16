# Pistilli: configurazione aziendale del flusso contratti

Decisione concordata il 16 ottobre 2026: Pistilli ha un’organizzazione diversa dalle altre aziende. Le sue regole operative non costituiscono il comportamento globale del gestionale.

La configurazione persistente è `company_fasi_settings.contract_workflow_profile`, con valore iniziale `standard`. Il profilo `manutenzione_stradale_su_ordine` richiede abilitazione esplicita per azienda. Non dedurlo dal nome, dal settore, da ANAS o dal contenuto del PDF. La lettura usa azienda corrente e policy esistenti; la cache include il company_id.

Per Pistilli, il contratto può raccogliere interventi su ordine. Non implica appuntamenti mensili. Il documento deve comunque distinguere lavoro singolo e manutenzione su ordine: il solo richiamo a un accordo quadro non basta.

Gli adempimenti d’ufficio (affidamento, documenti, programmazione, contabilità/SAL, collaudo e chiusura) sono attività separate dall’avanzamento del cantiere. Le lavorazioni esecutive si applicano al singolo intervento quando arriva l’ordine, con luogo, quantità, date, squadra e mezzi da confermare.

Lo standard viene proposto solo fra i modelli della stessa azienda; in caso di ambiguità si richiede una scelta. IVA, rate, quota dell’azienda nel raggruppamento e date mancanti rimangono da confermare. Queste garanzie sulla fedeltà del documento valgono per ogni azienda.

Le aziende con profilo standard mantengono la scelta delle proprie fasi: nessuna checklist stradale o assegnazione automatica del profilo Pistilli.

La migrazione è riordinata dopo le migrazioni 2028 che creano company_fasi_settings, poiché il repository usa già versioni future. Non include identificativi o documenti del cliente. L’abilitazione di Pistilli è una configurazione separata dei dati.

Limite attuale: il profilo distingue la preparazione del contratto e le attività d’ufficio; non introduce ancora un registro completo degli ordini di intervento collegati al contratto.
