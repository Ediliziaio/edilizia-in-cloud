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

// Edilnet (edilnet.it) è un portale di richieste di preventivo, non un
// gestionale. Ogni riga su Edilnet viene dalla home ufficiale (letta il
// 30/10/2026); /about-us e /come-funziona non erano leggibili. Niente ✗:
// dove il portale non ne parla si scrive «Non indicato sul sito ufficiale».
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

const EDILNET_URL = "https://www.edilnet.it/";
const NON_INDICATO = "Non indicato sul sito ufficiale";

const rows: TableRow[] = [
  {
    feature: "Che cos'è",
    eic: { type: "text", text: "Gestionale per imprese edili" },
    competitor: { type: "text", text: "Portale che mette in contatto privati e imprese (dichiarato)" },
  },
  {
    feature: "Portarti richieste di preventivo da privati",
    eic: { type: "partial", text: "Non è un portale: raccoglie i contatti dai tuoi canali (moduli Meta, form sul sito, prenotazione online)" },
    competitor: { type: "check", text: "Il privato riceve fino a 4 preventivi dalla sua zona (dichiarato)" },
  },
  {
    feature: "Recensioni",
    eic: { type: "check", text: "Recensioni Google Business Profile: le leggi e rispondi dall'app" },
    competitor: { type: "check", text: "Profilo dell'impresa con recensioni verificate (dichiarato)" },
  },
  {
    feature: "Contatto e opportunità con fasi e promemoria",
    eic: { type: "check", text: "Pipeline, motivo di perdita, richiami automatici" },
    competitor: { type: "text", text: NON_INDICATO },
  },
  {
    feature: "Sopralluogo con modello per mestiere",
    eic: { type: "check", text: "7 modelli: infissi, bagno, ristrutturazione, FV, cappotto, tetto, clima" },
    competitor: { type: "text", text: NON_INDICATO },
  },
  {
    feature: "Preventivo di mestiere",
    eic: { type: "check", text: "Con disegno degli infissi, piano di posa FV, render, computo" },
    competitor: { type: "text", text: NON_INDICATO },
  },
  {
    feature: "Firma del cliente a distanza",
    eic: { type: "check", text: "Codice OTP via SMS o email, su copia bloccata del PDF" },
    competitor: { type: "text", text: NON_INDICATO },
  },
  {
    feature: "Commessa, SAL e fattura SDI",
    eic: { type: "check", text: "Fasi, squadre, margine; SAL firmato dal cliente; invio SDI" },
    competitor: { type: "text", text: NON_INDICATO },
  },
  {
    feature: "App per operai e caposquadra",
    eic: { type: "check", text: "Timbratura, rapportino, foto, merce" },
    competitor: { type: "text", text: NON_INDICATO },
  },
  {
    feature: "Lingua e mercato",
    eic: { type: "text", text: "Italiano, imprese italiane" },
    competitor: { type: "text", text: "Italiano, richieste da tutte le province (dichiarato)" },
  },
];

const percorso = [
  {
    t: "1. Arriva la richiesta su Edilnet",
    d: "La registri come contatto e opportunità. Dal telefono, in un minuto. Da lì ha una fase, una data e qualcuno che la segue.",
  },
  {
    t: "2. Fissi il sopralluogo",
    d: "Lo metti in calendario con i km dalla sede, e si allinea a Google o Apple. Sul posto usi il modello del tuo mestiere. Il cliente firma e il PDF del sopralluogo è pronto.",
  },
  {
    t: "3. Fai il preventivo di mestiere",
    d: "Serramenti con il disegno degli infissi nel PDF. Fotovoltaico con il piano di posa in scala. Un render per far vedere il risultato. E come paga: acconto, SAL o rate.",
  },
  {
    t: "4. Il cliente firma con un codice",
    d: "Riceve il link e firma con un codice OTP via SMS o email. Firma una copia bloccata del PDF, con le clausole da approvare a parte.",
  },
  {
    t: "5. Nasce la commessa",
    d: "Fasi, squadre, date. Per ogni fase vedi costo previsto e costo reale. Il SAL lo firma il cliente dal link e la rata matura. Poi parte la fattura allo SDI.",
  },
  {
    t: "Se non firma subito",
    d: "Un'automazione lo ricontatta per email o SMS (anche WhatsApp, con l'add-on) e si ferma quando risponde. Il preventivo non resta in un cassetto.",
  },
];

const relatedLinks = [
  { to: "/funzionalita/crm-edilizia", label: "CRM edilizia" },
  { to: "/funzionalita/pipeline-vendite", label: "Pipeline vendite" },
  { to: "/funzionalita/preventivi-edilizia", label: "Preventivi" },
  { to: "/funzionalita/render-infissi", label: "Render infissi" },
  { to: "/funzionalita/firma-elettronica", label: "Firma elettronica" },
  { to: "/funzionalita/gestione-commesse", label: "Gestione commesse" },
  { to: "/funzionalita/automazioni", label: "Automazioni" },
];

const otherVsLinks = [
  { to: "/confronto/vs-primus", label: "vs Primus ACCA" },
  { to: "/confronto/vs-teamsystem", label: "vs TeamSystem Construction" },
  { to: "/confronto/vs-excel", label: "vs Excel" },
  { to: "/confronto/vs-buildertrend", label: "vs Buildertrend" },
];

const tldrPoints = [
  "Edilnet non è un gestionale. Il sito ufficiale lo presenta come un portale: il privato descrive il lavoro e riceve fino a 4 preventivi da imprese della sua zona.",
  "Edilizia in Cloud lavora dopo la richiesta: contatto, sopralluogo, preventivo di mestiere, firma con codice OTP, commessa, SAL e fattura SDI.",
  "Non si escludono. Edilnet ti porta la richiesta, Edilizia in Cloud la trasforma in un lavoro firmato e seguito fino all'ultima rata.",
];

const faqItems = [
  {
    q: "Edilnet è un gestionale per imprese edili?",
    a: "No. Il sito ufficiale edilnet.it presenta Edilnet come un portale che mette in contatto privati e imprese: il privato descrive il lavoro e riceve fino a 4 preventivi da ditte della sua zona. Strumenti per gestire cantieri, fatture, SAL o DDT non sono indicati sul sito ufficiale.",
  },
  {
    q: "Posso usare Edilnet e Edilizia in Cloud insieme?",
    a: "Sì, ed è il modo giusto di vederli. Edilnet ti porta la richiesta di preventivo. Edilizia in Cloud la segue: contatto, sopralluogo, preventivo, firma, commessa, SAL e fattura.",
  },
  {
    q: "Cosa succede in Edilizia in Cloud dopo una richiesta arrivata da Edilnet?",
    a: "La registri come contatto e opportunità. Fissi il sopralluogo in calendario e lo fai con il modello del tuo mestiere. Prepari il preventivo, anche con disegno degli infissi o render. Il cliente firma con un codice OTP via SMS o email. Da lì nasce la commessa, con fasi, squadre e margine per fase.",
  },
  {
    q: "Le richieste di Edilnet entrano da sole in Edilizia in Cloud?",
    a: "No: non c'è un collegamento diretto con Edilnet. La richiesta si registra come contatto, anche dal telefono. Entrano invece da soli i contatti dai moduli Meta che attivi, dai form sul tuo sito e dalle prenotazioni online del tuo calendario.",
  },
  {
    q: "Edilizia in Cloud ha un profilo pubblico con recensioni, come un portale?",
    a: "No, non è un portale e non ha una vetrina sua. Gestisce le recensioni del tuo profilo Google Business: le leggi e rispondi dall'app. Edilnet invece, sul sito ufficiale, dichiara un profilo dell'impresa con recensioni verificate.",
  },
  {
    q: "Qual è l'alternativa a Edilnet per gestire l'impresa?",
    a: "Se non cerchi un canale per trovare clienti ma uno strumento per gestirli, ti serve un gestionale edile. Edilizia in Cloud tiene insieme contatti, sopralluoghi, preventivi, firma, commesse, SAL, fatture SDI e l'app per gli operai.",
  },
];

const vsRelatedSlugs = ["richieste-preventivo-ristrutturazione-online", "crm-edilizia-gestire-lead-preventivi-follow-up", "come-fare-preventivo-edilizia"];
const vsRelatedPosts = blogPosts.filter((p) => vsRelatedSlugs.includes(p.slug)).slice(0, 3);

const SEO_TITLE = "Edilnet o gestionale? Dalla richiesta alla commessa";
const SEO_DESCRIPTION =
  "Edilnet porta richieste di preventivo dai privati, non è un gestionale. Come trasformarle in sopralluogo, preventivo, firma OTP e commessa. Ottobre 2026.";
const H1 = "Edilizia in Cloud vs Edilnet: dalla richiesta di preventivo alla commessa";

export default function VsEdilnet() {
  useSEO({
    title: SEO_TITLE,
    description: SEO_DESCRIPTION,
    canonical: "/confronto/vs-edilnet",
    modifiedTime: "2026-10-30",
    keywords:
      "edilnet alternativa, edilnet gestionale, edilizia in cloud vs edilnet, portale preventivi edilizia, gestire richieste di preventivo, crm impresa edile",
  });

  return (
    <div className="min-h-screen bg-white text-[#111111] overflow-x-hidden">
      <JsonLd
        id="jsonld-breadcrumb-vs-edilnet"
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: "https://www.ediliziaincloud.com/" },
            { "@type": "ListItem", position: 2, name: "Confronto", item: "https://www.ediliziaincloud.com/confronto" },
            {
              "@type": "ListItem",
              position: 3,
              name: "vs Edilnet",
              item: "https://www.ediliziaincloud.com/confronto/vs-edilnet",
            },
          ],
        }}
      />
      <JsonLd
        id="jsonld-software-vs-edilnet"
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
        id="jsonld-faq-vs-edilnet"
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
        id="jsonld-webpage-vs-edilnet"
        data={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: H1,
          description: SEO_DESCRIPTION,
          url: "https://www.ediliziaincloud.com/confronto/vs-edilnet",
          dateModified: "2026-10-30",
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
              Edilnet ti porta la richiesta di un privato. Poi tocca a te: richiamarlo, fare il sopralluogo, il
              preventivo, farlo firmare, aprire il cantiere. Questa pagina spiega cosa fa l'uno, cosa fa l'altro e come
              lavorano insieme.
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
          <MarketingVisual image={confrontoVisuals.edilnet} priority tone="dark" caption="Illustrazione editoriale · Edilizia in Cloud" />
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
            Chi fa cosa
          </h2>
          <p className="text-center text-gray-500 mb-12 max-w-xl mx-auto">
            Aggiornato a ottobre 2026, con quello che Edilnet dichiara sulla{" "}
            <a href={EDILNET_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              home ufficiale
            </a>
            . Sono due prodotti diversi: la tabella serve proprio a capire dove finisce uno e inizia l'altro.
          </p>
          <div className="overflow-x-auto rounded-2xl border border-gray-100 shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#111111]">
                  <th className="text-left px-6 py-4 text-white/70 font-semibold w-2/5">Cosa serve</th>
                  <th className="text-center px-6 py-4 text-eic-orange font-bold">Edilizia in Cloud</th>
                  <th className="text-center px-6 py-4 text-white/70 font-semibold">Edilnet</th>
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

      {/* ── PERCORSO ── */}
      <section className="bg-[#111111] py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-4xl font-extrabold text-center text-white mb-4">
            Dalla richiesta Edilnet alla commessa
          </h2>
          <p className="text-center text-white/60 mb-12 max-w-xl mx-auto">
            Cosa succede in Edilizia in Cloud dopo che il privato ti ha scelto.
          </p>
          <div className="grid md:grid-cols-2 gap-5">
            {percorso.map((p) => (
              <div key={p.t} className="bg-white/5 border border-white/10 rounded-2xl p-6">
                <h3 className="text-eic-orange font-extrabold mb-2">{p.t}</h3>
                <p className="text-white/80 text-sm leading-relaxed">{p.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── DOVE EDILNET È PIÙ FORTE ── */}
      <section className="bg-white py-20 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-extrabold text-center text-[#111111] mb-4">
            Dove Edilnet è più forte
          </h2>
          <p className="text-center text-gray-500 mb-10 max-w-xl mx-auto">
            Un confronto serve se dice anche questo. Per quello che fa, cioè portare contatti, Edilnet ha i suoi punti.
          </p>
          <div className="space-y-4">
            {[
              {
                t: "Ti porta richieste di preventivo",
                d: "Il privato descrive il lavoro, le imprese registrate ricevono la richiesta. Edilizia in Cloud non lo fa: non è un portale.",
              },
              {
                t: "Una vetrina con recensioni",
                d: "Sul sito ufficiale Edilnet dichiara recensioni verificate e la possibilità di farsi pubblicità. Per chi lavora col privato è visibilità in più.",
              },
              {
                t: "Un nome che i privati incontrano",
                d: "Il portale è attivo dal 2008 secondo il sito ufficiale, con guida prezzi e domande agli esperti per i privati.",
              },
            ].map((item) => (
              <div key={item.t} className="bg-[#f8f9fa] rounded-2xl p-6 border border-gray-100">
                <h3 className="font-extrabold text-[#111111] mb-1">{item.t}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{item.d}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-[#111111] font-semibold mt-8 max-w-2xl mx-auto">
            Poi però la richiesta va trasformata in preventivo, il preventivo in cantiere e il cantiere in margine. Quel
            lavoro succede fuori dal portale, dentro il gestionale.
          </p>
        </div>
      </section>

      {/* ── QUANDO SCEGLIERE ── */}
      <section className="bg-[#f8f9fa] py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-extrabold text-center text-[#111111] mb-10">
            Per chi ha senso Edilnet e per chi Edilizia in Cloud
          </h2>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm">
              <div className="text-2xl mb-3">🔵</div>
              <h3 className="text-xl font-extrabold text-[#111111] mb-4">Per chi ha senso Edilnet</h3>
              <p className="text-gray-600 leading-relaxed">
                Risolve un problema commerciale: farti trovare da privati che cercano un'impresa nella tua zona.
              </p>
              <ul className="mt-4 space-y-2">
                {[
                  "Lavori col privato e ti servono nuovi contatti",
                  "Nella tua zona il passaparola non basta più",
                  "Vuoi una vetrina con recensioni senza fare pubblicità da solo",
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
              <p className="text-white/70 leading-relaxed">
                Risolve un problema operativo: le richieste arrivano, ma poi si perdono tra chat, fogli e quaderni.
              </p>
              <ul className="mt-4 space-y-2">
                {[
                  "Ogni richiesta, da Edilnet o dal passaparola, diventa un'opportunità con una data",
                  "Sopralluogo, preventivo e firma senza carta da scansionare",
                  "Commessa, SAL e fattura SDI nello stesso posto",
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
      <section className="bg-white py-16 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="bg-eic-orange/10 border border-eic-orange/30 rounded-2xl p-8 text-center">
            <div className="text-3xl mb-4">📦</div>
            <h3 className="text-xl font-extrabold text-[#111111] mb-3">Prendi lavori dai portali?</h3>
            <p className="text-gray-600 leading-relaxed mb-6">
              Le richieste finiscono spesso su fogli e chat. I tuoi clienti si importano da file Excel o CSV; per il
              resto ti affianchiamo noi all'avvio. Da lì ogni richiesta nuova ha il suo posto.
            </p>
            <button
              onClick={openModal}
              className="inline-flex items-center gap-2 bg-eic-orange hover:bg-eic-orange-dark text-white font-bold px-8 py-4 rounded-2xl transition-colors"
            >
              Parliamo delle tue richieste <ArrowRight className="w-5 h-5" />
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
            Confronto a cura di Edilizia in Cloud, parte interessata, aggiornato a ottobre 2026. Su Edilnet riportiamo
            solo quello che dichiara la home del sito ufficiale; «non indicato» vuol dire che la pagina non ne parla,
            non che manchi. Le funzioni di Edilizia in Cloud dipendono dal piano e dai permessi per ruolo.
          </p>
          <ul className="mt-6 space-y-2 text-sm text-center">
            <li>
              <a
                href={EDILNET_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-eic-orange underline underline-offset-2 hover:text-eic-orange-dark"
              >
                Edilnet — sito ufficiale
              </a>
            </li>
          </ul>
        </div>
      </section>

      {/* ── 4-WAY INTERNAL LINKING ── */}
      <section className="bg-white py-10 px-4 border-t border-gray-100">
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
      <section className="bg-[#f8f9fa] py-16 px-4">
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
            Quello che un confronto non misura
          </h2>
          <p className="text-center text-gray-500 mb-10 max-w-xl mx-auto">
            Né un portale né un gestionale sistemano un'impresa che non sa leggere i propri numeri e non ha un metodo
            per vendere. Un contatto è solo un contatto: il software organizza, i margini li fanno le competenze.
          </p>
          <div className="space-y-4">
            {[
              {
                t: "Consulenti dedicati, formazione e webinar",
                d: (
                  <>
                    Con Edilizia in Cloud hai accanto persone, non solo schermate: consulenti dedicati per area,
                    formazione e webinar, assistenza in italiano. Cosa serve a te si definisce in consulenza.
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
                    è l'affiancamento commerciale all'imprenditore edile: trasformare una richiesta in un lavoro firmato
                    è un metodo, non fortuna.
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
            Detto senza sconti: Edilnet il suo pezzo lo fa, e ti porta richieste; i grandi gestionali hanno rivenditori
            e assistenza in tutta Italia, rete che noi non abbiamo. Il tuo problema è che ti mancano i contatti, o che
            nessuno ti ha insegnato a leggere i margini e a chiudere i preventivi?
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
            Prima di spendere in visibilità o in software, rispondi a queste.
          </p>
          <ul className="space-y-4">
            {[
              "Ti mancano i clienti o ti manca il controllo su quelli che hai già?",
              "Quando arriva una richiesta di preventivo, oggi dove finisce: in un sistema o in chat?",
              "Quanti preventivi mandati la settimana scorsa hanno avuto una seconda telefonata?",
              "Il cliente può firmare dal telefono, o aspetti che passi in ufficio?",
              "Se domani arrivano dieci richieste in una settimana, la tua gestione regge?",
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
            Porta una richiesta vera alla demo
          </h2>
          <p className="text-white/70 mb-8 text-lg">
            Prendi l'ultima richiesta che hai ricevuto. Ti mostriamo come diventa sopralluogo, preventivo firmato e
            commessa.
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
