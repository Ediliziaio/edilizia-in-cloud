import MarketingVisual from "@/components/marketing/MarketingVisual";
import EicPuntiFermi from "@/components/marketing/EicPuntiFermi";
import { confrontoVisuals } from "@/lib/marketing/visuals";
import { useSEO } from "@/hooks/useSEO";
import { JsonLd } from "@/components/seo/JsonLd";
import { Link } from "react-router-dom";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import { CheckCircle2, AlertCircle, ArrowRight, Sparkles } from "lucide-react";
import { blogPosts } from "@/data/blogPosts";

const openModal = () => {
  import("@/components/landing/QuickContactModal").then((m) => m.openContactModal());
};

// Ogni riga su Buildertrend viene dal sito ufficiale (pagine lette da browser
// il 30/10/2026, il sito risponde 403 alle richieste automatiche). Niente ✗,
// niente prezzi: dove il sito non ne parla si scrive «Non indicato sul sito
// ufficiale».
type CellType = "check" | "partial" | "text";

interface TableRow {
  feature: string;
  eic: { type: CellType; text?: string };
  competitor: { type: CellType; text?: string };
}

function Cell({ type, text, highlight = false }: { type: CellType; text?: string; highlight?: boolean }) {
  if (type === "check")
    return (
      <div className="flex flex-col items-center justify-center gap-1 text-eic-orange">
        <CheckCircle2 className="w-5 h-5" />
        {text && <span className="text-xs text-gray-600">{text}</span>}
      </div>
    );
  if (type === "partial")
    return (
      <div className="flex flex-col items-center justify-center text-amber-500 gap-1">
        <AlertCircle className="w-5 h-5" />
        {text && <span className="text-xs text-gray-600">{text}</span>}
      </div>
    );
  return <span className={`text-sm ${highlight ? "font-semibold text-eic-orange" : "text-[#111111]"}`}>{text}</span>;
}

const BT_HOME = "https://buildertrend.com/";
const BT_AI_2026 = "https://buildertrend.com/press-releases/ai-financial-platform-expansion/";
const BT_BILL_PAY = "https://buildertrend.com/press-releases/construction-bill-pay-launch-ibs-2026/";
const BT_BIZJET = "https://buildertrend.com/press-releases/buildertrend-acquires-bizjet-ai/";
const NON_INDICATO = "Non indicato sul sito ufficiale";

const rows: TableRow[] = [
  {
    feature: "Mercato e lingua",
    eic: { type: "text", text: "Imprese italiane, tutto in italiano" },
    competitor: { type: "text", text: "Mercato USA, sede a Omaha (dichiarato)" },
  },
  {
    feature: "Fattura elettronica allo SDI",
    eic: { type: "check", text: "Invio tramite openapi.it o Aruba, fatture ricevute in automatico" },
    competitor: { type: "text", text: `${NON_INDICATO}; dichiara il collegamento a QuickBooks, Xero e Sage Intacct` },
  },
  {
    feature: "POS sul modello ufficiale e DUVRI",
    eic: { type: "check", text: "POS sul DI 9/9/2014 con controllo Allegato XV, DUVRI" },
    competitor: { type: "text", text: NON_INDICATO },
  },
  {
    feature: "DURC dei subappaltatori con scadenze",
    eic: { type: "check", text: "Mancante, scaduto, in scadenza, con avvisi" },
    competitor: { type: "text", text: NON_INDICATO },
  },
  {
    feature: "SAL e rate",
    eic: { type: "check", text: "SAL = rata, firmato dal cliente via link" },
    competitor: { type: "check", text: "Fatturazione a stato avanzamento standard AIA con ritenute (dichiarato)" },
  },
  {
    feature: "Prezzari regionali italiani",
    eic: { type: "check", text: "19 regioni e province, nel listino" },
    competitor: { type: "text", text: NON_INDICATO },
  },
  {
    feature: "Contabilità dei lavori pubblici",
    eic: { type: "check", text: "Libretto, registro, SAL, certificato di pagamento" },
    competitor: { type: "text", text: NON_INDICATO },
  },
  {
    feature: "Lead, preventivi e contratti",
    eic: { type: "check", text: "CRM, preventivi di mestiere, firma con codice OTP" },
    competitor: { type: "check", text: "Lead, proposte e contratti (dichiarato)" },
  },
  {
    feature: "Varianti e giornale di cantiere",
    eic: { type: "check", text: "Varianti con PDF e firma del cliente, giornale lavori" },
    competitor: { type: "check", text: "Change order, giornali di cantiere, punch list (dichiarato)" },
  },
  {
    feature: "Fatture e bolle dei fornitori lette con AI",
    eic: { type: "check", text: "DDT e fatture ricevute; il DDT carica il magazzino" },
    competitor: { type: "check", text: "AI Bill Capture (dichiarato)" },
  },
  {
    feature: "Pagare fornitori e subappaltatori dal software",
    eic: { type: "partial", text: "Scadenzario e tesoreria; il pagamento parte dalla tua banca" },
    competitor: { type: "check", text: "Bill Pay, lanciato a febbraio 2026 (dichiarato)" },
  },
  {
    feature: "Portale del cliente",
    eic: { type: "check", text: "Avanzamento, documenti, firma, rate, assistenza" },
    competitor: { type: "check", text: "Aggiornamenti scritti dall'AI e pagamenti online (dichiarato)" },
  },
  {
    feature: "App per il cantiere",
    eic: { type: "check", text: "Timbratura GPS, rapportino per ruolo, foto, merce, mezzi" },
    competitor: { type: "check", text: "Nuova app mobile annunciata il 29/09/2026" },
  },
  {
    feature: "Assistenza in italiano",
    eic: { type: "check" },
    competitor: { type: "text", text: NON_INDICATO },
  },
];

const otherVsLinks = [
  { to: "/confronto/vs-primus", label: "vs Primus ACCA" },
  { to: "/confronto/vs-teamsystem", label: "vs TeamSystem Construction" },
  { to: "/confronto/vs-edilnet", label: "vs Edilnet" },
  { to: "/confronto/vs-excel", label: "vs Excel" },
];

const tldrPoints = [
  "Buildertrend è una piattaforma americana seria: dichiara oltre 20.000 costruttori e nel 2026 ha lanciato Bill Pay, AI Submittals, AI Plans e una nuova app.",
  "Sul sito ufficiale non indica lingua italiana, fattura elettronica SDI, POS, DURC o prezzari regionali. Sono cose che un'impresa italiana usa ogni settimana.",
  "Edilizia in Cloud nasce per il cantiere italiano: SDI, POS sul modello ufficiale, DUVRI, scadenze DURC, SAL che diventa rata, prezzari regionali, assistenza in italiano.",
];

const relatedLinks = [
  { to: "/confronto", label: "Tutti i confronti" },
  { to: "/funzionalita/fatturazione-elettronica", label: "Fatturazione elettronica" },
  { to: "/funzionalita/sicurezza-cantiere", label: "Sicurezza cantiere" },
  { to: "/funzionalita/gestione-subappalti", label: "Subappalti e DURC" },
  { to: "/funzionalita/contabilita-lavori", label: "Contabilità lavori" },
  { to: "/funzionalita/preventivi-edilizia", label: "Preventivi" },
  { to: "/funzionalita/app-cantiere-mobile", label: "App cantiere" },
];

const faqItems = [
  {
    q: "Buildertrend funziona per le imprese edili italiane?",
    a: "Buildertrend sul sito ufficiale si rivolge al mercato americano. Non indica fattura elettronica SDI, POS, DURC né prezzari regionali italiani, e per la contabilità dichiara il collegamento a QuickBooks, Xero e Sage Intacct. Un'impresa italiana dovrebbe gestire questi obblighi con altri strumenti. Edilizia in Cloud li tiene nello stesso posto della commessa.",
  },
  {
    q: "Buildertrend è disponibile in italiano?",
    a: "Sul sito ufficiale la lingua italiana non è indicata e il mercato dichiarato è quello USA, con sede a Omaha, in Nebraska. Edilizia in Cloud è in italiano in ogni schermata, anche nell'app degli operai, con assistenza in italiano.",
  },
  {
    q: "Software edilizia americano o italiano: cosa cambia davvero?",
    a: "Cambiano i documenti di tutti i giorni. In Italia la fattura passa dallo SDI, il cantiere chiede POS e DUVRI, i subappaltatori hanno un DURC con una scadenza e il SAL spesso è la rata che il cliente deve pagare. Un software americano lavora con altri standard: Buildertrend, per esempio, dichiara la fatturazione a stato avanzamento secondo lo standard AIA.",
  },
  {
    q: "Cosa ha annunciato Buildertrend nel 2026?",
    a: "Dai comunicati ufficiali: a febbraio Bill Pay, per pagare subappaltatori e fornitori con lettura AI delle fatture; a luglio l'acquisizione di BizJet AI, per sviluppare agenti AI; a settembre AI Submittals, AI Bill Capture, AI Client Updates, AI Plans, integrazioni con Sage Intacct e Bluebeam e una nuova app mobile.",
  },
  {
    q: "Posso passare da Buildertrend a Edilizia in Cloud?",
    a: "Sì. I clienti si importano da file Excel o CSV. Per cantieri, fornitori e documenti ti affianchiamo noi: i tempi si concordano dopo aver visto i dati esportati. Formazione e assistenza sono in italiano.",
  },
];

const vsRelatedSlugs = [
  "come-scegliere-software-gestionale-edilizia",
  "alternativa-excel-cantieri",
  "analisi-margini-imprese-edili",
];
const vsRelatedPosts = blogPosts.filter((p) => vsRelatedSlugs.includes(p.slug)).slice(0, 3);

const SEO_TITLE = "Buildertrend in Italiano? L'Alternativa Italiana";
const SEO_DESCRIPTION =
  "Buildertrend è nato per il mercato USA. Confronto per imprese italiane: SDI, POS e DUVRI, scadenze DURC, SAL e rate, prezzari regionali. Ottobre 2026.";
const H1 = "Edilizia in Cloud vs Buildertrend: cosa serve a un'impresa edile italiana";

export default function VsBuildertrend() {
  useSEO({
    title: SEO_TITLE,
    description: SEO_DESCRIPTION,
    canonical: "/confronto/vs-buildertrend",
    type: "article",
    modifiedTime: "2026-10-30",
    keywords:
      "buildertrend in italiano, alternativa italiana a buildertrend, software edilizia americano vs italiano, edilizia in cloud vs buildertrend, gestionale edilizia sdi",
  });

  return (
    <div className="min-h-screen bg-white text-[#111111] overflow-x-hidden">
      <JsonLd
        id="jsonld-article-vs-buildertrend"
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: H1,
          description: SEO_DESCRIPTION,
          url: "https://www.ediliziaincloud.com/confronto/vs-buildertrend/",
          image: "https://www.ediliziaincloud.com/og/confronto-buildertrend.jpg",
          datePublished: "2026-04-08",
          dateModified: "2026-10-30",
          author: { "@type": "Organization", name: "Edilizia in Cloud" },
          publisher: { "@type": "Organization", name: "Edilizia in Cloud" },
        }}
      />
      <JsonLd
        id="jsonld-software-vs-buildertrend"
        data={{
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "Edilizia in Cloud",
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web",
          url: "https://www.ediliziaincloud.com/",
        }}
      />
      <JsonLd
        id="jsonld-faq-vs-buildertrend"
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqItems.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }}
      />
      <JsonLd
        id="jsonld-breadcrumb-vs-buildertrend"
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: "https://www.ediliziaincloud.com/" },
            { "@type": "ListItem", position: 2, name: "Confronto", item: "https://www.ediliziaincloud.com/confronto" },
            {
              "@type": "ListItem",
              position: 3,
              name: "vs Buildertrend",
              item: "https://www.ediliziaincloud.com/confronto/vs-buildertrend",
            },
          ],
        }}
      />

      <LandingNavbar />

      {/* ── HERO ── */}
      <section className="bg-[#111111] pt-36 pb-24 px-4 text-center">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-8 lg:gap-12 items-center lg:text-left">
          <div className="min-w-0">
            <span className="inline-block bg-eic-orange/20 text-eic-orange text-xs font-bold tracking-widest uppercase px-4 py-1.5 rounded-full mb-6 border border-eic-orange/30">
              CONFRONTO ONESTO — OTTOBRE 2026
            </span>
            <h1 className="text-3xl md:text-5xl font-extrabold text-white leading-tight mb-6">{H1}</h1>
            <p className="text-lg text-white/70 mb-10 max-w-2xl mx-auto">
              Buildertrend è una piattaforma solida, costruita per i costruttori americani. In Italia però la fattura
              passa dallo SDI, il cantiere chiede il POS e il subappaltatore ha un DURC che scade. Qui vedi cosa dichiara
              Buildertrend e cosa copre Edilizia in Cloud.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={openModal}
                className="inline-flex items-center gap-2 bg-eic-orange hover:bg-eic-orange-dark text-white font-bold px-8 py-4 rounded-2xl transition-colors text-lg"
              >
                Richiedi una demo <ArrowRight className="w-5 h-5" />
              </button>
              <Link
                to="/confronto/"
                className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-semibold px-8 py-4 rounded-2xl transition-colors text-lg border border-white/20"
              >
                Tutti i confronti
              </Link>
            </div>
          </div>
          <MarketingVisual image={confrontoVisuals.buildertrend} priority tone="dark" caption="Illustrazione editoriale · Edilizia in Cloud" />
        </div>
      </section>

      {/* ── TL;DR ── */}
      <section className="bg-white pt-14 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="rounded-2xl border-l-4 border-eic-orange bg-eic-orange/5 p-6 md:p-7">
            <p className="text-xs font-bold tracking-widest uppercase text-eic-orange mb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4" /> In breve — 3 cose da sapere
            </p>
            <ul className="space-y-2 text-[#111111] text-sm md:text-base leading-relaxed">
              {tldrPoints.map((p, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-eic-orange font-bold shrink-0">{i + 1}.</span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="bg-white pt-10 px-4">
        <EicPuntiFermi className="max-w-5xl mx-auto" />
      </section>

      {/* ── COMPARISON TABLE ── */}
      <section className="bg-white py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-4xl font-extrabold text-center text-[#111111] mb-4">
            Confronto funzionalità
          </h2>
          <p className="text-center text-gray-500 mb-12 max-w-xl mx-auto">
            Aggiornato a ottobre 2026. Per Buildertrend riportiamo solo quello che dichiara il sito ufficiale; «non
            indicato» vuol dire che le pagine lette non ne parlano, non che la funzione manchi.
          </p>
          <div className="overflow-x-auto rounded-2xl border border-gray-100 shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#111111]">
                  <th className="text-left px-6 py-4 text-white/70 font-semibold w-2/5">Cosa serve</th>
                  <th className="text-center px-6 py-4 text-eic-orange font-bold">Edilizia in Cloud</th>
                  <th className="text-center px-6 py-4 text-white/70 font-semibold">Buildertrend</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={row.feature}
                    className={`border-t border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-[#f8f9fa]"}`}
                  >
                    <td className="px-6 py-4 font-medium text-[#111111]">{row.feature}</td>
                    <td className="px-6 py-4 text-center">
                      <Cell type={row.eic.type} text={row.eic.text} highlight />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Cell type={row.competitor.type} text={row.competitor.text} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── DOVE BUILDERTREND È PIÙ FORTE ── */}
      <section className="bg-white pb-4 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-extrabold text-center text-[#111111] mb-4">
            Dove Buildertrend è più forte
          </h2>
          <p className="text-center text-gray-500 mb-10 max-w-xl mx-auto">
            Un confronto serve se dice anche questo. Tutto quello che segue è dichiarato da Buildertrend.
          </p>
          <div className="space-y-4">
            {[
              {
                t: "Dimensione",
                d: "Oltre 20.000 costruttori dichiarati. Secondo l'azienda, più di metà delle case costruite negli USA passa da Buildertrend.",
              },
              {
                t: "Pagamenti a fornitori e subappaltatori",
                d: "Bill Pay, lanciato a febbraio 2026: le fatture dei fornitori lette con l'AI e pagate dal software. Edilizia in Cloud tiene scadenzario e tesoreria, ma il pagamento parte dalla tua banca.",
              },
              {
                t: "AI su disegni e documenti tecnici",
                d: "A settembre 2026 ha annunciato AI Submittals, AI Plans e AI Client Updates, più il collegamento con Bluebeam per i disegni. A luglio ha comprato BizJet AI per sviluppare agenti AI.",
              },
              {
                t: "Integrazioni contabili americane",
                d: "QuickBooks, Xero e Sage Intacct, quest'ultima con sincronizzazione nei due sensi. Per chi lavora con quei programmi è un punto concreto.",
              },
            ].map((item) => (
              <div key={item.t} className="bg-[#f8f9fa] rounded-2xl p-6 border border-gray-100">
                <h3 className="font-extrabold text-[#111111] mb-1">{item.t}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{item.d}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-[#111111] font-semibold mt-8 max-w-2xl mx-auto">
            Tutto vero, per il mercato americano. Per un'impresa italiana resta la domanda di sempre: chi manda la
            fattura allo SDI, chi prepara il POS, chi controlla il DURC del subappaltatore?
          </p>
        </div>
      </section>

      {/* ── COSA SERVE IN ITALIA ── */}
      <section className="bg-[#f8f9fa] py-20 px-4 mt-16">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-4xl font-extrabold text-center text-[#111111] mb-4">
            Cosa usa ogni settimana un'impresa edile italiana
          </h2>
          <p className="text-center text-gray-500 mb-12 max-w-xl mx-auto">
            Queste voci non sono indicate sul sito ufficiale di Buildertrend. In Edilizia in Cloud stanno dentro la
            commessa.
          </p>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                emoji: "🧾",
                title: "Fattura allo SDI",
                desc: "Fatture, note di credito e fatture a privati partono allo SDI tramite openapi.it o Aruba. Le fatture dei fornitori arrivano da sole. Registro IVA e scadenzario nello stesso posto.",
              },
              {
                emoji: "🦺",
                title: "POS, DUVRI e DURC",
                desc: "POS sul modello ufficiale del DI 9/9/2014 con controllo dell'Allegato XV. DUVRI. Per ogni subappaltatore vedi se il DURC manca, è scaduto o sta per scadere, con avvisi.",
              },
              {
                emoji: "📐",
                title: "SAL, rate e prezzari",
                desc: "Il SAL diventa la rata: il cliente lo firma dal link e la rata matura. Prezzari regionali di 19 regioni e province nel listino. Per i lavori pubblici: libretto, registro e certificato di pagamento.",
              },
            ].map((item) => (
              <div key={item.title} className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                <div className="text-3xl mb-3">{item.emoji}</div>
                <h3 className="font-bold text-lg text-[#111111] mb-2">{item.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-gray-600 text-sm mt-10 max-w-2xl mx-auto">
            E in cantiere: timbratura a un tocco con GPS, rapportini diversi per operaio e caposquadra, foto della merce
            presa in negozio, DDT letti con l'AI che caricano il magazzino, mezzi e attrezzi con etichetta QR.
          </p>
        </div>
      </section>

      {/* ── QUANDO SCEGLIERE ── */}
      <section className="bg-white py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-extrabold text-center text-[#111111] mb-10">
            Per chi ha senso Buildertrend e per chi Edilizia in Cloud
          </h2>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm">
              <div className="text-2xl mb-3">🔵</div>
              <h3 className="text-xl font-extrabold text-[#111111] mb-4">Per chi ha senso Buildertrend</h3>
              <ul className="mt-4 space-y-2">
                {[
                  "Lavori soprattutto nel mercato americano",
                  "La tua contabilità gira su QuickBooks, Xero o Sage Intacct",
                  "Il tuo team lavora già in inglese e con lo standard AIA",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-gray-600">
                    <span className="text-gray-400 mt-0.5">•</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-[#111111] rounded-2xl p-8 border border-eic-orange/30">
              <div className="text-2xl mb-3">🟠</div>
              <h3 className="text-xl font-extrabold text-white mb-4">Per chi ha senso Edilizia in Cloud</h3>
              <ul className="mt-4 space-y-2">
                {[
                  "Sei un'impresa italiana e fatturi allo SDI",
                  "Ti servono POS, DUVRI e il controllo dei DURC",
                  "Vuoi SAL e rate firmati dal cliente, e l'app degli operai in italiano",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-white/70">
                    <CheckCircle2 className="w-4 h-4 text-eic-orange mt-0.5 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── MIGRATION BOX ── */}
      <section className="bg-[#f8f9fa] py-16 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="bg-eic-orange/10 border border-eic-orange/30 rounded-2xl p-8 text-center">
            <div className="text-3xl mb-4">📦</div>
            <h3 className="text-xl font-extrabold text-[#111111] mb-3">Usi già Buildertrend?</h3>
            <p className="text-gray-600 leading-relaxed mb-6">
              I clienti si importano da file Excel o CSV. Per cantieri, fornitori e documenti ti affianchiamo noi: i
              tempi si concordano dopo aver visto i dati esportati.
            </p>
            <button
              onClick={openModal}
              className="inline-flex items-center gap-2 bg-eic-orange hover:bg-eic-orange-dark text-white font-bold px-8 py-4 rounded-2xl transition-colors"
            >
              Parliamo del passaggio <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="bg-[#f8f9fa] py-20 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-extrabold text-center text-[#111111] mb-12">
            Domande frequenti
          </h2>
          <div className="space-y-6">
            {faqItems.map((item) => (
              <div key={item.q} className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                <h3 className="text-base font-extrabold text-[#111111] mb-3">{item.q}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FONTI E DICHIARAZIONE DI PARTE ── */}
      <section className="bg-white py-16 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-extrabold text-center text-[#111111] mb-4">
            Come abbiamo scritto questo confronto
          </h2>
          <p className="text-gray-600 text-sm leading-relaxed text-center max-w-2xl mx-auto">
            Confronto a cura di Edilizia in Cloud, parte interessata, aggiornato a ottobre 2026. Su Buildertrend
            riportiamo solo quello che dichiarano il sito e i comunicati ufficiali. Le funzioni di Edilizia in Cloud
            dipendono dal piano e dai permessi per ruolo.
          </p>
          <ul className="mt-6 space-y-2 text-sm text-center">
            {[
              { href: BT_HOME, label: "Buildertrend — sito ufficiale" },
              { href: BT_AI_2026, label: "Buildertrend — espansione AI e finanza (29/09/2026)" },
              { href: BT_BILL_PAY, label: "Buildertrend — lancio di Bill Pay (11/02/2026)" },
              { href: BT_BIZJET, label: "Buildertrend — acquisizione di BizJet AI (28/07/2026)" },
            ].map((s) => (
              <li key={s.href}>
                <a
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-eic-orange underline underline-offset-2 hover:text-eic-orange-dark"
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── 4-WAY INTERNAL LINKING ── */}
      <section className="bg-[#f8f9fa] py-10 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-sm font-bold tracking-widest uppercase text-eic-orange mb-4">Confronta anche con</h2>
          <div className="flex flex-wrap gap-3 justify-center">
            {otherVsLinks.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="inline-flex items-center gap-1.5 bg-white border border-gray-200 hover:border-eic-orange hover:text-eic-orange text-[#111111] font-semibold px-5 py-2.5 rounded-full transition-colors text-sm"
              >
                {l.label} <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── RELATED ── */}
      <section className="bg-white py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-xl font-extrabold text-center text-[#111111] mb-8">Le funzioni citate in questa pagina</h2>
          <div className="flex flex-wrap gap-4 justify-center">
            {relatedLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="inline-flex items-center gap-2 bg-white border border-gray-200 hover:border-eic-orange hover:text-eic-orange text-[#111111] font-semibold px-6 py-3 rounded-2xl transition-colors text-sm"
              >
                {link.label} <ArrowRight className="w-4 h-4" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── OLTRE AL SOFTWARE ── */}
      <section className="bg-white py-16 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-extrabold text-center text-[#111111] mb-4">
            Il software è metà del lavoro
          </h2>
          <p className="text-center text-gray-500 mb-10 max-w-xl mx-auto">
            Nessun gestionale, italiano o americano, raddrizza un'impresa che non sa leggere i propri numeri, non ha un
            metodo di vendita e aspetta che il telefono suoni. Il software organizza: i margini li fanno le competenze.
          </p>
          <div className="space-y-4">
            {[
              {
                t: "Consulenti dedicati, formazione e webinar",
                d: (
                  <>
                    Con Edilizia in Cloud hai accanto persone, non solo schermate: consulenti dedicati per area,
                    formazione e webinar, assistenza in italiano, nei tuoi orari. Cosa serve a te si definisce in
                    consulenza.
                  </>
                ),
              },
              {
                t: "Numeri in Edilizia — leggere margini e commesse",
                d: (
                  <>
                    <a
                      href="https://www.numerinedilizia.com/"
                      target="_blank"
                      rel="noopener"
                      className="font-semibold text-eic-orange underline underline-offset-2 hover:text-eic-orange-dark"
                    >
                      Numeri in Edilizia
                    </a>{" "}
                    è il metodo di controllo di gestione per imprese edili: insegna al titolare a leggere margini,
                    commesse e utile.
                  </>
                ),
              },
              {
                t: "VENDITA EDILE® — il metodo commerciale",
                d: (
                  <>
                    <a
                      href="https://venditaedile.it/"
                      target="_blank"
                      rel="nofollow noopener noreferrer"
                      className="font-semibold text-eic-orange underline underline-offset-2 hover:text-eic-orange-dark"
                    >
                      VENDITA EDILE®
                    </a>{" "}
                    è l'affiancamento commerciale all'imprenditore edile: un metodo di vendita tarato sul cliente
                    italiano, privati e condomini compresi.
                  </>
                ),
              },
              {
                t: "Marketing Edile® — il flusso di richieste",
                d: (
                  <>
                    <a
                      href="https://www.marketingedile.com/"
                      target="_blank"
                      rel="nofollow noopener noreferrer"
                      className="font-semibold text-eic-orange underline underline-offset-2 hover:text-eic-orange-dark"
                    >
                      Marketing Edile®
                    </a>{" "}
                    porta clienti qualificati a imprese edili e serramentisti e lavora solo a percentuale sulle vendite:
                    sul sito dichiara 47 aziende seguite e oltre 60 milioni di euro generati.
                  </>
                ),
              },
            ].map((item) => (
              <div key={item.t} className="bg-[#f8f9fa] rounded-2xl p-6 border border-gray-100">
                <h3 className="font-extrabold text-[#111111] mb-1">{item.t}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{item.d}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-[#111111] font-semibold mt-8 max-w-2xl mx-auto">
            Onestà: Buildertrend ha una base di clienti enorme e un'azienda grande alle spalle, costruite per il mercato
            americano. La differenza non è solo chi ti affianca, ma su cosa e in che lingua. Il tuo problema è che il
            software non ti basta, o che nessuno ti ha insegnato a leggere i margini?
          </p>
        </div>
      </section>

      {/* ── LE DOMANDE GIUSTE ── */}
      <section className="bg-[#f8f9fa] py-20 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-extrabold text-center text-[#111111] mb-4">
            Le domande giuste da farti prima di scegliere
          </h2>
          <p className="text-center text-gray-500 mb-10 max-w-xl mx-auto">
            Americano o italiano, prima di firmare rispondi a queste.
          </p>
          <ul className="space-y-4">
            {[
              "La fattura elettronica allo SDI la manda il software, o servirà un secondo programma?",
              "POS, DUVRI e DURC dei subappaltatori: dove li tieni oggi, e chi ti avvisa delle scadenze?",
              "Il SAL che mandi al cliente è anche la rata che deve pagare?",
              "Il capocantiere può lavorare ogni giorno su un'app in inglese senza rallentare?",
              "Quando qualcosa si blocca, l'assistenza risponde in italiano e nei tuoi orari?",
            ].map((q, i) => (
              <li key={q} className="flex items-start gap-3 bg-white rounded-2xl p-5 border border-gray-100">
                <span className="text-eic-orange font-extrabold shrink-0">{i + 1}.</span>
                <span className="text-[#111111] text-sm md:text-base leading-relaxed">{q}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="bg-[#111111] py-20 px-4 text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl md:text-4xl font-extrabold text-white mb-4">
            Guarda una commessa italiana dall'inizio alla fine
          </h2>
          <p className="text-white/70 mb-8 text-lg">
            Dal preventivo firmato al POS, dal SAL alla fattura SDI. In italiano, con chi lavora nei cantieri italiani.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={openModal}
              className="inline-flex items-center justify-center gap-2 bg-eic-orange hover:bg-eic-orange-dark text-white font-bold px-10 py-5 rounded-2xl transition-colors text-lg"
            >
              Richiedi una demo <ArrowRight className="w-5 h-5" />
            </button>
            <Link
              to="/demo/"
              className="inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white font-semibold px-8 py-5 rounded-2xl transition-colors text-lg border border-white/20"
            >
              Come funziona la demo
            </Link>
          </div>
        </div>
      </section>

      {vsRelatedPosts.length > 0 && (
        <section className="py-14 px-6 bg-white border-t border-gray-100">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-lg font-bold text-[#111111] mb-6">Leggi anche</h2>
            <div className="grid sm:grid-cols-3 gap-4">
              {vsRelatedPosts.map((p) => (
                <Link key={p.slug} to={`/blog/${p.slug}/`} className="group flex flex-col gap-2 rounded-xl border border-gray-200 hover:border-eic-orange/40 p-4 transition-all hover:shadow-sm">
                  <img src={p.coverImage} alt={p.title} className="w-full h-28 object-cover rounded-lg" loading="lazy" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-eic-orange">{p.category}</span>
                  <span className="text-sm font-semibold text-[#111111] leading-snug group-hover:text-eic-orange transition-colors line-clamp-2">{p.title}</span>
                  <span className="text-xs text-[#111111]/50">{p.readTime} min di lettura</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <LandingFooter />

      {/* ── STICKY CTA ── */}
      <button
        onClick={openModal}
        className="fixed bottom-6 right-6 left-6 sm:left-auto z-40 inline-flex items-center justify-center gap-2 bg-eic-orange hover:bg-eic-orange-dark text-white font-bold px-6 py-3.5 rounded-full transition-colors shadow-2xl shadow-eic-orange/40 text-sm"
      >
        Richiedi una demo <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}
