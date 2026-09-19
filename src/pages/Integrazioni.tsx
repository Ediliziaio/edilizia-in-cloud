import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, Zap, ExternalLink } from "lucide-react";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import { useSEO } from "@/hooks/useSEO";
import { JsonLd } from "@/components/seo/JsonLd";
import { HubSeoSchema } from "@/components/seo/HubSeoSchema";

// ── Dati integrazioni ────────────────────────────────────────────────────────
// Solo cose che funzionano oggi nel prodotto, verificate nel codice e nel
// database il 19/09/2026. Prima la pagina dichiarava «native» anche SEPA/CBI,
// Zucchetti, TeamSystem, Google Drive, INPS, Casse Edili e un'API REST da 120
// endpoint che non esistono, e diceva che le fatture andavano da Edilizia in
// Cloud verso Fatture in Cloud (è il contrario). Prima di aggiungere una voce
// «attiva», controllare che ci sia davvero.
interface Integration {
  name: string;
  category: string;
  description: string;
  logo: string;          // emoji per semplicità (nessun asset esterno richiesto)
  status: "attiva" | "in-arrivo";
}

const INTEGRATIONS: Integration[] = [
  // Fatturazione
  { name: "Sistema di Interscambio (SDI)", category: "Fatturazione Elettronica", description: "Le fatture elettroniche verso aziende e privati partono dal gestionale verso lo SDI dell'Agenzia delle Entrate, tramite un intermediario accreditato. Lo stato di ogni invio lo vedi nel cassetto SDI.", logo: "🏛️", status: "attiva" },
  { name: "Fatture in Cloud", category: "Fatturazione Elettronica", description: "Colleghi il tuo account: le fatture che emetti su Fatture in Cloud e quelle dei fornitori arrivano in Edilizia in Cloud due volte al giorno, abbinate a clienti e commesse.", logo: "🧾", status: "attiva" },
  { name: "Aruba, Fattura24, Invoicetronic", category: "Fatturazione Elettronica", description: "Se fatturi con uno di questi programmi, le fatture emesse arrivano in Edilizia in Cloud da sole: non le ricopi a mano.", logo: "🔌", status: "attiva" },
  { name: "File XML FatturaPA", category: "Fatturazione Elettronica", description: "Carichi i file XML o ZIP delle fatture emesse e ricevute, esportati da qualsiasi programma di fatturazione nel formato standard dell'Agenzia delle Entrate.", logo: "📄", status: "attiva" },
  // Bancario
  { name: "PagoPA", category: "Banca & Pagamenti", description: "Riconciliazione automatica dei pagamenti da enti pubblici tramite il nodo PagoPA. Integrazione per SAL su commesse pubbliche.", logo: "💳", status: "in-arrivo" },
  // Contabilità
  { name: "Area commercialista", category: "Contabilità & Commercialista", description: "Il commercialista entra con un accesso suo e segue da lì tutte le aziende clienti. Prima nota, registro IVA e documenti si esportano in CSV.", logo: "📊", status: "attiva" },
  { name: "Wolters Kluwer CGN", category: "Contabilità & Commercialista", description: "Export contabilità per studi commercialisti che usano Arca Evolution o Profis. Formato compatibile con l'importazione automatica.", logo: "📈", status: "in-arrivo" },
  // Prezzari
  { name: "Prezzari Regionali", category: "Prezzari & Computi", description: "Le voci dei prezzari regionali ufficiali di 19 regioni e province autonome sono già caricate: le cerchi e le inserisci nei computi metrici.", logo: "📐", status: "attiva" },
  { name: "Primus (ACCA Software)", category: "Prezzari & Computi", description: "Importi i computi metrici esportati da Primus in formato XPWE, senza ricopiare le voci.", logo: "🏗️", status: "attiva" },
  // Comunicazione
  { name: "Moduli Facebook e Instagram", category: "CRM & Marketing", description: "Chi compila il modulo di una tua inserzione entra nel CRM in tempo reale, pronto da chiamare.", logo: "📣", status: "attiva" },
  { name: "WhatsApp Business", category: "CRM & Marketing", description: "Colleghi il numero WhatsApp Business dell'azienda con l'API ufficiale di Meta: messaggi, modelli approvati e invii dalle automazioni.", logo: "💬", status: "attiva" },
  { name: "Gmail e posta IMAP", category: "CRM & Marketing", description: "Colleghi la casella dell'azienda, Gmail o qualsiasi posta con IMAP: le email arrivano nel gestionale e quelle di un cliente le ritrovi nella sua scheda e nelle sue commesse.", logo: "📧", status: "attiva" },
  { name: "Mailchimp", category: "CRM & Marketing", description: "Sincronizzazione lista contatti e clienti con Mailchimp per campagne email marketing automatizzate. Segmentazione per zona geografica e tipo lavoro.", logo: "📮", status: "in-arrivo" },
  // Calendari
  { name: "Google Calendar", category: "Calendari", description: "Appuntamenti e sopralluoghi del gestionale finiscono sul tuo Google Calendar, e gli impegni che hai già lì bloccano gli orari occupati.", logo: "📅", status: "attiva" },
  { name: "Calendario Apple (iCloud)", category: "Calendari", description: "Colleghi il calendario iCloud: gli orari occupati si vedono quando fissi un appuntamento.", logo: "🍎", status: "attiva" },
  // Storage & Docs
  { name: "Dropbox Business", category: "Documenti & Storage", description: "Condivisione documenti di cantiere con clienti e DL tramite Dropbox. Upload automatico di foto e report dalla app mobile.", logo: "📁", status: "in-arrivo" },
  // CAD e BIM
  { name: "Autodesk AutoCAD (DXF/DWG)", category: "CAD & BIM", description: "Importazione di planimetrie e disegni tecnici in formato DXF/DWG per la gestione del cantiere referenziata alle tavole di progetto.", logo: "📐", status: "in-arrivo" },
  { name: "BIM (IFC)", category: "CAD & BIM", description: "Compatibilità con modelli BIM in formato IFC per l'estrazione automatica di quantità e la compilazione del computo metrico.", logo: "🏢", status: "in-arrivo" },
  // Automazioni e sviluppatori
  { name: "Zapier, Make e n8n", category: "Automazioni & Sviluppatori", description: "Un'automazione può chiamare un indirizzo web quando nasce una fattura, arriva un pagamento o un preventivo viene accettato: Zapier, Make o n8n ricevono la chiamata e fanno il resto.", logo: "🔗", status: "attiva" },
  { name: "Assistenti AI (MCP)", category: "Automazioni & Sviluppatori", description: "Crei chiavi API per l'azienda, revocabili in ogni momento, e colleghi gli assistenti AI compatibili con il protocollo MCP ai dati del gestionale.", logo: "⚡", status: "attiva" },
];

const CATEGORIES = [...new Set(INTEGRATIONS.map((i) => i.category))];

const CATEGORY_COLORS: Record<string, string> = {
  "Fatturazione Elettronica": "bg-blue-100 text-blue-700",
  "Banca & Pagamenti": "bg-emerald-100 text-emerald-700",
  "Contabilità & Commercialista": "bg-indigo-100 text-indigo-700",
  "Prezzari & Computi": "bg-orange-100 text-orange-700",
  "CRM & Marketing": "bg-rose-100 text-rose-700",
  "Calendari": "bg-sky-100 text-sky-700",
  "Documenti & Storage": "bg-yellow-100 text-yellow-700",
  "CAD & BIM": "bg-slate-100 text-slate-700",
  "Automazioni & Sviluppatori": "bg-gray-100 text-gray-700",
};

export default function Integrazioni() {
  useSEO({
    title: "Integrazioni Gestionale Edilizia",
    description: "Edilizia in Cloud si collega a Fatture in Cloud, Aruba e Fattura24, invia le fatture allo SDI, usa i prezzari regionali e lavora con WhatsApp, Gmail e Google Calendar.",
    canonical: "/integrazioni",
    keywords: "integrazioni gestionale edilizia, gestionale edilizia fatture in cloud, software edilizia fatturazione elettronica, prezzari regionali software, whatsapp impresa edile, gestionale edilizia google calendar, webhook gestionale edilizia",
  });

  const baseUrl = "https://www.ediliziaincloud.com";
  const nativeCount = INTEGRATIONS.filter((i) => i.status === "attiva").length;

  return (
    <div className="min-h-screen bg-white text-[#111111]">
      <HubSeoSchema
        pageName="Integrazioni"
        pagePath="/integrazioni"
        pageDescription="Collegamenti attivi con SDI, Fatture in Cloud, prezzari regionali, WhatsApp Business, Gmail, Google Calendar e moduli Facebook."
        breadcrumbs={[
          { name: "Home", url: "/" },
          { name: "Integrazioni", url: "/integrazioni" },
        ]}
      />

      {/* Structured Data */}
      <JsonLd id="jsonld-breadcrumb-integrazioni" data={{
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": `${baseUrl}/` },
          { "@type": "ListItem", "position": 2, "name": "Integrazioni", "item": `${baseUrl}/integrazioni` },
        ]
      }} />
      <JsonLd id="jsonld-integrazioni-webpage" data={{
        "@context": "https://schema.org",
        "@type": "WebPage",
        "@id": `${baseUrl}/integrazioni`,
        "name": "Integrazioni Gestionale Edilizia",
        "description": "I collegamenti attivi di Edilizia in Cloud: invio allo SDI, Fatture in Cloud e altri programmi di fatturazione, prezzari regionali, WhatsApp Business, posta, calendari e automazioni.",
        "url": `${baseUrl}/integrazioni`,
        "inLanguage": "it",
        "isPartOf": { "@id": `${baseUrl}/#website` },
        "about": { "@id": `${baseUrl}/#software` },
        "publisher": { "@id": `${baseUrl}/#organization` },
      }} />
      <JsonLd id="jsonld-integrazioni-software" data={{
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        "name": "Edilizia in Cloud",
        "url": baseUrl,
        "applicationCategory": "BusinessApplication",
        "featureList": INTEGRATIONS.filter((i) => i.status === "attiva").map((i) => `Integrazione ${i.name}`),
      }} />

      <LandingNavbar />

      {/* Hero */}
      <section className="bg-[#111111] pt-36 pb-20">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#F97415]/10 border border-[#F97415]/20 mb-6">
            <Zap size={14} className="text-[#F97415]" />
            <span className="text-[#F97415] text-xs font-bold uppercase tracking-widest">Integrazioni</span>
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white mb-6 leading-tight">
            Si collega ai programmi<br />
            <span className="text-[#F97415]">che già usi</span>
          </h1>
          <p className="text-white/60 text-lg md:text-xl max-w-2xl mx-auto mb-10">
            Fatturazione elettronica, programmi di fatturazione, prezzari regionali,
            WhatsApp, posta e calendari. Qui trovi cosa funziona oggi e cosa è in arrivo.
          </p>
          <div className="grid grid-cols-3 gap-6 max-w-lg mx-auto">
            {[
              { value: `${nativeCount}`, label: "Collegamenti attivi" },
              { value: "19", label: "Prezzari regionali caricati" },
              { value: "2 al giorno", label: "Import da Fatture in Cloud" },
            ].map((s, i) => (
              <div key={i} className="text-center">
                <p className="text-2xl font-extrabold text-[#F97415]">{s.value}</p>
                <p className="text-white/50 text-xs mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Integrations by category */}
      <main className="max-w-6xl mx-auto px-6 py-16">
        {CATEGORIES.map((cat) => {
          const catItems = INTEGRATIONS.filter((i) => i.category === cat);
          const colorClass = CATEGORY_COLORS[cat] ?? "bg-gray-100 text-gray-700";
          return (
            <div key={cat} className="mb-14">
              <div className="flex items-center gap-3 mb-6">
                <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest ${colorClass}`}>
                  {cat}
                </span>
                <div className="h-px flex-1 bg-gray-100" />
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {catItems.map((item) => (
                  <div
                    key={item.name}
                    className={`rounded-2xl p-6 border transition-all duration-200 ${
                      item.status === "attiva"
                        ? "bg-white border-gray-200 hover:border-[#F97415]/40 hover:shadow-md"
                        : "bg-gray-50 border-gray-100 opacity-70"
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <span className="text-2xl">{item.logo}</span>
                      <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${
                        item.status === "attiva"
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-200 text-gray-500"
                      }`}>
                        {item.status === "attiva" ? "✓ Attiva" : "In arrivo"}
                      </span>
                    </div>
                    <h3 className="font-bold text-[#111111] mb-2">{item.name}</h3>
                    <p className="text-gray-500 text-sm leading-relaxed">{item.description}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {/* Automazioni e sviluppatori: cosa c'è davvero oggi. Niente API REST
            pubblica: prima qui si prometteva un'API da 120 endpoint con OAuth,
            sandbox e 1.000 richieste al minuto che non esiste. */}
        <div className="mt-8 rounded-3xl bg-[#111111] p-8 md:p-12">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div>
              <span className="inline-block px-3 py-1 rounded-full bg-[#F97415]/10 text-[#F97415] text-xs font-bold uppercase tracking-widest mb-4">
                Automazioni & Sviluppatori
              </span>
              <h2 className="text-2xl md:text-3xl font-extrabold text-white mb-4">
                Collegare un programma che non è in elenco
              </h2>
              <p className="text-white/60 mb-6">
                Un&apos;API pubblica per leggere e scrivere i dati dall&apos;esterno non c&apos;è ancora.
                Oggi un altro programma si collega così:
              </p>
              <ul className="space-y-2 mb-8">
                {[
                  "Un'automazione chiama un indirizzo web quando succede qualcosa",
                  "Zapier, Make e n8n ricevono la chiamata e proseguono da soli",
                  "Chiavi API per l'azienda, revocabili quando vuoi",
                  "Assistenti AI collegati ai dati tramite MCP",
                ].map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-white/70 text-sm">
                    <CheckCircle2 size={14} className="text-[#F97415] shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                to="/demo/"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#F97415] text-white font-bold hover:bg-[#e8650e] transition-all"
              >
                Parlane con noi <ExternalLink size={15} />
              </Link>
            </div>
            <div className="bg-[#0d0d0d] rounded-2xl p-6 font-mono text-sm overflow-hidden">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="text-gray-500 text-xs ml-2">POST dalla tua automazione</span>
              </div>
              <pre className="text-green-400 text-xs leading-relaxed overflow-x-auto">{`{
  "entity_id": "8f3c2a71-…-e21a",
  "company_id": "5c06…9def",
  "config": {
    "url": "https://hooks.zapier.com/…",
    "metodo": "POST",
    …
  }
}`}</pre>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-16 text-center">
          <h2 className="text-2xl md:text-3xl font-extrabold text-[#111111] mb-4">
            Non trovi l'integrazione che cerchi?
          </h2>
          <p className="text-gray-500 mb-8 max-w-xl mx-auto">
            Il nostro team valuta nuove integrazioni su richiesta. Scrivici quale
            programma usi e ti diciamo se si può collegare.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/demo/"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-[#F97415] text-white font-bold hover:bg-[#e8650e] hover:scale-105 transition-all shadow-lg shadow-[#F97415]/30"
            >
              Richiedi un'integrazione <ArrowRight size={18} />
            </Link>
            <Link
              to="/funzionalita/"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-full border border-gray-200 text-gray-700 font-bold hover:border-[#F97415]/40 hover:text-[#F97415] transition-all"
            >
              Vedi tutte le funzionalità
            </Link>
          </div>
        </div>
      </main>

      {/* ── FAQ INTEGRAZIONI ── */}
      <JsonLd
        id="jsonld-faq-integrazioni"
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: [
            {
              "@type": "Question",
              name: "Edilizia in Cloud si integra con Fatture in Cloud?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Sì, in una direzione. Colleghi il tuo account Fatture in Cloud e le fatture che emetti lì, insieme a quelle dei fornitori, arrivano in Edilizia in Cloud due volte al giorno, abbinate a clienti e commesse. Non vale il contrario: le fatture fatte in Edilizia in Cloud non finiscono su Fatture in Cloud. Chi fattura con Fatture in Cloud continua a farlo lì.",
              },
            },
            {
              "@type": "Question",
              name: "Posso collegare Edilizia in Cloud al mio commercialista?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Sì. Il commercialista può avere un accesso suo e seguire da lì tutte le aziende clienti. Prima nota, registro IVA e documenti si esportano in CSV, e le fatture elettroniche restano nel formato XML standard che ogni programma di contabilità legge.",
              },
            },
            {
              "@type": "Question",
              name: "C'è un'API per integrazioni personalizzate?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Non ancora un'API pubblica per leggere e scrivere i dati. Oggi un altro programma si collega con le automazioni: quando nasce una fattura, arriva un pagamento o un preventivo viene accettato, Edilizia in Cloud chiama un indirizzo web che Zapier, Make o n8n possono ricevere. Con le chiavi API dell'azienda si collegano anche gli assistenti AI tramite MCP.",
              },
            },
            {
              "@type": "Question",
              name: "Le integrazioni hanno costi aggiuntivi?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "I collegamenti fanno parte del piano che scegli: in consulenza verifichiamo con te quali ti servono. I servizi esterni restano a parte con il loro fornitore, per esempio l'abbonamento a Fatture in Cloud o i messaggi WhatsApp che Meta fa pagare.",
              },
            },
          ],
        }}
      />
      <section className="py-16 px-6 bg-gray-50">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-extrabold text-[#111111] mb-8 text-center">
            Domande frequenti sulle Integrazioni
          </h2>
          <div className="divide-y divide-gray-200">
            {[
              { q: "Edilizia in Cloud si integra con Fatture in Cloud?", a: "Sì, in una direzione: le fatture che emetti su Fatture in Cloud, e quelle dei fornitori, arrivano in Edilizia in Cloud due volte al giorno, abbinate a clienti e commesse. Le fatture fatte in Edilizia in Cloud non finiscono su Fatture in Cloud." },
              { q: "Posso collegare Edilizia in Cloud al mio commercialista?", a: "Sì. Il commercialista può avere un accesso suo e seguire da lì tutte le aziende clienti. Prima nota, registro IVA e documenti si esportano in CSV." },
              { q: "C'è un'API per integrazioni personalizzate?", a: "Non ancora un'API pubblica. Oggi un altro programma si collega con le automazioni, che chiamano un indirizzo web ricevibile da Zapier, Make o n8n, e con le chiavi API per gli assistenti AI tramite MCP." },
              { q: "Le integrazioni hanno costi aggiuntivi?", a: "I collegamenti fanno parte del piano che scegli: in consulenza verifichiamo con te quali ti servono. I servizi esterni, come l'abbonamento a Fatture in Cloud, restano a parte con il loro fornitore." },
            ].map((item, i) => (
              <details key={i} className="py-5 group">
                <summary className="flex justify-between items-center cursor-pointer list-none font-semibold text-[#111111] text-sm">
                  {item.q}
                  <span className="text-[#F97415] text-lg font-light ml-4">+</span>
                </summary>
                <p className="mt-3 text-sm text-[#111111]/70 leading-relaxed">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
