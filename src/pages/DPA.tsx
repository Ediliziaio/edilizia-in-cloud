import LegalLayout from "@/components/legal/LegalLayout";

export default function DPA() {
  return (
    <LegalLayout
      title="Data Processing Agreement (DPA)"
      metaDescription="Accordo sul trattamento dei dati ex art. 28 GDPR tra cliente (titolare) ed Edilizia in Cloud (responsabile). Domus Group S.r.l."
      lastUpdate="30 ottobre 2026"
      downloadHref="/legal/Edilizia-in-Cloud_DPA.pdf"
      currentPath="/dpa"
    >
      <p>
        <strong>Accordo per il Trattamento dei Dati Personali — Data Processing Agreement (DPA) — art. 28 GDPR.</strong>{" "}
        Costituisce parte integrante e sostanziale dei Termini e Condizioni del Servizio &quot;Edilizia in Cloud&quot;.
        Si applica a tutti i Clienti che utilizzano la Piattaforma a partire dalla Data di Efficacia.
      </p>

      <p>
        <strong>Versione:</strong> 1.2 — <strong>Ultimo aggiornamento:</strong> 30 ottobre 2026.
      </p>

      <blockquote>
        <strong>Premessa operativa.</strong> Il presente DPA si intende automaticamente sottoscritto dal Cliente al
        momento dell&apos;accettazione dei Termini e Condizioni del Servizio. Non è quindi necessaria una sottoscrizione
        separata, salvo che il Cliente richieda espressamente, per i propri requisiti interni di compliance, la firma di
        una copia controfirmata. In tal caso, è possibile farne richiesta a{" "}
        <a href="mailto:info@ediliziaincloud.com">info@ediliziaincloud.com</a>.
      </blockquote>

      <h2>Indice</h2>
      <ol>
        <li>Premesse</li>
        <li>Definizioni</li>
        <li>Oggetto e durata del DPA</li>
        <li>Ruoli delle Parti</li>
        <li>Obblighi del Titolare (Cliente)</li>
        <li>Obblighi del Responsabile (Edilizia in Cloud)</li>
        <li>Sub-responsabili del trattamento</li>
        <li>Trasferimenti extra-UE</li>
        <li>Misure di sicurezza tecniche e organizzative</li>
        <li>Notifica delle violazioni di dati personali</li>
        <li>Assistenza al Titolare</li>
        <li>Audit e ispezioni</li>
        <li>Restituzione e cancellazione dei dati</li>
        <li>Responsabilità e indennità</li>
        <li>Modifiche al DPA</li>
        <li>Legge applicabile e foro competente</li>
        <li>Allegato 1 — Descrizione del trattamento</li>
        <li>Allegato 2 — Misure di sicurezza tecniche e organizzative (TOM)</li>
        <li>Allegato 3 — Sub-responsabili autorizzati</li>
      </ol>

      <h2>1. Premesse</h2>
      <p>
        <strong>1.1</strong> Il presente Accordo per il Trattamento dei Dati Personali (il &quot;DPA&quot;) è stipulato
        tra:
      </p>
      <ul>
        <li>
          il <strong>Cliente</strong>, ovvero la persona giuridica o fisica che ha sottoscritto i Termini e Condizioni
          del Servizio &quot;Edilizia in Cloud&quot; (di seguito anche il &quot;Titolare&quot;); e
        </li>
        <li>
          <strong>Domus Group S.r.l.</strong>, con sede in Via Aurelio Saffi 29, 20123 Milano (MI), P.IVA 13132010961
          (di seguito &quot;Edilizia in Cloud&quot;, la &quot;Società&quot; o il &quot;Responsabile&quot;);
        </li>
      </ul>
      <p>(congiuntamente le &quot;Parti&quot; e singolarmente la &quot;Parte&quot;).</p>
      <p>
        <strong>1.2</strong> Il presente DPA è stipulato ai sensi dell&apos;art. 28 del Regolamento (UE) 2016/679
        (&quot;GDPR&quot;) e disciplina il trattamento dei Dati Personali eseguito dalla Società per conto del Cliente
        nell&apos;ambito dell&apos;erogazione del servizio software-as-a-service &quot;Edilizia in Cloud&quot; (il
        &quot;Servizio&quot;).
      </p>
      <p>
        <strong>1.3</strong> Il presente DPA costituisce parte integrante e sostanziale dei Termini e Condizioni del
        Servizio. In caso di contrasto tra le previsioni dei Termini e Condizioni e quelle del presente DPA in materia
        di trattamento di Dati Personali, prevalgono le previsioni del presente DPA.
      </p>

      <h2>2. Definizioni</h2>
      <p>
        Ai fini del presente DPA, i termini definiti hanno il significato loro attribuito dal GDPR. In particolare:
      </p>
      <ul>
        <li>
          <strong>&quot;Dati Personali&quot;:</strong> qualsiasi informazione riguardante una persona fisica
          identificata o identificabile, che il Cliente carica o gestisce nella Piattaforma in qualità di Titolare, ai
          sensi dell&apos;art. 4, n. 1) GDPR;
        </li>
        <li>
          <strong>&quot;Trattamento&quot;:</strong> qualsiasi operazione o insieme di operazioni eseguite sui Dati
          Personali, ai sensi dell&apos;art. 4, n. 2) GDPR;
        </li>
        <li>
          <strong>&quot;Interessato&quot;:</strong> la persona fisica cui si riferiscono i Dati Personali;
        </li>
        <li>
          <strong>&quot;Sub-responsabile&quot;:</strong> il fornitore terzo nominato dalla Società ai sensi
          dell&apos;art. 28, par. 2 e 4, GDPR;
        </li>
        <li>
          <strong>&quot;Violazione di Dati Personali&quot; (o &quot;Data Breach&quot;):</strong> la violazione di
          sicurezza che comporta accidentalmente o in modo illecito la distruzione, la perdita, la modifica, la
          divulgazione non autorizzata o l&apos;accesso ai Dati Personali, ai sensi dell&apos;art. 4, n. 12) GDPR;
        </li>
        <li>
          <strong>&quot;Autorità di controllo&quot;:</strong> l&apos;Autorità Garante per la Protezione dei Dati
          Personali italiana o altra autorità di controllo competente ai sensi del GDPR;
        </li>
        <li>
          <strong>&quot;Istruzioni Documentate&quot;:</strong> le istruzioni del Titolare, contenute nel presente DPA,
          nei Termini e Condizioni del Servizio, nelle configurazioni della Piattaforma operate dal Cliente, e in
          eventuali ulteriori istruzioni scritte impartite dal Cliente alla Società.
        </li>
      </ul>

      <h2>3. Oggetto e durata del DPA</h2>
      <p>
        <strong>3.1</strong> Il presente DPA disciplina i diritti e gli obblighi delle Parti in relazione al
        Trattamento dei Dati Personali eseguito dalla Società in qualità di Responsabile per conto del Cliente in
        qualità di Titolare, in occasione dell&apos;erogazione del Servizio.
      </p>
      <p>
        <strong>3.2</strong> La descrizione del Trattamento (oggetto, durata, natura, finalità, categorie di
        Interessati e di Dati) è dettagliata nell&apos;Allegato 1.
      </p>
      <p>
        <strong>3.3</strong> Il presente DPA ha efficacia dalla data di accettazione dei Termini e Condizioni del
        Servizio da parte del Cliente e produce i propri effetti per tutta la durata del rapporto contrattuale, oltre
        che per il periodo necessario all&apos;espletamento delle operazioni di restituzione e/o cancellazione dei Dati
        Personali successive alla cessazione del contratto.
      </p>
      <p>
        <strong>3.4</strong> Le previsioni del presente DPA restano altresì efficaci, anche dopo la cessazione del
        contratto, limitatamente ai dati che la Società continua a conservare per conto del Cliente in forza di un
        obbligo di legge, e in particolare alle evidenze della Firma Elettronica Avanzata (FEA) conservate per 20 anni ai
        sensi dell&apos;art. 57 del DPCM 22 febbraio 2013 (v. art. 13.5), per tutta la durata di tale conservazione.
      </p>

      <h2>4. Ruoli delle Parti</h2>
      <p>
        <strong>4.1</strong> In relazione ai Dati Personali oggetto del presente DPA:
      </p>
      <ul>
        <li>
          il <strong>Cliente</strong> agisce in qualità di Titolare del trattamento ai sensi dell&apos;art. 4, n. 7),
          GDPR;
        </li>
        <li>
          la <strong>Società</strong> agisce in qualità di Responsabile del trattamento ai sensi dell&apos;art. 4, n.
          8), GDPR.
        </li>
      </ul>
      <p>
        <strong>4.2</strong> Resta inteso che, per i Dati Personali relativi alla gestione del rapporto contrattuale
        tra le Parti (registrazione del Cliente, fatturazione, supporto tecnico, comunicazioni commerciali) e per i
        dati di navigazione del Sito, la Società agisce in qualità di Titolare autonomo, secondo le modalità descritte
        nella propria Privacy Policy.
      </p>
      <p>
        <strong>4.3</strong> Nel caso in cui la Società determini autonomamente le finalità e i mezzi del trattamento
        di taluni Dati Personali (ad esempio per la sicurezza informatica del Servizio o per la generazione di dati
        aggregati e anonimi), agirà in qualità di Titolare autonomo per detti specifici trattamenti.
      </p>

      <h2>5. Obblighi del Titolare (Cliente)</h2>
      <p>Il Cliente, in qualità di Titolare del trattamento, dichiara e si impegna a:</p>
      <p>
        <strong>5.1</strong> Trattare i Dati Personali nel rispetto del GDPR e di ogni altra normativa applicabile in
        materia di protezione dei dati personali, ivi compresa la specifica normativa di settore (es. art. 4 dello
        Statuto dei Lavoratori per il monitoraggio dei dipendenti, normativa antiriciclaggio, normativa fiscale).
      </p>
      <p>
        <strong>5.2</strong> Disporre di un&apos;idonea base giuridica (consenso, esecuzione contrattuale, obbligo
        legale, legittimo interesse, ecc.) per ciascun trattamento eseguito tramite la Piattaforma, ai sensi
        dell&apos;art. 6 GDPR.
      </p>
      <p>
        <strong>5.3</strong> Fornire agli Interessati l&apos;informativa privacy ai sensi degli artt. 13 e 14 GDPR,
        nonché raccogliere ogni eventuale consenso necessario.
      </p>
      <p>
        <strong>5.4</strong> In caso di utilizzo di moduli che comportino la geolocalizzazione, il monitoraggio o il
        controllo a distanza dei propri dipendenti (ad esempio: GPS FleetTrack, timbratura geolocalizzata, controllo
        dei tempi di lavoro), aver previamente concluso l&apos;accordo collettivo con le rappresentanze sindacali
        aziendali ovvero ottenuto la previa autorizzazione dell&apos;Ispettorato Nazionale del Lavoro, ai sensi
        dell&apos;art. 4 della L. 300/1970 (&quot;Statuto dei Lavoratori&quot;), come modificato dal D.Lgs. 151/2015.
        Tali adempimenti restano di esclusiva responsabilità del Cliente, il quale tiene la Società indenne da ogni
        pretesa di terzi connessa alla loro mancata o incompleta esecuzione.
      </p>
      <p>
        <strong>5.5</strong> Configurare correttamente la Piattaforma in modo da rispettare i principi di
        minimizzazione, esattezza e limitazione della conservazione dei dati (art. 5 GDPR), evitando di caricare dati
        personali eccedenti, non pertinenti o non più necessari rispetto alle finalità per cui sono stati raccolti.
      </p>
      <p>
        <strong>5.6</strong> Non caricare nella Piattaforma &quot;categorie particolari di dati&quot; ai sensi
        dell&apos;art. 9 GDPR (origine razziale, opinioni politiche, convinzioni religiose, dati genetici, biometrici,
        sanitari, vita o orientamento sessuale) né dati relativi a condanne penali e reati ai sensi dell&apos;art. 10
        GDPR, salvo che ciò sia strettamente necessario all&apos;utilizzo del Servizio (ad esempio: certificati medici
        per la gestione delle assenze, dati di idoneità sanitaria al lavoro), nel qual caso il Cliente dovrà disporre
        di una specifica base giuridica e adottare adeguate misure di protezione aggiuntive. Il Cliente prende atto che
        anche documenti di uso corrente possono contenere categorie particolari di dati: ad esempio i cedolini paga che
        il Cliente carica per i propri dipendenti possono rivelare assenze per malattia, trattenute sindacali o altri
        dati relativi alla salute o all&apos;appartenenza sindacale. Tali documenti sono visibili soltanto agli utenti ai
        quali il Cliente attribuisce i relativi permessi e al dipendente interessato.
      </p>
      <p>
        <strong>5.7</strong> Adottare, all&apos;interno della propria organizzazione, adeguate misure di sicurezza
        tecniche e organizzative complementari a quelle adottate dalla Società (a titolo esemplificativo: gestione
        corretta delle credenziali di accesso, formazione del personale autorizzato, attivazione
        dell&apos;autenticazione a due fattori, gestione tempestiva della disabilitazione di account di personale che
        cessa l&apos;attività).
      </p>
      <p>
        <strong>5.8</strong> Riscontrare direttamente le richieste degli Interessati relative ai Dati Personali
        trattati nella Piattaforma, avvalendosi del supporto della Società ai sensi dell&apos;art. 11 del presente DPA.
      </p>
      <p>
        <strong>5.9</strong> Notificare prontamente alla Società qualsiasi violazione di Dati Personali di cui venga a
        conoscenza e che possa coinvolgere l&apos;infrastruttura del Servizio.
      </p>
      <p>
        <strong>5.10</strong> In relazione alle <strong>Funzionalità AI</strong> della Piattaforma, il Titolare è
        l&apos;unico responsabile dei dati personali che immette nei sistemi AI e dell&apos;uso che fa degli output
        generati. Il Titolare si impegna a non immettere nelle Funzionalità AI categorie particolari di dati (art. 9
        GDPR) o dati relativi a condanne e reati (art. 10 GDPR) salvo che ne ricorrano i presupposti di liceità, e a
        verificare gli output prima di ogni utilizzo. Il Titolare prende atto che, per l&apos;erogazione delle
        Funzionalità AI, i dati strettamente necessari alla singola richiesta possono essere trasmessi ai Fornitori
        AI indicati nell&apos;Allegato 3, in qualità di Sub-responsabili, anche al di fuori dello Spazio Economico
        Europeo (v. art. 8). La Società utilizza i Fornitori AI esclusivamente tramite API commerciali, le cui
        condizioni contrattuali escludono l&apos;utilizzo dei dati inviati per l&apos;addestramento dei modelli [DA
        COMPLETARE: verificare per ciascun fornitore instradato da OpenRouter, in particolare DeepSeek].
      </p>

      <h2>6. Obblighi del Responsabile (Edilizia in Cloud)</h2>
      <p>La Società, in qualità di Responsabile del trattamento, si impegna a:</p>
      <p>
        <strong>6.1</strong> Trattare i Dati Personali esclusivamente sulla base delle Istruzioni Documentate del
        Cliente, anche per quanto riguarda il trasferimento di Dati Personali verso un paese terzo, salvo che il trattamento sia richiesto dal diritto dell&apos;Unione o di uno Stato membro applicabile
        alla Società. In tale caso, la Società informerà il Cliente di tale obbligo prima del trattamento, salvo che il
        diritto applicabile lo vieti per importanti motivi di interesse pubblico.
      </p>
      <p>
        <strong>6.2</strong> Trattare i Dati Personali esclusivamente per le finalità di erogazione del Servizio
        descritte nei Termini e Condizioni e nell&apos;Allegato 1, e non per finalità ulteriori o diverse.
      </p>
      <p>
        <strong>6.3</strong> Garantire che le persone autorizzate al trattamento dei Dati Personali nell&apos;ambito
        della propria organizzazione siano vincolate al rispetto della riservatezza mediante apposito impegno
        contrattuale o vincolo legale di natura analoga, e che ricevano adeguata formazione in materia di protezione
        dei dati personali.
      </p>
      <p>
        <strong>6.4</strong> Adottare le misure di sicurezza tecniche e organizzative descritte all&apos;art. 9 del
        presente DPA e nell&apos;Allegato 2, in conformità all&apos;art. 32 GDPR.
      </p>
      <p>
        <strong>6.5</strong> Avvalersi di Sub-responsabili soltanto nelle modalità previste dall&apos;art. 7 del
        presente DPA.
      </p>
      <p>
        <strong>6.6</strong> Tenendo conto della natura del trattamento, assistere il Cliente con misure tecniche e
        organizzative adeguate, nella misura in cui ciò sia possibile, al fine di soddisfare gli obblighi del Cliente
        di dare seguito alle richieste degli Interessati ai sensi del Capo III del GDPR.
      </p>
      <p>
        <strong>6.7</strong> Assistere il Cliente nel garantire il rispetto degli obblighi di cui agli artt. 32-36
        GDPR, tenendo conto della natura del trattamento e delle informazioni a sua disposizione.
      </p>
      <p>
        <strong>6.8</strong> Su scelta del Cliente, cancellare o restituire tutti i Dati Personali al termine della
        prestazione dei servizi, secondo le modalità di cui all&apos;art. 13 del presente DPA.
      </p>
      <p>
        <strong>6.9</strong> Mettere a disposizione del Cliente tutte le informazioni necessarie a dimostrare il
        rispetto degli obblighi di cui all&apos;art. 28 GDPR e consentire al Cliente di effettuare audit, secondo le
        modalità di cui all&apos;art. 12 del presente DPA.
      </p>
      <p>
        <strong>6.10</strong> Informare immediatamente il Cliente qualora, a parere della Società, un&apos;istruzione
        del Titolare violi il GDPR o altre disposizioni in materia di protezione dei dati.
      </p>
      <p>
        <strong>6.11</strong> Tenere un registro delle attività di trattamento svolte per conto del Cliente ai sensi
        dell&apos;art. 30, par. 2, GDPR.
      </p>
      <p>
        <strong>6.12</strong> Nominare, ove richiesto dalla normativa, un Responsabile della Protezione dei Dati (DPO)
        ai sensi degli artt. 37-39 GDPR. [DA COMPLETARE: indicare se la Società ha nominato un DPO e i relativi
        contatti; in mancanza, il punto di contatto privacy è{" "}
        <a href="mailto:info@ediliziaincloud.com">info@ediliziaincloud.com</a>.]
      </p>
      <p>
        <strong>6.13</strong> Non accedere ai contenuti caricati dal Cliente se non nella misura necessaria a erogare
        il Servizio, a fornire assistenza su richiesta del Cliente o dei suoi utenti, a garantire la sicurezza e la
        continuità del Servizio o ad adempiere a un obbligo di legge.
      </p>

      <h2>7. Sub-responsabili del trattamento</h2>
      <p>
        <strong>7.1</strong> Il Cliente autorizza espressamente la Società ad avvalersi di Sub-responsabili per
        l&apos;erogazione del Servizio, ai sensi dell&apos;art. 28, par. 2, GDPR. L&apos;elenco dei Sub-responsabili
        autorizzati al momento dell&apos;accettazione del presente DPA è riportato nell&apos;Allegato 3.
      </p>
      <p>
        <strong>7.2</strong> La Società si impegna a:
      </p>
      <ul>
        <li>
          stipulare con ciascun Sub-responsabile un accordo scritto che imponga al Sub-responsabile obblighi di
          protezione dei dati di livello equivalente a quelli previsti dal presente DPA;
        </li>
        <li>
          selezionare Sub-responsabili che presentino garanzie sufficienti per mettere in atto misure tecniche e
          organizzative adeguate;
        </li>
        <li>
          rispondere pienamente nei confronti del Cliente dell&apos;inadempimento del Sub-responsabile ai propri
          obblighi in materia di protezione dei dati.
        </li>
      </ul>
      <p>
        <strong>7.3</strong> La Società si riserva il diritto di modificare l&apos;elenco dei Sub-responsabili in
        qualsiasi momento, ad esempio per aggiungere nuovi fornitori, sostituire fornitori esistenti o cessare il
        rapporto con uno di essi. La Società notificherà tali modifiche al Cliente con un preavviso di almeno 30
        giorni, mediante:
      </p>
      <ul>
        <li>aggiornamento dell&apos;Allegato 3 del presente DPA, pubblicato su questa pagina; e</li>
        <li>comunicazione email all&apos;indirizzo di contatto del Cliente e/o notifica all&apos;interno della Piattaforma.</li>
      </ul>
      <p>
        <strong>7.3-bis</strong> I fornitori integrati nel codice della Piattaforma ma non attivi alla data del
        presente DPA non sono elencati nell&apos;Allegato 3 e non ricevono Dati Personali del Cliente. La loro eventuale
        attivazione segue la procedura di cui agli artt. 7.3 e 7.4.
      </p>
      <p>
        <strong>7.4</strong> Il Cliente ha facoltà di opporsi all&apos;inclusione di un nuovo Sub-responsabile entro 15
        giorni dalla notifica, comunicando la propria opposizione, motivata da ragionevoli motivi attinenti alla
        protezione dei dati, all&apos;indirizzo{" "}
        <a href="mailto:info@ediliziaincloud.com">info@ediliziaincloud.com</a>. In tale caso, le Parti coopereranno
        in buona fede per individuare una soluzione tecnica alternativa. Qualora non sia possibile individuare una
        soluzione ragionevole entro 30 giorni, ciascuna Parte avrà facoltà di risolvere il contratto del Servizio
        (limitatamente alle funzionalità interessate) con effetto immediato.
      </p>
      <p>
        <strong>7.5</strong> La mancata opposizione del Cliente entro il termine di cui al precedente comma comporta
        l&apos;accettazione tacita del nuovo Sub-responsabile.
      </p>
      <p>
        <strong>7.6</strong> La Società può avvalersi di Sub-responsabili del trattamento senza preavviso
        esclusivamente nei seguenti casi: (i) variazioni della denominazione sociale o trasferimenti di ramo
        d&apos;azienda di un Sub-responsabile esistente; (ii) sostituzione urgente di un Sub-responsabile per ragioni
        di sicurezza, continuità del Servizio o altre cause di forza maggiore. In tali casi, la Società ne darà
        comunicazione al Cliente nel più breve tempo possibile.
      </p>

      <h2>8. Trasferimenti extra-UE</h2>
      <p>
        <strong>8.1</strong> Alcuni Sub-responsabili possono trattare i Dati Personali al di fuori dello Spazio
        Economico Europeo (SEE), tipicamente negli Stati Uniti d&apos;America. Il database, l&apos;autenticazione e
        lo storage dei file della Piattaforma risiedono invece nell&apos;Unione Europea (Irlanda). Il Cliente prende
        atto dei trasferimenti indicati nell&apos;Allegato 3 e li autorizza per quanto strettamente necessario
        all&apos;erogazione del Servizio.
      </p>
      <p>
        <strong>8.2</strong> Per ogni trasferimento extra-UE, la Società garantisce la presenza di idonee garanzie ai
        sensi degli artt. 44-49 GDPR, in particolare:
      </p>
      <ul>
        <li>
          <strong>Decisioni di adeguatezza</strong> della Commissione europea (art. 45 GDPR), ove disponibili — ad
          esempio l&apos;EU-US Data Privacy Framework per i fornitori statunitensi che vi abbiano aderito;
        </li>
        <li>
          in assenza di decisione di adeguatezza, <strong>Clausole Contrattuali Tipo</strong> approvate dalla
          Commissione europea con la decisione (UE) 2021/914, eventualmente integrate da misure tecniche e
          organizzative supplementari (cifratura, pseudonimizzazione, controlli di accesso aggiuntivi);
        </li>
        <li>
          in casi residuali, una delle <strong>deroghe</strong> previste dall&apos;art. 49 GDPR.
        </li>
      </ul>
      <p>
        <strong>8.2-bis</strong> <strong>Repubblica Popolare Cinese.</strong> Tra i modelli AI raggiungibili
        tramite OpenRouter vi sono i modelli DeepSeek. Qualora una richiesta sia servita dall&apos;infrastruttura di
        DeepSeek, i dati della richiesta sono trasferiti in Cina, paese per il quale non esiste una decisione di
        adeguatezza della Commissione europea. [DA COMPLETARE: indicare la garanzia ex art. 46 GDPR effettivamente in
        essere oppure la misura adottata, ad es. esclusione dell&apos;instradamento verso l&apos;infrastruttura di
        DeepSeek e uso dei soli fornitori che ospitano i modelli DeepSeek in UE/USA. In assenza di una garanzia, le
        richieste contenenti Dati Personali non devono essere instradate verso tale infrastruttura.]
      </p>
      <p>
        <strong>8.3</strong> Una copia delle garanzie adottate (estratti delle Clausole Contrattuali Tipo,
        certificazioni, attestazioni di adesione al Data Privacy Framework) è messa a disposizione del Cliente su
        richiesta scritta a <a href="mailto:info@ediliziaincloud.com">info@ediliziaincloud.com</a>.
      </p>

      <h2>9. Misure di sicurezza tecniche e organizzative</h2>
      <p>
        <strong>9.1</strong> La Società adotta misure di sicurezza tecniche e organizzative adeguate ai sensi
        dell&apos;art. 32 GDPR, tenendo conto dello stato dell&apos;arte, dei costi di attuazione, della natura,
        dell&apos;oggetto, del contesto e delle finalità del trattamento, nonché del rischio di varia probabilità e
        gravità per i diritti e le libertà delle persone fisiche.
      </p>
      <p>
        <strong>9.2</strong> Le misure di sicurezza adottate sono dettagliate nell&apos;Allegato 2. Tali misure sono
        soggette a revisione e aggiornamento periodici per riflettere l&apos;evoluzione tecnologica e dei rischi, fermo
        restando che la Società non ridurrà unilateralmente il livello complessivo di sicurezza durante la vigenza del
        presente DPA.
      </p>

      <h2>10. Notifica delle violazioni di dati personali</h2>
      <p>
        <strong>10.1</strong> Qualora la Società venga a conoscenza di una Violazione di Dati Personali che riguardi i
        Dati Personali trattati per conto del Cliente, ne darà notifica al Cliente senza ingiustificato ritardo e, ove
        possibile, <strong>entro 48 ore</strong> dalla scoperta della Violazione.
      </p>
      <p>
        <strong>10.2</strong> La notifica al Cliente conterrà, nella misura in cui le informazioni siano disponibili
        al momento della notifica:
      </p>
      <ul>
        <li>
          la descrizione della natura della Violazione, delle categorie di Interessati e di Dati Personali interessati
          e del numero approssimativo degli stessi;
        </li>
        <li>
          il nome e i dati di contatto del DPO o di altro punto di contatto presso il quale ottenere ulteriori
          informazioni;
        </li>
        <li>la descrizione delle probabili conseguenze della Violazione;</li>
        <li>
          la descrizione delle misure adottate o di cui si propone l&apos;adozione per porre rimedio alla Violazione e
          per attenuarne i possibili effetti negativi.
        </li>
      </ul>
      <p>
        <strong>10.3</strong> La Società collaborerà ragionevolmente con il Cliente per assisterlo
        nell&apos;adempimento dei propri obblighi di notifica all&apos;Autorità di controllo (art. 33 GDPR) e di
        comunicazione agli Interessati (art. 34 GDPR), restando inteso che tali obblighi di notifica e comunicazione
        gravano sul Cliente in qualità di Titolare.
      </p>
      <p>
        <strong>10.4</strong> La notifica al Cliente di una Violazione non costituisce, di per sé, ammissione di
        responsabilità o colpa da parte della Società.
      </p>

      <h2>11. Assistenza al Titolare</h2>
      <p>
        <strong>11.1</strong> Tenendo conto della natura del trattamento e nella misura in cui ciò sia possibile, la
        Società assiste il Cliente con misure tecniche e organizzative adeguate per:
      </p>
      <ul>
        <li>
          dare seguito alle richieste degli Interessati di esercizio dei diritti di cui agli artt. 15-22 GDPR (accesso,
          rettifica, cancellazione, limitazione, portabilità, opposizione);
        </li>
        <li>garantire il rispetto degli obblighi di sicurezza (art. 32 GDPR);</li>
        <li>gestire le notifiche di Violazioni (artt. 33 e 34 GDPR);</li>
        <li>
          condurre eventuali Valutazioni d&apos;Impatto sulla Protezione dei Dati (DPIA) ai sensi dell&apos;art. 35
          GDPR;
        </li>
        <li>
          condurre eventuali consultazioni preventive con l&apos;Autorità di controllo ai sensi dell&apos;art. 36
          GDPR.
        </li>
      </ul>
      <p>
        <strong>11.2</strong> La Piattaforma mette a disposizione del Cliente strumenti self-service (consultazione,
        modifica, esportazione e cancellazione dei dati, gestione degli utenti e dei relativi permessi, esportazione dei
        dati dell&apos;azienda) che consentono al Cliente di rispondere autonomamente a gran parte delle richieste degli
        Interessati. La Società fornirà supporto manuale solo ove tali
        strumenti non consentano di soddisfare la richiesta.
      </p>
      <p>
        <strong>11.3</strong> Qualora la richiesta del Cliente di assistenza richieda un impegno significativo
        eccedente l&apos;ordinaria assistenza connessa all&apos;erogazione del Servizio, la Società potrà richiedere il
        rimborso dei costi ragionevolmente sostenuti, secondo le tariffe orarie comunicate al Cliente prima
        dell&apos;esecuzione delle attività.
      </p>
      <p>
        <strong>11.4</strong> Qualora la Società riceva direttamente una richiesta di esercizio di diritti da parte di
        un Interessato, la trasmetterà tempestivamente al Cliente, senza darvi seguito autonomamente, e indicherà
        all&apos;Interessato di rivolgersi al Cliente.
      </p>

      <h2>12. Audit e ispezioni</h2>
      <p>
        <strong>12.1</strong> La Società mette a disposizione del Cliente, su richiesta scritta, tutte le informazioni
        ragionevolmente necessarie a dimostrare il rispetto degli obblighi previsti dall&apos;art. 28 GDPR e dal
        presente DPA. Tali informazioni includono, in via prioritaria:
      </p>
      <ul>
        <li>
          copia del presente DPA e degli accordi con i Sub-responsabili (in forma redatta per la riservatezza);
        </li>
        <li>
          le certificazioni e i rapporti di audit dei principali Sub-responsabili infrastrutturali (ad es. il rapporto
          SOC 2 di Supabase e le certificazioni ISO/IEC 27001 di Amazon Web Services e Cloudflare), nei limiti in cui
          tali fornitori ne consentano la condivisione. La Società non dispone, alla data del presente DPA, di
          certificazioni di sicurezza proprie;
        </li>
        <li>
          una descrizione aggiornata delle misure di cui all&apos;Allegato 2 e, ove disponibili, le relazioni sintetiche
          di eventuali verifiche di sicurezza condotte da terzi;
        </li>
        <li>la Privacy Policy, la Cookie Policy e ogni ulteriore documentazione pubblica relativa al trattamento.</li>
      </ul>
      <p>
        <strong>12.2</strong> Qualora le informazioni di cui al precedente comma non siano sufficienti, il Cliente ha
        diritto di effettuare audit, ispezioni o richieste documentali aggiuntive, alle seguenti condizioni:
      </p>
      <ul>
        <li>
          l&apos;audit è condotto a spese del Cliente, salvo che riveli inadempimenti significativi della Società;
        </li>
        <li>
          il Cliente fornisce un preavviso scritto di almeno 30 giorni, salvo nei casi di Violazione di Dati Personali
          in corso o di indagine dell&apos;Autorità di controllo;
        </li>
        <li>l&apos;audit non può svolgersi più di una volta all&apos;anno, salvo nei casi di cui sopra;</li>
        <li>
          l&apos;audit è condotto durante l&apos;orario lavorativo, in modo da minimizzare l&apos;impatto sul Servizio,
          e nel rispetto delle policy di sicurezza e riservatezza della Società;
        </li>
        <li>
          il Cliente o il revisore incaricato sono tenuti alla riservatezza di tutte le informazioni acquisite durante
          l&apos;audit;
        </li>
        <li>l&apos;audit non può comprendere l&apos;accesso a dati o sistemi di altri clienti della Società.</li>
      </ul>
      <p>
        <strong>12.3</strong> In alternativa all&apos;audit diretto, la Società potrà mettere a disposizione del
        Cliente i risultati di audit indipendenti già condotti da soggetti terzi qualificati (es. revisori, organismi
        di certificazione), nei limiti consentiti dagli accordi con tali terzi.
      </p>

      <h2>13. Restituzione e cancellazione dei dati</h2>
      <p>
        <strong>13.1</strong> Al termine del rapporto contrattuale, per qualunque causa, la Società consente al
        Cliente di esportare i propri Dati Personali dalla Piattaforma in formati strutturati e di uso comune (ad es.
        JSON e CSV; XML per le fatture elettroniche; PDF per i documenti generati) per un periodo di{" "}
        <strong>30 giorni</strong> dalla data di cessazione.
      </p>
      <p>
        <strong>13.2</strong> Decorsi 30 giorni, la Società procederà alla cancellazione definitiva dei Dati Personali
        dell&apos;azienda Cliente dai sistemi di produzione, mediante una procedura automatica di eliminazione, fatti
        salvi:
      </p>
      <ul>
        <li>
          i dati che la Società è tenuta a conservare in forza di un obbligo di legge gravante su di essa, per il tempo
          strettamente necessario;
        </li>
        <li>le evidenze della Firma Elettronica Avanzata, disciplinate dall&apos;art. 13.5;</li>
        <li>
          i dati conservati nei backup di sicurezza, che saranno cancellati secondo il normale ciclo di rotazione dei
          backup, comunque entro un massimo di 90 giorni;
        </li>
        <li>i dati strettamente necessari alla difesa di un diritto in giudizio.</li>
      </ul>
      <p>
        <strong>13.3</strong> Su richiesta scritta del Cliente, la Società rilascerà un&apos;attestazione formale di
        avvenuta cancellazione dei Dati Personali.
      </p>
      <p>
        <strong>13.4</strong> In alternativa alla cancellazione, su espressa richiesta del Cliente, la Società può
        procedere alla restituzione dei Dati Personali in formato strutturato e di uso comune. Eventuali servizi
        professionali di assistenza alla migrazione potranno essere oggetto di tariffazione separata.
      </p>
      <p>
        <strong>13.5</strong> <strong>Firma Elettronica Avanzata.</strong> Se il Cliente ha attivato la FEA (funzione
        facoltativa, disattivata di default), la Società conserva per suo conto, per <strong>20 anni</strong> ai sensi
        dell&apos;art. 57, comma 1, del DPCM 22 febbraio 2013, i dati identificativi dei firmatari, le copie dei
        documenti di riconoscimento, la dichiarazione di accettazione e le evidenze del processo di firma (codici OTP
        inviati e verificati, indirizzi IP, date e ore, impronte dei documenti firmati). Tale conservazione prosegue
        anche dopo la cessazione del contratto, limitatamente a queste finalità di legge: i dati sono custoditi in
        archivi ad accesso riservato, non sono utilizzati per altri scopi e sono messi a disposizione del Cliente o
        dell&apos;Interessato su richiesta, anche per la tutela di un diritto in giudizio. Decorso il termine, sono
        cancellati. [DA COMPLETARE: confermare se, in alternativa, il Cliente può chiedere la consegna delle evidenze
        assumendo direttamente l&apos;obbligo di conservazione.]
      </p>

      <h2>14. Responsabilità e indennità</h2>
      <p>
        <strong>14.1</strong> La responsabilità delle Parti per inadempimento degli obblighi del presente DPA è
        regolata dagli artt. 82 GDPR e dalla normativa applicabile.
      </p>
      <p>
        <strong>14.2</strong> Ferma restando la responsabilità di ciascuna Parte ai sensi dell&apos;art. 82 GDPR nei
        confronti degli Interessati, le Parti convengono che la responsabilità reciproca derivante dal presente DPA è
        soggetta alle limitazioni di responsabilità previste dai Termini e Condizioni del Servizio, ferma restando la
        nullità di clausole limitative in caso di dolo o colpa grave o di violazione di norme inderogabili.
      </p>
      <p>
        <strong>14.2-bis</strong> Le Parti danno atto che il Cliente, in qualità di Titolare, determina autonomamente
        finalità e mezzi del trattamento e che la Società, in qualità di Responsabile, agisce esclusivamente sulla base
        delle istruzioni documentate del Cliente. Conseguentemente, qualora la Società sia tenuta a corrispondere a un
        Interessato o all&apos;Autorità un risarcimento o una sanzione per una violazione imputabile, in tutto o in
        parte, alle istruzioni, alle scelte o agli inadempimenti del Cliente, quest&apos;ultimo rimborserà alla Società
        la quota di responsabilità ad esso ascrivibile ai sensi dell&apos;art. 82, par. 5, GDPR.
      </p>
      <p>
        <strong>14.3</strong> Il Cliente tiene indenne la Società da ogni richiesta di risarcimento, sanzione o pretesa
        proveniente da Interessati, Autorità di controllo o terzi, derivante da:
      </p>
      <ul>
        <li>violazione, da parte del Cliente, degli obblighi di cui all&apos;art. 5 del presente DPA;</li>
        <li>
          caricamento nella Piattaforma di Dati Personali eccedenti, non pertinenti, illeciti o privi di idonea base
          giuridica;
        </li>
        <li>
          mancato adempimento, da parte del Cliente, delle proprie obbligazioni di Titolare ai sensi del GDPR (in
          particolare: informativa, raccolta del consenso, esercizio dei diritti, accordo sindacale ex art. 4 dello
          Statuto dei Lavoratori).
        </li>
      </ul>

      <h2>15. Modifiche al DPA</h2>
      <p>
        <strong>15.1</strong> La Società si riserva il diritto di aggiornare il presente DPA per riflettere modifiche
        normative, organizzative o tecniche, nonché per recepire indicazioni delle Autorità di controllo o orientamenti
        del Comitato Europeo per la Protezione dei Dati (EDPB).
      </p>
      <p>
        <strong>15.2</strong> Le modifiche al DPA saranno comunicate al Cliente con un preavviso di almeno 30 giorni,
        mediante email o avviso nella Piattaforma. Le modifiche entrano in vigore alla data indicata nella
        comunicazione.
      </p>
      <p>
        <strong>15.3</strong> Qualora le modifiche comportino una riduzione sostanziale delle tutele riconosciute al
        Cliente in qualità di Titolare, il Cliente potrà recedere senza costi entro la data di efficacia delle
        modifiche.
      </p>

      <h2>16. Legge applicabile e foro competente</h2>
      <p>
        <strong>16.1</strong> Il presente DPA è regolato dalla legge italiana e dalle disposizioni del GDPR
        direttamente applicabili.
      </p>
      <p>
        <strong>16.2</strong> Per qualsiasi controversia derivante dal presente DPA o ad esso connessa sarà competente
        in via esclusiva il <strong>Foro di Milano</strong>, in coerenza con quanto previsto dai Termini e Condizioni
        del Servizio.
      </p>

      <h2>Allegato 1 — Descrizione del trattamento</h2>

      <h3>A.1 Oggetto del trattamento</h3>
      <p>
        Trattamento dei Dati Personali necessario all&apos;erogazione del Servizio software-as-a-service &quot;Edilizia
        in Cloud&quot; e alle relative funzionalità sottoscritte dal Cliente.
      </p>

      <h3>A.2 Durata del trattamento</h3>
      <p>
        Per tutta la durata del contratto del Servizio, oltre al periodo di restituzione/cancellazione di cui
        all&apos;art. 13 del presente DPA.
      </p>

      <h3>A.3 Natura e finalità del trattamento</h3>
      <p>
        Il trattamento ha natura automatizzata e include le seguenti operazioni: raccolta, registrazione,
        organizzazione, strutturazione, conservazione, elaborazione, modifica, estrazione, consultazione, comunicazione
        mediante trasmissione, raffronto, interconnessione, limitazione, cancellazione e distruzione dei Dati
        Personali.
      </p>
      <p>
        Le finalità sono limitate all&apos;erogazione del Servizio, come descritto nei Termini e Condizioni e nei
        moduli funzionali sottoscritti dal Cliente, e comprendono in particolare, in funzione dei moduli attivati: la
        gestione di contatti, lead e opportunità commerciali (CRM), inclusa la ricezione dei lead dalle campagne
        pubblicitarie del Cliente; preventivi, contratti e relativa firma (anche con FEA); commesse, cantieri,
        rapportini, presenze e timbrature; personale e documenti dei dipendenti; magazzino, ordini e DDT; fatturazione
        elettronica e tesoreria (inclusa la lettura dei movimenti bancari tramite open banking); comunicazioni con
        clienti, fornitori e collaboratori via email, SMS e WhatsApp; sincronizzazione di caselle email e calendari
        collegati dal Cliente; funzionalità di intelligenza artificiale; backup, sicurezza e assistenza tecnica.
      </p>

      <h3>A.4 Categorie di Interessati</h3>
      <p>
        I Dati Personali trattati possono riferirsi alle seguenti categorie di Interessati, in funzione delle scelte
        operative del Cliente:
      </p>
      <ul>
        <li>
          <strong>Dipendenti, collaboratori e operai</strong> del Cliente, inclusi addetti di cantiere e personale
          tecnico/amministrativo;
        </li>
        <li>
          <strong>Utenti autorizzati</strong> del Cliente alla Piattaforma (referenti, amministratori, capi cantiere);
        </li>
        <li>
          <strong>Clienti finali</strong> del Cliente (committenti, condomini, privati e imprese che ricevono
          prestazioni edili dal Cliente);
        </li>
        <li>
          <strong>Fornitori, subappaltatori, professionisti</strong> con cui il Cliente intrattiene rapporti
          commerciali;
        </li>
        <li>
          <strong>Lead e contatti commerciali</strong> del Cliente, registrati nella Piattaforma o ricevuti dai moduli
          pubblicitari e dai form del Cliente, a fini di gestione di lead, preventivi e CRM;
        </li>
        <li>
          <strong>Firmatari</strong> dei documenti sottoscritti con Firma Elettronica Avanzata, se attivata dal
          Cliente.
        </li>
      </ul>

      <h3>A.5 Categorie di Dati Personali</h3>
      <table>
        <thead>
          <tr>
            <th>Categoria</th>
            <th>Tipologia di dati (esemplificativa)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Dati identificativi e di contatto</td>
            <td>Nome, cognome, ragione sociale, codice fiscale, P.IVA, indirizzo, telefono, email, PEC</td>
          </tr>
          <tr>
            <td>Dati relativi al rapporto di lavoro</td>
            <td>
              Mansione, livello, retribuzione, contratto applicato, presenze, ferie, permessi, malattia, cedolini,
              comunicazioni obbligatorie
            </td>
          </tr>
          <tr>
            <td>Dati di geolocalizzazione</td>
            <td>
              Posizione rilevata al momento della timbratura (entrata, uscita, cambio luogo), se il Cliente la utilizza;
              posizione dei mezzi, in caso di attivazione del modulo FleetTrack
            </td>
          </tr>
          <tr>
            <td>Dati di sicurezza sul lavoro</td>
            <td>DPI assegnati, formazione svolta, idoneità sanitarie, sopralluoghi, incidenti</td>
          </tr>
          <tr>
            <td>Dati contabili e di pagamento</td>
            <td>
              Fatture, scadenzari, IBAN, dati di pagamento; movimenti dei conti bancari del Cliente letti in sola
              lettura tramite open banking (PSD2), che possono riportare nomi e causali di controparti
            </td>
          </tr>
          <tr>
            <td>Dati di cantiere e operativi</td>
            <td>Lavori, preventivi, contratti d&apos;appalto, DDT, materiali, mezzi, rapportini, foto di cantiere</td>
          </tr>
          <tr>
            <td>Comunicazioni</td>
            <td>
              Email, messaggi WhatsApp e SMS scambiati tramite la Piattaforma, note e chat interne, eventi di calendario
              sincronizzati
            </td>
          </tr>
          <tr>
            <td>Dati documentali</td>
            <td>Documenti, file, ticket, allegati caricati nella Piattaforma</td>
          </tr>
          <tr>
            <td>Dati di identificazione dei firmatari (FEA)</td>
            <td>
              Solo se il Cliente attiva la FEA: nome, cognome, codice fiscale, tipo, numero e scadenza del documento di
              riconoscimento e relative immagini, email e cellulare, codici OTP, indirizzo IP, data e ora della firma.
              Non sono trattati dati biometrici
            </td>
          </tr>
          <tr>
            <td>Dati di accesso e di utilizzo</td>
            <td>Credenziali (conservate in forma cifrata), log di accesso e registri delle operazioni rilevanti</td>
          </tr>
          <tr>
            <td>Categorie particolari (art. 9 GDPR)</td>
            <td>
              Solo se caricati dal Cliente: certificati medici, idoneità sanitarie, documenti relativi a salute e
              sicurezza dei lavoratori; cedolini paga, che possono rivelare dati sulla salute (malattia) o
              sull&apos;appartenenza sindacale (trattenute)
            </td>
          </tr>
        </tbody>
      </table>

      <h3>A.6 Conservazione</h3>
      <p>
        Durante il contratto i Dati Personali sono conservati secondo le scelte del Cliente, che può modificarli o
        cancellarli in ogni momento. Alla cessazione si applica l&apos;art. 13: esportazione per 30 giorni, poi
        cancellazione definitiva dai sistemi di produzione e, entro un massimo di 90 giorni, dalle copie di backup. Le
        evidenze della FEA sono conservate per 20 anni (art. 13.5).
      </p>

      <h2>Allegato 2 — Misure di sicurezza tecniche e organizzative (TOM)</h2>

      <h3>B.1 Sicurezza dei dati in transito</h3>
      <ul>
        <li>Cifratura di tutte le comunicazioni tra browser/app e server mediante protocollo TLS;</li>
        <li>Certificati TLS gestiti da Certificate Authority pubbliche con rinnovo automatico.</li>
      </ul>

      <h3>B.2 Sicurezza dei dati a riposo</h3>
      <ul>
        <li>
          Cifratura at-rest del database e dello storage dei file, fornita dall&apos;infrastruttura del Sub-responsabile
          (Supabase su Amazon Web Services, regione eu-west-1, Irlanda);
        </li>
        <li>
          Segreti applicativi (chiavi API, credenziali di servizio, password delle caselle email collegate)
          conservati in un vault cifrato e mai inseriti nel codice sorgente;
        </li>
        <li>
          Token di accesso ai servizi esterni collegati dal Cliente (ad es. Google, Meta) conservati in forma
          cifrata;
        </li>
        <li>Documenti di riconoscimento dei firmatari FEA conservati in un archivio privato non accessibile al pubblico.</li>
      </ul>

      <h3>B.3 Controllo degli accessi</h3>
      <ul>
        <li>Autenticazione delle utenze applicative mediante credenziali personali univoche;</li>
        <li>
          Autenticazione a due fattori (app di autenticazione TOTP o codice via email), che il Cliente può rendere
          obbligatoria per i propri utenti;
        </li>
        <li>
          Controllo degli accessi basato su ruoli e permessi configurabili dal Cliente, secondo il principio del minimo
          privilegio;
        </li>
        <li>
          Row-Level Security attiva su tutte le tabelle del database, che segrega i dati di ciascuna azienda Cliente e
          limita l&apos;accesso in base al ruolo dell&apos;utente;
        </li>
        <li>
          Accessi amministrativi all&apos;infrastruttura limitati al personale autorizzato della Società.
        </li>
      </ul>

      <h3>B.4 Sicurezza infrastrutturale e monitoraggio</h3>
      <ul>
        <li>
          Database, autenticazione, storage e funzioni server ospitati nell&apos;Unione Europea (Irlanda); frontend
          distribuito tramite la rete CDN di Cloudflare, con la relativa protezione da attacchi DDoS;
        </li>
        <li>Registro (audit log) delle operazioni rilevanti eseguite nella Piattaforma;</li>
        <li>Controllo automatico dello stato dei servizi ogni 5 minuti, con avvisi al personale della Società;</li>
        <li>
          Funzioni del database eseguibili da utenti non autenticati ridotte a quelle necessarie (ad es. firma tramite
          link, prenotazioni pubbliche) e censite con il relativo motivo.
        </li>
      </ul>

      <h3>B.5 Backup e continuità operativa</h3>
      <ul>
        <li>Backup automatici dell&apos;infrastruttura del database gestiti dal Sub-responsabile;</li>
        <li>
          Backup settimanale dei dati di ciascuna azienda Cliente, conservato in un archivio privato, con procedura di
          ripristino collaudata (prova di ripristino in ambiente separato);
        </li>
        <li>Possibilità per il Cliente di esportare i propri dati.</li>
      </ul>

      <h3>B.6 Gestione degli incidenti e dei data breach</h3>
      <ul>
        <li>Procedura di gestione degli incidenti di sicurezza;</li>
        <li>Monitoraggio dei sistemi, degli errori e degli accessi;</li>
        <li>Conservazione dei log applicativi e di accesso per il tempo necessario alle finalità di sicurezza;</li>
        <li>
          Procedura di notifica al Cliente entro 48 ore in caso di Violazione di Dati Personali (art. 10 del DPA).
        </li>
      </ul>

      <h3>B.7 Misure organizzative</h3>
      <ul>
        <li>Personale autorizzato al trattamento, istruito e vincolato alla riservatezza;</li>
        <li>Test automatici e controlli sul codice eseguiti prima di ogni rilascio in produzione;</li>
        <li>Aggiornamenti di sicurezza tempestivi delle dipendenze applicative;</li>
        <li>Selezione dei Sub-responsabili sulla base delle garanzie di sicurezza offerte (art. 7.2).</li>
      </ul>

      <h3>B.8 Privacy by design e by default</h3>
      <ul>
        <li>Minimizzazione dei dati raccolti dalla Piattaforma in funzione delle finalità del Servizio;</li>
        <li>
          Funzioni opzionali che comportano trattamenti più delicati (ad es. FEA, geolocalizzazione delle timbrature)
          attivabili solo per scelta del Cliente;
        </li>
        <li>
          Funzionalità self-service per l&apos;esercizio dei diritti degli Interessati e per la cancellazione dei dati;
        </li>
        <li>Cancellazione automatica dei dati delle aziende cessate dopo 30 giorni.</li>
      </ul>

      <h2>Allegato 3 — Sub-responsabili autorizzati</h2>
      <p>
        Il presente Allegato riporta l&apos;elenco dei Sub-responsabili attivi alla data di pubblicazione del DPA ed è
        aggiornato secondo la procedura di cui all&apos;art. 7.3. Alcuni Sub-responsabili ricevono dati solo se il
        Cliente utilizza la relativa funzionalità, come indicato nella colonna &quot;Servizio fornito&quot;.
      </p>

      <table>
        <thead>
          <tr>
            <th>Sub-responsabile</th>
            <th>Servizio fornito</th>
            <th>Ubicazione</th>
            <th>Garanzia trasferimento</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Supabase Inc.</td>
            <td>Database, autenticazione, storage dei file, funzioni server, backup</td>
            <td>UE (Irlanda, AWS eu-west-1)</td>
            <td>Trattamento UE; SCC + DPA per l&apos;eventuale accesso del supporto dagli USA</td>
          </tr>
          <tr>
            <td>Cloudflare, Inc.</td>
            <td>CDN e hosting del frontend (Cloudflare Pages), protezione DDoS</td>
            <td>UE / USA (rete globale)</td>
            <td>DPF + SCC</td>
          </tr>
          <tr>
            <td>Resend, Inc.</td>
            <td>Email transazionali (notifiche, inviti, codici di verifica, documenti)</td>
            <td>USA</td>
            <td>SCC</td>
          </tr>
          <tr>
            <td>Elastic Email Inc.</td>
            <td>Email di marketing inviate dal Cliente, se utilizza la funzione</td>
            <td>[DA COMPLETARE: paese di sede e dei server]</td>
            <td>[DA COMPLETARE]</td>
          </tr>
          <tr>
            <td>Meta Platforms Ireland Ltd.</td>
            <td>WhatsApp Business Cloud API; ricezione dei lead dalle campagne Lead Ads del Cliente, se collegate</td>
            <td>UE (Irlanda) / USA</td>
            <td>DPF + SCC</td>
          </tr>
          <tr>
            <td>DigitalOcean, LLC</td>
            <td>Server che ospita il gateway WhatsApp gestito dalla Società, se il Cliente collega un numero tramite tale canale</td>
            <td>UE (Germania, Francoforte)</td>
            <td>Trattamento UE; DPF + SCC per la società statunitense</td>
          </tr>
          <tr>
            <td>Telnyx LLC</td>
            <td>SMS (ad es. codici di firma FEA, comunicazioni del Cliente)</td>
            <td>UE / USA</td>
            <td>SCC</td>
          </tr>
          <tr>
            <td>Google Ireland Ltd. / Google LLC</td>
            <td>
              Sincronizzazione di Gmail e Google Calendar, solo se collegati dal Cliente; Google Maps e geocodifica
              degli indirizzi; generazione di immagini con modelli Gemini
            </td>
            <td>UE / USA</td>
            <td>DPF + SCC</td>
          </tr>
          <tr>
            <td>OpenRouter, Inc.</td>
            <td>Instradamento delle richieste ai modelli AI di Anthropic, OpenAI, Google e DeepSeek</td>
            <td>USA</td>
            <td>SCC</td>
          </tr>
          <tr>
            <td>Anthropic PBC</td>
            <td>Modelli di linguaggio AI (Claude), tramite OpenRouter</td>
            <td>USA</td>
            <td>SCC</td>
          </tr>
          <tr>
            <td>OpenAI Ireland Ltd. / OpenAI, L.L.C.</td>
            <td>Modelli di linguaggio tramite OpenRouter; embeddings (ricerca semantica) tramite API diretta</td>
            <td>UE (Irlanda) / USA</td>
            <td>DPF + SCC</td>
          </tr>
          <tr>
            <td>DeepSeek (Hangzhou DeepSeek Artificial Intelligence Co., Ltd.)</td>
            <td>Modelli di linguaggio AI, tramite OpenRouter</td>
            <td>Cina, se la richiesta è servita dall&apos;infrastruttura di DeepSeek</td>
            <td>
              Nessuna decisione di adeguatezza. [DA COMPLETARE: garanzia ex art. 46 GDPR o esclusione
              dell&apos;instradamento verso la Cina — v. art. 8.2-bis]
            </td>
          </tr>
          <tr>
            <td>Openapi S.p.A. (openapi.it)</td>
            <td>Trasmissione e ricezione delle fatture elettroniche tramite SDI</td>
            <td>Italia</td>
            <td>Trattamento UE</td>
          </tr>
          <tr>
            <td>Aruba S.p.A.</td>
            <td>
              Canale alternativo per fatture elettroniche SDI e conservazione digitale a norma, solo se scelto
              dall&apos;azienda cliente
            </td>
            <td>Italia</td>
            <td>Trattamento UE</td>
          </tr>
          <tr>
            <td>Distyra (Brightfield Software) — Enable Banking Oy</td>
            <td>
              Open banking in sola lettura (servizio di informazione sui conti, PSD2): saldi e movimenti dei conti del
              Cliente, solo se collegati dal Cliente
            </td>
            <td>UE (Francia, Germania; Finlandia per Enable Banking)</td>
            <td>Trattamento UE</td>
          </tr>
          <tr>
            <td>Stripe Payments Europe Ltd.</td>
            <td>
              Pagamento dell&apos;abbonamento al Servizio. Riguarda i dati di pagamento dell&apos;azienda Cliente, per i
              quali la Società agisce come titolare autonomo (art. 4.2); è indicato qui per completezza
            </td>
            <td>UE (Irlanda) / USA</td>
            <td>DPF + SCC</td>
          </tr>
        </tbody>
      </table>

      <p>
        <strong>Legenda:</strong> SCC = Standard Contractual Clauses (Clausole Contrattuali Tipo della Commissione UE,
        decisione (UE) 2021/914); DPF = EU-US Data Privacy Framework; DPA = Data Processing Agreement con il
        sub-responsabile.
      </p>
      <p>
        <strong>Calendario Apple.</strong> Se il Cliente collega un proprio calendario Apple (iCloud),
        la Piattaforma scambia gli eventi con l&apos;account del Cliente presso tale fornitore, su istruzione
        del Cliente; il fornitore resta un fornitore del Cliente. [DA COMPLETARE: confermare questa qualificazione.]
      </p>

      <h2>Sottoscrizione (opzionale)</h2>
      <p>
        Il presente DPA si intende validamente accettato dal Cliente con l&apos;accettazione dei Termini e Condizioni
        del Servizio. La sottoscrizione del presente blocco è prevista esclusivamente per i Clienti che, in conformità
        ai propri requisiti interni di compliance, richiedano una copia controfirmata del documento.
      </p>

      <h3>Per il Titolare (Cliente)</h3>
      <ul>
        <li>
          <strong>Ragione sociale:</strong> _______________________________
        </li>
        <li>
          <strong>Sede legale:</strong> _______________________________
        </li>
        <li>
          <strong>P.IVA:</strong> _______________________________
        </li>
        <li>
          <strong>Rappresentante legale:</strong> _______________________________
        </li>
        <li>
          <strong>Firma e timbro · Data:</strong> ____ / ____ / ____
        </li>
      </ul>

      <h3>Per il Responsabile (Edilizia in Cloud)</h3>
      <ul>
        <li>
          <strong>Ragione sociale:</strong> Domus Group S.r.l.
        </li>
        <li>
          <strong>Sede legale:</strong> Via Aurelio Saffi 29, 20123 Milano (MI)
        </li>
        <li>
          <strong>P.IVA:</strong> 13132010961
        </li>
        <li>
          <strong>Rappresentante legale:</strong> [DA COMPLETARE: nome e cognome del legale rappresentante]
        </li>
        <li>
          <strong>PEC:</strong>{" "}
          <a href="mailto:domusgroupsrl@legalmail.it">domusgroupsrl@legalmail.it</a>
        </li>
        <li>
          <strong>Contatto privacy:</strong>{" "}
          <a href="mailto:info@ediliziaincloud.com">info@ediliziaincloud.com</a>
        </li>
        <li>
          <strong>Firma e timbro · Data:</strong> ____ / ____ / ____
        </li>
      </ul>

      <p>
        <em>© 2026 Domus Group S.r.l. — Tutti i diritti riservati. P.IVA 13132010961.</em>
      </p>
    </LegalLayout>
  );
}
