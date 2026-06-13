import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, Zap, ExternalLink } from "lucide-react";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import { useSEO } from "@/hooks/useSEO";
import { JsonLd } from "@/components/seo/JsonLd";
import { HubSeoSchema } from "@/components/seo/HubSeoSchema";

// ── Dati integrazioni ────────────────────────────────────────────────────────
interface Integration {
  name: string;
  category: string;
  description: string;
  logo: string;          // emoji per semplicità (nessun asset esterno richiesto)
  status: "nativa" | "in-arrivo";
}

const INTEGRATIONS: Integration[] = [
  // Fatturazione
  { name: "Sistema di Interscambio (SDI)", category: "Fatturazione Elettronica", description: "Trasmissione diretta delle fatture elettroniche al SDI dell'Agenzia delle Entrate. Firma digitale, ricevute di consegna e conservazione sostitutiva a norma di legge per 10 anni.", logo: "🏛️", status: "nativa" },
  { name: "Fattura PA", category: "Fatturazione Elettronica", description: "Emissione e invio di fatture verso la Pubblica Amministrazione tramite NSO. Gestione codice destinatario, CIG/CUP e firma digitale.", logo: "📄", status: "nativa" },
  // Bancario
  { name: "Bonifici SEPA", category: "Banca & Pagamenti", description: "Generazione file SEPA XML per pagamenti fornitori e subappaltatori. Esportazione distinta bonifici per la banca in formato standard CBI.", logo: "🏦", status: "nativa" },
  { name: "PagoPA", category: "Banca & Pagamenti", description: "Riconciliazione automatica dei pagamenti da enti pubblici tramite il nodo PagoPA. Integrazione per SAL su commesse pubbliche.", logo: "💳", status: "in-arrivo" },
  // Contabilità
  { name: "Zucchetti", category: "Contabilità & ERP", description: "Esportazione prima nota, analitica per centro di costo e integrazione con i moduli HR di Zucchetti Paghe. Compatibilità con Ad Hoc, Infinity e Mago.", logo: "📊", status: "nativa" },
  { name: "TeamSystem", category: "Contabilità & ERP", description: "Connettore bidirezionale con TeamSystem Studio e Enterprise. Sincronizzazione clienti, fornitori, analitica commessa e scadenzario.", logo: "🔄", status: "nativa" },
  { name: "Wolters Kluwer CGN", category: "Contabilità & ERP", description: "Export contabilità per studi commercialisti che usano Arca Evolution o Profis. Formato compatibile con l'importazione automatica.", logo: "📈", status: "in-arrivo" },
  // Prezzari
  { name: "Prezzari Regionali", category: "Prezzari & Computi", description: "Integrazione con i prezzari regionali ufficiali italiani (DEI, SIX, Pricebook) per la compilazione automatica di computi metrici estimativi aggiornati.", logo: "📐", status: "nativa" },
  { name: "Primus (ACCA Software)", category: "Prezzari & Computi", description: "Importazione/esportazione di computi metrici e preventivi in formato XMK compatibile con Primus e altri software di computo metrico ACCA.", logo: "🏗️", status: "nativa" },
  // Comunicazione
  { name: "WhatsApp Business API", category: "CRM & Marketing", description: "Invio automatico di messaggi WhatsApp per scadenze SAL, promemoria pagamenti, conferme appuntamenti con clienti e aggiornamenti cantiere.", logo: "💬", status: "nativa" },
  { name: "Gmail / Google Workspace", category: "CRM & Marketing", description: "Sincronizzazione email con Gmail per tracciare le comunicazioni con clienti e fornitori direttamente dalla scheda commessa. OAuth 2.0 sicuro.", logo: "📧", status: "nativa" },
  { name: "Mailchimp", category: "CRM & Marketing", description: "Sincronizzazione lista contatti e clienti con Mailchimp per campagne email marketing automatizzate. Segmentazione per zona geografica e tipo lavoro.", logo: "📮", status: "in-arrivo" },
  // Storage & Docs
  { name: "Google Drive", category: "Documenti & Storage", description: "Archiviazione automatica di documenti cantiere (planimetrie, foto, contratti) su Google Drive con struttura cartelle per commessa.", logo: "☁️", status: "nativa" },
  { name: "Dropbox Business", category: "Documenti & Storage", description: "Condivisione documenti di cantiere con clienti e DL tramite Dropbox. Upload automatico di foto e report dalla app mobile.", logo: "📁", status: "in-arrivo" },
  // CAD e BIM
  { name: "Autodesk AutoCAD (DXF/DWG)", category: "CAD & BIM", description: "Importazione di planimetrie e disegni tecnici in formato DXF/DWG per la gestione del cantiere referenziata alle tavole di progetto.", logo: "📐", status: "in-arrivo" },
  { name: "BIM (IFC)", category: "CAD & BIM", description: "Compatibilità con modelli BIM in formato IFC per l'estrazione automatica di quantità e la compilazione del computo metrico.", logo: "🏢", status: "in-arrivo" },
  // HR e presenze
  { name: "INPS Telematici", category: "HR & Presenze", description: "Export modelli per le comunicazioni obbligatorie INPS: Uniemens, LUL, CU e Denuncia Mensile Analitica (DMA) per la Cassa Edile.", logo: "🏛️", status: "nativa" },
  { name: "Casse Edili (CNCE)", category: "HR & Presenze", description: "Generazione automatica dei file telematici per la denuncia mensile alla Cassa Edile territoriale. Calcolo ore, paga oraria, maggiorazioni e contributi.", logo: "👷", status: "nativa" },
  // API
  { name: "API REST", category: "API & Sviluppatori", description: "API REST documentata con autenticazione OAuth 2.0. Oltre 120 endpoint per integrare Edilizia in Cloud con qualsiasi sistema aziendale o piattaforma custom.", logo: "⚡", status: "nativa" },
  { name: "Webhook", category: "API & Sviluppatori", description: "Webhook configurabili per eventi chiave: nuovo SAL, pagamento ricevuto, variante approvata, fine cantiere. Integrazione con Zapier, Make e n8n.", logo: "🔗", status: "nativa" },
];

const CATEGORIES = [...new Set(INTEGRATIONS.map((i) => i.category))];

const CATEGORY_COLORS: Record<string, string> = {
  "Fatturazione Elettronica": "bg-blue-100 text-blue-700",
  "Banca & Pagamenti": "bg-emerald-100 text-emerald-700",
  "Contabilità & ERP": "bg-indigo-100 text-indigo-700",
  "Prezzari & Computi": "bg-orange-100 text-orange-700",
  "CRM & Marketing": "bg-rose-100 text-rose-700",
  "Documenti & Storage": "bg-yellow-100 text-yellow-700",
  "CAD & BIM": "bg-slate-100 text-slate-700",
  "HR & Presenze": "bg-purple-100 text-purple-700",
  "API & Sviluppatori": "bg-gray-100 text-gray-700",
};

export default function Integrazioni() {
  useSEO({
    title: "Integrazioni Gestionale Edilizia",
    description: "Edilizia in Cloud si integra con i principali software italiani: fatturazione elettronica SDI, Zucchetti, TeamSystem, prezzari regionali, Cassa Edile e API REST.",
    canonical: "/integrazioni",
    keywords: "integrazioni gestionale edilizia, software edilizia fatturazione elettronica, edilizia zucchetti, teamSystem edilizia, API gestionale edilizia, whatsapp impresa edile, cassa edile software, prezzari edilizia software",
  });

  const baseUrl = "https://www.ediliziaincloud.com";
  const nativeCount = INTEGRATIONS.filter((i) => i.status === "nativa").length;

  return (
    <div className="min-h-screen bg-white text-[#111111]">
      <HubSeoSchema
        pageName="Integrazioni"
        pagePath="/integrazioni"
        pageDescription="Integrazioni native con SDI Agenzia Entrate, banche PSD2, Cassa Edile, INPS, INAIL, CRM e tool di marketing."
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
        "description": "Tutte le integrazioni native di Edilizia in Cloud: fatturazione elettronica SDI, Zucchetti, TeamSystem, WhatsApp Business, Cassa Edile e API REST.",
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
        "featureList": INTEGRATIONS.filter((i) => i.status === "nativa").map((i) => `Integrazione ${i.name}`),
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
            Si integra con i software<br />
            <span className="text-[#F97415]">che già usi</span>
          </h1>
          <p className="text-white/60 text-lg md:text-xl max-w-2xl mx-auto mb-10">
            {nativeCount} integrazioni native con i principali software italiani:
            fatturazione elettronica, contabilità, HR, prezzari, CRM e API REST.
            Nessun import/export manuale.
          </p>
          <div className="grid grid-cols-3 gap-6 max-w-lg mx-auto">
            {[
              { value: `${nativeCount}`, label: "Integrazioni native" },
              { value: "API REST", label: "120+ endpoint" },
              { value: "0", label: "Import manuali" },
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
                      item.status === "nativa"
                        ? "bg-white border-gray-200 hover:border-[#F97415]/40 hover:shadow-md"
                        : "bg-gray-50 border-gray-100 opacity-70"
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <span className="text-2xl">{item.logo}</span>
                      <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${
                        item.status === "nativa"
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-200 text-gray-500"
                      }`}>
                        {item.status === "nativa" ? "✓ Nativa" : "In arrivo"}
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

        {/* API section */}
        <div className="mt-8 rounded-3xl bg-[#111111] p-8 md:p-12">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div>
              <span className="inline-block px-3 py-1 rounded-full bg-[#F97415]/10 text-[#F97415] text-xs font-bold uppercase tracking-widest mb-4">
                API & Sviluppatori
              </span>
              <h2 className="text-2xl md:text-3xl font-extrabold text-white mb-4">
                API REST completa per ogni esigenza custom
              </h2>
              <p className="text-white/60 mb-6">
                Oltre 120 endpoint documentati con autenticazione OAuth 2.0.
                Integra Edilizia in Cloud con qualsiasi software aziendale, ERP personalizzato o app custom.
              </p>
              <ul className="space-y-2 mb-8">
                {[
                  "Documentazione API completa con esempi",
                  "Sandbox di test gratuita",
                  "Webhook configurabili per ogni evento",
                  "Rate limit generosi (1.000 req/min)",
                  "Supporto sviluppatori via email dedicata",
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
                Richiedi accesso API <ExternalLink size={15} />
              </Link>
            </div>
            <div className="bg-[#0d0d0d] rounded-2xl p-6 font-mono text-sm overflow-hidden">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="text-gray-500 text-xs ml-2">GET /api/v1/commesse</span>
              </div>
              <pre className="text-green-400 text-xs leading-relaxed overflow-x-auto">{`{
  "commesse": [
    {
      "id": "C-2026-042",
      "nome": "Ristrutturazione via Roma",
      "cliente": "Immobiliare Rossi Srl",
      "margine_attuale": 22.4,
      "avanzamento_pct": 68,
      "sal_prossimo": "2026-04-15",
      "liquidita_30gg": 48500
    }
  ],
  "totale": 12,
  "meta": { "cursor": "eyJpZCI..." }
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
            Il nostro team tecnico valuta nuove integrazioni su richiesta.
            Contattaci e ti diciamo se è fattibile — solitamente in meno di 72 ore.
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
              name: "Edilizia in Cloud si integra con FattureInCloud?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Sì. L'integrazione con FattureInCloud è nativa: le fatture create in Edilizia in Cloud vengono sincronizzate automaticamente su FattureInCloud per la contabilità. Non serve doppio inserimento.",
              },
            },
            {
              "@type": "Question",
              name: "Posso collegare Edilizia in Cloud al mio commercialista?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Sì. Edilizia in Cloud esporta automaticamente prima nota, registro IVA e movimenti in formato compatibile con i principali software contabili (TeamSystem, Zucchetti, Datev). Il tuo commercialista riceve i dati già strutturati.",
              },
            },
            {
              "@type": "Question",
              name: "C'è un'API per integrazioni personalizzate?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Sì. Edilizia in Cloud dispone di API REST documentata con autenticazione OAuth 2.0. Puoi collegare qualsiasi sistema esterno: ERP, CRM, software paghe, piattaforme e-commerce. La documentazione API è disponibile nel piano Impresa AI.",
              },
            },
            {
              "@type": "Question",
              name: "Le integrazioni hanno costi aggiuntivi?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Le integrazioni native (FattureInCloud, Aruba, Stripe, Google Calendar, ecc.) sono incluse nel piano senza costi aggiuntivi. L'accesso alle API REST è disponibile dal piano Impresa AI in poi.",
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
              { q: "Edilizia in Cloud si integra con FattureInCloud?", a: "Sì. L'integrazione con FattureInCloud è nativa: le fatture vengono sincronizzate automaticamente. Nessun doppio inserimento." },
              { q: "Posso collegare Edilizia in Cloud al mio commercialista?", a: "Sì. Edilizia in Cloud esporta prima nota, registro IVA e movimenti in formato compatibile con TeamSystem, Zucchetti e Datev. Il commercialista riceve i dati già strutturati." },
              { q: "C'è un'API per integrazioni personalizzate?", a: "Sì. API REST documentata con autenticazione OAuth 2.0. Puoi collegare qualsiasi sistema esterno: ERP, CRM, software paghe, piattaforme e-commerce." },
              { q: "Le integrazioni hanno costi aggiuntivi?", a: "Le integrazioni native sono incluse nel piano. L'accesso alle API REST è disponibile dal piano Impresa AI in poi." },
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
