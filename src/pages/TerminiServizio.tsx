import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import { useSEO } from "@/hooks/useSEO";

export default function TerminiServizio() {
  useSEO({
    title: "Termini di Servizio — Edilizia in Cloud",
    description:
      "Termini e condizioni di utilizzo del software Edilizia in Cloud di Domus Group S.r.l.",
    canonical: "/termini",
    noindex: true,
  });

  return (
    <div className="min-h-screen bg-white">
      <LandingNavbar />
      <div className="pt-16" />
      <main className="max-w-4xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-bold text-[#1a2744] mb-2">Termini di Servizio</h1>
        <p className="text-sm text-gray-400 mb-10">Ultimo aggiornamento: 26 marzo 2026</p>

        <section className="mb-10">
          <h2 className="text-xl font-bold text-[#1a2744] mb-3">1. Accettazione dei Termini</h2>
          <p className="text-gray-600 leading-relaxed">
            I presenti Termini di Servizio ("Termini") disciplinano l'accesso e l'utilizzo della piattaforma
            software Edilizia in Cloud, fornita da <strong>Domus Group S.r.l.</strong> (di seguito "Fornitore"),
            con sede legale in Via Aurelio Saffi 29, CAP 20123, Milano, P.IVA 13132010961. L'accesso o
            l'utilizzo del servizio da parte dell'utente ("Cliente") costituisce accettazione integrale e
            incondizionata dei presenti Termini. Qualora il Cliente non accetti i presenti Termini, è tenuto a
            cessare immediatamente l'utilizzo del servizio e a richiedere la chiusura del proprio account.
            Il Fornitore si riserva il diritto di modificare i presenti Termini con adeguato preavviso.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-bold text-[#1a2744] mb-3">2. Descrizione del Servizio</h2>
          <p className="text-gray-600 leading-relaxed">
            Edilizia in Cloud è una piattaforma software gestionale in modalità SaaS (Software as a Service)
            progettata specificamente per le imprese edili italiane. Il servizio comprende moduli per la gestione
            dei cantieri, il controllo dei margini e della contabilità di cantiere, la gestione delle risorse
            umane, il CRM, la fatturazione elettronica, la gestione dei preventivi e dei contratti, nonché
            strumenti di marketing operativo. Il Fornitore si riserva il diritto di aggiungere, modificare o
            rimuovere funzionalità del servizio, dandone comunicazione ai Clienti con un preavviso di almeno
            30 giorni nel caso di modifiche sostanziali.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-bold text-[#1a2744] mb-3">3. Account e Responsabilità dell'Utente</h2>
          <p className="text-gray-600 leading-relaxed">
            Il Cliente è responsabile della corretta custodia delle proprie credenziali di accesso e di tutte
            le attività effettuate tramite il proprio account. È fatto divieto al Cliente di condividere le
            proprie credenziali con soggetti terzi non autorizzati o di consentire l'accesso alla piattaforma
            a un numero di utenti superiore a quello previsto dal piano sottoscritto. Il Cliente si impegna a
            utilizzare il servizio in conformità alla legge applicabile, ai presenti Termini e a non effettuare
            attività che possano compromettere la sicurezza, l'integrità o la disponibilità della piattaforma.
            In caso di accesso non autorizzato o sospetto compromissione delle credenziali, il Cliente è tenuto
            a notificarlo immediatamente al Fornitore all'indirizzo{" "}
            <a href="mailto:info@ediliziaincloud.com" className="text-[#0fa68c] hover:underline">
              info@ediliziaincloud.com
            </a>
            .
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-bold text-[#1a2744] mb-3">4. Piani e Pagamenti</h2>
          <p className="text-gray-600 leading-relaxed">
            I servizi sono erogati sulla base di piani in abbonamento con fatturazione mensile o annuale,
            secondo le tariffe indicate nella pagina prezzi del sito web al momento della sottoscrizione.
            Il corrispettivo è dovuto anticipatamente e il mancato pagamento entro 15 giorni dalla scadenza
            della fattura potrà comportare la sospensione dell'accesso al servizio. I prezzi si intendono IVA
            esclusa, salvo diversa indicazione; l'IVA sarà applicata nella misura prevista dalla normativa
            vigente al momento della fatturazione. Il Fornitore si riserva il diritto di modificare le tariffe
            con un preavviso scritto di almeno 60 giorni; il Cliente che non intenda accettare le nuove tariffe
            potrà recedere dal contratto entro tale termine senza penali.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-bold text-[#1a2744] mb-3">5. Proprietà Intellettuale</h2>
          <p className="text-gray-600 leading-relaxed">
            Tutti i diritti di proprietà intellettuale relativi alla piattaforma Edilizia in Cloud, inclusi
            il software, il design, i marchi, i loghi e la documentazione, sono e rimangono di esclusiva
            proprietà di Domus Group S.r.l. La sottoscrizione di un piano conferisce al Cliente una licenza
            d'uso personale, non esclusiva, non trasferibile e revocabile della piattaforma, limitata alle
            funzionalità incluse nel piano sottoscritto. È espressamente vietato al Cliente copiare, modificare,
            decompilare, fare reverse engineering, distribuire o concedere in sublicenza il software o qualsiasi
            sua parte senza il previo consenso scritto del Fornitore.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-bold text-[#1a2744] mb-3">6. Limitazione di Responsabilità</h2>
          <p className="text-gray-600 leading-relaxed">
            Nei limiti consentiti dalla legge applicabile, il Fornitore non sarà responsabile per danni
            indiretti, incidentali, speciali, punitivi o consequenziali derivanti dall'utilizzo o
            dall'impossibilità di utilizzo del servizio, inclusi lucro cessante, perdita di dati o
            interruzione dell'attività. La responsabilità complessiva del Fornitore nei confronti del
            Cliente per qualsiasi causa non potrà in nessun caso superare l'importo corrisposto dal Cliente
            per il servizio nei 12 mesi precedenti all'evento dannoso. Le limitazioni di cui al presente
            articolo non si applicano nei casi di dolo o colpa grave del Fornitore, né per i diritti
            inderogabili previsti dalla normativa italiana a tutela dei consumatori.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-bold text-[#1a2744] mb-3">7. Disponibilità del Servizio (SLA)</h2>
          <p className="text-gray-600 leading-relaxed">
            Il Fornitore si impegna a garantire una disponibilità della piattaforma pari ad almeno il{" "}
            <strong>99,5% su base mensile</strong> (SLA — Service Level Agreement), calcolata escludendo le
            finestre di manutenzione programmate comunicate con almeno 48 ore di anticipo. In caso di
            indisponibilità prolungata imputabile al Fornitore che superi tale soglia, il Cliente potrà
            richiedere un credito di servizio proporzionale al disservizio subito, secondo le modalità
            indicate nel contratto di servizio. Il Fornitore non è responsabile per interruzioni causate
            da eventi di forza maggiore, guasti di infrastrutture di terze parti o azioni dell'utente
            contrarie ai presenti Termini.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-bold text-[#1a2744] mb-3">8. Dati e Privacy</h2>
          <p className="text-gray-600 leading-relaxed">
            Il trattamento dei dati personali degli utenti avviene nel rispetto del Regolamento (UE)
            2016/679 (GDPR) e della normativa italiana applicabile, come descritto nella{" "}
            <a href="/privacy" className="text-[#0fa68c] hover:underline">
              Privacy Policy
            </a>{" "}
            di Edilizia in Cloud. I dati inseriti dal Cliente nella piattaforma rimangono di sua esclusiva
            proprietà; il Fornitore agisce in qualità di Responsabile del Trattamento ai sensi dell'art.
            28 GDPR e tratta tali dati esclusivamente per le finalità di erogazione del servizio contrattuale.
            Al termine del rapporto contrattuale, il Cliente può richiedere l'esportazione dei propri dati
            entro 30 giorni; successivamente, i dati saranno cancellati in modo sicuro dai sistemi del Fornitore.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-bold text-[#1a2744] mb-3">9. Risoluzione del Contratto</h2>
          <p className="text-gray-600 leading-relaxed">
            Ciascuna parte può recedere dal contratto in qualsiasi momento con un preavviso scritto di
            almeno 30 giorni, da comunicare all'altra parte via email. In caso di violazione grave dei
            presenti Termini da parte del Cliente, il Fornitore si riserva il diritto di sospendere o
            risolvere immediatamente l'account, senza obbligo di rimborso delle somme già versate. In
            caso di recesso da parte del Cliente, non è previsto il rimborso dei corrispettivi relativi
            al periodo di abbonamento già iniziato; eventuali importi prepagati per periodi futuri
            saranno invece rimborsati pro rata, salvo diversa pattuizione scritta.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-bold text-[#1a2744] mb-3">10. Legge Applicabile e Foro Competente</h2>
          <p className="text-gray-600 leading-relaxed">
            I presenti Termini di Servizio sono regolati dalla legge italiana. Per qualsiasi controversia
            relativa all'interpretazione, esecuzione o risoluzione del contratto, le parti eleggono quale
            foro esclusivo competente il <strong>Tribunale di Milano</strong>. Prima di ricorrere all'autorità
            giudiziaria, le parti si impegnano a tentare una risoluzione bonaria della controversia entro
            30 giorni dalla ricezione di apposita comunicazione scritta. La presente clausola non pregiudica
            i diritti dei consumatori ai sensi del D.Lgs. 206/2005 (Codice del Consumo), qualora applicabile.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-bold text-[#1a2744] mb-3">11. Modifiche ai Termini</h2>
          <p className="text-gray-600 leading-relaxed">
            Il Fornitore si riserva il diritto di modificare i presenti Termini in qualsiasi momento,
            dandone comunicazione ai Clienti tramite email con un preavviso di almeno 30 giorni prima
            dell'entrata in vigore delle modifiche. La versione aggiornata dei Termini sarà pubblicata
            su questa pagina con indicazione della data di ultimo aggiornamento. Il proseguimento
            dell'utilizzo del servizio dopo la data di entrata in vigore delle modifiche costituisce
            accettazione dei nuovi Termini. In caso di mancata accettazione, il Cliente ha il diritto
            di recedere dal contratto senza penali entro la data di entrata in vigore delle modifiche.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-bold text-[#1a2744] mb-3">12. Contatti</h2>
          <p className="text-gray-600 leading-relaxed">
            Per qualsiasi domanda, richiesta o comunicazione relativa ai presenti Termini di Servizio,
            è possibile contattare Domus Group S.r.l. ai seguenti recapiti:
          </p>
          <ul className="list-none text-gray-600 leading-relaxed space-y-1 mt-3">
            <li>
              <strong>Email:</strong>{" "}
              <a href="mailto:info@ediliziaincloud.com" className="text-[#0fa68c] hover:underline">
                info@ediliziaincloud.com
              </a>
            </li>
            <li>
              <strong>PEC:</strong> domusgroupsrl@legalmail.it
            </li>
            <li>
              <strong>Indirizzo:</strong> Via Aurelio Saffi 29, CAP 20123, Milano (MI)
            </li>
            <li>
              <strong>P.IVA:</strong> 13132010961
            </li>
          </ul>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
