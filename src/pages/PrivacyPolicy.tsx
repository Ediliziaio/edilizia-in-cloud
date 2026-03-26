import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import { useSEO } from "@/hooks/useSEO";

export default function PrivacyPolicy() {
  useSEO({
    title: "Privacy Policy — Edilizia in Cloud",
    description:
      "Informativa sul trattamento dei dati personali di Edilizia in Cloud (Domus Group S.r.l.) ai sensi del GDPR 2016/679.",
    canonical: "/privacy",
    noindex: true,
  });

  return (
    <div className="min-h-screen bg-white">
      <LandingNavbar />
      <div className="pt-16" />
      <main className="max-w-4xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-bold text-[#111111] mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-400 mb-10">Ultimo aggiornamento: 26 marzo 2026</p>

        <section className="mb-10">
          <h2 className="text-xl font-bold text-[#111111] mb-3">1. Titolare del Trattamento</h2>
          <p className="text-gray-600 leading-relaxed">
            Il Titolare del trattamento dei dati personali, ai sensi dell'art. 13 del Regolamento (UE) 2016/679
            (GDPR), è <strong>Domus Group S.r.l.</strong>, con sede legale in Via Aurelio Saffi 29, CAP 20123,
            Milano (MI), P.IVA 13132010961. Per qualsiasi richiesta relativa al trattamento dei dati personali è
            possibile contattare il Titolare all'indirizzo email{" "}
            <a href="mailto:info@ediliziaincloud.com" className="text-[#F97415] hover:underline">
              info@ediliziaincloud.com
            </a>
            . Il Responsabile della Protezione dei Dati (DPO) è contattabile all'indirizzo{" "}
            <a href="mailto:privacy@ediliziaincloud.com" className="text-[#F97415] hover:underline">
              privacy@ediliziaincloud.com
            </a>
            . La presente informativa è resa ai sensi dell'art. 13 GDPR a tutti i soggetti che interagiscono con
            il sito web e i servizi offerti da Edilizia in Cloud.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-bold text-[#111111] mb-3">2. Dati Raccolti e Finalità del Trattamento</h2>
          <p className="text-gray-600 leading-relaxed mb-3">
            Nell'ambito dell'erogazione dei propri servizi, Domus Group S.r.l. raccoglie e tratta le seguenti
            categorie di dati personali:
          </p>
          <ul className="list-disc list-inside text-gray-600 leading-relaxed space-y-1 mb-3">
            <li>
              <strong>Dati anagrafici e di contatto:</strong> nome, cognome, indirizzo email, numero di telefono;
            </li>
            <li>
              <strong>Dati aziendali:</strong> ragione sociale, P.IVA, codice fiscale, indirizzo della sede legale;
            </li>
            <li>
              <strong>Dati di utilizzo:</strong> informazioni sul comportamento dell'utente all'interno della
              piattaforma, log di accesso, indirizzi IP;
            </li>
            <li>
              <strong>Dati tecnici:</strong> cookie, identificatori del dispositivo, tipo di browser e sistema
              operativo.
            </li>
          </ul>
          <p className="text-gray-600 leading-relaxed">
            I dati vengono raccolti per le seguenti finalità: (a) erogazione del servizio software e adempimento
            degli obblighi contrattuali; (b) fatturazione e gestione amministrativa; (c) assistenza tecnica e
            supporto clienti; (d) invio di comunicazioni commerciali e di marketing, previo consenso esplicito
            dell'interessato; (e) miglioramento del prodotto attraverso l'analisi aggregata e anonimizzata dei
            dati di utilizzo.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-bold text-[#111111] mb-3">3. Base Giuridica del Trattamento</h2>
          <p className="text-gray-600 leading-relaxed">
            Il trattamento dei dati personali si fonda sulle seguenti basi giuridiche ai sensi dell'art. 6 GDPR:
            (a) <strong>esecuzione di un contratto</strong> (art. 6.1.b GDPR) per i dati necessari all'erogazione
            del servizio, alla fatturazione e all'assistenza; (b) <strong>legittimo interesse</strong> del Titolare
            (art. 6.1.f GDPR) per il miglioramento del prodotto, la prevenzione delle frodi e la sicurezza
            informatica, previa valutazione del bilanciamento degli interessi; (c) <strong>consenso</strong>{" "}
            dell'interessato (art. 6.1.a GDPR) per le attività di marketing diretto e profilazione, consenso che
            può essere revocato in qualsiasi momento senza pregiudicare la liceità del trattamento basato sul
            consenso prestato prima della revoca. Per i trattamenti fondati sul legittimo interesse, l'interessato
            ha diritto di opporsi in qualsiasi momento ai sensi dell'art. 21 GDPR.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-bold text-[#111111] mb-3">4. Periodo di Conservazione dei Dati</h2>
          <p className="text-gray-600 leading-relaxed">
            I dati personali trattati per finalità contrattuali e di fatturazione sono conservati per un periodo
            di <strong>10 anni</strong> dalla cessazione del rapporto contrattuale, in conformità agli obblighi
            di legge previsti dal Codice Civile e dalla normativa fiscale italiana (art. 2220 c.c. e D.P.R.
            600/1973). I dati trattati per finalità di marketing e comunicazione commerciale sono conservati{" "}
            <strong>fino alla revoca del consenso</strong> da parte dell'interessato. I dati di navigazione e i
            log tecnici sono conservati per un periodo massimo di <strong>12 mesi</strong>. Alla scadenza dei
            termini di conservazione, i dati vengono cancellati in modo sicuro o resi anonimi.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-bold text-[#111111] mb-3">5. Diritti dell'Interessato (artt. 15–22 GDPR)</h2>
          <p className="text-gray-600 leading-relaxed mb-3">
            In qualità di interessato, l'utente ha il diritto di esercitare in qualsiasi momento i seguenti
            diritti nei confronti del Titolare del trattamento:
          </p>
          <ul className="list-disc list-inside text-gray-600 leading-relaxed space-y-1 mb-3">
            <li>
              <strong>Diritto di accesso</strong> (art. 15 GDPR): ottenere conferma del trattamento e accedere ai
              propri dati personali;
            </li>
            <li>
              <strong>Diritto di rettifica</strong> (art. 16 GDPR): ottenere la correzione di dati inesatti o
              incompleti;
            </li>
            <li>
              <strong>Diritto alla cancellazione</strong> (art. 17 GDPR): ottenere la cancellazione dei propri
              dati ("diritto all'oblio");
            </li>
            <li>
              <strong>Diritto alla portabilità dei dati</strong> (art. 20 GDPR): ricevere i dati in formato
              strutturato e leggibile da dispositivo automatico;
            </li>
            <li>
              <strong>Diritto di opposizione</strong> (art. 21 GDPR): opporsi al trattamento per finalità di
              marketing diretto o legittimo interesse;
            </li>
            <li>
              <strong>Diritto di limitazione del trattamento</strong> (art. 18 GDPR): ottenere la limitazione del
              trattamento in determinate circostanze.
            </li>
          </ul>
          <p className="text-gray-600 leading-relaxed">
            Per esercitare i propri diritti, l'interessato può inviare una richiesta scritta a{" "}
            <a href="mailto:privacy@ediliziaincloud.com" className="text-[#F97415] hover:underline">
              privacy@ediliziaincloud.com
            </a>
            . Il Titolare risponderà entro 30 giorni dal ricevimento della richiesta. L'interessato ha altresì il
            diritto di proporre reclamo all'autorità di controllo competente,{" "}
            <strong>Garante per la Protezione dei Dati Personali</strong>, raggiungibile all'indirizzo{" "}
            <a
              href="https://www.garanteprivacy.it"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#F97415] hover:underline"
            >
              www.garanteprivacy.it
            </a>
            .
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-bold text-[#111111] mb-3">6. Cookie Policy</h2>
          <p className="text-gray-600 leading-relaxed">
            Il sito web di Edilizia in Cloud utilizza cookie e tecnologie similari per garantire il corretto
            funzionamento del sito, analizzare il traffico in forma aggregata e anonimizzata tramite Google
            Analytics 4, e — previo consenso esplicito — per finalità di profilazione e marketing. I cookie
            tecnici sono strettamente necessari al funzionamento del servizio e non richiedono consenso. I cookie
            analitici e di profilazione possono essere accettati o rifiutati dall'utente tramite il banner
            presente al primo accesso al sito. Per informazioni dettagliate sui cookie utilizzati, la loro durata
            e le modalità di gestione, si rimanda alla{" "}
            <a href="/cookie" className="text-[#F97415] hover:underline">
              Cookie Policy completa
            </a>
            .
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-bold text-[#111111] mb-3">7. Trasferimento di Dati Extra-UE</h2>
          <p className="text-gray-600 leading-relaxed">
            Domus Group S.r.l. non effettua trasferimenti di dati personali verso Paesi terzi al di fuori dello
            Spazio Economico Europeo (SEE). Tutti i dati sono trattati e conservati su infrastrutture situate
            all'interno dell'Unione Europea o in Paesi che garantiscono un livello di protezione adeguato ai
            sensi degli artt. 44–49 GDPR. Nel caso in cui, in futuro, si rendesse necessario un trasferimento
            extra-UE, il Titolare adotterà tutte le garanzie appropriate previste dal GDPR, incluse le Clausole
            Contrattuali Standard approvate dalla Commissione Europea, e ne darà tempestiva comunicazione agli
            interessati tramite aggiornamento della presente informativa.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-bold text-[#111111] mb-3">8. Sicurezza dei Dati</h2>
          <p className="text-gray-600 leading-relaxed">
            Domus Group S.r.l. adotta misure tecnico-organizzative adeguate per proteggere i dati personali da
            accessi non autorizzati, perdita, distruzione o divulgazione non consentita, in conformità all'art.
            32 GDPR. Tra le misure adottate figurano la cifratura dei dati in transito (TLS/SSL) e a riposo, il
            controllo degli accessi basato sui ruoli, l'autenticazione a due fattori per gli account con accesso
            privilegiato e procedure periodiche di backup. In caso di violazione dei dati personali (data breach)
            che comporti un rischio per i diritti e le libertà degli interessati, il Titolare provvederà alla
            notifica all'autorità di controllo entro 72 ore ai sensi dell'art. 33 GDPR e, ove necessario,
            comunicherà la violazione agli interessati ai sensi dell'art. 34 GDPR.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-bold text-[#111111] mb-3">9. Modifiche alla Privacy Policy</h2>
          <p className="text-gray-600 leading-relaxed">
            Il Titolare si riserva il diritto di modificare la presente informativa in qualsiasi momento, al fine
            di adeguarla a eventuali variazioni normative, a nuove finalità di trattamento o a modifiche dei
            servizi offerti. Le modifiche saranno comunicate agli utenti tramite pubblicazione della versione
            aggiornata sul sito web, con indicazione della data di ultimo aggiornamento in cima alla pagina.
            Si invita pertanto l'utente a consultare periodicamente questa pagina. In caso di modifiche
            sostanziali che incidano sui diritti degli interessati, il Titolare provvederà a darne comunicazione
            anche tramite email agli utenti registrati con almeno 30 giorni di preavviso.
          </p>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
