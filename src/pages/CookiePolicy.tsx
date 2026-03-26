import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import { useSEO } from "@/hooks/useSEO";

export default function CookiePolicy() {
  useSEO({
    title: "Cookie Policy — Edilizia in Cloud",
    description:
      "Informativa sull'utilizzo dei cookie sul sito web di Edilizia in Cloud ai sensi del Provvedimento Garante Privacy 8 maggio 2014.",
    canonical: "/cookie",
    noindex: true,
  });

  return (
    <div className="min-h-screen bg-white">
      <LandingNavbar />
      <div className="pt-16" />
      <main className="max-w-4xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-bold text-[#111111] mb-2">Cookie Policy</h1>
        <p className="text-sm text-gray-400 mb-10">Ultimo aggiornamento: 26 marzo 2026</p>

        <section className="mb-10">
          <h2 className="text-xl font-bold text-[#111111] mb-3">1. Cosa sono i Cookie</h2>
          <p className="text-gray-600 leading-relaxed">
            I cookie sono piccoli file di testo che i siti web visitati dall'utente inviano al suo
            dispositivo (computer, tablet, smartphone), dove vengono memorizzati per essere poi
            ritrasmessi agli stessi siti alla visita successiva. Grazie ai cookie, il sito web può
            ricordare le preferenze dell'utente, mantenere la sessione attiva, analizzare il
            comportamento di navigazione e, in alcuni casi, mostrare annunci pubblicitari personalizzati.
            La presente Cookie Policy è redatta in conformità al Provvedimento del Garante per la
            protezione dei dati personali dell'8 maggio 2014 e al D.Lgs. 196/2003 come modificato
            dal D.Lgs. 101/2018, nonché al GDPR (UE) 2016/679.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-bold text-[#111111] mb-3">2. Tipologie di Cookie Utilizzati</h2>
          <p className="text-gray-600 leading-relaxed mb-3">
            Il sito web di Edilizia in Cloud utilizza le seguenti categorie di cookie:
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-gray-600 border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left p-3 border border-gray-200 text-[#111111] font-semibold">Categoria</th>
                  <th className="text-left p-3 border border-gray-200 text-[#111111] font-semibold">Descrizione</th>
                  <th className="text-left p-3 border border-gray-200 text-[#111111] font-semibold">Consenso</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="p-3 border border-gray-200 font-medium">Tecnici</td>
                  <td className="p-3 border border-gray-200">Necessari per il funzionamento del sito</td>
                  <td className="p-3 border border-gray-200 text-green-600 font-medium">Non richiesto</td>
                </tr>
                <tr className="bg-gray-50">
                  <td className="p-3 border border-gray-200 font-medium">Analitici</td>
                  <td className="p-3 border border-gray-200">Analisi del traffico in forma anonima</td>
                  <td className="p-3 border border-gray-200 text-yellow-600 font-medium">Opzionale</td>
                </tr>
                <tr>
                  <td className="p-3 border border-gray-200 font-medium">Marketing</td>
                  <td className="p-3 border border-gray-200">Pubblicità personalizzata</td>
                  <td className="p-3 border border-gray-200 text-red-600 font-medium">Richiesto</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-bold text-[#111111] mb-3">3. Cookie Tecnici (Sempre Attivi)</h2>
          <p className="text-gray-600 leading-relaxed">
            I cookie tecnici sono indispensabili per il corretto funzionamento del sito web e della
            piattaforma applicativa e non richiedono il consenso dell'utente ai sensi del Provvedimento
            del Garante dell'8 maggio 2014. Rientrano in questa categoria i cookie di sessione, necessari
            per mantenere attiva la sessione autenticata dell'utente, i cookie di preferenza, che memorizzano
            le impostazioni dell'utente (lingua, tema, ecc.), e i cookie di sicurezza, utilizzati per la
            protezione contro attacchi CSRF e per la gestione dei token di autenticazione. Questi cookie
            vengono automaticamente eliminati alla chiusura del browser (cookie di sessione) o hanno una
            scadenza definita (cookie persistenti), non superiore ai 12 mesi.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-bold text-[#111111] mb-3">4. Cookie Analitici (Google Analytics 4)</h2>
          <p className="text-gray-600 leading-relaxed">
            Il sito utilizza <strong>Google Analytics 4</strong> (GA4), un servizio di analisi web fornito
            da Google LLC, per raccogliere informazioni statistiche aggregate sull'utilizzo del sito, come
            il numero di visitatori, le pagine visualizzate, la provenienza geografica e il comportamento
            di navigazione. L'indirizzo IP degli utenti è anonimizzato prima di essere inviato ai server
            di Google, impedendo l'identificazione diretta degli utenti. I dati raccolti da GA4 vengono
            conservati per un periodo massimo di 14 mesi. L'utente può disabilitare i cookie di Google
            Analytics installando il componente aggiuntivo del browser disponibile all'indirizzo{" "}
            <a
              href="https://tools.google.com/dlpage/gaoptout"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#F97415] hover:underline"
            >
              tools.google.com/dlpage/gaoptout
            </a>
            . I cookie analitici di terze parti richiedono il consenso preventivo dell'utente e possono
            essere gestiti tramite il pannello di gestione cookie presente nel sito.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-bold text-[#111111] mb-3">5. Cookie di Marketing (Solo con Consenso)</h2>
          <p className="text-gray-600 leading-relaxed">
            I cookie di marketing e profilazione vengono utilizzati per mostrare annunci pubblicitari
            personalizzati in base agli interessi dell'utente, rilevati attraverso il tracciamento delle
            attività di navigazione su questo e altri siti web. Questi cookie sono installati solo previo
            consenso esplicito dell'utente, espresso tramite il banner di gestione dei cookie al primo
            accesso al sito. Il mancato consenso non pregiudica in alcun modo la navigabilità del sito né
            l'accesso ai contenuti. Il consenso può essere revocato in qualsiasi momento accedendo alle
            impostazioni dei cookie tramite il link "Gestisci Cookie" presente nel footer del sito.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-bold text-[#111111] mb-3">6. Come Gestire i Cookie</h2>
          <p className="text-gray-600 leading-relaxed mb-4">
            Oltre alla gestione tramite il pannello cookie del sito, l'utente può controllare e gestire
            i cookie direttamente dalle impostazioni del proprio browser. Di seguito le istruzioni per
            i principali browser:
          </p>
          <ul className="space-y-3 text-gray-600">
            <li>
              <strong className="text-[#111111]">Google Chrome:</strong> Menu (⋮) → Impostazioni →
              Privacy e sicurezza → Cookie e altri dati dei siti. Oppure visitare{" "}
              <code className="bg-gray-100 px-1 rounded text-sm">chrome://settings/cookies</code>.
            </li>
            <li>
              <strong className="text-[#111111]">Mozilla Firefox:</strong> Menu (☰) → Impostazioni →
              Privacy e sicurezza → Cookie e dati dei siti. È possibile cancellare i cookie e impostare
              le preferenze di blocco per categoria.
            </li>
            <li>
              <strong className="text-[#111111]">Apple Safari:</strong> Preferenze → Privacy → Gestisci
              dati siti web. Su iOS: Impostazioni → Safari → Avanzate → Dati dei siti web.
            </li>
            <li>
              <strong className="text-[#111111]">Microsoft Edge:</strong> Menu (…) → Impostazioni →
              Cookie e autorizzazioni sito → Cookie e dati dei siti. È possibile bloccare cookie di terze
              parti e gestire le eccezioni per singolo sito.
            </li>
          </ul>
          <p className="text-gray-600 leading-relaxed mt-4">
            Si avvisa che la disabilitazione di tutti i cookie potrebbe compromettere il corretto
            funzionamento di alcune parti del sito o della piattaforma applicativa. Il Titolare non è
            responsabile per malfunzionamenti derivanti dalla disabilitazione dei cookie tecnici.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-bold text-[#111111] mb-3">7. Cookie di Terze Parti</h2>
          <p className="text-gray-600 leading-relaxed">
            Il sito web di Edilizia in Cloud può includere componenti di terze parti (pulsanti social,
            widget, video incorporati, strumenti di chat) che potrebbero installare cookie propri sui
            dispositivi degli utenti. Il Titolare non ha il controllo diretto su tali cookie e si
            raccomanda di consultare le informative privacy delle rispettive terze parti. I principali
            fornitori di servizi terzi attualmente integrati nella piattaforma includono Google LLC
            (Google Analytics, Google Fonts), per cui si rimanda all'informativa privacy disponibile
            su{" "}
            <a
              href="https://policies.google.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#F97415] hover:underline"
            >
              policies.google.com/privacy
            </a>
            . Tutti i cookie di terze parti non tecnici sono soggetti al consenso preventivo dell'utente.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-bold text-[#111111] mb-3">8. Aggiornamenti alla Cookie Policy</h2>
          <p className="text-gray-600 leading-relaxed">
            La presente Cookie Policy potrà essere modificata in qualsiasi momento per adeguarsi a
            variazioni normative, all'introduzione di nuovi cookie o servizi, o a modifiche dei
            servizi di terze parti integrati nel sito. Le modifiche saranno pubblicate su questa
            pagina con indicazione della data di aggiornamento; per le modifiche sostanziali, il
            Titolare si impegna a raccogliere nuovamente il consenso degli utenti ove necessario.
            Si consiglia di verificare periodicamente questa pagina per tenersi aggiornati sulle
            pratiche di utilizzo dei cookie adottate da Edilizia in Cloud.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-bold text-[#111111] mb-3">9. Contatti</h2>
          <p className="text-gray-600 leading-relaxed">
            Per informazioni sui cookie utilizzati dal sito o per esercitare i propri diritti ai sensi
            del GDPR, è possibile contattare il Titolare del trattamento:
          </p>
          <ul className="list-none text-gray-600 leading-relaxed space-y-1 mt-3">
            <li>
              <strong>Domus Group S.r.l.</strong>
            </li>
            <li>Via Aurelio Saffi 29, CAP 20123, Milano (MI)</li>
            <li>
              Email:{" "}
              <a href="mailto:privacy@ediliziaincloud.com" className="text-[#F97415] hover:underline">
                privacy@ediliziaincloud.com
              </a>
            </li>
            <li>
              Per ulteriori informazioni sulla privacy, consulta la nostra{" "}
              <a href="/privacy" className="text-[#F97415] hover:underline">
                Privacy Policy
              </a>
              .
            </li>
          </ul>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
