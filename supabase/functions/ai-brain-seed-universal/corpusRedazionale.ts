/**
 * corpusRedazionale.ts — 76 guide redazionali per l'edilizia + filiere + esempi.
 *
 * Origine: "Libreria Prompt AI per l'Edilizia v2" (agosto 2026), trasformata in
 * documenti del Brain UNIVERSALE. Ogni documento e' la struttura collaudata di
 * un deliverable ricorrente dell'impresa edile (sollecito, variante, SAL,
 * verbale DPI, contestazione fornitura, offerta condominiale, ...).
 *
 * Come li usa Silvio: il playbook redazionale (executionPlaybooks.ts) gli dice
 * di cercare qui la guida quando l'utente chiede un documento di questi tipi,
 * e di seguirne la struttura riempiendo i campi [TRA QUADRE] con dati reali
 * dai tool — mai inventati.
 *
 * File GENERATO da scripts nella sessione del 2026-08-05 (parser del markdown
 * sorgente). Per aggiornarlo in blocco: rigenerare, non editare a mano le
 * singole guide. L'ingestione e' idempotente (hash del contenuto).
 */
// Tipo locale identico a quello del seeder: importarlo da index.ts creerebbe
// un ciclo (index.ts importa questo file).
export interface UniversalDoc {
  category: string;
  title: string;
  content: string;
  source_type?: string;
}

export const CORPUS_REDAZIONALE: UniversalDoc[] = [
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 1.1 — Scomponi una richiesta cliente in voci di computo",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 1.1 — Scomponi una richiesta cliente in voci di computo
Area: PREVENTIVI E COMPUTI METRICI

QUANDO USARLA: il cliente ti ha descritto il lavoro a voce o via messaggio e devi trasformarlo in un elenco tecnico di lavorazioni.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Agisci come un geometra esperto in contabilità lavori.

Ti incollo la richiesta di un cliente, scritta con parole sue:
"[INCOLLA LA DESCRIZIONE DEL CLIENTE]"

Contesto: edificio [TIPO: appartamento / villetta / capannone / condominio], anno [ANNO CIRCA], a [CITTÀ]. Il lavoro riguarda [UNITÀ SINGOLA / PIÙ UNITÀ / PARTI COMUNI].

Genera:
1. ELENCO VOCI DI LAVORAZIONE in ordine logico di esecuzione (allestimento cantiere → demolizioni → impianti → opere murarie → finiture → pulizie e smobilizzo), con per ogni voce: descrizione tecnica corretta e unità di misura appropriata (mq, ml, cad, a corpo).
2. LAVORAZIONI IMPLICITE che il cliente non ha nominato ma quasi certamente servono (es. smaltimento macerie, opere provvisionali, assistenze murarie agli impianti). Segnale ⚠️ su ognuna.
3. DATI MANCANTI da chiedere al cliente prima di quantificare, in ordine di importanza.
4. PUNTI DI RISCHIO PREVENTIVO: dove è più probabile che emergano imprevisti (con che domanda di sopralluogo li verifico).

Se il lavoro riguarda più unità o parti comuni condominiali, separa le voci per ambito e segnala le lavorazioni che richiedono delibera o autorizzazioni.
Non indicare prezzi. Solo struttura e quantità da rilevare.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 1.2 — Bozza di preventivo per lavorazione standard",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 1.2 — Bozza di preventivo per lavorazione standard
Area: PREVENTIVI E COMPUTI METRICI

QUANDO USARLA: devi impostare un preventivo per una tipologia ricorrente (bagno, cucina, cappotto, rifacimento tetto...) senza partire dal foglio bianco.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Agisci come un'impresa edile che prepara offerte professionali.

Prepara la STRUTTURA di un preventivo per: [TIPO LAVORO, es. ristrutturazione completa bagno].
Dati: [METRATURA] mq, edificio [TIPO E ANNO], a [CITTÀ], piano [N], [CON/SENZA] ascensore.
Lavorazioni previste: [ELENCA, es. demolizione totale, nuovo massetto, impianto idrico ed elettrico, rivestimenti, sanitari sospesi].
Vincoli particolari: [ES. spazi ridotti, colonna di scarico condominiale da rifare, cliente che resta in casa, edificio vincolato — oppure "nessuno"].

Genera un preventivo con:
1. VOCI in ordine di esecuzione, ognuna con descrizione chiara, unità di misura e quantità stimata (segnala con ~ le stime da verificare in sopralluogo).
2. Colonne vuote per prezzo unitario e totale: i prezzi li metto io.
3. SEZIONE ESCLUSIONI tipiche per questo lavoro (che il cliente spesso dà per incluse) — adattala ai vincoli che ti ho indicato.
4. CONDIZIONI: validità offerta, modalità di pagamento per fasi, durata cantiere stimata (intervallo min-max), gestione varianti.
5. 3 DOMANDE che dovrei fare al cliente prima di consegnare, per evitare i contenziosi più comuni su questo tipo di lavoro.

Se i vincoli che ti ho indicato cambiano lavorazioni o sequenza (es. scarico condominiale), integrali nelle voci, non in una nota generica.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 1.3 — Riscrivi il preventivo in linguaggio chiaro",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 1.3 — Riscrivi il preventivo in linguaggio chiaro
Area: PREVENTIVI E COMPUTI METRICI

QUANDO USARLA: il preventivo è tecnico e il cliente privato non lo capisce; vuoi aumentarne l'accettazione senza cambiare i numeri.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Agisci come un consulente che aiuta le imprese edili a farsi capire dai clienti privati.

Ti incollo le voci del mio preventivo:
"[INCOLLA LE VOCI]"

Riscrivile così:
1. Per ogni voce: COSA facciamo (parole semplici), PERCHÉ serve, COSA È INCLUSO. Massimo 3 frasi a voce: se una voce è banale (es. "pulizia finale"), basta una frase — non gonfiare.
2. NON cambiare: ordine, quantità, prezzi, contenuto tecnico. Se semplificando rischi di alterare il significato tecnico di una voce, fermati e segnalamela invece di tirare a indovinare.
3. Aggiungi una INTRODUZIONE di 4-5 righe da mettere in testa al preventivo: cosa troverà il cliente, come leggerlo, invito a chiedere chiarimenti.
4. In fondo, una LEGENDA di massimo 5 termini tecnici che è meglio lasciare (es. massetto, tracce) con spiegazione da una riga.

Regola ferrea: nessuna promessa aggiuntiva che non è scritta nelle voci originali.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 1.4 — Cronoprogramma di massima del cantiere",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 1.4 — Cronoprogramma di massima del cantiere
Area: PREVENTIVI E COMPUTI METRICI

QUANDO USARLA: devi dare al cliente (o a te stesso) un piano temporale realistico prima di iniziare.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Agisci come un direttore di cantiere esperto.

Lavorazioni: [ELENCO LAVORAZIONI]
Squadra: [N OPERAI + SPECIALIZZAZIONI, es. 2 muratori + idraulico ed elettricista esterni]
Produttività indicativa: [SE LA SAI, es. "il mio piastrellista fa ~15 mq/giorno" — altrimenti scrivi "usa medie di settore e segnala che sono medie"]
Vincoli: [ES. condominio con orari, cliente in casa, forniture con consegna a X settimane, periodo dell'anno]

Genera:
1. CRONOPROGRAMMA per settimane: sequenza fasi, sovrapposizioni possibili, tempi tecnici di maturazione (massetti, intonaci, stagionature) trattati come vincoli NON comprimibili.
2. Il PERCORSO CRITICO: le 3-4 lavorazioni il cui ritardo sposta la consegna, e di quanto (effetto a cascata).
3. PUNTI DI DECISIONE del cliente (scelta piastrelle, sanitari, colori) con la data ultima per decidere senza bloccare il cantiere.
4. DURATA TOTALE come intervallo (scenario buono / scenario realistico), non data secca.
5. I 3 RISCHI DI SLITTAMENTO più probabili per QUESTO cantiere, con mossa preventiva per ciascuno.
6. Se il periodo dell'anno che ti ho indicato impatta (gelo, ferie di agosto, piogge), integralo nelle durate.

Presenta il tutto anche in versione tabella semplice che posso incollare in una email al cliente.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 1.5 — Email di accompagnamento al preventivo",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 1.5 — Email di accompagnamento al preventivo
Area: PREVENTIVI E COMPUTI METRICI

QUANDO USARLA: invii il preventivo e vuoi che venga letto, capito e non giudicato solo dal totale.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Scrivi l'email con cui invio un preventivo a un potenziale cliente.

Dati: impresa [NOME], lavoro [TIPO], cliente [NOME], sopralluogo fatto il [DATA], importo [CIFRA], validità offerta [GIORNI].
Punti di forza da valorizzare: [ES. squadra propria senza subappalti, cantiere pulito, tempi garantiti per iscritto, referenze in zona]
Profilo del cliente: [SBRIGATIVO — vuole sintesi / ANALITICO — vuole dettagli / INDECISO — sta confrontando più preventivi]

Struttura:
1. Ringraziamento breve e riferimento concreto al sopralluogo (una cosa specifica che abbiamo visto insieme).
2. Cosa contiene il preventivo e COME leggerlo (dove guardare oltre al totale: esclusioni, qualità materiali, garanzie).
3. I punti di forza, intrecciati al lavoro specifico, non elencati come slogan.
4. Invito a una telefonata di 10 minuti per rivederlo insieme, con proposta di due finestre orarie.
5. Chiusura con validità dell'offerta, senza pressione.

Lunghezza: adattala al profilo cliente che ti ho dato (sbrigativo = max 100 parole; analitico = fino a 200; indeciso = aggiungi 2 righe su cosa ci distingue dai preventivi più bassi).`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 2.1 — Aggiornamento settimanale sul cantiere",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 2.1 — Aggiornamento settimanale sul cantiere
Area: COMUNICAZIONE CON I CLIENTI

QUANDO USARLA: ogni venerdì, per ogni cantiere attivo. Il cliente informato è un cliente che non chiama in continuazione.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Scrivi l'aggiornamento settimanale per il cliente del cantiere [NOME/INDIRIZZO].

FATTO questa settimana: [ELENCO]
PREVISTO settimana prossima: [ELENCO]
DECISIONI che servono dal cliente: [ELENCO + data limite per ciascuna — oppure "nessuna"]
VARIAZIONI su tempi o costi: [DESCRIVI — oppure "nessuna"]
ANDAMENTO generale: [IN LINEA / LEGGERO RITARDO RECUPERABILE / PROBLEMA DA DISCUTERE]

Struttura fissa: ✅ Fatto / 🔜 Prossima settimana / ❓ Serve da te (con date limite) / 📊 Stato generale.

Tono: concreto e rassicurante SE l'andamento è in linea. Se ho indicato un problema, niente tono rassicurante di facciata: dillo con chiarezza e rimanda alla telefonata o al messaggio dedicato.
Lunghezza: max 120 parole per settimane normali; se ci sono decisioni in scadenza o variazioni, dai loro lo spazio che serve.
Formato: adatto sia a email che WhatsApp. Le decisioni richieste SEMPRE con data limite, altrimenti il cliente non decide mai.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 2.2 — Spiega un imprevisto e la variante di costo",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 2.2 — Spiega un imprevisto e la variante di costo
Area: COMUNICAZIONE CON I CLIENTI

QUANDO USARLA: hai aperto e trovato la sorpresa. Devi comunicarla senza sembrare né incompetente né furbo.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Devo comunicare un imprevisto di cantiere al cliente e chiedere approvazione della variante.

Lavorazione in corso: [ES. demolizione pavimento bagno]
Problema trovato: [DESCRIVI, es. tubazione di scarico corrosa e non a norma]
Era prevedibile prima di aprire? [NO, non visibile / IN PARTE — spiega / era un rischio già segnalato nel preventivo alla voce X]
Cosa succede se non si interviene: [CONSEGUENZE CONCRETE]
Soluzione proposta: [DESCRIVI] — Costo: [CIFRA] — Giorni extra: [N]
Alternativa più economica (se esiste): [DESCRIVI + LIMITI — oppure "non esiste alternativa seria"]
Foto disponibili: [SÌ/NO]

Scrivi un messaggio che:
1. Comunica il fatto SUBITO, senza giri di parole né drammatizzazione.
2. Chiarisce con onestà se era prevedibile o no. Se era un rischio già segnalato nel preventivo, richiamalo esplicitamente (questo ci protegge). Se non era prevedibile, spiega perché in una frase tecnica ma comprensibile.
3. Presenta la soluzione, il costo e l'impatto sui tempi. Se c'è un'alternativa più economica, presentala onestamente con i suoi limiti: far scegliere il cliente tra due opzioni riduce i conflitti.
4. Rimanda alle foto allegate.
5. Chiede APPROVAZIONE SCRITTA prima di procedere, indicando cosa succede al cantiere nell'attesa (fermo? proseguiamo su altre lavorazioni?).

Tono: fermo, trasparente, zero scuse eccessive. Chiudi con disponibilità a una telefonata oggi stesso.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 2.3 — Rispondi a chi chiede uno sconto",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 2.3 — Rispondi a chi chiede uno sconto
Area: COMUNICAZIONE CON I CLIENTI

QUANDO USARLA: "mi fai qualcosina sul prezzo?" — la frase più costosa dell'edilizia italiana.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Un cliente chiede uno sconto sul mio preventivo. Scrivi la risposta.

Importo preventivo: [CIFRA] — Lavoro: [TIPO]
Richiesta del cliente: [SCONTO % / CIFRA TONDA / "me lo fanno a meno" con preventivo concorrente]
Situazione: [CLIENTE NORMALE che tratta per abitudine / CLIENTE IN REALE DIFFICOLTÀ economica / CLIENTE che confronta con preventivo molto più basso]
Il mio margine su questo lavoro: [BUONO — c'è spazio di manovra / GIUSTO — poco spazio / TIRATO — zero spazio]
Elementi di valore: [ES. squadra propria, materiali certificati, garanzia scritta, assistenza post-lavori]

Scrivi una risposta che:
1. Ringrazia e NON si scusa del prezzo.
2. Ribadisce cosa c'è dentro quel prezzo (2-3 elementi concreti, non slogan).
3. Poi si adatta alla situazione:
   - Cliente normale → no allo sconto secco + due alternative: ridurre il perimetro (indica quali voci si prestano) o rimodulare i pagamenti.
   - Cliente in reale difficoltà → mantieni il prezzo ma proponi lavori per fasi/priorità: prima ciò che è urgente, il resto quando potrà.
   - Confronto con preventivo più basso → offri di confrontare le voci una per una insieme, e dai al cliente 3 domande da fare all'altro preventivo (esclusioni? smaltimento incluso? chi fa i lavori materialmente?).
4. Chiude cordiale e sicura, senza supplicare.

Max 130 parole per il caso semplice; per il confronto preventivi puoi arrivare a 180.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 2.4 — Comunica un ritardo di consegna",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 2.4 — Comunica un ritardo di consegna
Area: COMUNICAZIONE CON I CLIENTI

QUANDO USARLA: il cantiere slitta. Meglio dirlo tu prima che se ne accorga il cliente.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Devo comunicare al cliente un ritardo sulla consegna del cantiere.

Lavoro: [TIPO] — Ritardo: [GIORNI/SETTIMANE] — Nuova data fine: [DATA]
Causa: [DESCRIVI]
La causa è: [NOSTRA — errore/sottostima / ESTERNA — fornitore, meteo, burocrazia / DEL CLIENTE — decisioni arrivate tardi, varianti richieste in corso]
Azioni di recupero già in corso: [ES. seconda squadra il sabato, fornitore alternativo]
Il contratto prevede penali? [SÌ/NO/NON SO]

Scrivi un messaggio che:
1. Annuncia il ritardo nella PRIMA frase. Niente premesse lunghe.
2. Spiega la causa con onestà calibrata:
   - Causa nostra → ammissione diretta senza autoflagellazione + cosa abbiamo già messo in campo per recuperare + un gesto concreto verso il cliente (priorità su una finitura, sistemazione extra senza addebito: proponimi tu 2 opzioni sensate per questo tipo di lavoro).
   - Causa esterna → fatti e date precise, documentabili, senza scaricare il barile in modo piagnucoloso.
   - Causa del cliente → tono neutro e fattuale, ricostruzione con date delle decisioni attese: serve a proteggere noi, senza fare la ramanzina.
3. Piano aggiornato con la nuova data e cosa faremo per non slittare oltre.
4. Scuse: una frase, sobria, solo se la causa è nostra o mista.
5. Chiusura con disponibilità a sentirci a voce.

Se ho indicato che c'è una penale, aggiungi in coda una nota PER ME (non da inviare) su come la causa del ritardo si rapporta alla penale e cosa documentare.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 2.5 — Messaggio di fine lavori + richiesta recensione",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 2.5 — Messaggio di fine lavori + richiesta recensione
Area: COMUNICAZIONE CON I CLIENTI

QUANDO USARLA: cantiere chiuso. Il momento migliore per incassare la recensione (e il saldo).

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Il cantiere è finito. Scrivi il messaggio di chiusura per il cliente.

Lavoro: [TIPO] — Cliente: [NOME]
Saldo finale: [GIÀ PAGATO / DA PAGARE — importo e scadenza]
Soddisfazione del cliente: [MOLTO CONTENTO / CONTENTO CON QUALCHE FRIZIONE DURANTE I LAVORI / CI SONO STATI PROBLEMI]
Istruzioni di manutenzione rilevanti: [ES. non lavare il gres con acido i primi giorni, tempi di essiccazione pitture — oppure "nessuna"]
Link recensione Google: [LINK]

Genera DUE versioni (email completa + WhatsApp da 3-4 righe) che:
1. Ringraziano con un riferimento specifico al progetto (una frase che dimostri che non è un copia-incolla).
2. Riepilogano le garanzie post-lavori: cosa copriamo, per quanto, chi chiamare se qualcosa non va.
3. Includono le istruzioni di manutenzione (solo se rilevanti, in elenco puntato).
4. Se il saldo è ancora da pagare: richiamo cordiale con importo, scadenza e IBAN. La richiesta di recensione in questo caso NON va in questo messaggio: preparane una separata da inviare DOPO il saldo.
5. Richiesta recensione: adattata alla soddisfazione reale. Cliente molto contento → richiesta diretta con link. Contento con frizioni → prima una domanda ("è tutto a posto? c'è qualcosa che sistemerebbe?"), la recensione si chiede al messaggio successivo. Problemi → niente richiesta recensione: proponi invece una visita di verifica gratuita a 30 giorni.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 3.1 — Traccia dei contenuti del POS",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 3.1 — Traccia dei contenuti del POS
Area: SICUREZZA E POS

QUANDO USARLA: per preparare la bozza di POS da portare al tuo consulente sicurezza, arrivando con il lavoro mezzo fatto.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Agisci come un consulente per la sicurezza nei cantieri (D.Lgs. 81/2008).

Cantiere: [TIPO LAVORI] — Durata: [SETTIMANE/MESI] — Operai: [N, di cui nuovi assunti: N]
Attrezzature principali: [ES. ponteggio, gru a torre, elevatore, sega circolare, demolitori]
Lavorazioni a rischio particolare presenti: [SPUNTA QUELLE CHE CI SONO: lavori in quota / demolizioni / scavi / amianto sospetto / lavori su impianti elettrici / spazi confinati / presenza di terzi (condomini, clienti in casa) / nessuna di queste]
C'è un PSC del coordinatore? [SÌ/NO — se sì, incolla l'indice o le prescrizioni principali]

Genera la TRACCIA del Piano Operativo di Sicurezza, sezione per sezione secondo l'Allegato XV:
1. Per ogni sezione: cosa deve contenere, quali DATI devo raccogliere io, e con che documento li dimostro.
2. Per ogni lavorazione a rischio che ho spuntato: rischi specifici, misure preventive tipiche, DPI necessari, formazione richiesta agli operai.
3. Se c'è il PSC: elenca i punti del POS che devono raccordarsi con esso.
4. CHECKLIST FINALE dei documenti da avere pronti prima della consegna (nomine, attestati formazione, verbali consegna DPI, idoneità sanitarie).

Avvertenza da includere: questa è una traccia di lavoro. Il POS va redatto e firmato secondo le responsabilità di legge, con il supporto del professionista/consulente per la sicurezza.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 3.2 — Verbale di consegna DPI",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 3.2 — Verbale di consegna DPI
Area: SICUREZZA E POS

QUANDO USARLA: ogni consegna, sostituzione o reintegro di DPI. Senza firma, in caso di infortunio sei scoperto.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Genera il modello di VERBALE DI CONSEGNA DPI per la mia impresa.

Impresa: [NOME, P.IVA, SEDE]
Lavoratore: [NOME, MANSIONE]
Tipo di consegna: [PRIMA DOTAZIONE / SOSTITUZIONE PER USURA / REINTEGRO PER SMARRIMENTO / DOTAZIONE AGGIUNTIVA PER NUOVA LAVORAZIONE]
DPI consegnati: [ELENCO: tipologia, marca/modello, taglia, quantità, eventuale scadenza (es. imbracature, elmetti)]

Il verbale deve contenere:
1. Intestazione con dati impresa e lavoratore, data e luogo.
2. Tabella DPI: tipologia, marca/modello, taglia, quantità, scadenza/vita utile, stato (nuovo/verificato).
3. Se è una SOSTITUZIONE: riga per il DPI ritirato (tipologia e motivo del ritiro) — il ritiro documentato conta quanto la consegna.
4. Dichiarazioni del lavoratore: ricezione, impegno all'uso e alla custodia, obbligo di segnalare danni o smarrimenti, presa d'atto della formazione ricevuta sull'uso.
5. Campo per esito della verifica visiva alla consegna (per DPI di terza categoria).
6. Firme di datore di lavoro (o preposto delegato) e lavoratore.
7. In coda, PER ME: i 3 errori più comuni nella gestione DPI che fanno perdere le cause, e un promemoria delle scadenze da calendarizzare per i DPI con vita utile limitata.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 3.3 — Riunione sicurezza di 10 minuti (toolbox talk)",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 3.3 — Riunione sicurezza di 10 minuti (toolbox talk)
Area: SICUREZZA E POS

QUANDO USARLA: lunedì mattina o prima di una fase delicata. Dieci minuti che valgono più di cento circolari.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Prepara la traccia di una riunione sicurezza breve con la squadra.

Argomento: [ES. lavori in quota su ponteggio / movimentazione carichi con gru / demolizioni]
Squadra: [N] operai, di cui [N] nuovi o al primo cantiere con noi. Lingue parlate: [SE CI SONO OPERAI NON MADRELINGUA, INDICALO]
Fase che inizia: [DESCRIVI]
Durata: [10 MINUTI DEFAULT — se l'argomento è ampio, dimmi tu se servono due sessioni da 10 invece di una da 20: meglio due brevi che una lunga]

Struttura della traccia:
1. PERCHÉ ne parliamo oggi (il rischio concreto di QUESTA fase, non teoria): 1 minuto.
2. Le 3-5 REGOLE NON NEGOZIABILI, formulate come si parla in cantiere: frasi corte, imperative, zero burocratese.
3. UN CASO REALE di incidente tipico per questo rischio, raccontato in 1 minuto (verosimile, senza nomi).
4. VERIFICA DI COMPRENSIONE: dammi 3 domande PRONTE da fare a rotazione agli operai (non "avete capito?", ma domande operative tipo "Marco, prima di salire sul ponteggio cosa controlli?"). Per i nuovi: una domanda dedicata a testa.
5. CHI FA COSA se qualcosa non torna: a chi si segnala, quando ci si ferma.
6. Chiusura: una frase secca da ripetere uguale a ogni riunione, che diventi un tormentone di squadra.

Se ho indicato operai non madrelingua: regole formulate nel modo più semplice possibile + suggerimento di verifica comprensione individuale.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 3.4 — Checklist di controllo ponteggio",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 3.4 — Checklist di controllo ponteggio
Area: SICUREZZA E POS

QUANDO USARLA: per il preposto, a ogni verifica periodica del ponteggio. Da stampare e tenere in baracca.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Genera una CHECKLIST DI CONTROLLO PONTEGGIO per il preposto (rif. D.Lgs. 81/2008 e Allegato XIX — segnala che i riferimenti vanno verificati con l'edizione vigente).

Tipo ponteggio: [TUBO-GIUNTO / TELAI PREFABBRICATI / MULTIDIREZIONALE]
Contesto: [FACCIATA STANDARD / EDIFICIO STORICO-VINCOLATO / SU MARCIAPIEDE PUBBLICO CON PASSAGGIO PEDONI / CORTILE INTERNO]
Altezza indicativa: [METRI] — Presenza di: [MANTOVANA / TELI / SCHERMATURE / CARTELLI PUBBLICITARI — indica quali]

La checklist deve:
1. Essere organizzata per zone: base e appoggi → struttura verticale → ancoraggi → impalcati → protezioni laterali → accessi e scale → protezioni verso terzi.
2. Per ogni punto: colonne OK / NO / N.A. / Note.
3. Includere i controlli AGGIUNTIVI specifici del contesto che ho indicato (es. passaggio pedoni → mantovana e segregazione a terra; teli → verifica ancoraggi supplementari per vento; edificio vincolato → punti di ancoraggio non invasivi concordati).
4. Riportare in testa le FREQUENZE dei controlli: prima dell'uso, periodici, dopo eventi meteo rilevanti, dopo modifiche o urti.
5. Spazi per: data, ora, firma del preposto, azioni correttive disposte con data limite, firma per avvenuta correzione.
6. Regola in grassetto in fondo: se un punto è NO su elementi strutturali o protezioni, la zona interessata si interdice SUBITO, prima di qualsiasi altra cosa.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 3.5 — Comunicazione al coordinatore sicurezza (CSE)",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 3.5 — Comunicazione al coordinatore sicurezza (CSE)
Area: SICUREZZA E POS

QUANDO USARLA: ogni volta che in cantiere entra un'impresa nuova, cambia una fase o si crea un'interferenza. Scripta manent.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Scrivi una comunicazione formale al Coordinatore per la Sicurezza in fase di Esecuzione (CSE).

Cantiere: [NOME/INDIRIZZO] — Impresa: [NOME, RUOLO: affidataria/esecutrice]
Tipo di comunicazione: [INGRESSO NUOVA IMPRESA O LAVORATORE AUTONOMO / MODIFICA FASI O CRONOPROGRAMMA / SEGNALAZIONE INTERFERENZA TRA LAVORAZIONI / RISCONTRO A PRESCRIZIONE DEL CSE / COMUNICAZIONE POST-INFORTUNIO O QUASI-INFORTUNIO]
Dettagli: [DESCRIVI L'EVENTO]

Scrivi una email/PEC che:
1. Identifica cantiere, impresa e riferimento al PSC.
2. Descrive la novità con precisione: chi, cosa, da quando, in quale zona del cantiere.
3. Include la CHECKLIST ALLEGATI giusta per il tipo di comunicazione scelto (es. ingresso nuova impresa → POS dell'impresa entrante, visura, DURC, dichiarazione organico; interferenza → proposta di sfasamento spaziale/temporale). Elenca gli allegati nel testo.
4. Chiede esplicitamente al CSE quanto di sua competenza (aggiornamento PSC, verbale di coordinamento, sopralluogo).
5. Tono asciutto e professionale: questo documento resta agli atti.

Se il tipo è POST-INFORTUNIO: struttura la comunicazione in soli fatti oggettivi (cosa, dove, quando, misure immediate adottate), NIENTE ammissioni di responsabilità o ricostruzioni delle cause, e chiudi con nota ⚠️ da far verificare a consulente sicurezza e avvocato PRIMA dell'invio.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 4.1 — Descrizione lavori eseguiti per il SAL",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 4.1 — Descrizione lavori eseguiti per il SAL
Area: SAL E DESCRIZIONE LAVORI

QUANDO USARLA: trasformare gli appunti sparsi del capocantiere in descrizioni formali da contabilità lavori.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Agisci come un tecnico di contabilità lavori.

Ti incollo appunti grezzi di cantiere (note vocali trascritte, messaggi, elenchi):
"[INCOLLA GLI APPUNTI]"

Periodo del SAL: dal [DATA] al [DATA]. Riferimento contrattuale: [COMPUTO/PREVENTIVO N., se esiste]

Genera:
1. ELENCO FORMALE delle opere eseguite nel periodo: descrizione tecnica corretta, in terza persona, linguaggio da contabilità lavori. Niente colloquialismi.
2. Per ogni voce: quantità (solo se presente negli appunti). Se la quantità NON c'è, scrivi [QUANTITÀ DA RILEVARE] — non stimarla mai tu.
3. TABELLA DI RISCONTRO: voce → percentuale di avanzamento per categoria → cosa manca per completarla.
4. ELENCO CRITICITÀ: voci degli appunti che non ho saputo classificare, ambiguità, lavorazioni menzionate a metà. Per ognuna, la domanda esatta da fare al capocantiere.
5. Se negli appunti compaiono lavorazioni NON previste dal computo (potenziali varianti), isolale in una sezione separata "POSSIBILI VARIANTI DA FORMALIZZARE" — è lì che si perdono i soldi.

Output pronto da incollare nel documento SAL.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 4.2 — Dalla nota vocale al rapportino di giornata",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 4.2 — Dalla nota vocale al rapportino di giornata
Area: SAL E DESCRIZIONE LAVORI

QUANDO USARLA: il capocantiere manda un vocale a fine giornata; tu lo trasformi in un documento archiviabile in 30 secondi.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Trasforma questa trascrizione di nota vocale del capocantiere in un rapportino di giornata strutturato:

"[INCOLLA LA TRASCRIZIONE]"

Regole:
1. Schema fisso: DATA · CANTIERE · SQUADRA PRESENTE (nomi e ore) · LAVORAZIONI SVOLTE (per zona/piano) · MATERIALI consumati e ricevuti · MEZZI E ATTREZZATURE · METEO · PROBLEMI/IMPREVISTI · PREVISIONE DOMANI · RICHIESTE ALL'UFFICIO.
2. Dove l'informazione manca scrivi "non indicato". MAI inventare o dedurre ore, quantità, nomi.
3. La trascrizione può contenere errori di riconoscimento vocale (nomi storpiati, numeri sbagliati, termini di cantiere trascritti male, dialetto). Se una parola sembra un errore di trascrizione, correggi SOLO se ovvio dal contesto e segnala la correzione tra parentesi [interpretato: "massetto" da "masetto"]. Se non è ovvio, lascia il dubbio esplicito.
4. In coda, sezione DATI MANCANTI CRITICI: i campi vuoti che rendono il rapportino incompleto ai fini di contabilità o sicurezza (es. ore per operaio, visitatori in cantiere), formulati come domande secche da rimandare al capocantiere via messaggio.

Output pronto da archiviare.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 4.3 — Riepilogo mensile di avanzamento per il committente",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 4.3 — Riepilogo mensile di avanzamento per il committente
Area: SAL E DESCRIZIONE LAVORI

QUANDO USARLA: commesse medio-grandi, committente strutturato (azienda, amministratore, DL). Un report al mese evita dieci riunioni.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Genera il report mensile di avanzamento lavori per il committente.

Cantiere: [NOME] — Mese: [MESE/ANNO] — Mese n. [X] di [Y] previsti
Lavorazioni completate nel mese: [ELENCO]
Avanzamento complessivo: [%] (mese precedente: [%])
Importo lavori eseguiti nel mese: [CIFRA] — Totale contabilizzato a oggi: [CIFRA] su [IMPORTO CONTRATTO]
Varianti nel mese: [ELENCO CON STATO: proposta/approvata/in esecuzione — oppure "nessuna"]
Criticità: [ELENCO — oppure "nessuna"]
Programma mese prossimo: [ELENCO]
Destinatari: [SOLO COMMITTENTE / COMMITTENTE + DL / COMMITTENTE + DL + BANCA-SAL]

Struttura:
1. SINTESI IN 3 RIGHE in testa: stato generale, avanzamento, l'unica cosa importante da sapere questo mese. Chi legge solo questa deve avere il quadro.
2. AVANZAMENTO per macro-categorie con confronto rispetto al cronoprogramma (in linea / anticipo / ritardo e di quanto).
3. CONTABILITÀ del periodo: eseguito, contabilizzato, varianti con relativo stato di approvazione.
4. CRITICITÀ: ogni problema SEMPRE accompagnato da azione in corso e data attesa di risoluzione. Mai problemi nudi.
5. PROGRAMMA del mese successivo + decisioni attese dal committente con date limite.
6. Se ci sono più destinatari: mantieni un solo report ma segnala eventuali dettagli da trattare in canali separati (es. aspetti economici riservati al solo committente).

Tono: professionale e trasparente. Se il cantiere è in ritardo, il report lo dice nella sintesi, non nascosto a pagina due.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 4.4 — Verbale di sospensione o ripresa lavori",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 4.4 — Verbale di sospensione o ripresa lavori
Area: SAL E DESCRIZIONE LAVORI

QUANDO USARLA: cantiere fermo (meteo, autorizzazioni, morosità, cause di forza maggiore) o ripartenza. Il verbale protegge i termini contrattuali.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Redigi un VERBALE DI [SOSPENSIONE / RIPRESA] LAVORI.

Cantiere: [INDIRIZZO] — Contratto del: [DATA] — Committente: [NOME] — Impresa: [NOME]
Causa della sospensione: [DESCRIVI: meteo prolungato / attesa autorizzazioni / mancato pagamento / varianti in definizione / forza maggiore]
La sospensione è: [CONCORDATA con il committente / RICHIESTA DA NOI / DISPOSTA dal committente o DL]
Data decorrenza: [DATA] — Stato lavori: [DESCRIZIONE + % AVANZAMENTO]
(Per la ripresa: data ripresa, durata effettiva della sospensione)

Il verbale deve contenere:
1. Stato di fatto delle opere alla data, con percentuale di avanzamento.
2. OPERE DI MESSA IN SICUREZZA del cantiere sospeso, adattate al tipo di lavori in corso: proponi tu l'elenco per QUESTO cantiere (es. lavori al grezzo → protezione dalle acque meteoriche; scavi aperti → recinzioni e segregazioni; ponteggio in opera → verifica ancoraggi e cartellonistica) e distingui chi le esegue e a spese di chi.
3. Causa della sospensione, in termini OGGETTIVI e documentabili.
4. Effetto sul termine contrattuale: proroga di giorni pari alla sospensione + eventuale periodo di riavviamento cantiere.
5. Se la causa è il MANCATO PAGAMENTO: formulazione da far verificare all'avvocato ⚠️ — richiama la diffida già inviata [DATA] e la facoltà di sospensione, senza toni polemici. Il verbale in questo caso è unilaterale: adatta le firme.
6. Documentazione da allegare: elenco foto/video da fare OGGI con indicazione di cosa fotografare.
7. Spazi firma per entrambe le parti (o firma unilaterale + invio PEC se il committente non firma).`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 4.5 — Comunicazione di ultimazione lavori",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 4.5 — Comunicazione di ultimazione lavori
Area: SAL E DESCRIZIONE LAVORI

QUANDO USARLA: i lavori sono finiti (del tutto o per la fase contrattualizzata). La comunicazione formale fa partire verifica, consegna e saldo.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Scrivi la comunicazione formale di ULTIMAZIONE LAVORI da inviare via PEC.

Contratto del: [DATA] — Oggetto: [LAVORI] — Cantiere: [INDIRIZZO]
Data ultimazione: [DATA]
Ultimazione: [TOTALE / PARZIALE — indica la fase o porzione completata e cosa resta escluso da contratto]
Lavorazioni minori in completamento: [ELENCO — es. ritocchi, regolazioni — oppure "nessuna"]
Certificazioni/documenti previsti alla consegna: [ES. dichiarazioni di conformità impianti, certificazioni serramenti, APE — oppure "nessuno"]
Condizioni di saldo da contratto: [IMPORTO/percentuale e termini]

La comunicazione deve:
1. Dichiarare l'ultimazione alla data indicata, richiamando il contratto.
2. Se PARZIALE: perimetrare con precisione cosa è ultimato e cosa no, per non far scattare eccezioni sull'intero.
3. Distinguere le lavorazioni minori in completamento (con data di chiusura) dall'ultimazione sostanziale: la prassi dei "ritocchi" non deve rimandare il saldo all'infinito.
4. Elencare le certificazioni che consegneremo e quando.
5. Invitare il committente alla verifica congiunta, proponendo DUE date.
6. Richiamare le condizioni di saldo con importi e termini, e chiedere conferma scritta della data di verifica.
7. Precisare che, decorso [X GIORNI] senza riscontro, i lavori si intenderanno accettati per comportamento concludente ⚠️ (formulazione da far verificare all'avvocato, dipende dal contratto).

Tono: formale, cordiale, inappuntabile. Questo documento serve a incassare.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 5.1 — Richiesta di offerta a un fornitore",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 5.1 — Richiesta di offerta a un fornitore
Area: FORNITORI E SUBAPPALTI

QUANDO USARLA: vuoi preventivi confrontabili, non tre PDF scritti in tre lingue diverse.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Scrivi una RICHIESTA DI OFFERTA da inviare a [N] fornitori per lo stesso materiale.

Materiale: [DESCRIZIONE DETTAGLIATA: tipo, classe/qualità, dimensioni, quantità con unità di misura]
Fornitura: [SOLO MATERIALE / MATERIALE + POSA — se con posa, descrivi il contesto di posa]
Certificazioni/tracciabilità richieste: [ES. marcatura CE, DOP, certificati di provenienza — oppure "standard"]
Cantiere: [CITTÀ, caratteristiche di accesso: ztl, strada stretta, piano di scarico]
Consegna richiesta: entro [DATA], modalità [AL PIANO / CON SPONDA / FRANCO CANTIERE / FRANCO MAGAZZINO]
Possibilità di consegne frazionate: [SÌ, indicare tranches / NO]

L'email deve chiedere ESPLICITAMENTE, in elenco numerato (così il fornitore risponde punto per punto):
1. Prezzo unitario e totale, IVA esclusa
2. Disponibilità e tempi di consegna dalla conferma d'ordine
3. Costi di trasporto e scarico (separati)
4. Validità dell'offerta
5. Condizioni di pagamento
6. Gestione resi e non conformità
7. Certificazioni richieste: incluse? con che documenti?
8. Se il materiale esatto non è disponibile: alternativa equivalente proposta, con differenze dichiarate

Chiusura: risposta richiesta entro [DATA], preferibilmente ricalcando la numerazione (offerte strutturate = confronto rapido = risposta rapida da parte nostra).
Tono: diretto, professionale, da cliente che sa cosa vuole.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 5.2 — Confronta le offerte ricevute",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 5.2 — Confronta le offerte ricevute
Area: FORNITORI E SUBAPPALTI

QUANDO USARLA: hai 2-4 offerte sul tavolo e vuoi capire quella davvero più conveniente, non quella col numero più basso.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Agisci come un buyer esperto di forniture edili.

Ti incollo le offerte ricevute per [MATERIALE/LAVORAZIONE]. Sono in formati diversi: estrai tu i dati e segnala ogni dato mancante come "ND" — le celle ND sono domande da fare, non da ignorare.

OFFERTA A ([FORNITORE, rapporto: storico/nuovo]): "[INCOLLA]"
OFFERTA B ([FORNITORE, rapporto: storico/nuovo]): "[INCOLLA]"
OFFERTA C ([FORNITORE, rapporto: storico/nuovo]): "[INCOLLA]"

Genera:
1. TABELLA COMPARATIVA: prezzo unitario · prezzo totale · trasporto/scarico · tempi consegna · pagamento · marca/qualità · garanzie · validità offerta · certificazioni.
2. COSTO REALE COMPARABILE: totale a parità di condizioni (aggiungendo dove serve trasporto, scarico, differenze di pagamento). Se un'offerta sembra più bassa solo perché omette voci, dillo chiaramente.
3. DIFFERENZE NASCOSTE: qualità/marca non equivalenti, esclusioni, tempi che impattano sul cronoprogramma del cantiere.
4. VALUTAZIONE RISCHIO FORNITORE: per i fornitori nuovi, elenco delle verifiche minime prima di ordinare (visura, DURC se in cantiere, referenze, ordine di prova ridotto).
5. RACCOMANDAZIONE motivata + le 2 DOMANDE da fare a ciascun fornitore prima di decidere.
6. LEVA NEGOZIALE: sulla base delle differenze trovate, con che argomento concreto posso chiedere un miglioramento al fornitore preferito.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 5.3 — Sollecito consegna materiali in ritardo",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 5.3 — Sollecito consegna materiali in ritardo
Area: FORNITORI E SUBAPPALTI

QUANDO USARLA: il materiale non arriva e il cantiere aspetta. Ogni giorno di ritardo del fornitore sono soldi tuoi.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Scrivi un sollecito a un fornitore per una consegna in ritardo.

Fornitore: [NOME] — Rapporto: [STORICO E SOLIDO / RECENTE / PRIMO ORDINE]
Ordine n. [N] del [DATA] — Materiale: [DESCRIZIONE] — Consegna pattuita: [DATA] — Ritardo: [GIORNI]
Solleciti già fatti: [NESSUNO / TELEFONATA DEL GIORNO X / MESSAGGI — descrivi]
Impatto sul cantiere: [ES. squadra ferma, lavorazione bloccata, rischio penale verso il committente]
Esiste un'alternativa di approvvigionamento? [SÌ, a costo maggiore di X / SÌ, con tempi Y / NO]

Scrivi un messaggio che:
1. Ricostruisce i fatti con date precise (ordine, conferma, scadenza, solleciti già fatti).
2. Spiega l'impatto concreto sul cantiere, in una frase.
3. Chiede UNA DATA CERTA di consegna entro 24/48 ore, per iscritto.
4. Calibra la pressione sul rapporto: fornitore storico → tono collaborativo ma fermo ("aiutami a risolvere"); recente o primo ordine → tono più formale, con richiamo alle condizioni d'ordine.
5. Se ho indicato un'alternativa: preannuncia che senza data certa procederemo con approvvigionamento sostitutivo, riservandoci l'addebito dei maggiori costi (formulazione documentabile ma non ancora da avvocato).
6. Se il ritardo supera [X GIORNI] o questo è già il secondo sollecito scritto: genera ANCHE la versione PEC formale con riserva espressa dei diritti ⚠️.

Obiettivo: sbloccare la consegna mantenendo il rapporto, ma lasciando tracce scritte utilizzabili.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 5.4 — Ordine di acquisto con condizioni chiare",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 5.4 — Ordine di acquisto con condizioni chiare
Area: FORNITORI E SUBAPPALTI

QUANDO USARLA: l'offerta ti va bene: trasformala in un ordine scritto che ti tutela. "Ci siamo detti al telefono" non è un contratto.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Trasforma un'offerta accettata in un ORDINE DI ACQUISTO scritto.

Offerta fornitore n. [N] del [DATA] — Fornitore: [NOME, P.IVA]
Impresa: [NOME, P.IVA]
Materiale: [DESCRIZIONE, QUANTITÀ, PREZZI UNITARI E TOTALE, IVA]
Tipo ordine: [SINGOLO / QUADRO CON CONSEGNE RIPARTITE — se ripartite, indica il piano]
Consegna: [DATA/E, LUOGO, MODALITÀ DI SCARICO, chi fornisce i mezzi di scarico]
Pagamento: [CONDIZIONI]

L'ordine deve contenere:
1. Richiamo espresso all'offerta (numero e data): in caso di conflitto tra ordine e offerta, prevale l'ordine.
2. Descrizione del materiale con marca/modello ESATTI dell'offerta — no "o equivalente" salvo mia autorizzazione scritta.
3. Consegna: ogni consegna accompagnata da DDT con riferimento al numero d'ordine; per ordini ripartiti, il piano delle consegne con date.
4. ACCETTAZIONE CON RISERVA: la firma del DDT vale come ricevuta di colli, non come accettazione qualitativa; verifica entro [X GIORNI] dalla consegna, difformità segnalate per iscritto.
5. Procedura NON CONFORMITÀ: sostituzione a carico fornitore entro [X GIORNI], merce contestata a disposizione per verifica.
6. Termini di pagamento agganciati a consegna CONFORME, non a consegna generica.
7. Richiesta di CONFERMA D'ORDINE scritta entro [X GIORNI]; decorso il termine senza conferma, l'ordine si intende [ACCETTATO / DECADUTO — scegli tu e spiegami la differenza pratica].

Tono: neutro e formale. Nota finale ⚠️: per ordini sopra [SOGLIA CHE INDICO IO], far rivedere le condizioni all'avvocato una volta e riusarle come standard.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 5.5 — Contestazione di fornitura non conforme",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 5.5 — Contestazione di fornitura non conforme
Area: FORNITORI E SUBAPPALTI

QUANDO USARLA: materiale sbagliato, danneggiato o mancante. La contestazione scritta e tempestiva è tutto.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Scrivi una CONTESTAZIONE FORMALE per fornitura non conforme, da inviare via PEC.

Ordine n. [N] — DDT n. [N] del [DATA CONSEGNA]
Non conformità: [DESCRIVI: difetti, danneggiamenti, quantità mancanti, materiale diverso dall'ordinato]
Scoperta: [ALLA CONSEGNA, annotata sul DDT: sì/no / DOPO LO SCARICO, in fase di verifica / DOPO L'UTILIZZO PARZIALE — quanto materiale è già posato]
Foto/video: [DISPONIBILI: descrivi cosa mostrano]
Il materiale contestato è: [ACCANTONATO E NON USATO / PARZIALMENTE UTILIZZATO]
Impatto sul cantiere: [FERMO LAVORAZIONE / RITARDO / NECESSITÀ RIACQUISTO URGENTE]

La lettera deve:
1. Ricostruire i fatti: ordine, consegna, momento della scoperta. Se la scoperta è successiva alla firma del DDT, precisare che la firma valeva come ricevuta colli con riserva di verifica (richiama la clausola d'ordine se esiste).
2. Descrivere la non conformità in modo OGGETTIVO e misurabile (quantità, riferimenti a foto numerate). Zero aggettivi polemici.
3. Se il materiale è stato PARZIALMENTE UTILIZZATO: circoscrivere la contestazione (il vizio è emerso solo con l'uso / a campione), precisare quanto resta accantonato, e ⚠️ segnalarmi che questo caso indebolisce la posizione e va calibrato con l'avvocato se l'importo è alto.
4. Dichiarare la merce a disposizione per verifica in cantiere/magazzino entro [X GIORNI].
5. Chiedere: sostituzione o integrazione entro [X GIORNI], oppure nota di credito.
6. RISERVA DEI DIRITTI: maggiori costi da fermo cantiere, approvvigionamento sostitutivo da terzi con addebito differenza.
7. In coda, PER ME: la lista di cosa congelare subito (foto aggiuntive, campioni, DDT originale, testimoni dello scarico).`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 6.1 — Post prima/dopo di un lavoro finito",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 6.1 — Post prima/dopo di un lavoro finito
Area: MARKETING E SOCIAL

QUANDO USARLA: hai le foto di un bel lavoro concluso. Il prima/dopo è il formato che converte di più per le imprese edili.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Scrivi il testo di un post [INSTAGRAM / FACEBOOK / ENTRAMBI] con foto prima/dopo.

Lavoro: [TIPO] a [CITTÀ/ZONA] — Durata: [TEMPO]
Lavorazioni principali: [ELENCO]
La sfida di questo progetto: [COSA LO RENDEVA DIFFICILE O INTERESSANTE — c'è sempre qualcosa: spazi, tempi, un vincolo, una richiesta particolare]
Foto disponibili: [DESCRIVI COSA MOSTRANO — es. bagno prima buio anni '80, dopo con doccia walk-in]
Obiettivo del post: [CONTATTI DIRETTI / NOTORIETÀ DI ZONA / MOSTRARE UNA SPECIALIZZAZIONE]

Genera:
1. GANCIO: prima frase che ferma lo scroll — dammi 3 opzioni con tagli diversi (numero/dato, domanda, affermazione controintuitiva). Niente "Ecco il nostro ultimo lavoro!".
2. STORIA in 3-4 frasi brevi: problema del cliente → cosa abbiamo fatto → risultato. Parla come parla un titolare orgoglioso, non un'agenzia.
3. UN DETTAGLIO TECNICO che fa capire la competenza (uno solo, spiegato semplice).
4. CTA adattata all'obiettivo: contatti → invito al sopralluogo con modalità concreta; notorietà → domanda che invita al commento; specializzazione → invito a salvare/condividere il post ("salvatelo per quando rifarete il bagno").
5. HASHTAG: 8-10 mirati, con [CITTÀ] e [ZONA/PROVINCIA] negli hashtag geografici — niente hashtag generici da milioni di post.
6. SUGGERIMENTO ORDINE FOTO: quale mettere per prima e perché.

Max 150 parole di testo post. Se il progetto ha una storia forte, dammi anche la variante "storytelling lungo" da 250 parole e dimmi quando conviene usarla.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 6.2 — Descrizione per la scheda Google Business",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 6.2 — Descrizione per la scheda Google Business
Area: MARKETING E SOCIAL

QUANDO USARLA: la scheda Google è il tuo biglietto da visita locale: spesso il cliente la vede prima del sito.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Scrivi la descrizione per la scheda Google Business Profile della mia impresa (limite: 750 caratteri).

Impresa: [NOME] — Attiva da: [ANNI] — Base: [CITTÀ], operiamo in: [ZONE/PROVINCE]
Specializzazioni in ordine di importanza COMMERCIALE (su cosa voglio più clienti): [ELENCO ORDINATO — es. 1. ristrutturazioni complete, 2. bagni, 3. cappotti]
Punti di forza VERI e verificabili: [ES. squadra propria, preventivi entro 48h, cantieri seguiti da un unico referente]
Cosa NON facciamo (per filtrare richieste inutili): [ES. piccole riparazioni, solo imbiancature — oppure "niente da escludere"]

Regole:
1. Le prime 2 righe contano di più (troncatura in anteprima): metti lì [CITTÀ] + la specializzazione n.1.
2. Parole chiave città+servizio inserite in modo naturale, non a elenco.
3. Se le specializzazioni sono tante, NON elencarle tutte: le prime 2-3 in evidenza, le altre in una frase cumulativa. Meglio forti su poco che diluiti su tutto.
4. Frasi corte, zero superlativi vuoti ("leader", "massima qualità"). Concretezza: anni, zone, come lavoriamo.
5. Se ho indicato cose che non facciamo, inseriscile in positivo ("ci occupiamo esclusivamente di...").
6. Chiusura con invito al contatto.

Genera DUE varianti (una più commerciale, una più istituzionale) + i 10 SERVIZI da caricare nella sezione "Servizi" della scheda con nome ottimizzato per la ricerca locale.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 6.3 — Testo per la pagina \"Chi siamo\" del sito",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 6.3 — Testo per la pagina "Chi siamo" del sito
Area: MARKETING E SOCIAL

QUANDO USARLA: la pagina più visitata dopo la home, e quasi sempre la più sprecata.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Scrivi la pagina "Chi siamo" del sito della mia impresa edile.

Impresa: [NOME] — Fondata nel: [ANNO] da [FONDATORE/I]
Team: [N] persone — Zona: [CITTÀ E PROVINCE]
2-3 FATTI VERI della nostra storia: [ES. partiti in due con un furgone, il primo cantiere grosso nel 2015, oggi 3 squadre — fatti, non poesia]
Come lavoriamo, in pratica: [ES. un referente unico per cantiere, foto di aggiornamento ogni settimana, prezzi chiusi salvo varianti scritte]
Se siamo GIOVANI (meno di 3-4 anni): [SÌ/NO — se sì, indica l'esperienza precedente dei fondatori: anni in cantiere per altri, specializzazioni]

Struttura (300-400 parole):
1. APERTURA sul CLIENTE, non su di noi: il problema che risolviamo a chi ristruttura (la paura di tempi, sorprese sui costi, imprese che spariscono).
2. STORIA con i fatti veri che ho dato — se l'impresa è giovane, la storia sono gli ANNI DI CANTIERE dei fondatori, non l'età della partita IVA: girala così.
3. COME LAVORIAMO: punto per punto, ogni valore tradotto in comportamento verificabile. Vietato scrivere "serietà e professionalità" da solo: ogni parola astratta va accompagnata da cosa facciamo concretamente.
4. IL TEAM: una riga che dia facce e mestieri, non organigrammi.
5. CTA: sopralluogo/preventivo, con cosa succede dopo il contatto (rispondiamo entro X, il sopralluogo funziona così).

Prima persona plurale, tono diretto e onesto. Se un punto che ti ho dato è troppo vago per essere credibile, segnalamelo con la domanda giusta invece di riempire di parole.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 6.4 — Risposta a una recensione negativa",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 6.4 — Risposta a una recensione negativa
Area: MARKETING E SOCIAL

QUANDO USARLA: la recensione negativa è arrivata. La risposta non è per chi l'ha scritta: è per i prossimi 100 che la leggeranno.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Rispondi a una recensione negativa ricevuta dalla mia impresa.

Recensione: "[INCOLLA IL TESTO]"
Cosa è successo davvero: [LA TUA VERSIONE DEI FATTI]
Il problema era: [COLPA NOSTRA, VERA / IN PARTE NOSTRO E IN PARTE MALINTESO / VERSIONE DISTORTA O INCOMPLETA / RECENSIONE FALSA — mai stato nostro cliente o fatti inventati]
Abbiamo già provato a risolvere privatamente? [SÌ — con che esito / NO]

Scrivi la risposta pubblica ricordando che il vero lettore è il PROSSIMO potenziale cliente:
1. Colpa nostra → riconoscimento preciso (non generico), cosa abbiamo fatto/faremo per rimediare, invito al contatto diretto. Zero excusatio prolissa.
2. In parte malinteso → riconosci la parte vera, chiarisci quella fraintesa con i fatti, senza umiliare il cliente.
3. Versione distorta → ristabilisci i fatti con date e dettagli verificabili, tono fermo ma mai sarcastico; chiudi con apertura alla soluzione.
4. RECENSIONE FALSA → risposta pubblica che dichiara con calma di non avere riscontro del cliente/lavoro, invita a contattarci per verificare, e resta impeccabile. In più, PER ME: la procedura di segnalazione a Google per richiederne la rimozione e che prove preparare.

Max 100 parole. Niente scuse a raffica, niente attacchi. Un potenziale cliente che legge deve pensare: "gestiscono i problemi da persone serie".
Genera anche la bozza di messaggio PRIVATO al recensore (dove applicabile) per tentare la risoluzione reale: la risposta pubblica gestisce l'immagine, quella privata il problema.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 6.5 — Script video da 30-60 secondi sul cantiere",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 6.5 — Script video da 30-60 secondi sul cantiere
Area: MARKETING E SOCIAL

QUANDO USARLA: Reel e TikTok girati in cantiere: il formato a più alto ritorno per un'impresa locale, a costo zero.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Scrivi lo script di un video breve da girare in cantiere.

Soggetto: [ES. posa cappotto passo-passo / errore tipico delle case anni '70 / perché il massetto deve asciugare]
Parla: [TITOLARE / CAPOCANTIERE] — a suo agio in camera? [SÌ / NO, meglio voice-over su riprese]
Formato: [30" SECCHI / 45-60" — se il tema non ci sta in 30", proponi tu il taglio giusto o la serie in più puntate]
Obiettivo: [FARSI CONOSCERE IN ZONA / MOSTRARE COMPETENZA / GENERARE RICHIESTE DIRETTE]

Genera:
1. SCRIPT CON TIMING: gancio (0-3": la frase che impedisce lo swipe — dammi 2 opzioni), sviluppo in 2-3 punti, chiusura con CTA.
2. Per OGNI blocco: cosa DIRE (frasi max 10 parole, linguaggio da cantiere) e cosa INQUADRARE (inquadrature semplici, fattibili con uno smartphone da soli: niente regie a due persone se non necessario).
3. TESTO IN SOVRIMPRESSIONE per chi guarda senza audio (l'80%): le scritte chiave sincronizzate con lo script.
4. Se ho indicato "no camera": riscrivi come voice-over puro su riprese del cantiere, con le riprese elencate come shot-list da fare in 10 minuti.
5. PRIMA RIGA DELLA CAPTION + 5 hashtag geolocalizzati.
6. In coda: 3 IDEE di video collegati a questo (per costruire una serie), perché un video da solo non fa niente, la costanza sì.

Vietato: musichette motivazionali suggerite, "ciao ragazzi", richieste di like in apertura.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 7.1 — Primo sollecito di pagamento (gentile)",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 7.1 — Primo sollecito di pagamento (gentile)
Area: PAGAMENTI E CONTESTAZIONI

QUANDO USARLA: fattura scaduta da poco, cliente storicamente corretto. Il 70% dei ritardi si risolve qui, senza rovinare il rapporto.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Scrivi un primo sollecito di pagamento cordiale.

Fattura n. [N] del [DATA] — Importo: [CIFRA] — Lavoro: [TIPO]
Scadenza: [DATA] — Giorni di ritardo: [N]
Cliente: [PRIVATO / AZIENDA] — Rapporto: [BUONO, mai problemi / GIÀ RITARDATARIO in passato]
Durante i lavori ci sono stati malumori o rilievi? [NO / SÌ — descrivi: un sollecito cieco su un cliente insoddisfatto peggiora le cose]
IBAN: [IBAN]

Se il rapporto è buono e non ci sono stati malumori:
1. Apertura cordiale con richiamo positivo al lavoro fatto.
2. Richiamo della fattura (numero, data, importo) e della scadenza, dando per scontata la svista.
3. Richiesta di saldo o, in alternativa, di una DATA CERTA di pagamento.
4. IBAN in evidenza + fattura riallegata (togli ogni attrito al pagamento).
5. Disponibilità per qualsiasi chiarimento. Max 90 parole. + VERSIONE WHATSAPP da 3 righe.

Se ho indicato malumori o rilievi: prima del sollecito, il messaggio deve APRIRE sul lavoro ("volevo assicurarmi che sia tutto a posto") e agganciare il pagamento come naturale conseguenza — dammi questa variante al posto di quella standard.

In coda, PER ME: la data esatta in cui inviare il secondo sollecito se questo non produce nulla (regola: [7-10] giorni), così lo metto subito in agenda.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 7.2 — Secondo sollecito formale (con interessi di mora)",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 7.2 — Secondo sollecito formale (con interessi di mora)
Area: PAGAMENTI E CONTESTAZIONI

QUANDO USARLA: il primo sollecito è caduto nel vuoto. Si passa alla PEC con richiamo ai diritti di legge.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Scrivi un SOLLECITO FORMALE di pagamento via PEC (il primo cordiale non ha avuto esito).

Fattura n. [N] del [DATA] — Importo: [CIFRA] — Scadenza: [DATA]
Primo sollecito inviato il: [DATA], esito: [NESSUNA RISPOSTA / PROMESSA NON MANTENUTA — dettagli]
Cliente: [B2B — impresa o professionista / PRIVATO CONSUMATORE]
Il cliente ha sollevato contestazioni sul lavoro? [NO, MAI / SÌ — descrivi]
Sono disposto a valutare un piano di rientro se paga qualcosa subito? [SÌ / NO]

La lettera deve:
1. Ricostruire i fatti con date: contratto/lavoro, fattura, scadenza, sollecito precedente.
2. Intimare il pagamento entro [7-10] giorni con data esatta.
3. Se B2B: richiamare gli interessi moratori ex D.Lgs. 231/2002 e i costi di recupero, chiedendo il calcolo aggiornato alla data (⚠️ tasso da verificare, cambia semestralmente). Se PRIVATO: richiamare gli interessi legali e i termini in modo appropriato al consumatore ⚠️ da verificare con il legale — NON usare il 231/2002 che non si applica.
4. Se il cliente NON ha mai contestato nulla: farlo risultare ("nessun rilievo è mai stato sollevato sui lavori") — pesa moltissimo in un eventuale decreto ingiuntivo.
5. Se ho aperto al piano di rientro: una frase che lascia la porta aperta a un accordo SOLO se contattati entro il termine — fermezza e uscita di sicurezza insieme.
6. Preannunciare, decorso il termine, il ricorso al legale senza ulteriore avviso.
7. Tono: formale, freddo, impersonale. Zero emotività.

In coda, PER ME: cosa preparare fin d'ora per l'eventuale decreto ingiuntivo (contratto/preventivo firmato, DDT, foto lavori, fatture, PEC, estratto conto) e ⚠️ nota di farla rivedere all'avvocato prima dell'invio.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 7.3 — Risposta a contestazione di vizi o difetti",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 7.3 — Risposta a contestazione di vizi o difetti
Area: PAGAMENTI E CONTESTAZIONI

QUANDO USARLA: il cliente lamenta difetti (spesso in concomitanza col saldo da pagare). La risposta scritta di oggi è l'esibita in giudizio di domani.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Rispondi per iscritto a una contestazione di vizi/difetti sull'opera.

Contestazione ricevuta: "[INCOLLA IL TESTO]" — ricevuta via: [EMAIL / PEC / VERBALE]
C'è un saldo bloccato? [SÌ, importo / NO]
La mia valutazione onesta, difetto per difetto: [PER OGNUNO: reale e colpa nostra / reale ma da uso improprio / normale assestamento-tolleranza / inesistente o pretestuoso / da verificare in sopralluogo]
Tempistica: i lavori sono finiti da [TEMPO], la contestazione arriva [SUBITO / A RIDOSSO DELLA SCADENZA DI PAGAMENTO / MESI DOPO]

La risposta deve:
1. Prendere sul serio la segnalazione SENZA ammettere nulla nel merito: distingui "prendiamo in carico e verifichiamo" da "riconosciamo il difetto" — la prima sempre, la seconda solo dopo sopralluogo.
2. Rispondere PUNTO PER PUNTO, difetto per difetto, secondo la mia valutazione: presa in carico / spiegazione tecnica (uso improprio, assestamento fisiologico, tolleranze di norma) / richiesta di verifica congiunta.
3. Proporre il SOPRALLUOGO CONGIUNTO con due date, chiedendo che eventuali difetti siano constatati insieme e verbalizzati.
4. Per i difetti eventualmente a nostro carico: impegno a ripristino in tempi definiti, nell'ambito della garanzia.
5. Se c'è un SALDO BLOCCATO: ricordare che l'eventuale contestazione parziale non giustifica il blocco integrale del pagamento, e che le lavorazioni non contestate vanno saldate ⚠️ formulazione da far calibrare all'avvocato.
6. Se la contestazione arriva sospettamente A RIDOSSO del pagamento: nessuna accusa esplicita, ma ricostruzione fattuale delle date (fine lavori, consegna, prima segnalazione) che parli da sola.
7. Tono: collaborativo, tecnico, documentato. Ogni frase deve reggere davanti a un giudice.

⚠️ Prima dell'invio: rilettura dell'avvocato se l'importo bloccato è rilevante o se il cliente ha già menzionato legali.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 7.4 — Proposta di piano di rientro",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 7.4 — Proposta di piano di rientro
Area: PAGAMENTI E CONTESTAZIONI

QUANDO USARLA: il cliente non riesce a pagare tutto ma vuole pagare. Meglio un piano firmato che un credito fantasma.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Prepara una PROPOSTA DI PIANO DI RIENTRO per un cliente in difficoltà.

Debito totale: [CIFRA] — Fatture: [ELENCO N., DATE, IMPORTI]
Cliente: [PRIVATO / AZIENDA — se azienda: che segnali dà? ritardi generalizzati, cantieri fermi, voci di crisi?]
Trattative già avvenute: [COSA HA PROPOSTO LUI / COSA HO PROPOSTO IO]
Piano che voglio proporre: [N RATE da CIFRA, scadenze, modalità] — Anticipo alla firma: [CIFRA — consigliato: senza un anticipo, il piano non è credibile]
Sono disposto a rinunciare agli interessi di mora se rispetta il piano? [SÌ / NO]

Il documento deve contenere:
1. RICOGNIZIONE DEL DEBITO: elenco fatture con importi e l'ammissione espressa del cliente che il debito esiste ed è dovuto (⚠️ questa è la clausola che vale oro in giudizio: falla verificare all'avvocato).
2. Piano rate con date PRECISE e modalità di pagamento; l'anticipo alla firma come condizione di efficacia.
3. DECADENZA DAL BENEFICIO DEL TERMINE: una rata saltata = tutto il residuo immediatamente esigibile.
4. Rinuncia agli interessi moratori SOLO condizionata al rispetto integrale del piano (se ho detto sì).
5. Clausola che il piano NON costituisce novazione: il titolo resta il credito originario ⚠️.
6. Firma per accettazione del cliente su ogni pagina.
7. In coda, PER ME: i segnali per capire se conviene il piano o se è meglio agire subito (azienda che accumula debiti con tutti = il piano fa solo perdere tempo mentre altri creditori si muovono), e il promemoria di monitoraggio a ogni scadenza rata.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 7.5 — Promemoria scadenza rata SAL al committente",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 7.5 — Promemoria scadenza rata SAL al committente
Area: PAGAMENTI E CONTESTAZIONI

QUANDO USARLA: qualche giorno prima della scadenza di una rata. Il promemoria preventivo evita il sollecito successivo.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Scrivi un promemoria di scadenza rata SAL da inviare al committente [X GIORNI] prima.

Lavoro: [TIPO] — SAL n. [N] maturato il [DATA]
Milestone raggiunto: [ES. completamento struttura piano primo — la cosa CONCRETA che il cliente riconosce]
Documentazione a supporto: [FOTO / REPORT / VERBALE DL — cosa posso richiamare]
Importo: [CIFRA] + IVA — Fattura n. [N] — Scadenza: [DATA]
Il committente ha sollevato rilievi su questo SAL? [NO / SÌ — descrivi / NON ANCORA, il SAL è in attesa di approvazione DL]

Se nessun rilievo:
1. Aggancio del pagamento al risultato concreto ("completata la struttura del piano primo, come da foto del report del [DATA]") — il cliente paga più volentieri ciò che vede.
2. Richiamo di fattura, importo e scadenza in tono di routine, come un fatto amministrativo normale.
3. Una frase sul fatto che il rispetto delle scadenze mantiene il ritmo di forniture e squadre — motivazione, non minaccia.
4. Max 100 parole, tono sereno. + versione WhatsApp breve.

Se il SAL è in attesa di approvazione DL: il promemoria diventa un sollecito GARBATO di approvazione alla DL (con copia al committente), perché senza approvazione la scadenza slitta e il problema diventa nostro.
Se ci sono rilievi: NON inviare il promemoria standard — genera invece un messaggio che affronta i rilievi e propone la verifica congiunta, agganciando il pagamento alla loro risoluzione rapida.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 8.1 — Qualifica del lead prima del sopralluogo",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 8.1 — Qualifica del lead prima del sopralluogo
Area: COMMERCIALE E ACQUISIZIONE CLIENTI

QUANDO USARLA: prima di regalare mezze giornate a chi "voleva solo un'idea di prezzo". Il sopralluogo si guadagna.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Un potenziale cliente mi ha contattato. Aiutami a qualificarlo PRIMA di fissare il sopralluogo.

Come ci ha trovato: [PASSAPAROLA / GOOGLE / SOCIAL / CARTELLO CANTIERE / ALTRO]
Cosa ha scritto/detto: "[INCOLLA IL MESSAGGIO O RIASSUMI LA TELEFONATA]"
Tipo di lavoro richiesto: [SE SI CAPISCE]

Genera:
1. VALUTAZIONE del lead (caldo/tiepido/freddo) in base ai segnali nel messaggio: urgenza reale, budget menzionato, decisore o "chiedo per...", fase (idea vaga vs progetto pronto).
2. Le 5-7 DOMANDE DI QUALIFICA da fare per telefono o messaggio prima del sopralluogo, in ordine, formulate in modo naturale e non da interrogatorio: tempistica desiderata, chi decide, se c'è già un progetto/tecnico, budget di massima (con la formulazione giusta per chiederlo senza far scappare), se sta raccogliendo altri preventivi.
3. SEGNALI D'ALLARME tipici per questo tipo di richiesta (es. "mi serve solo una firma per la pratica", raccolta di 10 preventivi, fretta sospetta) e come gestirli.
4. Lo SCRIPT del messaggio di risposta: cordiale, professionale, che fissa la breve chiamata di qualifica come passaggio naturale ("per prepararle un sopralluogo utile mi servono 5 minuti al telefono").
5. CRITERIO DECISIONALE finale: in base a quali risposte fisso il sopralluogo, lo metto in coda, o declino con garbo (dammi anche la frase per declinare senza bruciare il contatto futuro).`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 8.2 — Preparazione del sopralluogo",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 8.2 — Preparazione del sopralluogo
Area: COMMERCIALE E ACQUISIZIONE CLIENTI

QUANDO USARLA: il sopralluogo è fissato. Arrivarci preparati significa preventivi più precisi e clienti più colpiti.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Preparami al sopralluogo di domani.

Cliente: [NOME] — Lavoro richiesto: [DESCRIZIONE DA QUALIFICA]
Immobile: [TIPO, ANNO SE NOTO, PIANO, ZONA]
Cosa so già dalle conversazioni precedenti: [RIASSUNTO]

Genera:
1. CHECKLIST DI RILIEVO specifica per QUESTO tipo di lavoro: cosa misurare, cosa fotografare, cosa aprire/controllare (es. per un bagno: colonna di scarico, pressione acqua, quadro elettrico, stato massetto sottostante). Ordinata come un percorso fisico nell'immobile, non a casaccio.
2. Le DOMANDE AL CLIENTE da fare sul posto, divise in: tecniche (abitudini d'uso, problemi noti dell'immobile), decisionali (chi sceglie i materiali, tempi attesi), economiche (come immagina di gestire i pagamenti).
3. I PUNTI DA VERIFICARE che generano il 90% degli imprevisti per questo tipo di lavoro (dove guardare per non trovare sorprese a cantiere aperto).
4. COSA DIRE E COSA NON DIRE: come dare un ordine di grandezza di costo sul posto senza incastrarmi su un numero ("lavori simili partono da X, ma glielo confermo nel preventivo dopo aver verificato Y e Z"), e le promesse da non fare mai a voce.
5. CHIUSURA DEL SOPRALLUOGO: lo script per concordare sul posto data di consegna del preventivo e prossimo contatto — mai andarsene con un "le faccio sapere".`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 8.3 — Follow-up del preventivo senza risposta",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 8.3 — Follow-up del preventivo senza risposta
Area: COMMERCIALE E ACQUISIZIONE CLIENTI

QUANDO USARLA: preventivo inviato, silenzio da giorni. La maggior parte delle imprese non richiama mai: è lì che si perdono i lavori già mezzi vinti.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Ho inviato un preventivo e il cliente non risponde. Scrivi la sequenza di follow-up.

Preventivo inviato il: [DATA] — Importo: [CIFRA] — Lavoro: [TIPO]
Segnali avuti finora: [HA LETTO E NON RISPOSTO / HA DETTO "CI PENSO" / HA DETTO CHE CONFRONTA ALTRI PREVENTIVI / SILENZIO TOTALE]
Quanto ci tengo a questo lavoro: [MOLTO — commessa importante / NORMALE / POCO — ho già altro]

Genera una SEQUENZA di 3 contatti:
1. FOLLOW-UP 1 (a [5-7] giorni dall'invio): messaggio breve che NON chiede "ha visto il preventivo?" ma porta VALORE — un chiarimento utile, una disponibilità di calendario che si libera, un dettaglio del sopralluogo su cui ho riflettuto. Il pretesto giusto invento con te: proponimi 3 angoli diversi.
2. FOLLOW-UP 2 (a [12-15] giorni): la telefonata. Dammi lo SCRIPT: apertura, la domanda diretta ma non pressante ("mi dica onestamente: c'è qualcosa nel preventivo che non la convince?"), gestione delle 3 obiezioni più probabili (prezzo, tempi, "devo sentire mio marito/il condominio").
3. FOLLOW-UP 3 (a [25-30] giorni): il messaggio di chiusura elegante che lascia la porta aperta: niente rancore, validità dell'offerta, disponibilità futura. Chi non chiude oggi spesso chiama tra 6 mesi: questo messaggio decide se chiamerà noi o un altro.
4. Se il cliente ha detto che CONFRONTA altri preventivi: aggiungi al follow-up 1 l'offerta di rivedere insieme le voci a parità di contenuti ("spesso i preventivi più bassi escludono X e Y: se vuole li confrontiamo insieme, anche se poi sceglie un altro").

Tono: sicuro, mai bisognoso. Chi insegue svaluta.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 8.4 — Richiesta di referenze e passaparola",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 8.4 — Richiesta di referenze e passaparola
Area: COMMERCIALE E ACQUISIZIONE CLIENTI

QUANDO USARLA: cliente contento, cantiere chiuso, saldo incassato. Il momento d'oro per generare il prossimo lavoro — quasi nessuno lo sfrutta in modo sistematico.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Voglio trasformare un cliente soddisfatto in una fonte di nuovi lavori.

Cliente: [NOME] — Lavoro fatto: [TIPO] — Chiuso da: [TEMPO]
Ha già lasciato recensione? [SÌ/NO]
Contesto utile: [ES. abita in un condominio con altri appartamenti datati / ha accennato a vicini interessati / zona dove voglio più cantieri]

Genera:
1. Il MESSAGGIO DI RICHIESTA PASSAPAROLA: diretto ma non imbarazzante. Non il generico "se conosce qualcuno mi mandi", ma una richiesta specifica basata sul contesto ("se qualche suo vicino sta pensando al cappotto, per noi lavorare di nuovo nel suo condominio sarebbe l'ideale — cantiere già conosciuto, condizioni agevolate per lui"). Proponi 2 varianti: una via WhatsApp, una da dire a voce alla consegna.
2. L'INCENTIVO GIUSTO (se decido di usarlo): opzioni concrete e sostenibili per un'impresa edile (es. un intervento di manutenzione omaggio, uno sconto sul prossimo lavoro suo, MAI percentuali in denaro che sviliscono), con pro e contro di ciascuna.
3. Il MESSAGGIO PER IL "REFERRAL": quando il cliente mi passa un contatto, il primo messaggio al nuovo potenziale cliente che sfrutta la fiducia trasferita ("mi ha dato il suo numero il sig. [NOME], abbiamo appena finito casa sua").
4. Il PROMEMORIA DI SISTEMA: ogni quanto e con che scusa ricontattare i vecchi clienti soddisfatti (visita di controllo garanzia, stagionalità delle manutenzioni) per restare il "loro" impresario anche negli anni.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 8.5 — Risposta alla richiesta generica di prezzo",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 8.5 — Risposta alla richiesta generica di prezzo
Area: COMMERCIALE E ACQUISIZIONE CLIENTI

QUANDO USARLA: "Quanto costa ristrutturare un appartamento di 90 mq?" — la domanda impossibile che arriva ogni settimana. Rispondere male brucia il contatto, non rispondere lo regala a un altro.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Un potenziale cliente mi fa la classica domanda generica sul prezzo, senza dati sufficienti.

La richiesta: "[INCOLLA, es. 'quanto mi costa rifare il bagno?' via WhatsApp]"
Canale: [WHATSAPP / EMAIL / TELEFONO / COMMENTO SOCIAL]
Per questo tipo di lavoro, nella mia zona, la forbice realistica è: [DA X A Y € — se la so; altrimenti chiedimi tu i fattori per costruirla]

Scrivi una risposta che:
1. NON dice "dipende" e basta (frustrante), e NON spara un numero secco (suicidio: qualsiasi numero sarà o troppo alto per lui o troppo basso per me).
2. Dà una FORBICE ONESTA con i 3 fattori principali che spostano il prezzo da un estremo all'altro, spiegati in una riga l'uno — così dimostro competenza invece di reticenza.
3. Qualifica nel mentre: inserisce 2 domande la cui risposta mi dice subito se è un contatto serio (tempistica e stato dell'immobile).
4. Converte: chiude proponendo il passo concreto (chiamata di 5 minuti o sopralluogo) come IL modo per avere un numero vero, gratuito e senza impegno.
5. Lunghezza da canale: WhatsApp = 5-6 righe; email = un paio di paragrafi; commento social = 2 righe + invito al messaggio privato.

Dammi anche la VERSIONE DA SALVARE come risposta rapida riutilizzabile, con i campi [DA ADATTARE] evidenziati.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 9.1 — Analisi di marginalità della commessa",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 9.1 — Analisi di marginalità della commessa
Area: GESTIONE IMPRESA E SQUADRA

QUANDO USARLA: a fine cantiere (o a metà, meglio). Sapere SE ci hai guadagnato — e dove hai perso — vale più di dieci nuovi preventivi.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Agisci come un controller di gestione specializzato in imprese edili.

Analizza la marginalità di questa commessa:

PREVENTIVATO: importo contratto [CIFRA] + varianti approvate [CIFRA]
CONSUNTIVO:
- Materiali: [CIFRA — se ce l'hai per categoria, incolla il dettaglio]
- Manodopera interna: [ORE TOTALI x COSTO ORARIO AZIENDALE — se non conosci il tuo costo orario reale, dimmelo: lo calcoliamo prima, è il dato che il 80% delle imprese sbaglia]
- Subappalti e prestazioni esterne: [CIFRA]
- Noli e attrezzature: [CIFRA]
- Smaltimenti: [CIFRA]
- Altri costi diretti: [CIFRA]
Durata: prevista [GIORNI] vs effettiva [GIORNI]
Imprevisti e rilavorazioni: [DESCRIVI COSA È ANDATO STORTO E QUANTO È COSTATO]

Genera:
1. MARGINE LORDO di commessa (€ e %) e margine al netto di una quota di costi generali [SE NON SO LA MIA INCIDENZA DI COSTI GENERALI, USA IL 12-15% E SEGNALALO — poi la calcoliamo davvero].
2. SCOSTAMENTI: dove ho perso rispetto al preventivo, in ordine di importo, distinguendo: errore di stima / imprevisto vero / inefficienza esecutiva / variante non fatturata.
3. LE VARIANTI FANTASMA: dal confronto tra descrizione lavori e consuntivo, cosa ho FATTO senza farmelo pagare.
4. LEZIONI PER IL PROSSIMO PREVENTIVO simile: le 3 voci da prezzare diversamente, con la correzione suggerita.
5. IL NUMERO DA RICORDARE: quanto ho guadagnato per giornata di cantiere, confrontato con quanto DOVREI guadagnare per far stare in piedi l'impresa.

Non addolcire i risultati: se la commessa è andata male, il report deve dirlo chiaro.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 9.2 — Annuncio di lavoro per operai e capocantiere",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 9.2 — Annuncio di lavoro per operai e capocantiere
Area: GESTIONE IMPRESA E SQUADRA

QUANDO USARLA: trovare gente valida è la vera emergenza del settore. L'annuncio fotocopia ("cercasi muratore serio") attira solo chi risponde a tutto.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Scrivi un annuncio di lavoro per la mia impresa edile.

Cerco: [FIGURA: muratore / carpentiere / capocantiere / apprendista / piastrellista...]
Esperienza richiesta: [ANNI / anche primo impiego con voglia di imparare]
Cosa farà davvero: [DESCRIVI LE GIORNATE TIPO, i tipi di cantiere]
Cosa offro: [INQUADRAMENTO CCNL, retribuzione o fascia SE ME LA SENTO DI PUBBLICARLA (consigliato: gli annunci con la cifra ricevono molte più risposte), straordinari pagati, furgone/attrezzatura, formazione, stabilità]
La mia impresa in 2 righe vere: [ES. 8 persone, cantieri entro 30 km, si torna a casa la sera, il titolare è in cantiere non in ufficio]
Canale: [SUBITO/INDEED / FACEBOOK-INSTAGRAM / PASSAPAROLA-WHATSAPP]

Regole:
1. TITOLO che dice figura + zona + un aggancio concreto (la cifra, o "si torna a casa ogni sera", o "pagamenti puntuali il 10 del mese").
2. Struttura: chi siamo (2 righe, fatti) → cosa farai (concreto, niente mansionari) → cosa chiediamo (POCHI requisiti veri, non la lista dei sogni: ogni requisito in più dimezza le candidature) → cosa offriamo (la parte più lunga: è un annuncio di vendita, il prodotto è il posto di lavoro) → come candidarsi (SEMPLICISSIMO: un WhatsApp con nome ed esperienza, niente CV formattati).
3. Tono: da titolare che parla a un collega, non da ufficio HR. Chi legge deve pensare "qui si lavora bene".
4. Versione adattata al canale scelto (l'annuncio Facebook è diverso da quello Indeed: più corto, più diretto, con la prima riga che ferma lo scroll).
5. In coda, PER ME: le 3 domande di scrematura da fare al primo contatto WhatsApp per non perdere tempo coi curiosi.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 9.3 — Traccia per il colloquio di selezione",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 9.3 — Traccia per il colloquio di selezione
Area: GESTIONE IMPRESA E SQUADRA

QUANDO USARLA: mezz'ora di colloquio fatto bene evita mesi di assunzione sbagliata. In cantiere un errore di selezione costa il doppio.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Preparami la traccia per il colloquio a un candidato.

Figura: [RUOLO] — Il candidato dichiara: [ESPERIENZA DAL PRIMO CONTATTO]
Cosa mi serve DAVVERO da questa figura: [ES. autonomia sul cantiere piccolo, saper leggere un disegno, gestire due manovali, guidare il furgone]
Dubbi che ho già: [SE CE NE SONO — es. tanti cambi di datore, esperienza vaga]

Genera:
1. DOMANDE TECNICHE indirette che rivelano l'esperienza vera: non "sai fare i massetti?" (tutti dicono sì) ma domande situazionali dove chi ha davvero cazzuola in mano si riconosce subito (es. "il cliente ti chiede di piastrellare su un massetto fatto 5 giorni fa: che fai?"). Dammene 5-6 calibrate sul ruolo, con la risposta giusta a fianco PER ME.
2. DOMANDE SU AFFIDABILITÀ E SQUADRA: com'era organizzato il cantiere precedente, cosa lo faceva arrabbiare del vecchio datore (rivelatrice: chi sparla a raffica, sparlera anche di me), perché ha cambiato.
3. VERIFICA DEI MIEI DUBBI specifici, con la domanda diretta ma non aggressiva per ciascuno.
4. COSA DIRE IO del posto: presentazione onesta (anche dei lati duri: trasferte, ritmo) — chi accetta sapendo tutto, resta.
5. I SEGNALI a cui fare attenzione (rosse e verdi) durante il colloquio, specifici del settore.
6. CHIUSURA: prova pratica sì/no per questo ruolo (e come impostarla in mezza giornata pagata), tempi di risposta, referenze da chiamare — con le 2 domande da fare al vecchio datore che dicono tutto.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 9.4 — Pianificazione settimanale squadre multi-cantiere",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 9.4 — Pianificazione settimanale squadre multi-cantiere
Area: GESTIONE IMPRESA E SQUADRA

QUANDO USARLA: ogni venerdì pomeriggio o domenica sera. Tre cantieri e otto persone non si incastrano a memoria.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Aiutami a pianificare la settimana delle mie squadre.

CANTIERI APERTI:
- [CANTIERE A]: fase attuale [X], prossime lavorazioni [Y], scadenze/vincoli [ES. consegna promessa, condominio con orari, materiale che arriva martedì]
- [CANTIERE B]: [IDEM]
- [CANTIERE C]: [IDEM]
PERSONE: [ELENCO con ruolo/specializzazione, assenze note (ferie, visite mediche), chi può fare da solo e chi va seguito]
ESTERNI da coordinare: [IDRAULICO/ELETTRICISTA/PONTEGGISTA con le loro disponibilità]
MEZZI: [FURGONI/MEZZI e vincoli]
PRIORITÀ della settimana: [COSA NON PUÒ SLITTARE E PERCHÉ]

Genera:
1. GRIGLIA settimanale (lun-ven/sab): per ogni giorno, chi è dove, a fare cosa. Rispetta: specializzazioni, chi non può lavorare da solo, spostamenti sensati (non far girare i furgoni a vuoto).
2. INCASTRI CON GLI ESTERNI: quando devono entrare gli impiantisti perché la squadra non li aspetti e loro non aspettino la squadra.
3. PUNTI DI ROTTURA del piano: cosa lo fa saltare (il materiale di martedì non arriva? piove giovedì?) e il piano B per ciascuno, già pronto.
4. TEMPI MORTI individuati: se qualcuno resta scoperto mezza giornata, proponi come usarla (manutenzioni, magazzino, il cantiere in ritardo).
5. I 3 MESSAGGI WHATSAPP pronti da mandare domenica sera: uno per squadra, con dove presentarsi lunedì, cosa portare, obiettivo della settimana in una riga.

Se i vincoli sono incompatibili (troppe scadenze, poche persone), NON forzare un piano irrealistico: dimmi cosa non ci sta e quale scadenza è da rinegoziare subito col cliente — meglio una telefonata scomoda oggi che una figuraccia venerdì.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 9.5 — Dal vocale/riunione al verbale con azioni",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 9.5 — Dal vocale/riunione al verbale con azioni
Area: GESTIONE IMPRESA E SQUADRA

QUANDO USARLA: riunioni con DL, committente, tecnici o squadra. Senza verbale scritto, dopo una settimana ognuno ricorda una versione diversa.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Trasforma questi appunti/trascrizione di riunione in un verbale operativo.

Riunione del [DATA] — Presenti: [NOMI E RUOLI]
Contesto: [CANTIERE/ARGOMENTO]
Trascrizione o appunti: "[INCOLLA]"

Genera:
1. VERBALE SINTETICO: argomenti trattati e DECISIONI PRESE (solo le decisioni, non la cronaca della discussione). Per ogni decisione: chi l'ha presa/condivisa.
2. TABELLA AZIONI: azione → responsabile → scadenza. Se nella discussione un'azione è rimasta senza responsabile o senza data, mettila comunque in tabella con [DA ASSEGNARE] evidenziato: sono quelle che non verranno mai fatte se non le becco ora.
3. PUNTI RIMASTI APERTI e in che sede si decideranno.
4. Se nella riunione qualcuno ha fatto RICHIESTE CON IMPATTO ECONOMICO (varianti, extra, modifiche): isolale in una sezione dedicata con la dicitura che andranno formalizzate per iscritto prima dell'esecuzione — le parole in riunione non sono ordini.
5. EMAIL DI TRASMISSIONE del verbale ai presenti: due righe + richiesta di segnalare eventuali difformità entro [X GIORNI], decorsi i quali il verbale si intende condiviso. È questa frase che lo rende utile.

Linguaggio: asciutto, neutro, fattuale. Il verbale deve poter essere riletto tra 6 mesi da chi non c'era e capire tutto.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 10.1 — Revisione del contratto d'appalto privato",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 10.1 — Revisione del contratto d'appalto privato
Area: CONTRATTI, SUBAPPALTI E TUTELE

QUANDO USARLA: prima di firmare un contratto proposto dal committente (o dal suo tecnico/avvocato), o per costruire il TUO contratto standard.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Agisci come un consulente contrattuale per imprese edili. NON sei un avvocato e lo dirai chiaramente: il tuo lavoro è prepararmi la mappa dei punti critici da negoziare e da portare al legale.

Situazione: [DEVO FIRMARE un contratto che mi hanno proposto — lo incollo sotto / VOGLIO COSTRUIRE il mio contratto standard da proporre ai clienti]
[SE DA REVISIONARE, INCOLLA IL TESTO]
Commessa: [TIPO LAVORO, IMPORTO, DURATA PREVISTA]
Committente: [PRIVATO / AZIENDA / CONDOMINIO]

Per la REVISIONE, analizza e segnala in ordine di pericolosità:
1. PENALI: importo, tetto massimo (c'è? se no, è un problema), eventi che le fanno scattare, e se sono bilanciate da premi di accelerazione o almeno da proroghe automatiche per cause non nostre.
2. PAGAMENTI: acconti, SAL, termini, cosa succede se il committente ritarda (posso sospendere? dopo quanto?), ritenute a garanzia (quanto e quando si sbloccano).
3. VARIANTI: come si autorizzano, chi le prezza, cosa succede a quelle ordinate a voce.
4. IMPREVISTI E SORPRESE: chi paga cosa emerge di non prevedibile (sottosuolo, strutture nascoste).
5. RECESSO E RISOLUZIONE: con che preavviso, chi paga cosa in caso di abbandono.
6. GARANZIE E COLLAUDO: durata, termini per denuncia vizi, quando scatta l'accettazione.
7. FORO E SPESE LEGALI.
Per ogni punto critico: perché è pericoloso PER ME, la riformulazione da proporre, e quanto è realistico ottenerla.

Per il CONTRATTO STANDARD: genera la scaletta delle clausole con il testo-base di ciascuna, equilibrato ma protettivo, con evidenziati ⚠️ i punti da far blindare all'avvocato una volta sola (investimento che si ripaga al primo contenzioso evitato).`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 10.2 — Formalizzare una variante in corso d'opera",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 10.2 — Formalizzare una variante in corso d'opera
Area: CONTRATTI, SUBAPPALTI E TUTELE

QUANDO USARLA: OGNI volta che il cliente chiede "già che ci siete...". La variante non scritta è un regalo, e spesso pure un litigio.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Il cliente ha chiesto una modifica/aggiunta durante i lavori. Formalizzala prima che diventi un problema.

Contratto originario: [LAVORO, IMPORTO, del DATA]
Variante richiesta: [DESCRIVI COSA CHIEDE IL CLIENTE]
Richiesta arrivata: [A VOCE IN CANTIERE / TELEFONO / WHATSAPP — quando]
Impatto: costo aggiuntivo [CIFRA O STIMA], giorni aggiuntivi [N], lavorazioni già ordinate/eseguite che vengono modificate: [SE CI SONO — es. materiale già ordinato da riordinare]
La variante interferisce con lavori già fatti? [ES. riaprire una parete chiusa — descrivi]

Genera l'ORDINE DI VARIANTE da far firmare (o approvare per iscritto anche solo via WhatsApp/email — meglio di niente):
1. Richiamo al contratto originario.
2. Descrizione PRECISA della variante: cosa si aggiunge, cosa si toglie, cosa si modifica rispetto al preventivo originario (voce per voce).
3. PREZZO della variante e nuovo importo contrattuale complessivo aggiornato.
4. EFFETTO SUI TEMPI: nuova data di fine lavori (non "qualche giorno in più": una data).
5. Costi già sostenuti resi inutili dalla variante (materiale ordinato, lavoro da rifare): addebitati e motivati.
6. Clausola: la variante si esegue SOLO dopo approvazione scritta; nel frattempo il cantiere prosegue sulle lavorazioni non interessate.
7. VERSIONE BREVE WHATSAPP: stesso contenuto in 6-8 righe da mandare subito col telefono ("le confermo la modifica di cui parlavamo stamattina: ...") per congelare l'accordo, in attesa della firma sul documento completo.

In coda, PER ME: la frase gentile ma ferma da usare IN CANTIERE quando arriva il "già che ci siete", per spostare tutto sul canale scritto senza irrigidire il clima.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 10.3 — Ingresso di un subappaltatore: documenti e verifica",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 10.3 — Ingresso di un subappaltatore: documenti e verifica
Area: CONTRATTI, SUBAPPALTI E TUTELE

QUANDO USARLA: prima che una ditta esterna metta piede nel TUO cantiere. Se non è in regola, il problema è tuo quanto suo.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Devo far entrare un subappaltatore/ditta esterna nel mio cantiere. Preparami richiesta documenti e verifica.

Subappaltatore: [NOME, ATTIVITÀ: es. impianti elettrici / cartongessi / ponteggi]
Cantiere: [TIPO, con/senza PSC e coordinatore]
Il committente deve autorizzare il subappalto? [SÌ DA CONTRATTO / NO / NON SO — se non so, ricordami di verificarlo nel contratto]
Rapporto: [GIÀ LAVORATO INSIEME / PRIMA VOLTA]

Genera:
1. EMAIL DI RICHIESTA DOCUMENTI al subappaltatore, con elenco completo: DURC in corso di validità, visura camerale, iscrizioni/abilitazioni specifiche per la sua attività (es. DM 37/08 per impiantisti), POS per il nostro cantiere, elenco nominativo lavoratori con UNILAV, attestati formazione sicurezza, idoneità sanitarie, polizza RCT/RCO con massimali, dichiarazione organico medio e CCNL applicato ⚠️ (elenco da far validare al consulente: può variare per attività e cantiere).
2. TABELLA DI VERIFICA per me: documento → cosa controllo concretamente (scadenze, congruenza nomi, massimali) → segnale d'allarme tipico (DURC in richiesta ma mai esibito, operai in cantiere diversi dall'elenco).
3. Se PRIMA VOLTA: le 3 verifiche extra di affidabilità prima di affidare (referenze su cantieri simili, sopralluogo congiunto, partenza con una porzione limitata).
4. CLAUSOLE MINIME per l'ordine/contratto di subappalto: prezzi e contabilizzazione, sicurezza e rispetto POS/PSC, divieto di ulteriore sub-subappalto senza autorizzazione, pagamenti legati a DURC regolare, penali/sostituzione per abbandono ⚠️ da far rivedere al legale.
5. Se serve AUTORIZZAZIONE del committente: la comunicazione formale di richiesta con i dati della ditta.
6. PROMEMORIA RICORRENTE: quali documenti scadono e vanno richiesti di nuovo durante il cantiere (DURC ogni 4 mesi, nuovi operai = nuovi UNILAV).`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 10.4 — Spiegare detrazioni e bonus fiscali al cliente",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 10.4 — Spiegare detrazioni e bonus fiscali al cliente
Area: CONTRATTI, SUBAPPALTI E TUTELE

QUANDO USARLA: "ma questo lavoro rientra nel bonus?" — domanda a ogni preventivo. Rispondere bene aiuta a vendere; rispondere da commercialista improvvisato crea guai.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Un cliente mi chiede se il lavoro rientra nelle detrazioni fiscali. Aiutami a rispondere in modo utile ma protetto.

Lavoro in questione: [DESCRIVI]
Cliente: [PRIVATO PRIMA CASA / SECONDA CASA / CONDOMINIO / AZIENDA]
Cosa mi ha chiesto esattamente: "[LA SUA DOMANDA]"

IMPORTANTE: le norme sui bonus edilizi cambiano di continuo (aliquote, massimali, requisiti, scadenze). NON dare per buone le aliquote che conosci: indica il QUADRO GENERALE e segnala esplicitamente ogni punto da verificare con fonti aggiornate ⚠️.

Genera:
1. RISPOSTA AL CLIENTE che: inquadra in generale che tipo di agevolazione POTREBBE applicarsi a questo lavoro; chiarisce che aliquote e condizioni esatte le confermerà il suo commercialista/CAF sulla base della normativa vigente alla data; spiega COSA FACCIAMO NOI per metterlo in condizione di detrarre (fatture con diciture corrette, pagamenti con bonifico parlante, documentazione tecnica necessaria).
2. LA LINEA DA NON SUPERARE: le frasi che NON devo mai dire ("le garantisco che rientra", "il bonus glielo faccio avere io") e le formule sicure con cui sostituirle. Io vendo lavori edili, non consulenza fiscale: se prometto detrazioni che poi saltano, il contenzioso è con me.
3. CHECKLIST OPERATIVA per me su questo lavoro: cosa deve risultare in fattura, che tipo di bonifico serve al cliente, quali documenti tecnici produrre e conservare (e per quanti anni), eventuali comunicazioni/asseverazioni che coinvolgono tecnici abilitati.
4. La FRASE-PONTE commerciale: come trasformare il tema bonus in un vantaggio competitivo onesto ("siamo abituati a preparare tutta la documentazione per la detrazione: il suo commercialista riceve il fascicolo completo") senza sconfinare in promesse fiscali.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 10.5 — Calcola il tuo costo orario e aggiorna i prezzi",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 10.5 — Calcola il tuo costo orario e aggiorna i prezzi
Area: CONTRATTI, SUBAPPALTI E TUTELE

QUANDO USARLA: almeno una volta l'anno, o quando ti accorgi che lavori tanto e resta poco. La maggior parte delle imprese edili prezza a sensazione.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Agisci come un consulente di controllo di gestione per piccole imprese edili. Aiutami a calcolare il mio VERO costo orario e a verificare i miei prezzi.

I MIEI DATI (metti [NON SO] dove non ho il numero: ti dirò io dove recuperarlo):
- Persone in squadra: [N e ruoli] — costo aziendale annuo di ciascuno [LORDO + CONTRIBUTI + TFR: il costo azienda, non la busta paga — se ho solo la busta, dimmelo e usa i moltiplicatori tipici del CCNL edilizia segnalandolo]
- Ore FATTURABILI realistiche all'anno per persona: [SE NON SO, calcolale tu: 52 settimane - ferie - festività - malattie medie - formazione - tempi morti/spostamenti/preventivi... e dimmi quante ne restano DAVVERO]
- Costi fissi annui dell'impresa: [FURGONI, ASSICURAZIONI, MAGAZZINO, ATTREZZATURE E AMMORTAMENTI, COMMERCIALISTA, TELEFONI, SOFTWARE, PUBBLICITÀ...]
- Il mio compenso da titolare: [QUANTO VOGLIO/DEVO PRENDERE — se in cantiere anche io, le mie ore vanno contate]
- Margine di utile obiettivo dell'impresa: [% — se non so che numero sia sano, proponi tu un intervallo per il settore]

Genera:
1. COSTO ORARIO AZIENDALE per persona e medio di squadra: quanto mi costa UN'ORA di cantiere, tutto compreso. Mostra il calcolo passo passo, così lo capisco e lo rifaccio da solo l'anno prossimo.
2. TARIFFA ORARIA MINIMA sotto cui sto regalando (costo + generali + utile obiettivo).
3. TEST SUI MIEI PREZZI ATTUALI: [INCOLLA 2-3 VOCI TIPICHE DEI MIEI PREVENTIVI CON PREZZI] → dimmi se ai miei ritmi reali quelle voci mi lasciano margine o mi mangiano.
4. I 3 ERRORI di pricing più probabili nella mia situazione e la correzione per ciascuno.
5. UNA PAGINA RIASSUNTIVA da stampare: i miei numeri chiave (costo orario, tariffa minima, margine obiettivo) da tenere sott'occhio quando faccio i preventivi.

Non consolarmi: se dai numeri esce che sto lavorando in perdita su certe lavorazioni, voglio saperlo oggi.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 11.1 — Piano editoriale social mensile",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 11.1 — Piano editoriale social mensile
Area: MARKETING AVANZATO E VENDITA

QUANDO USARLA: una volta al mese, 20 minuti. Il singolo post improvvisato non costruisce niente: la costanza sì.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Costruisci il piano editoriale social del mese per la mia impresa edile.

Canali attivi: [INSTAGRAM / FACEBOOK / TIKTOK / LINKEDIN — e quanto tempo reale ho: es. 2 post a settimana MASSIMO, siamo onesti]
Cantieri in corso questo mese (la materia prima): [ELENCO con tipo lavoro e fase — le fasi "fotogeniche" in arrivo: demolizioni, getti, pose, consegne]
Obiettivo del mese: [RICHIESTE PREVENTIVI / NOTORIETÀ DI ZONA / CANDIDATURE OPERAI — sceglierne UNO]
Cosa ha funzionato finora: [I 2-3 POST CON PIÙ RISCONTRO, se lo so]
Periodo: [MESE — così agganci stagionalità: bonus in scadenza, pre-estate, rientro settembre...]

Genera:
1. CALENDARIO del mese: per ogni post → data, canale, formato (foto/carosello/reel), argomento, aggancio al cantiere reale in corso. Mix bilanciato: 40% lavori (prima/dopo, avanzamenti), 25% competenza (errori da evitare, "perché si fa così"), 20% dietro le quinte e squadra, 15% prova sociale (recensioni, consegne).
2. Per OGNI post: il gancio della prima riga già scritto + cosa fotografare/riprendere QUELLA settimana in cantiere (così il capocantiere sa cosa mandarmi).
3. LISTA SPESA FOTO/VIDEO settimanale da girare al capocantiere via WhatsApp: 3 righe, cosa riprendere e come (verticale, con luce, ecc.).
4. 2 POST JOLLY senza data, pronti nel cassetto per le settimane in cui non succede niente di fotogenico.
5. Il piano deve reggere il MIO tempo reale dichiarato: se ho detto 2 post a settimana, non propormene 20 al mese.

Vietato: contenuti che richiedono grafici professionisti, trend ballati, post motivazionali generici.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 11.2 — Campagna locale a pagamento (Meta / Google)",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 11.2 — Campagna locale a pagamento (Meta / Google)
Area: MARKETING AVANZATO E VENDITA

QUANDO USARLA: quando vuoi richieste di preventivo dalla tua zona e il passaparola non basta a riempire il calendario.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Aiutami a impostare una campagna pubblicitaria locale per generare richieste di preventivo.

Budget mensile che posso investire: [CIFRA] — Zona target: [CITTÀ + RAGGIO KM]
Servizio da spingere (UNO solo per campagna): [ES. rifacimento bagni / cappotto / ristrutturazioni complete]
Il mio cliente tipo per questo servizio: [ETÀ INDICATIVA, TIPO IMMOBILE, COSA LO SPINGE: casa vecchia? bolletta alta? casa appena comprata?]
Dove atterra chi clicca: [PAGINA DEL SITO / WHATSAPP / MODULO — se non ho niente, dimmelo: la campagna senza atterraggio è soldi buttati]
Prova sociale disponibile: [N RECENSIONI GOOGLE, FOTO PRIMA/DOPO, ANNI DI ATTIVITÀ]

Genera:
1. SCELTA DEL CANALE motivata per il mio caso: Meta (domanda latente: gli ricordo il problema) vs Google (domanda attiva: mi cerca già) vs entrambi — con che spartizione di budget e perché, dato il mio budget reale.
2. Per META: 3 varianti di annuncio complete (gancio + corpo + CTA), ognuna con un angolo diverso (dolore / prova sociale / offerta di valore tipo sopralluogo con relazione scritta). Indicazioni su che immagine/video usare tra quelli che un'impresa ha davvero.
3. Per GOOGLE: le parole chiave su cui apparire (e i TERMINI DA ESCLUDERE per non pagare click spazzatura: "lavoro", "corso", "fai da te"...), più 2 annunci testuali.
4. LA VELOCITÀ DI RISPOSTA: la campagna genera contatti che vanno richiamati entro minuti, non giorni. Dammi il messaggio di risposta automatica immediata + lo script della richiamata (aggancio a "ha compilato la richiesta per...").
5. NUMERI DA GUARDARE dopo 2 settimane per capire se funziona: costo per contatto accettabile per il mio servizio (calcolalo dal valore medio di una commessa che ti do io: [CIFRA]) e i 3 segnali per capire se spegnere, correggere o aumentare.

⚠️ Le impostazioni tecniche delle piattaforme cambiano spesso: dammi la logica e i testi, le schermate le seguo sulla piattaforma o col mio consulente.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 11.3 — Pagina servizio per il sito (SEO locale)",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 11.3 — Pagina servizio per il sito (SEO locale)
Area: MARKETING AVANZATO E VENDITA

QUANDO USARLA: una pagina per ogni servizio+città che vuoi presidiare ("rifacimento bagno Verona"). È la pagina che lavora di notte.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Scrivi la pagina del mio sito dedicata a un servizio specifico, ottimizzata per la ricerca locale.

Servizio: [ES. rifacimento bagno] — Città/zona: [CITTÀ E ZONE SERVITE]
Come lo facciamo noi, in concreto: [PROCESSO, TEMPI TIPICI, COSA È SEMPRE INCLUSO]
Forbice di prezzo indicativa (consigliato pubblicarla): [DA X A Y € — le pagine con i prezzi convertono di più e filtrano i perditempo]
Prove: [FOTO LAVORI, RECENSIONI PERTINENTI, N LAVORI FATTI DI QUESTO TIPO]
Domande che i clienti fanno SEMPRE su questo servizio: [ELENCANE 4-5 — quelle vere, dal telefono]

Struttura della pagina (600-900 parole):
1. TITOLO e apertura con servizio + città, e nella prima riga la promessa concreta (tempi certi, prezzo chiaro, un referente).
2. IL PROBLEMA del cliente prima di chiamare (riconoscersi = continuare a leggere).
3. COME LAVORIAMO: il processo passo-passo dal sopralluogo alla consegna, con i tempi. È la sezione che toglie la paura.
4. PREZZI: la forbice onesta con i 3 fattori che la spostano (come nel prompt 8.5) — trasparenza = fiducia + filtro.
5. FAQ: le domande vere che mi hai chiesto, con risposte da professionista (questa sezione intercetta anche le ricerche vocali e le risposte AI).
6. PROVA SOCIALE: dove inserire foto e recensioni, con che didascalie.
7. CTA ripetuta 3 volte lungo la pagina (dopo il processo, dopo i prezzi, in fondo), sempre con il passo successivo concreto e a bassa soglia.
8. In coda PER ME: title e meta description della pagina, e le 3-5 varianti di ricerca che questa pagina deve intercettare.

Tono: da impresario competente che spiega, non da agenzia. Ogni affermazione generica ("qualità", "esperienza") sostituita da un fatto.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 11.4 — Case study di un progetto (la prova che vende)",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 11.4 — Case study di un progetto (la prova che vende)
Area: MARKETING AVANZATO E VENDITA

QUANDO USARLA: dopo ogni lavoro significativo. Il case study è il contenuto più riutilizzabile che esista: sito, social, PDF da allegare ai preventivi.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Trasforma un lavoro finito in un case study riutilizzabile.

Progetto: [TIPO LAVORO, ZONA, DURATA, importo pubblicabile? SÌ/NO/FORBICE]
Situazione di partenza: [COM'ERA, che problemi aveva il cliente, perché ha deciso di intervenire]
La sfida: [COSA RENDEVA QUESTO LAVORO NON BANALE — tecnica, logistica, tempi, convivenza col cliente in casa]
Come l'abbiamo risolta: [LE SCELTE FATTE E PERCHÉ]
Risultato: [COM'È FINITA + se ho numeri: giorni, mq, risparmio energetico, valore]
Il cliente ha detto/scritto: ["CITAZIONE VERA O RECENSIONE" — con permesso di usarla? SÌ/NO]
Foto: [COSA HO: prima, durante, dopo]

Genera QUATTRO formati dallo stesso materiale:
1. VERSIONE SITO (400-500 parole): struttura situazione → sfida → soluzione → risultato, scritta come una storia vera, con i punti dove inserire le foto.
2. VERSIONE PDF DA ALLEGARE AI PREVENTIVI (1 pagina): la stessa storia compressa, pensata per il potenziale cliente indeciso che sta confrontando preventivi — chiude con "vuoi vedere il cantiere o parlare col proprietario? si può".
3. VERSIONE SOCIAL: carosello in 5-6 slide (testo di ogni slide) che racconta la trasformazione.
4. VERSIONE WHATSAPP (5 righe): da mandare al volo al cliente indeciso che ha un lavoro simile ("le mando un lavoro uguale al suo, finito a marzo").

Regola: niente aggettivi autocelebrativi. La storia e i numeri parlano da soli. Se un dato che ho fornito è vago, chiedimelo invece di gonfiarlo.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 11.5 — Partnership con tecnici e professionisti (canale B2B)",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 11.5 — Partnership con tecnici e professionisti (canale B2B)
Area: MARKETING AVANZATO E VENDITA

QUANDO USARLA: architetti, geometri, ingegneri, agenti immobiliari e amministratori portano lavori a ripetizione. Quasi nessuna impresa li coltiva in modo sistematico.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Voglio costruire un canale di lavori tramite professionisti della mia zona.

Target: [ARCHITETTI / GEOMETRI / INGEGNERI / AGENZIE IMMOBILIARI / AMMINISTRATORI DI CONDOMINIO — scegli o più d'uno]
Cosa posso offrire IO a loro (il punto è questo, non cosa voglio io): [ES. preventivi in 48h sui loro progetti, cantieri che non li fanno litigare col cliente, foto e aggiornamenti che li fanno fare bella figura, disponibilità per sopralluoghi rapidi]
Professionisti con cui ho già lavorato bene: [NOMI/SITUAZIONI — la partnership migliore parte da chi ti conosce già]
La mia capacità reale: [QUANTI CANTIERI IN PIÙ POSSO ASSORBIRE — inutile seminare se poi non consegno]

Genera:
1. LA PROPOSTA DI VALORE per ciascun target scelto: cosa gli risolvo IO (all'architetto serve un'impresa che rispetta il progetto e i tempi; all'immobiliare serve il preventivo rapido che sblocca la vendita; all'amministratore serve chi non gli riempie il telefono di lamentele dei condomini). Una per target, in 3 righe dette come le direi a voce.
2. PRIMO CONTATTO: il messaggio/email per il professionista che NON mi conosce — corto, senza piaggeria, con una proposta concreta di caffè o di prova su un lavoro piccolo. E la variante per chi ha già lavorato con me una volta.
3. IL SISTEMA DI MANTENIMENTO: cosa fare ogni volta che un professionista mi manda un lavoro (aggiornarlo anche se non è dovuto, foto di fine lavori, ringraziamento) e ogni quanto farsi vivo senza essere invadente.
4. IL TEMA COMPENSI ⚠️: come gestire con trasparenza eventuali segnalazioni (dal semplice reciproco invio di clienti alla collaborazione strutturata) — dammi le opzioni pulite e cosa evitare, da verificare con il commercialista per gli aspetti fiscali.
5. LA SCALA: da dove iniziare con la mia capacità reale — 3 professionisti coltivati bene battono 30 contattati a pioggia.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 11.6 — Script di vendita: presentare il preventivo a voce",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 11.6 — Script di vendita: presentare il preventivo a voce
Area: MARKETING AVANZATO E VENDITA

QUANDO USARLA: il preventivo NON si manda e basta: si presenta. Mezz'ora a voce cambia le percentuali di chiusura più di qualsiasi sconto.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Preparami a presentare un preventivo al cliente [DI PERSONA / AL TELEFONO / IN VIDEOCHIAMATA].

Preventivo: [LAVORO, IMPORTO] — Cliente: [CHI È, cosa ho capito di lui al sopralluogo: cosa lo preoccupa di più — prezzo? tempi? fiducia? disordine in casa?]
Concorrenza: [SO CHE HA ALTRI PREVENTIVI / NON SO / SONO L'UNICO]
I punti del MIO preventivo che potrebbero fare obiezione: [ES. sono più caro della media, tempi lunghi, chiedo acconto del 30%]

Genera lo SCRIPT della presentazione:
1. APERTURA (2 min): non partire dal prezzo. Riprendi il suo obiettivo con parole SUE dal sopralluogo ("lei mi ha detto che la cosa più importante è..."). Il preventivo è la risposta a quello.
2. IL PERCORSO (5 min): racconta il lavoro come sequenza (prima X, poi Y), non come elenco di voci — il cliente compra un percorso gestito, non un elenco. Dove fermarsi a chiedere "fin qui torna?".
3. IL PREZZO (2 min): come arrivarci in modo naturale, come dirlo SENZA giustificarsi né correre, e il silenzio da reggere dopo averlo detto.
4. OBIEZIONI: per ognuna di quelle che ho previsto + le 3 classiche ("devo pensarci" / "l'altro chiede meno" / "e se poi escono sorprese?"), la risposta in 3-4 frasi con la tecnica giusta: mai contraddire frontalmente, prima riconoscere, poi ancorare al valore. Per "l'altro chiede meno": le domande che invitano a confrontare il contenuto, non il totale.
5. CHIUSURA: la domanda di chiusura adatta al cliente (diretta per il deciso, a step per il prudente: "facciamo così: le blocco le date, mi conferma entro venerdì") — mai andarsene senza un prossimo passo con data.
6. In coda: i 3 ERRORI da non fare in questa presentazione specifica, visti i punti deboli che ti ho dichiarato.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 11.7 — Riattivazione dei vecchi clienti",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 11.7 — Riattivazione dei vecchi clienti
Area: MARKETING AVANZATO E VENDITA

QUANDO USARLA: 2 volte l'anno. La lista dei vecchi clienti è la miniera che ogni impresa possiede e nessuna scava: hanno già comprato, si fidano già.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Voglio riattivare i miei vecchi clienti in modo intelligente.

La mia lista: [QUANTI CLIENTI, di che tipo di lavori, di che periodo — anche solo "80 clienti dal 2018 a oggi, per lo più bagni e ristrutturazioni"]
Stagione/periodo attuale: [MESE]
Cosa posso proporre di sensato: [ES. controllo gratuito post-garanzia, manutenzioni stagionali, nuovo servizio che prima non facevo, disponibilità per lavori piccoli nei buchi di calendario]

Genera:
1. SEGMENTAZIONE semplice della lista in 3 gruppi: chi ha fatto lavori che RICHIEDONO manutenzione ciclica (caldaie escluse, pensa a: tetti, terrazzi, facciate, sigillature bagni) / chi ha fatto lavori parziali e ha quasi certamente ALTRO da fare (ha rifatto il bagno nel 2021 → la cucina è ancora vecchia) / tutti gli altri.
2. Per ogni gruppo, il MESSAGGIO WHATSAPP di riattivazione: personale, mai da volantino, con un motivo VERO per scrivergli proprio ora (la stagione, il tempo passato dal lavoro, il nuovo servizio). Deve sembrare — ed essere — il messaggio di un professionista che si ricorda di loro, non una campagna.
3. L'OFFERTA-PONTE a bassa soglia: il controllo/sopralluogo gratuito formulato in modo che accettarlo sia facile e non impegni.
4. GESTIONE RISPOSTE: la risposta per chi dice "tutto a posto, grazie" (lasciare un seme per il futuro) e per chi morde ("in effetti avrei da fare...").
5. IL CALENDARIO: in che ordine contattarli e quanti a settimana, calibrato sulla mia capacità di gestire le risposte — 10 messaggi a settimana con risposte curate battono 80 in un giorno.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 12.1 — Offerta per lavori condominiali (pensata per l'assemblea)",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 12.1 — Offerta per lavori condominiali (pensata per l'assemblea)
Area: CONDOMINI E AMMINISTRATORI

QUANDO USARLA: il preventivo condominiale non lo legge un cliente: lo leggono 20 condomini in assemblea, quasi tutti cercando un motivo per dire no.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Preparo un'offerta per lavori condominiali. Il documento verrà presentato in assemblea.

Lavori: [ES. rifacimento facciata, tetto, cappotto] — Condominio: [N UNITÀ, ZONA]
Interlocutore: [AMMINISTRATORE — mi conosce? / RICHIESTA ARRIVATA DA UN CONDOMINO]
Importo indicativo: [CIFRA] — Ci sarà confronto con altre imprese? [QUASI CERTAMENTE SÌ / GARA CON N OFFERTE]

Genera:
1. IL PREVENTIVO IN DUE LIVELLI: una SINTESI DA ASSEMBLEA (1 pagina: cosa si fa, quanto costa, quanto dura, come si paga, che garanzie ci sono — leggibile ad alta voce in 3 minuti da un amministratore) + il dettaglio tecnico completo dietro. Il 90% dei condomini leggerà solo la sintesi: è lì che si vince.
2. LE RISPOSTE PREVENTIVE alle 5 obiezioni che qualcuno farà SICURAMENTE in assemblea ("non si può fare solo la parte rovinata?", "perché non aspettiamo un anno?", "l'altra impresa costa meno", "e se poi chiedono soldi in più?", "quanto dura il disagio?") — scritte DENTRO il documento, così l'amministratore risponde con le mie parole.
3. LA SEZIONE DISAGI E CONVIVENZA: orari, rumore, ponteggio e sicurezza per i condomini, accessi, come comunicheremo — è la sezione che i condomini leggono davvero, e quasi nessuna impresa la mette.
4. CONDIZIONI DI PAGAMENTO pensate per un condominio (rate agganciate a SAL verificabili dall'amministratore, ⚠️ attenzione ai tempi di raccolta delle quote: prevedi termini realistici).
5. PER L'AMMINISTRATORE: la mini-lettera di accompagnamento che gli semplifica la vita (documenti già pronti per la delibera: DURC, visura, polizza RCT) — l'amministratore consiglia l'impresa che gli dà meno lavoro.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 12.2 — Comunicazioni ai condomini durante il cantiere",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 12.2 — Comunicazioni ai condomini durante il cantiere
Area: CONDOMINI E AMMINISTRATORI

QUANDO USARLA: cantiere condominiale attivo. Ogni condomino non informato è un reclamo all'amministratore, e ogni reclamo è un punto perso per il prossimo lavoro.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Il mio cantiere è in un condominio abitato. Preparami il kit di comunicazione ai condomini.

Lavori: [TIPO] — Durata prevista: [SETTIMANE/MESI] — Fasi più impattanti: [ES. demolizioni rumorose sett. 2-3, ponteggio su balconi, acqua chiusa il giorno X]
Canale: [BACHECA / LETTERA NELLE CASSETTE / GRUPPO WHATSAPP GESTITO DALL'AMMINISTRATORE]

Genera:
1. AVVISO DI INIZIO LAVORI: chi siamo, cosa faremo, quanto durerà, orari di lavoro, il referente con nome e numero (UN numero, non "l'impresa"), regole di sicurezza per i condomini (ponteggio, zone interdette). Tono: rispettoso, da ospiti in casa d'altri.
2. AVVISI PER LE FASI CRITICHE: il modello di avviso per rumore forte / interruzione servizi (acqua, ascensore) / accesso ai balconi — da affiggere [48-72h] prima, con data, fascia oraria e durata. Preciso: "rumore forte dalle 8:30 alle 12:30 di martedì" genera metà lamentele di "nei prossimi giorni possibili disagi".
3. AGGIORNAMENTO QUINDICINALE da bacheca: 5 righe, a che punto siamo, cosa succede nelle prossime due settimane. Poca roba, costante.
4. RISPOSTA-TIPO ALLE LAMENTELE del singolo condomino (polvere, rumore, "il ponteggio mi toglie la luce"): riconoscere il disagio senza sminuire, dire cosa facciamo per limitarlo, dare l'orizzonte temporale. MAI discutere: il condomino ostile si gestisce, non si vince.
5. AVVISO DI FINE LAVORI + ringraziamento per la pazienza: il biglietto da visita per i prossimi lavori privati DENTRO quel condominio (con la frase giusta per dirlo senza vendere: "per esigenze dei singoli appartamenti, il nostro riferimento resta...").`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 12.3 — Gestire il condomino ostile",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 12.3 — Gestire il condomino ostile
Area: CONDOMINI E AMMINISTRATORI

QUANDO USARLA: in ogni condominio ce n'è uno. Blocca l'assemblea, contesta il ponteggio, fotografa gli operai. Gestirlo male costa il saldo o il prossimo appalto.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Ho un condomino ostile in un cantiere condominiale. Aiutami a gestirlo senza danni.

La situazione: [DESCRIVI: cosa fa, cosa contesta, da quanto]
La sua contestazione ha basi reali? [IN PARTE — cosa c'è di vero / NO, pretestuosa / SÌ, su questo ha ragione]
Ha già coinvolto: [SOLO ALTRI CONDOMINI / L'AMMINISTRATORE / MINACCIA LEGALI O VIGILI]
Il mio committente formale è: [IL CONDOMINIO VIA AMMINISTRATORE — quindi lui NON è il mio cliente diretto]

Genera:
1. LA REGOLA D'INGAGGIO: cosa rispondere IO e ai miei operai sul posto (cortesia ferma, mai discutere nel merito in cortile, rimandare al canale ufficiale) — con le 2-3 frasi esatte da usare, perché nel momento non vengono in mente.
2. EMAIL ALL'AMMINISTRATORE: informarlo dei fatti (date, episodi, eventuali foto) in tono neutro e documentale, chiedendo che la gestione del condomino passi da lui — è il suo mestiere, non il mio. Se c'è del vero nella contestazione: cosa sistemiamo noi e come lo comunichiamo, togliendo benzina dal fuoco.
3. TUTELA OPERATIVA: cosa documentare da subito (foto quotidiane delle zone contestate, verbalizzare le interferenze se ostacola i lavori) — se il condomino rallenta il cantiere, il ritardo va contestualizzato PRIMA che diventi una penale mia.
4. LA LINEA ROSSA ⚠️: i comportamenti del condomino che fanno scattare la segnalazione formale scritta (accesso al ponteggio, rimozione segregazioni, minacce agli operai) e il modello di quella segnalazione — qui entra anche il tema sicurezza, che non è negoziabile.
5. COSA NON FARE MAI: l'elenco degli errori istintivi (rispondere a tono, fare sconti "per farlo stare zitto", parlarne male con gli altri condomini) e perché ognuno si ritorce contro.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 13.1 — Dossier per la banca (fido, anticipo contratti)",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 13.1 — Dossier per la banca (fido, anticipo contratti)
Area: BANCHE, FINANZA E ASSICURAZIONI

QUANDO USARLA: quando chiedi soldi alla banca. L'impresa edile che si presenta con un dossier ordinato ottiene condizioni che quella col "mi serve liquidità" si sogna.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Devo chiedere alla banca [FIDO DI CASSA / ANTICIPO SU CONTRATTI-FATTURE / FINANZIAMENTO PER ATTREZZATURA/MEZZO]. Preparami il dossier.

La mia impresa: [FORMA GIURIDICA, ANNI DI ATTIVITÀ, FATTURATO ULTIMI 2-3 ANNI, DIPENDENTI]
Perché mi servono i soldi (il motivo VERO): [ES. commesse in crescita ma SAL a 60-90 giorni, acquisto mezzo, cantiere grosso che parte]
Cosa ho da mostrare: [CONTRATTI FIRMATI IN PORTAFOGLIO E IMPORTI, COMMESSE IN CORSO, EVENTUALI RITARDI PASSATI CON LA BANCA — sii onesto, la banca li vede comunque]
Cifra richiesta: [IMPORTO]

Genera:
1. IL DOSSIER DI PRESENTAZIONE (2-3 pagine): chi siamo, i numeri degli ultimi anni, il portafoglio contratti firmati (la vera garanzia di un'impresa edile), a cosa serve la liquidità e — fondamentale — COME RIENTRA: il ciclo commessa spiegato alla banca (anticipo → SAL → saldo) con le date dei flussi attesi.
2. LA RICHIESTA GIUSTA: aiutami a capire se lo strumento che ho in mente è quello adatto al mio caso o se c'è di meglio (anticipo fatture vs fido vs finanziamento) — spiegami pro, contro e costi tipici di ciascuno in parole semplici ⚠️ condizioni reali da confrontare con 2-3 banche.
3. LE DOMANDE CHE MI FARANNO (ritardi, concentrazione su pochi clienti, il settore edile "rischioso") con la risposta preparata e onesta per ciascuna.
4. I DOCUMENTI da portare già pronti: elenco completo (bilanci/dichiarazioni, DURC, cassetto fiscale, contratti, centrale rischi ⚠️ chiedila prima TU per sapere cosa vedranno).
5. ERRORI DA EVITARE nel colloquio: chiedere all'ultimo momento (la banca finanzia chi non è disperato), cifra sbagliata (troppo poca = tornare a chiedere; troppa = spaventare), non saper spiegare i propri numeri.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 13.2 — Pianificazione di cassa della commessa",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 13.2 — Pianificazione di cassa della commessa
Area: BANCHE, FINANZA E ASSICURAZIONI

QUANDO USARLA: PRIMA di firmare un lavoro grosso. Le imprese edili non falliscono per mancanza di lavoro: falliscono per cassa, mentre aspettano i SAL.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Agisci come un consulente finanziario per imprese edili. Verifica se questa commessa la reggo di cassa.

Commessa: [IMPORTO TOTALE] — Durata: [MESI] — Pagamenti pattuiti: [ES. 10% avvio, SAL mensili a 60 giorni, saldo a collaudo]
Le mie USCITE su questa commessa, mese per mese (stima): materiali [QUANDO E QUANTO — attenzione: i materiali si pagano a 30-60 giorni ma i grossi ordini spesso in anticipo], manodopera [MENSILE], subappalti [QUANDO], noli [QUANDO]
Altre commesse in corso e loro flussi: [ENTRATE/USCITE GIÀ IMPEGNATE NEI PROSSIMI MESI]
Liquidità disponibile oggi: [CASSA + FIDO RESIDUO]

Genera:
1. LA CURVA DI CASSA della commessa mese per mese: quanto sono SOTTO e in che mese tocco il punto peggiore. È il numero che decide se firmare.
2. IL PUNTO CRITICO: quando e di quanto vado in tensione, e cosa succede se un SAL slitta di 30 giorni (il caso NORMALE, non pessimistico).
3. LE CONTROMOSSE, in ordine di convenienza: rinegoziare l'acconto o la frequenza SAL PRIMA di firmare (dammi le richieste esatte da fare al committente e come motivarle), concordare dilazioni coi fornitori principali, anticipo fatture sui SAL ⚠️ costi da verificare.
4. LA SOGLIA DI FIRMA: a che condizioni minime di pagamento questa commessa è sostenibile per me — così in trattativa so qual è il punto sotto cui NON scendere (il prezzo giusto con pagamenti sbagliati è comunque un affare sbagliato).
5. Il FOGLIO DI MONITORAGGIO mensile: le 4 righe da aggiornare ogni fine mese per vedere in anticipo la tensione di cassa, non quando è già lì.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 13.3 — Assicurazioni dell'impresa: cosa serve e come confrontare",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 13.3 — Assicurazioni dell'impresa: cosa serve e come confrontare
Area: BANCHE, FINANZA E ASSICURAZIONI

QUANDO USARLA: al rinnovo delle polizze, o prima di un lavoro che richiede coperture specifiche (CAR, decennale postuma).

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Aiutami a fare ordine sulle assicurazioni della mia impresa edile. NON sei un assicuratore: preparami la mappa e le domande, le polizze le chiudo col broker ⚠️.

La mia situazione: [LAVORI TIPICI, IMPORTO MEDIO E MASSIMO COMMESSE, N DIPENDENTI, USO SUBAPPALTATORI SÌ/NO]
Polizze attuali: [RCT/RCO CON MASSIMALI, ALTRE — oppure "non lo so di preciso", che è già una risposta]
Esigenza specifica: [RINNOVO GENERALE / IL COMMITTENTE MI CHIEDE LA POLIZZA CAR PER UN CANTIERE / DEVO DARE LA DECENNALE POSTUMA / HO AVUTO UN SINISTRO E VOGLIO CAPIRE SE SONO COPERTO BENE]

Genera:
1. LA MAPPA DELLE COPERTURE per un'impresa come la mia: RCT/RCO (la base — e i massimali sensati per i miei importi di commessa), CAR (quando serve e chi la paga di solito), decennale postuma (quando è obbligatoria), tutela legale, mezzi e attrezzature, infortuni titolare (spesso scoperto: se mi fermo io, l'impresa si ferma). Per ciascuna: a cosa serve in UN esempio concreto di cantiere, e i buchi tipici delle polizze economiche.
2. LE DOMANDE DA FARE AL BROKER, per iscritto: esclusioni esatte (lavori in quota? demolizioni? danni da acqua — il sinistro più frequente?), i subappaltatori sono coperti o no, franchigie reali, cosa succede coi lavori già consegnati.
3. IL CONFRONTO: la tabella per mettere in fila 2-3 proposte (massimali, franchigie, esclusioni, premio) — la polizza più economica con l'esclusione sbagliata è la più cara di tutte.
4. Se l'esigenza è una POLIZZA RICHIESTA DAL COMMITTENTE (CAR/postuma): cosa verificare nella richiesta, tempi realistici per ottenerla, e come girarne il costo nel preventivo.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 13.4 — Denuncia di sinistro e gestione del danno",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 13.4 — Denuncia di sinistro e gestione del danno
Area: BANCHE, FINANZA E ASSICURAZIONI

QUANDO USARLA: l'operaio ha bucato il tubo del vicino, il ponteggio ha graffiato l'auto, l'acqua è finita nell'appartamento di sotto. Ora conta la sequenza.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

È successo un danno in/dal mio cantiere. Guidami nella gestione.

Cosa è successo: [DESCRIVI: cosa, quando, come ve ne siete accorti]
Danneggiato: [CLIENTE STESSO / VICINO-TERZO / CONDOMINIO / COSA PUBBLICA]
Entità apparente: [STIMA — e può peggiorare? es. infiltrazione ancora attiva]
Chi l'ha causato: [NOSTRO OPERAIO / SUBAPPALTATORE / NON CHIARO / FORSE PREESISTENTE]
La mia polizza RCT: [COMPAGNIA, so la franchigia? SÌ-CIFRA/NO]

Genera, in ordine di urgenza:
1. LE PRIME ORE: fermare l'aggravamento (se l'acqua scorre, prima si chiude e poi si scrive), documentare TUTTO (foto/video di danno, causa e contesto, con orari), raccogliere i dati del danneggiato — e cosa NON dire sul posto: dispiacere e presenza sì, ammissioni di responsabilità e promesse di pagamento NO, quelle passano dall'assicurazione ⚠️.
2. LA DENUNCIA DI SINISTRO alla mia assicurazione: il testo pronto con la descrizione FATTUALE (cosa, dove, quando, danni apparenti), entro i termini di polizza — descrizione onesta ma senza autoaccuse ricostruttive: le cause le accerta il perito.
3. IL MESSAGGIO AL DANNEGGIATO: presenza e serietà ("abbiamo aperto il sinistro, il perito la contatterà, questo è il riferimento") senza ammissioni né cifre. Se il danneggiato è il MIO CLIENTE: il tono va calibrato per salvare il rapporto e il cantiere che continua.
4. SE C'ENTRA IL SUBAPPALTATORE: la comunicazione formale a lui (è il suo sinistro e la sua polizza, ma il cantiere è mio: pretendo che lo gestisca subito) ⚠️.
5. LA VALUTAZIONE FRANCHIGIA: se il danno è sotto o poco sopra la franchigia, pro e contro del risolvere direttamente senza sinistro (rapidità e rapporto vs precedente e mancanza di perizia) — con i casi in cui NON conviene mai fare da soli.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 14.1 — Infortunio in cantiere: le prime 24 ore",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 14.1 — Infortunio in cantiere: le prime 24 ore
Area: EMERGENZE E CRISI

QUANDO USARLA: speriamo mai. Ma il protocollo si prepara PRIMA, perché nel momento non ragiona nessuno. Stampalo e tienilo in baracca.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Preparami il PROTOCOLLO SCRITTO da seguire in caso di infortunio in cantiere. Voglio averlo pronto PRIMA che serva.

La mia impresa: [N OPERAI, chi è il preposto/addetto primo soccorso in squadra]
⚠️ AVVERTENZA: questo protocollo è una traccia operativa. Obblighi e termini esatti vanno validati dal mio consulente del lavoro e dal consulente sicurezza, e possono variare — fallo scrivere nel documento.

Genera il protocollo in sequenza temporale:
1. MINUTO ZERO: soccorso all'infortunato (chi chiama il 112, chi assiste, chi mette in sicurezza l'area perché non succeda a un secondo). L'area dell'infortunio grave NON si modifica: niente riordino "per pulizia" — se ci sarà un'indagine, l'area parla.
2. PRIMA ORA: chi avvisare e in che ordine (famiglia dell'infortunato — con che parole, dammi la traccia; il consulente del lavoro per la denuncia INAIL nei termini di legge ⚠️; l'avvocato se l'infortunio è serio; il CSE se c'è). Cosa dire e NON dire ai presenti: i fatti si raccontano alle autorità, non si costruiscono versioni condivise.
3. PRIME 24 ORE: la denuncia INAIL (chi la fa e con che dati — raccogli l'elenco), l'eventuale comunicazione al committente, la gestione della squadra (fermare il cantiere? riprendere? come parlare agli altri operai che hanno visto).
4. SE ARRIVANO GLI ISPETTORI (ASL/Ispettorato): come ci si comporta — collaborazione totale, documenti a disposizione (l'elenco di quelli che chiederanno: POS, nomine, formazione, DPI, idoneità — tienili SEMPRE aggiornati in cantiere), risposte fattuali, e il diritto di farsi assistere ⚠️.
5. LA SETTIMANA DOPO: vicinanza all'infortunato e alla famiglia (che è la cosa giusta E anche quella saggia), analisi interna di cosa è successo SENZA caccia al colpevole davanti alla squadra, azioni correttive documentate.
6. LA PAGINA STAMPABILE: tutto il protocollo compresso in 1 pagina con i numeri di telefono da compilare (112, consulente lavoro, avvocato, CSE, mia) da appendere in baracca di cantiere.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 14.2 — Il subappaltatore è sparito",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 14.2 — Il subappaltatore è sparito
Area: EMERGENZE E CRISI

QUANDO USARLA: l'impiantista non risponde da tre giorni, il cartongessista ha lasciato il lavoro a metà. Il cantiere non aspetta.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Un subappaltatore ha abbandonato (o sta abbandonando) il mio cantiere. Guidami.

Subappaltatore: [ATTIVITÀ, cosa doveva fare, cosa ha completato in %]
Situazione: [NON RISPONDE DA X GIORNI / HA DETTO CHE NON TORNA / VIENE A SINGHIOZZO E RALLENTA TUTTO / SOSPETTO CRISI AZIENDALE SUA]
Contratto/ordine scritto: [SÌ, con clausole su abbandono / SÌ, generico / SOLO ACCORDI VERBALI]
Gli ho già pagato: [QUANTO, su quanto pattuito] — Lavori suoi con difetti da sistemare? [SÌ/NO]
Impatto: [COSA BLOCCA, entro quando devo consegnare]

Genera, in parallelo (il tempo è la variabile):
1. LA DIFFIDA FORMALE via PEC: ricostruzione (ordine, stato lavori, assenze con date), intimazione a riprendere entro [48-72h], avviso che decorso il termine affiderò a terzi il completamento addebitando i maggiori costi, riserva sui difetti ⚠️ da far verificare al legale, ma dammela pronta OGGI.
2. IL PIANO B OPERATIVO da attivare SUBITO in parallelo (non dopo la scadenza della diffida): come cercare il sostituto senza farmi spennare dall'urgenza (cosa dire e cosa NON dire sul perché cerco), come far certificare lo stato di avanzamento del lavoro interrotto PRIMA che il sostituto ci metta mano (foto, video, possibilmente constatazione con testimone — se no, ogni difetto futuro sarà "colpa di chi c'era prima" in entrambe le direzioni).
3. I CONTI: schema di calcolo di quanto gli devo/mi deve (lavoro fatto - acconti - costi extra del sostituto - difetti da sistemare) per la trattativa o il contenzioso che verrà.
4. LA COMUNICAZIONE AL COMMITTENTE (se il ritardo si vedrà): versione del prompt 2.4 adattata — causa esterna, piano di recupero già attivato, senza sputtanare il subappaltatore per nome (poco professionale e giuridicamente inutile).
5. PER LA PROSSIMA VOLTA: le 3 clausole dell'ordine di subappalto che mi avrebbero protetto meglio in questo caso specifico, da aggiungere al mio standard (si collega al prompt 10.3).`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 14.3 — Il cliente è insolvente sul serio (o fallito)",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 14.3 — Il cliente è insolvente sul serio (o fallito)
Area: EMERGENZE E CRISI

QUANDO USARLA: oltre i solleciti: il cliente non pagherà, o è entrato in procedura. Qui si salva il salvabile.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Il mio credito è a serio rischio. Aiutami a inquadrare la situazione e le mosse. ⚠️ Da qui in poi ogni mossa va coordinata con l'avvocato: preparami il quadro e i materiali per arrivare da lui pronto, che costa meno ed è più efficace.

Credito: [IMPORTO, FATTURE, da quando scaduto] — Già fatto: [SOLLECITI, PEC, DECRETO INGIUNTIVO GIÀ OTTENUTO?]
Il cliente: [PRIVATO / AZIENDA] — Cosa so della sua situazione: [VOCI DI CRISI / ALTRI FORNITORI NON PAGATI / PROCEDURA GIÀ APERTA (fallimento-liquidazione, concordato) / SEMPLICEMENTE SPARITO]
Il cantiere: [FINITO E CONSEGNATO / IN CORSO — ancora mio materiale o attrezzatura sul posto?]

Genera:
1. IL TRIAGE: in base alla situazione, quanto è realisticamente recuperabile e in che tempi — la valutazione onesta costi/benefici tra azione legale, accordo a saldo e stralcio, o accantonamento della perdita. Farsi altri 10.000€ di spese legali per un credito irrecuperabile è il secondo errore.
2. SE IL CANTIERE È IN CORSO: le mosse IMMEDIATE — sospensione lavori formalizzata (prompt 4.4, versione morosità), recupero di materiali e attrezzature MIE dal cantiere (cosa posso riprendermi e cosa no ⚠️: il materiale già posato non si tocca), stop a nuovi ordini fornitori per quella commessa.
3. SE C'È UNA PROCEDURA CONCORSUALE: cosa significa in pratica per me (stop azioni individuali, insinuazione al passivo con i suoi termini ⚠️), l'elenco documenti da preparare per l'avvocato (contratto, SAL approvati, fatture, PEC, foto lavori) e il realismo sui tempi e percentuali tipiche di recupero.
4. IL FASCICOLO PER L'AVVOCATO: tutto ordinato in cronologia con un sommario di 1 pagina — arrivo con questo, non con una busta di carte.
5. LA LEZIONE DI SISTEMA: dai segnali che c'erano (e che ignoravo), la regola da adottare da domani: acconti più alti ai nuovi clienti, stop lavori automatico a X giorni di ritardo SAL, verifica visura/protesti prima di commesse sopra [SOGLIA]. Il credito perso deve almeno comprare la procedura che eviterà il prossimo.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 14.4 — Ispezione o controllo in cantiere (ASL, Ispettorato, vigili)",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 14.4 — Ispezione o controllo in cantiere (ASL, Ispettorato, vigili)
Area: EMERGENZE E CRISI

QUANDO USARLA: arrivano senza preavviso. Come va a finire dipende molto da com'è organizzato il cantiere QUEL giorno — e da come ci si comporta.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Preparami a gestire un controllo ispettivo in cantiere (e a farmi trovare pronto sempre).

La mia situazione: [CONTROLLO GIÀ AVVENUTO — racconta com'è andata e cosa hanno rilevato / VOGLIO PREPARARMI PRIMA]
Cantieri tipici: [TIPO, con/senza ponteggio, con/senza subappaltatori]

Genera:
1. IL FASCICOLO DI CANTIERE SEMPRE PRONTO: la checklist dei documenti che gli ispettori chiedono per primi (notifica preliminare se dovuta, POS, nomine e deleghe, attestati formazione, idoneità sanitarie, verbali consegna DPI, registro/documenti subappaltatori con DURC, libro unico se richiesto ⚠️ elenco da validare col consulente) — organizzati in un raccoglitore fisico o cartella condivisa, aggiornati OGNI ingresso di persona nuova.
2. IL COMPORTAMENTO durante il controllo: chi parla con gli ispettori (UNO solo: io o il preposto delegato — la squadra lavora e risponde solo se interpellata, con i fatti), collaborazione senza ansia, MAI ostacolare o "sistemare" cose al volo davanti a loro, prendere nota di tutto ciò che viene rilevato.
3. GLI ERRORI CLASSICI del titolare durante l'ispezione (giustificarsi troppo, dare colpe agli operai davanti agli ispettori, firmare verbali senza leggerli, promettere date impossibili) e cosa fare invece.
4. SE RILEVANO IRREGOLARITÀ: come leggere il verbale, la differenza tra prescrizione con termine e sanzione immediata ⚠️, i termini per adempiere e la conferma scritta dell'avvenuta regolarizzazione — con avvocato/consulente in copia da subito se la cosa è seria.
5. IL GIORNO DOPO: l'analisi onesta di cosa non era a posto e la correzione DI SISTEMA (non la toppa): se mancava un attestato, il problema non è quell'attestato — è che non ho un sistema di scadenze. Collegalo al prompt 10.3 (subappaltatori) e 3.1 (POS).`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 15.1 — Sollecito al tecnico per pratica ferma",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 15.1 — Sollecito al tecnico per pratica ferma
Area: TECNICI, PRATICHE E AMBIENTE

QUANDO USARLA: il cantiere è pronto ma la CILA/SCIA è ferma sulla scrivania del geometra da tre settimane. Il tecnico non è un fornitore qualsiasi: domani ci rilavori.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Una pratica edilizia è ferma dal tecnico e mi blocca il lavoro. Scrivi il sollecito giusto.

Tecnico: [GEOMETRA/ARCHITETTO/INGEGNERE — incaricato da: ME / DAL CLIENTE (cambia tutto: se è del cliente, il sollecito vero va fatto fare al cliente)]
Pratica: [CILA / SCIA / PERMESSO / AGIBILITÀ / ALTRO] — Ferma da: [TEMPO] — Promesse già fatte: [DATE DETTE E SALTATE]
Impatto: [CANTIERE CHE NON PARTE / CLIENTE CHE PRESSA ME / SQUADRA DA RIPIANIFICARE]
Rapporto col tecnico: [LAVORIAMO SPESSO INSIEME / OCCASIONALE / MI MANDA ANCHE CLIENTI — la leva cambia]

Genera:
1. Il SOLLECITO CALIBRATO sul rapporto: mai aggressivo (il tecnico offeso ha mille modi di rallentarti per anni), ma con la data che mi serve e il PERCHÉ concreto (la squadra che devo impegnare, il cliente che chiede). La formula che funziona: dargli una via d'uscita facile ("se c'è un intoppo sulla pratica ditemelo, magari posso aiutare io con [documenti/rilievi]") + la richiesta di una data affidabile, anche più in là, purché vera.
2. Se il tecnico è DEL CLIENTE: il messaggio al CLIENTE (non al tecnico) che gli fa capire, senza accusare nessuno, che il ritardo è della pratica e non mio — con le date in fila. Proteggo me e lascio a lui la pressione sul suo tecnico.
3. L'ESCALATION dopo [X GIORNI] senza risposta: la versione scritta più formale con ricostruzione date (che mi serve anche come prova che il ritardo non è mio, se il cliente poi contesta i tempi).
4. LA PREVENZIONE: le 3 cose da concordare col tecnico A INIZIO rapporto sulla prossima pratica (tempi dichiarati per iscritto, chi fornisce cosa entro quando, aggiornamento quindicinale anche solo "tutto in corso") — due righe su WhatsApp che evitano questo prompt la prossima volta.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 15.2 — Richiesta di chiarimenti sul progetto",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 15.2 — Richiesta di chiarimenti sul progetto
Area: TECNICI, PRATICHE E AMBIENTE

QUANDO USARLA: il disegno non torna, manca un dettaglio, due tavole si contraddicono. Chiedere per iscritto oggi evita il "dovevate capirlo voi" domani.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Ho dei dubbi sul progetto che devo eseguire. Formalizza la richiesta di chiarimenti al progettista/DL.

Progetto: [LAVORO, PROGETTISTA/DL, COMMITTENTE]
I miei dubbi (elenca tutto, anche i piccoli): [ES. tavola 3 e tavola 7 in contraddizione sul dettaglio X / quota mancante / materiale indicato fuori produzione / soluzione che secondo me crea problemi perché...]
Urgenza: [LAVORAZIONE GIÀ IN CORSO — sto fermo? / ARRIVA TRA X GIORNI]
Ho una soluzione alternativa da proporre? [SÌ, DESCRIVI / NO, chiedo solo istruzioni]

Genera:
1. La RICHIESTA DI CHIARIMENTI formale (email, con protocollo interno mio: numerala — RDC-01, RDC-02... — così si tracciano): per ogni dubbio → riferimento esatto (tavola, particolare, quota), descrizione del problema, e la domanda PRECISA a cui rispondere. Domande chiuse dove possibile: "confermate spessore X o Y?" ottiene risposta; "come facciamo qui?" ottiene silenzio.
2. Per i punti dove HO un'alternativa: proporla con il perché tecnico e l'eventuale differenza di costo/tempo — proposta + domanda, mai modifica autonoma: quello che cambio senza ok scritto diventa mio per sempre.
3. La FRASE SUI TEMPI: entro quando serve la risposta e cosa succede al cronoprogramma se slitta (fattuale, non minacciosa) — se la lavorazione è in corso, la sospensione parziale va detta qui.
4. La REGISTRAZIONE: il mini-registro delle RDC da tenere (numero, data invio, risposta, data risposta) — a fine cantiere, questo registro è la storia di chi ha risposto in tempo e chi no.
5. Se la risposta non arriva: il SOLLECITO a distanza di [X GIORNI] con avviso che, per non fermare il cantiere, procederemo secondo [LA SOLUZIONE PIÙ CONSERVATIVA — quale?] salvo diversa indicazione entro [DATA] ⚠️ questa formula va calibrata: fammi vedere quando è difendibile e quando è un rischio.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 15.3 — Gestione rifiuti di cantiere: la checklist che evita le sanzioni",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 15.3 — Gestione rifiuti di cantiere: la checklist che evita le sanzioni
Area: TECNICI, PRATICHE E AMBIENTE

QUANDO USARLA: macerie, imballaggi, sfridi: la gestione rifiuti è il punto dove un'impresa in regola su tutto prende la sanzione stupida.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Fammi il quadro operativo della gestione rifiuti per i miei cantieri. ⚠️ La normativa ambientale cambia ed è piena di dettagli: questo è il quadro di lavoro, la validazione finale spetta al mio consulente ambientale — scrivilo nel documento.

I miei cantieri tipici: [TIPO LAVORI — demolizioni? scavi? — e volumi indicativi di macerie]
Come gestisco oggi: [CASSONE DELLA DITTA DI SMALTIMENTO / PORTO IO IN DISCARICA COL MIO MEZZO / UN PO' E UN PO' / VORREI CAPIRE COSA MI CONVIENE]
Ho iscrizioni albo gestori? [SÌ CATEGORIA / NO / NON SO SE MI SERVE]

Genera:
1. LA MAPPA BASE: chi è il produttore del rifiuto (io), cosa significa in responsabilità, i codici EER tipici dei rifiuti da costruzione/demolizione, la differenza che conta tra rifiuto e sottoprodotto (terre e rocce ⚠️ tema a parte, segnalane l'esistenza).
2. IL DEPOSITO TEMPORANEO in cantiere: limiti di tempo e quantità, come organizzarlo per essere in regola a colpo d'occhio (zone, cartelli, niente mescolare pericolosi e non).
3. IL GIRO DELLE CARTE: FIR (chi lo compila, chi lo firma, cosa controllo io quando il trasportatore ritira, la quarta copia ⚠️/sistema digitale vigente da verificare), registri se dovuti, e la verifica delle autorizzazioni di trasportatore e impianto PRIMA di affidare (se loro sono irregolari, la responsabilità risale a me).
4. TRASPORTO IN PROPRIO: a che condizioni posso portare i MIEI rifiuti col MIO mezzo (iscrizione semplificata albo ⚠️) e quando invece è abusivo — il caso classico del furgone con le macerie "tanto è poco".
5. LA CHECKLIST PLASTIFICATA per il capocantiere: 8-10 righe, cosa controllare a ogni ritiro rifiuti — da tenere in baracca.
6. I 5 ERRORI che costano le sanzioni più frequenti in edilizia e la contromossa per ciascuno.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 15.4 — Sicurezza multilingua per la squadra",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 15.4 — Sicurezza multilingua per la squadra
Area: TECNICI, PRATICHE E AMBIENTE

QUANDO USARLA: se in squadra c'è chi capisce l'italiano a metà, la formazione in italiano è una formalità, non una protezione. E in caso di infortunio, la "formazione non compresa" è un problema tuo.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

Ho operai stranieri in squadra. Rendimi la sicurezza COMPRENSIBILE, non solo formale.

Lingue in squadra: [ES. rumeno, albanese, arabo, urdu...] — Livello di italiano: [PER CIASCUNO: buono / si arrangia / minimo]
Lavorazioni tipiche: [ELENCO] — Le regole che mi preme siano capite DAVVERO: [ES. imbracatura in quota, mai rimuovere protezioni, cosa fare se...]

Genera:
1. LE REGOLE D'ORO TRADOTTE: le 10 regole di sicurezza fondamentali per le mie lavorazioni, scritte in italiano SEMPLIFICATO (frasi da 5-8 parole, verbi all'imperativo) + traduzione in ogni lingua richiesta, affiancate — da stampare e appendere in baracca ⚠️ per le lingue che traduco, fai verificare a un madrelingua (un operaio stesso): la traduzione sbagliata su una regola di sicurezza è peggio di niente.
2. IL TOOLBOX TALK MULTILINGUA: come adattare la riunione del prompt 3.3 — parlare lento non basta: la tecnica del "fammi vedere" (la verifica di comprensione si fa facendo MOSTRARE il gesto, non chiedendo "capito?"), e l'operaio-ponte (il collega stessa lingua con buon italiano che riformula) usato in modo strutturato, non a caso.
3. I CARTELLI: quali segnalazioni di cantiere doppiare con pittogrammi + scritta multilingua (i pittogrammi normati già parlano da soli: integrare, non sostituire ⚠️).
4. LA VERIFICA DOCUMENTATA: come documentare che la formazione è stata COMPRESA (verbale con modalità: lingua usata, presenza dell'operaio-ponte, prova pratica eseguita) — in caso di controllo o infortunio, questa carta pesa.
5. LE FRASI DI EMERGENZA: il mini-glossario bidirezionale (10 frasi: "fermati", "scendi", "chiama aiuto", "non toccare", "dov'è il dolore?") nelle lingue della squadra — da tenere nel telefono di ogni preposto.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 16.1 — Foto del sopralluogo → verifica completezza",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 16.1 — Foto del sopralluogo → verifica completezza
Area: PROMPT CON FOTO

QUANDO USARLA: appena tornato dal sopralluogo, PRIMA di fare il preventivo. Scoprire cosa non hai fotografato quando sei ancora in tempo a tornarci.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

[ALLEGA TUTTE LE FOTO DEL SOPRALLUOGO]

Ho fatto il sopralluogo per: [TIPO LAVORO da preventivare]
Queste sono tutte le foto che ho scattato.

Analizzale e dimmi:
1. COSA SI VEDE: l'inventario di quello che ho documentato, zona per zona, con lo stato apparente di ciò che si vede (nota bene ciò che dalle foto sembra critico: crepe, umidità, impianti datati...).
2. COSA MANCA: per preventivare QUESTO tipo di lavoro, quali foto/informazioni NON ho raccolto (il quadro elettrico? il punto di adduzione? il sotto-finestra? l'accesso per i materiali?) — in ordine di importanza, così se torno faccio un giro solo.
3. I CAMPANELLI D'ALLARME: dettagli nelle foto che suggeriscono possibili sorprese in corso d'opera (con che verifica li escluderei: apertura ispettiva, prova, domanda al cliente).
4. LE MISURE: cosa devo assolutamente misurare che dalle foto non si ricava.
⚠️ Sei un assistente, non un tecnico in loco: le tue osservazioni sono spunti da verificare, non diagnosi. Segnala il tuo livello di certezza su ogni rilievo.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 16.2 — Foto di fine giornata → rapportino",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 16.2 — Foto di fine giornata → rapportino
Area: PROMPT CON FOTO

QUANDO USARLA: il capocantiere scatta 5 foto a fine giornata; il rapportino si scrive mezzo da solo. Da abbinare al vocale del prompt 4.2.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

[ALLEGA LE FOTO DI FINE GIORNATA + eventuale trascrizione vocale]

Cantiere: [NOME] — Data: [DATA] — Squadra presente: [NOMI/N]

Dalle foto (e dal vocale se c'è), genera il rapportino di giornata:
1. LAVORAZIONI VISIBILI nelle foto: cosa risulta eseguito/avanzato oggi, zona per zona, con descrizione tecnica corretta.
2. STIMA AVANZAMENTO di ciò che si vede (es. "posa pavimento zona giorno: ~70% della superficie visibile") — dichiarata come stima da foto, MAI spacciata per misura.
3. COSA NON TORNA: incongruenze tra foto e programma dichiarato, lavorazioni che sembrano ferme rispetto a ieri (se ti do anche le foto di ieri, confrontale).
4. DETTAGLI DEGNI DI NOTA visti nelle foto: materiale accatastato male, area disordinata, protezioni mancanti ⚠️ (segnala con cautela: da foto non si giudica, si segnala da verificare).
5. Le DOMANDE al capocantiere per completare il rapportino (ore, materiali ricevuti, problemi) — solo quelle a cui le foto non rispondono.
Output nello schema del rapportino standard (prompt 4.2), pronto da archiviare.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 16.3 — Foto del difetto → descrizione tecnica per contestazione",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 16.3 — Foto del difetto → descrizione tecnica per contestazione
Area: PROMPT CON FOTO

QUANDO USARLA: materiale non conforme (prompt 5.5) o vizi contestati dal cliente (prompt 7.3): la descrizione tecnica del difetto parte dalla foto.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

[ALLEGA LE FOTO DEL DIFETTO/NON CONFORMITÀ — più angolazioni, con riferimento di scala]

Contesto: [STO CONTESTANDO UNA FORNITURA (uso col prompt 5.5) / STO RISPONDENDO A UNA CONTESTAZIONE DEL CLIENTE (uso col prompt 7.3) / DOCUMENTAZIONE PREVENTIVA]
Cosa dovrebbero mostrare le foto: [DESCRIVI: es. piastrelle con difetto di smaltatura, ammaccature sui profili, fessurazione sull'intonaco]

Genera:
1. DESCRIZIONE TECNICA OGGETTIVA di ciò che è visibile in ogni foto, numerandole (Foto 1: ..., Foto 2: ...): tipo di difetto apparente, posizione, estensione stimata. Linguaggio da perizia: solo ciò che SI VEDE, zero interpretazioni sulle cause.
2. SEPARATAMENTE, le IPOTESI SULLE CAUSE compatibili con quanto visibile (difetto di produzione / trasporto / posa / uso), ciascuna con il suo grado di plausibilità e con COSA servirebbe per confermarla — questa parte è PER ME, non va nella contestazione: nella lettera vanno i fatti, le cause le accerta chi di dovere.
3. LE FOTO CHE MANCANO per una documentazione solida: angolazioni, dettagli, contesto, riferimento di scala.
4. IL PARAGRAFO PRONTO da incollare nella lettera di contestazione (5.5) o nella risposta al cliente (7.3), con i riferimenti alle foto numerate.
⚠️ Analisi da fotografia: per difetti rilevanti economicamente, la perizia di un tecnico resta la strada.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale 16.4 — Foto del cantiere → giro di controllo visivo",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE 16.4 — Foto del cantiere → giro di controllo visivo
Area: PROMPT CON FOTO

QUANDO USARLA: il titolare non può essere ovunque. Le foto del giro di cantiere del preposto, passate all'AI, sono un secondo paio d'occhi. NON sostituiscono i controlli di legge: li integrano.

STRUTTURA DA SEGUIRE. I campi [TRA QUADRE] si riempiono con i dati reali di azienda, commessa e cliente (usa i tool); se un dato manca, chiedilo all'utente o lascia [DA COMPLETARE] ben visibile — mai inventare importi, date o norme.

[ALLEGA LE FOTO DEL GIRO DI CANTIERE DI OGGI]

Cantiere: [TIPO LAVORI IN CORSO, FASE ATTUALE]

Fai un giro di controllo visivo su queste foto e segnala:
1. ORDINE E LOGISTICA: materiale stoccato male (in bilico, esposto alla pioggia se deperibile, in mezzo ai passaggi), vie di transito ostruite, area di taglio/lavorazione disordinata.
2. POSSIBILI TEMI DI SICUREZZA visibili: aperture apparentemente non protette, quadri elettrici aperti, DPI apparentemente non indossati nelle foto con persone, scale usate male ⚠️ — formula OGNI rilievo come "da verificare sul posto", mai come accertamento: una foto non dice tutto (l'apertura può essere protetta fuori inquadratura).
3. QUALITÀ APPARENTE: dettagli di esecuzione che dalle foto meritano un secondo sguardo (allineamenti, pulizia dei giunti, protezione delle lavorazioni finite).
4. LA LISTA PER IL PREPOSTO: i punti sopra trasformati in un messaggio WhatsApp di 5-8 righe, in ordine di priorità (prima la sicurezza), con richiesta di foto di riscontro dopo la sistemazione.
5. COSA NON VEDO: le zone/aspetti che dalle foto di oggi non sono documentati e che nel prossimo giro andrebbero fotografati.
⚠️ Questo controllo NON sostituisce i sopralluoghi del preposto, le verifiche di legge (ponteggi, ecc.) né la vigilanza reale: è un filtro in più.`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale F.0 — Filiere: quale guida usare in quale fase",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE — FILIERE: quale guida usare in quale fase del lavoro

I numeri (es. 7.1, 2.2) sono le altre guide redazionali di questo Brain: cercale per numero o per titolo quando servono. L'output di una guida e' l'input della successiva.

I prompt non vivono da soli: l'output di uno è l'input del successivo. Queste sono le catene da seguire; nella stessa conversazione AI puoi percorrere un'intera filiera senza ricompilare i dati (l'AI ricorda quello che le hai già detto).

## Filiera A — Dalla richiesta al contratto (commerciale)
**8.5** risposta alla richiesta generica → **8.1** qualifica del lead → **8.2** preparazione sopralluogo → **16.1** verifica foto sopralluogo → **1.1** scomposizione in voci → **1.2** bozza preventivo → **1.4** cronoprogramma → **1.3** preventivo in linguaggio chiaro → **1.5** email di invio → **11.6** presentazione a voce → **8.3** follow-up → **10.1** contratto.
*Prima di firmare commesse grosse: passare da **13.2** (tenuta di cassa).*

## Filiera B — Il cantiere che scorre (esecuzione)
**3.1** traccia POS → **3.2** consegna DPI → **10.3** ingresso subappaltatori → **3.3** toolbox talk (+ **15.4** se squadra multilingua) → **2.1** aggiornamento settimanale cliente → **4.2**/**16.2** rapportini → **9.4** pianificazione squadre → **15.2** chiarimenti sul progetto quando serve.
*Deviazioni: imprevisto → **2.2**; richiesta del cliente in corso d'opera → **10.2** (variante scritta, SEMPRE); ritardo → **2.4**.*

## Filiera C — Dal lavoro ai soldi (amministrativa)
**4.1** descrizione lavori SAL → **4.3** report mensile committente → **7.5** promemoria scadenza → *(se non paga)* **7.1** primo sollecito → **7.2** sollecito formale → *(se in difficoltà)* **7.4** piano di rientro → *(se insolvente)* **14.3**.
*Chiusura: **4.5** ultimazione lavori → **2.5** fine lavori e recensione → **9.1** analisi marginalità (il consuntivo che migliora il prossimo preventivo — chiude il cerchio con la Filiera A).*

## Filiera D — La macchina dei clienti (marketing)
**11.1** piano editoriale mensile ← alimentato da → **11.4** case study di ogni lavoro finito → **6.1** post prima/dopo → **6.5** video. In parallelo: **6.2** scheda Google + **11.3** pagine servizio (la base), **11.2** campagne quando serve volume, **11.5** partnership tecnici e **11.7** riattivazione vecchi clienti (i canali che costano meno). Le recensioni di **2.5** alimentano tutto; **6.4** protegge la reputazione.

## Filiera E — Emergenze (da tenere pronte PRIMA)
**14.1** protocollo infortunio (da preparare OGGI, non quando serve) · **14.4** protocollo ispezioni · **13.4** sinistri e danni · **14.2** subappaltatore sparito · **12.3** condomino ostile.

---`,
  },
  {
    category: "07-guide-redazionali",
    title: "Guida redazionale F.1 — Esempi di qualita: sollecito, variante, richiesta di prezzo",
    source_type: "playbook",
    content: `GUIDA REDAZIONALE — ESEMPI DI QUALITA' (il livello da eguagliare)

Tre esempi compilati con l'output di riferimento. Quando scrivi solleciti, comunicazioni di variante o risposte a richieste di prezzo, il risultato deve reggere il confronto con questi: concreto, onesto, un solo messaggio, prossimo passo chiaro.

Tre esempi completi (input compilato + output di riferimento). Servono a due cose: vedere COME si compilano i campi (con fatti veri e specifici, non genericità) e sapere che qualità pretendere dall'AI — se l'output che ricevi è peggio di questi, rilancia con "più concreto, meno frasi fatte".

## Esempio 1 — Prompt 7.1 (primo sollecito) compilato

**Input compilato:**
> Fattura n. 24/2026 del 12/06/2026 — Importo: 4.850 € — Lavoro: rifacimento bagno
> Scadenza: 12/07/2026 — Giorni di ritardo: 9
> Cliente: privato — Rapporto: buono, mai problemi
> Malumori durante i lavori: no
> IBAN: IT60X0542811101000000123456

**Output di riferimento (versione WhatsApp):**
> Buongiorno sig. Martini! Spero vi stiate godendo il bagno nuovo. Le scrivo solo perché la fattura del saldo (n. 24, 4.850 €) risultava in scadenza il 12 luglio — sarà sfuggita, capita. Le rigiro l'IBAN qui sotto per comodità. Se invece c'è qualsiasi cosa da chiarire mi chiami pure. Grazie!
> IT60X0542811101000000123456

*Perché è buona: dà per scontata la buona fede, un solo messaggio, zero tono da recupero crediti, l'IBAN subito lì. Nota il "PER ME" che il prompt genera in coda: secondo sollecito in agenda per il giorno +8.*

## Esempio 2 — Prompt 2.2 (imprevisto e variante) compilato

**Input compilato:**
> Lavorazione: demolizione pavimento bagno — Problema: massetto sbriciolato e sottofondo inconsistente, non ancorabile
> Prevedibile? No, non visibile prima della demolizione
> Se non si interviene: il nuovo pavimento si fessura entro pochi mesi
> Soluzione: rimozione completa sottofondo e nuovo massetto alleggerito — Costo: 1.150 € — Giorni extra: 3
> Alternativa: nessuna seria — Foto: sì, 4

**Output di riferimento:**
> Buongiorno sig.ra Ferri, la aggiorno subito su una cosa emersa stamattina. Rimosso il pavimento, abbiamo trovato il massetto sottostante sbriciolato: non era visibile prima di demolire, e su un fondo così il pavimento nuovo si fessurerebbe nel giro di pochi mesi. Le allego 4 foto.
> La soluzione corretta è rimuovere tutto il sottofondo e rifare il massetto: 1.150 € e 3 giorni in più sul programma. Un'alternativa seria purtroppo non c'è — coprire e basta significherebbe rifare il lavoro tra un anno.
> Per procedere mi serve il suo ok scritto anche qui su WhatsApp. Nel frattempo la squadra avanza sull'impianto idrico, quindi non perdiamo la giornata. Se vuole ci sentiamo al telefono oggi: sono disponibile dopo le 17.

*Perché è buona: notizia nella prima frase, onestà sul "non visibile prima", foto, un prezzo e una data, l'ok scritto richiesto, e il cantiere che intanto non si ferma.*

## Esempio 3 — Prompt 8.5 (richiesta generica di prezzo) compilato

**Input compilato:**
> Richiesta: "Salve, quanto costa rifare un bagno di 6 mq? Grazie" — via WhatsApp
> Forbice realistica in zona: 7.000–14.000 €

**Output di riferimento:**
> Buongiorno! Domanda giusta, le do numeri veri: un bagno di 6 mq rifatto completo va in genere dai 7.000 ai 14.000 €. I tre fattori che spostano la cifra: quanto si demolisce (solo rivestimenti o tutto, impianti compresi), la fascia dei materiali che sceglie, e lo stato di scarichi e tubazioni sotto — che si vede solo aprendo.
> Due domande per inquadrarla meglio: di che anno è la casa? E quando vorrebbe partire coi lavori?
> Se vuole un numero vero e non una forbice, il sopralluogo è gratuito e senza impegno: 30 minuti e le preparo un preventivo voce per voce. Questa settimana ho disponibilità giovedì e venerdì pomeriggio.

*Perché è buona: forbice onesta subito (niente "dipende"), competenza mostrata nei 3 fattori, due domande che qualificano senza interrogare, chiusura con un passo concreto e due date.*

---`,
  },
];
