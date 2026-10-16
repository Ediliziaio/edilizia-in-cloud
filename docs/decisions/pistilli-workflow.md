# Pistilli: configurazione aziendale del flusso contratti

Decisione concordata il 16 ottobre 2026: Pistilli ha un’organizzazione diversa dalle altre aziende. Le sue regole operative non costituiscono il comportamento globale del gestionale.

La configurazione persistente è `company_fasi_settings.contract_workflow_profile`, con valore iniziale `standard`. Il profilo `manutenzione_stradale_su_ordine` richiede abilitazione esplicita per azienda. Non dedurlo dal nome, dal settore, da ANAS o dal contenuto del PDF. La lettura usa azienda corrente e policy esistenti; la cache include il company_id.

Per Pistilli, il contratto può raccogliere interventi su ordine. Non implica appuntamenti mensili. Il documento deve comunque distinguere lavoro singolo e manutenzione su ordine: il solo richiamo a un accordo quadro non basta.

Gli adempimenti d’ufficio (affidamento, documenti, programmazione, contabilità/SAL, collaudo e chiusura) sono attività separate dall’avanzamento del cantiere. Le lavorazioni esecutive si applicano al singolo intervento quando arriva l’ordine, con luogo, quantità, date, squadra e mezzi da confermare.

Lo standard viene proposto solo fra i modelli della stessa azienda; in caso di ambiguità si richiede una scelta. IVA, rate, quota dell’azienda nel raggruppamento e date mancanti rimangono da confermare. Queste garanzie sulla fedeltà del documento valgono per ogni azienda.

Le aziende con profilo standard mantengono la scelta delle proprie fasi: nessuna checklist stradale o assegnazione automatica del profilo Pistilli.

Le migrazioni canoniche sono le versioni 20261016114116, 20261016115423 e 20261016120017 recuperate dallo storico effettivo del database sul ramo principale. Le copie locali con versioni future sono state rimosse durante l’integrazione per evitare DDL duplicato. Non includono identificativi o documenti del cliente. L’abilitazione di Pistilli è una configurazione separata dei dati.

## Contratto e interventi

Gli ordini distinguono `workflow_kind` commessa/contratto/intervento. Un intervento ha un `parent_contract_id` della stessa azienda e un riferimento all’ordine/PED. La creazione tramite `create_contract_intervention` è atomica e usa un id stabile per i tentativi successivi: ordine, fasi e sottofasi vengono creati una sola volta. Lo standard deve appartenere all’azienda. Nessuna data viene dedotta automaticamente.

Gli interventi sono schede operative: importo tecnico zero e IVA nulla sono imposti dal database per evitare duplicazioni dei ricavi. Economia, SAL e pagamenti restano sul contratto. I costi e i rapportini degli interventi rimangono nei singoli interventi: non è ancora implementato un consolidamento automatico dei costi sul contratto. L’avanzamento dell’ufficio non modifica quello delle lavorazioni.

Il contratto può essere salvato in bozza anche senza cliente di fatturazione, quota economica, IVA e pagamenti confermati. I valori mancanti sono indicati nelle note e non generano ricavi o rate. Le normali commesse mantengono i controlli di conferma prima della creazione.

## Attività d’ufficio per ogni azienda

`tasks.activity_scope` distingue ufficio/cantiere/generale. Il riquadro Ufficio è disponibile per tutte le aziende; i modelli stradali rimangono opt-in per Pistilli. Si riusa il flusso di lavoro aziendale esistente per configurare modelli e uffici, senza introdurre una seconda libreria di modelli.

Ogni adempimento può essere assegnato a una persona d’ufficio con account aziendale. Le persone senza account collegato sono evidenziate e non diventano destinatari fittizi. Nomi uguali non vengono uniti automaticamente; gli account vengono distinti fra personale collegato e utenti aziendali.

Il cliente non ha ancora confermato i responsabili: le attività restano esplicitamente “Da assegnare”. Non si possono completare senza responsabile, né agganciare a un avanzamento automatico delle lavorazioni. Nessuna scadenza viene inventata. La scelta dei responsabili proposta in importazione viene conservata nella bozza.

Verifica database con ruolo authenticated e rollback: creazione con 8 fasi, ripetizione senza duplicati, ricavi/VAT del figlio isolati, rifiuto azienda errata, rifiuto completamento di attività non assegnata, importi del contratto invariati. Nessun dato di prova temporaneo della verifica resta salvato.

Gli standard hanno un ambito esplicito `work_phase_templates.template_scope`: contratto oppure cantiere. Lo standard organizzativo ANAS non è selezionabile come lavorazione dell’intervento, anche lato server. Gli standard esecutivi Pistilli sono stati ripuliti da verifiche economiche, SAL e saldo: sul campo restano ricognizione, esecuzione, misure, foto e riconsegna; la contabilità rimane all’ufficio. Le commesse reali preesistenti non vengono riscritte.
