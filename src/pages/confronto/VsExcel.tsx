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

// Regole del confronto (30/10/2026): niente prezzi, niente stime di costo
// inventate, niente ✗ senza fonte. Su Excel Microsoft non dichiara funzioni
// per l'edilizia: si scrive cosa va costruito a mano, non «non ce l'ha».
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

const FATTO_A_MANO = "Da costruire a mano, con modelli o macro fatti in casa";

const rows: TableRow[] = [
  {
    feature: "Stessi dati, aggiornati, per ufficio e cantiere",
    eic: { type: "check", text: "Ogni dato inserito una volta, visto da chi ha il permesso" },
    competitor: { type: "partial", text: "Co-editing sullo stesso file con Microsoft 365" },
  },
  {
    feature: "Timbratura dal telefono con GPS",
    eic: { type: "check", text: "Un tocco, giornata unica, cambio cantiere" },
    competitor: { type: "text", text: FATTO_A_MANO },
  },
  {
    feature: "Rapportini di cantiere con approvazione in ufficio",
    eic: { type: "check", text: "Diversi per operaio e caposquadra, anche vocali" },
    competitor: { type: "text", text: FATTO_A_MANO },
  },
  {
    feature: "Merce presa in negozio",
    eic: { type: "check", text: "Foto di bolla o scontrino, l'ufficio verifica" },
    competitor: { type: "text", text: FATTO_A_MANO },
  },
  {
    feature: "DDT del fornitore che carica il magazzino",
    eic: { type: "check", text: "Foto o PDF letto con l'AI, confermi e la giacenza sale" },
    competitor: { type: "text", text: FATTO_A_MANO },
  },
  {
    feature: "Economia per fase: previsto e consuntivo",
    eic: { type: "check", text: "Venduto, costo previsto, costo reale, margine" },
    competitor: { type: "partial", text: "Possibile con formule, se qualcuno inserisce ogni costo" },
  },
  {
    feature: "SAL che diventa rata, firmato dal cliente",
    eic: { type: "check", text: "Il cliente firma dal link, la rata matura" },
    competitor: { type: "text", text: FATTO_A_MANO },
  },
  {
    feature: "Fattura elettronica allo SDI",
    eic: { type: "check", text: "Invio tramite openapi.it o Aruba" },
    competitor: { type: "text", text: "Non indicato da Microsoft: serve un programma a parte" },
  },
  {
    feature: "POS sul modello ufficiale e scadenze DURC",
    eic: { type: "check", text: "POS sul DI 9/9/2014, DUVRI, avvisi DURC" },
    competitor: { type: "text", text: FATTO_A_MANO },
  },
  {
    feature: "Chi vede cosa, e chi ha cambiato cosa",
    eic: { type: "check", text: "Permessi per ruolo e registro delle azioni" },
    competitor: { type: "partial", text: "Protezione di fogli e cronologia versioni" },
  },
  {
    feature: "Calcoli liberi, pivot e grafici al volo",
    eic: { type: "partial", text: "Export Excel/CSV di timbrature e dati azienda" },
    competitor: { type: "check", text: "È il suo mestiere" },
  },
  {
    feature: "Assistente AI sui tuoi dati",
    eic: { type: "check", text: "Silvio legge commesse, incassi, ore (consuma crediti AI)" },
    competitor: { type: "check", text: "Copilot in Excel, dichiarato da Microsoft" },
  },
];

const otherVsLinks = [
  { to: "/confronto/vs-primus", label: "vs Primus ACCA" },
  { to: "/confronto/vs-teamsystem", label: "vs TeamSystem Construction" },
  { to: "/confronto/vs-edilnet", label: "vs Edilnet" },
  { to: "/confronto/vs-buildertrend", label: "vs Buildertrend" },
];

const tldrPoints = [
  "Excel calcola bene quello che qualcuno ci scrive dentro. Il problema in un'impresa edile è chi ci scrive, quando, e da dove.",
  "Edilizia in Cloud prende i dati dove nascono: la timbratura dal telefono, il rapportino del caposquadra, la foto della bolla, il DDT letto con l'AI. L'ufficio li trova già al loro posto.",
  "Se lavori su un cantiere alla volta e fai tutto tu, Excel può bastare. Con più squadre e più cantieri aperti, ricopiare dati diventa un lavoro a sé.",
];

const giornata = [
  {
    quando: "La mattina, in cantiere",
    excel: "Le ore si segnano su un foglio o in chat. Qualcuno le ricopia la sera.",
    eic: "L'operaio timbra con un tocco, il GPS segna il luogo. Se cambia cantiere, tocca il nuovo.",
  },
  {
    quando: "A metà giornata",
    excel: "Il capocantiere compra al negozio. Lo scontrino finisce nel furgone.",
    eic: "Fotografa bolla o scontrino. L'ufficio verifica, il costo va sulla commessa una volta sola.",
  },
  {
    quando: "Arriva il fornitore",
    excel: "Il DDT si ricopia riga per riga nel foglio del magazzino, quando c'è tempo.",
    eic: "Foto o PDF del DDT: l'AI legge le righe e le abbina all'ordine. Confermi e la giacenza sale.",
  },
  {
    quando: "A fine giornata",
    excel: "Il caposquadra detta al telefono cosa hanno fatto. In ufficio si scrive tutto.",
    eic: "Rapportino dal telefono, diverso per operaio e caposquadra. In ufficio lo approvi o lo rimandi.",
  },
  {
    quando: "A fine mese",
    excel: "Si incrociano tre file per capire se la commessa guadagna.",
    eic: "Per ogni fase vedi venduto, costo previsto, costo reale e margine. Il SAL firmato dal cliente fa maturare la rata, poi parte la fattura allo SDI.",
  },
];

const relatedLinks = [
  { to: "/confronto", label: "Tutti i confronti" },
  { to: "/funzionalita/timbrature-gps", label: "Timbrature GPS" },
  { to: "/funzionalita/rapportini-cantiere", label: "Rapportini di cantiere" },
  { to: "/funzionalita/ddt-digitali", label: "DDT digitali" },
  { to: "/funzionalita/margini-cantiere", label: "Margini di cantiere" },
  { to: "/funzionalita/fatturazione-elettronica", label: "Fatturazione elettronica" },
  { to: "/funzionalita/sicurezza-cantiere", label: "Sicurezza cantiere" },
  { to: "/blog/alternativa-excel-cantieri", label: "Alternativa a Excel" },
];

const COPILOT_URL =
  "https://support.microsoft.com/it-it/office/introduzione-a-copilot-in-excel-d7110502-0334-4b4f-a175-a73abdfc118a";

const faqItems = [
  {
    q: "Quali sono i limiti di gestire i cantieri con Excel?",
    a: "Excel fa bene i conti, ma i dati ce li deve mettere qualcuno. In un'impresa edile i dati nascono in cantiere: ore, rapportini, bolle, scontrini, DDT. Con Excel qualcuno li ricopia a mano, spesso la sera o a fine settimana. Così il margine di una commessa lo scopri tardi, e un errore di formula può restare nascosto per mesi.",
  },
  {
    q: "Quando Excel basta per un'impresa edile?",
    a: "Quando lavori su un cantiere alla volta, fai quasi tutto tu e la fattura elettronica la prepara il commercialista o un altro programma. Excel resta comodo anche per calcoli una tantum e analisi al volo. Quando le squadre sono più di una e i cantieri aperti si sovrappongono, ricopiare dati diventa un lavoro a sé: lì serve un gestionale.",
  },
  {
    q: "Copilot in Excel non risolve il problema?",
    a: "Copilot in Excel, secondo Microsoft, crea formule, grafici, tabelle pivot e dashboard e risponde a domande sui dati del file. È un aiuto vero per chi lavora sui fogli. Però lavora sui dati che qualcuno ha già inserito: non fa timbrare l'operaio, non riceve la foto della bolla, non manda la fattura allo SDI e non fa firmare il SAL al cliente.",
  },
  {
    q: "Posso portare i miei dati da Excel in Edilizia in Cloud?",
    a: "Sì. I clienti si importano da file Excel o CSV. Per cantieri, fornitori e storico ti affianchiamo noi: i tempi si concordano dopo aver visto i tuoi file.",
  },
  {
    q: "Posso continuare a usare Excel insieme a Edilizia in Cloud?",
    a: "Sì. Le timbrature si esportano in Excel o CSV e i dati dell'azienda si scaricano quando vuoi. Molti tengono Excel per le analisi al volo e lasciano al gestionale il lavoro di tutti i giorni.",
  },
  {
    q: "Edilizia in Cloud è difficile per chi è abituato a Excel?",
    a: "L'operaio vede solo quello che gli serve: oggi, timbratura, rapportino, foto, merce. Il caposquadra parte dalla sua squadra. L'ufficio approva. Ognuno usa poche schermate, pensate per il telefono. All'avvio ti affianchiamo noi, in italiano.",
  },
];

const vsRelatedSlugs = ["alternativa-excel-cantieri", "ridurre-costi-cantieri-edili", "computo-metrico-estimativo-guida"];
const vsRelatedPosts = blogPosts.filter((p) => vsRelatedSlugs.includes(p.slug)).slice(0, 3);

const SEO_TITLE = "Gestione Cantieri con Excel: Limiti e Alternativa";
const SEO_DESCRIPTION =
  "Cosa Excel non fa da solo in un'impresa edile: timbrature GPS, rapportini, DDT letti con AI, SAL firmati dal cliente, SDI. E quando Excel basta.";
const H1 = "Edilizia in Cloud vs Excel: cosa il foglio non fa da solo in un'impresa edile";

export default function VsExcel() {
  useSEO({
    title: SEO_TITLE,
    description: SEO_DESCRIPTION,
    canonical: "/confronto/vs-excel",
    type: "article",
    modifiedTime: "2026-10-30",
    keywords:
      "gestione cantieri con excel limiti, alternativa a excel per imprese edili, foglio excel contabilità cantiere, gestionale edilizia vs excel, copilot excel cantiere",
  });

  return (
    <div className="min-h-screen bg-white text-[#111111] overflow-x-hidden">
      <JsonLd
        id="jsonld-article-vs-excel"
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: H1,
          description: SEO_DESCRIPTION,
          url: "https://www.ediliziaincloud.com/confronto/vs-excel",
          datePublished: "2026-01-01",
          dateModified: "2026-10-30",
          author: { "@type": "Organization", name: "Edilizia in Cloud" },
          publisher: { "@type": "Organization", name: "Edilizia in Cloud" },
        }}
      />
      <JsonLd
        id="jsonld-software-vs-excel"
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
        id="jsonld-breadcrumb-vs-excel"
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: "https://www.ediliziaincloud.com/" },
            { "@type": "ListItem", position: 2, name: "Confronto", item: "https://www.ediliziaincloud.com/confronto" },
            {
              "@type": "ListItem",
              position: 3,
              name: "vs Excel",
              item: "https://www.ediliziaincloud.com/confronto/vs-excel",
            },
          ],
        }}
      />
      <JsonLd
        id="jsonld-faq-vs-excel"
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
              Excel fa i conti. Non timbra, non fotografa la bolla, non manda la fattura allo SDI. In un'impresa edile
              i dati nascono in cantiere: qui vedi cosa cambia quando arrivano da soli in ufficio. E quando Excel ti
              basta davvero.
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
          <MarketingVisual image={confrontoVisuals.excel} priority tone="dark" caption="Illustrazione editoriale · Edilizia in Cloud" />
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
            Cosa fa da solo e cosa va costruito a mano
          </h2>
          <p className="text-center text-gray-500 mb-12 max-w-xl mx-auto">
            Aggiornato a ottobre 2026. Excel è uno strumento generico: Microsoft non dichiara funzioni per SAL, DDT,
            DURC, POS o invio SDI. Con modelli e macro si può fare quasi tutto, ma qualcuno li deve costruire e tenere
            in piedi.
          </p>
          <div className="overflow-x-auto rounded-2xl border border-gray-100 shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#111111]">
                  <th className="text-left px-6 py-4 text-white/70 font-semibold w-2/5">Cosa serve</th>
                  <th className="text-center px-6 py-4 text-eic-orange font-bold">Edilizia in Cloud</th>
                  <th className="text-center px-6 py-4 text-white/70 font-semibold">Excel / fogli</th>
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

      {/* ── UNA GIORNATA ── */}
      <section className="bg-[#111111] py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-4xl font-extrabold text-center text-white mb-4">
            Una giornata di cantiere, in due modi
          </h2>
          <p className="text-center text-white/60 mb-12 max-w-xl mx-auto">
            Niente numeri inventati: solo chi fa cosa, e quando il dato arriva in ufficio.
          </p>
          <div className="space-y-5">
            {giornata.map((g) => (
              <div key={g.quando} className="bg-white/5 border border-white/10 rounded-2xl p-6">
                <h3 className="text-eic-orange font-extrabold mb-3">{g.quando}</h3>
                <div className="grid md:grid-cols-2 gap-4 text-sm leading-relaxed">
                  <p className="text-white/60">
                    <span className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-1">Con Excel</span>
                    {g.excel}
                  </p>
                  <p className="text-white">
                    <span className="block text-xs font-bold uppercase tracking-wider text-eic-orange mb-1">
                      Con Edilizia in Cloud
                    </span>
                    {g.eic}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── DOVE EXCEL È PIÙ FORTE ── */}
      <section className="bg-white py-20 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-extrabold text-center text-[#111111] mb-4">
            Dove Excel è più forte
          </h2>
          <p className="text-center text-gray-500 mb-10 max-w-xl mx-auto">
            Confronto scritto da Edilizia in Cloud: dove Excel è più forte lo scriviamo.
          </p>
          <div className="space-y-4">
            {[
              {
                t: "Lo hai già",
                d: "Con Microsoft 365 è già in azienda. Per un calcolo una tantum non serve altro.",
              },
              {
                t: "Lo conosci già",
                d: "Tu e il tuo geometra lo usate da anni. Nessuno deve imparare schermate nuove.",
              },
              {
                t: "Libertà totale",
                d: "Qualsiasi calcolo, qualsiasi struttura, qualsiasi analisi al volo. Nessun gestionale ti lascia altrettanto libero.",
              },
              {
                t: "Copilot lavora sui tuoi fogli",
                d: "Secondo Microsoft, Copilot in Excel crea formule, grafici, pivot e dashboard su richiesta e risponde a domande sui dati del file.",
              },
              {
                t: "Lo aprono tutti",
                d: "Commercialista, banca, fornitori: un file .xlsx lo legge chiunque.",
              },
            ].map((item) => (
              <div key={item.t} className="bg-[#f8f9fa] rounded-2xl p-6 border border-gray-100">
                <h3 className="font-extrabold text-[#111111] mb-1">{item.t}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{item.d}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-[#111111] font-semibold mt-8 max-w-2xl mx-auto">
            Il problema non è quello che Excel sa fare. È che i dati di un cantiere nascono fuori dall'ufficio: sul
            telefono dell'operaio, nel furgone, sul DDT del fornitore. Qualcuno li deve portare nel foglio.
          </p>
        </div>
      </section>

      {/* ── QUANDO SCEGLIERE ── */}
      <section className="bg-[#f8f9fa] py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-extrabold text-center text-[#111111] mb-10">
            Per chi ha senso Excel e per chi Edilizia in Cloud
          </h2>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm">
              <div className="text-2xl mb-3">🔵</div>
              <h3 className="text-xl font-extrabold text-[#111111] mb-4">Per chi ha senso restare su Excel</h3>
              <ul className="mt-4 space-y-2">
                {[
                  "Lavori su un cantiere alla volta e fai quasi tutto tu",
                  "Non hai squadre che devono segnare ore e rapportini dal telefono",
                  "La fattura elettronica la prepara il commercialista o un altro programma",
                  "Ti servono soprattutto calcoli e analisi al volo",
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
                  "Hai più squadre e più cantieri aperti insieme",
                  "Vuoi le ore, i rapportini e la merce in ufficio il giorno stesso",
                  "Vuoi sapere il margine di ogni fase a cantiere aperto",
                  "Vuoi SAL, rate e fattura SDI nello stesso posto della commessa",
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
            <h3 className="text-xl font-extrabold text-[#111111] mb-3">Hai anni di dati su Excel?</h3>
            <p className="text-gray-600 leading-relaxed mb-6">
              I clienti si importano da file Excel o CSV. Per cantieri, fornitori e storico ti affianchiamo noi: i tempi
              si concordano dopo aver visto i tuoi file. E le timbrature si riesportano in Excel quando vuoi.
            </p>
            <button
              onClick={openModal}
              className="inline-flex items-center gap-2 bg-eic-orange hover:bg-eic-orange-dark text-white font-bold px-8 py-4 rounded-2xl transition-colors"
            >
              Parliamo dei tuoi file <ArrowRight className="w-5 h-5" />
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
            Confronto a cura di Edilizia in Cloud, parte interessata, aggiornato a ottobre 2026. Su Excel riportiamo
            solo quello che Microsoft dichiara; l'uso di Excel come gestionale di cantiere è un'abitudine diffusa, non
            una funzione del prodotto. Le funzioni di Edilizia in Cloud dipendono dal piano e dai permessi per ruolo.
          </p>
          <ul className="mt-6 space-y-2 text-sm text-center">
            <li>
              <a
                href={COPILOT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-eic-orange underline underline-offset-2 hover:text-eic-orange-dark"
              >
                Microsoft — Introduzione a Copilot in Excel
              </a>
            </li>
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
            Uscire da Excel mette ordine, ma non basta. Un file o un gestionale non insegnano a leggere i numeri, non
            danno un metodo di vendita e non fanno entrare richieste. Quelle sono competenze.
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
                    commesse e utile, cioè quello che nessuna formula in un foglio fa al posto tuo.
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
                    è il percorso di affiancamento commerciale per imprenditori edili: come si vende un lavoro, non come
                    si formatta un preventivo.
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
            Onestà anche qui: attorno a Excel di gente competente ce n'è ovunque — consulenti che ti costruiscono il
            file su misura, corsi, il tuo commercialista. La differenza è su cosa ti affiancano: sul foglio, oppure
            anche su numeri, vendita e clienti in ingresso. Il tuo problema è che Excel non ti basta più, o che nessuno
            ti ha insegnato a leggere i margini?
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
            Che tu resti su Excel o passi a un gestionale, prima rispondi a queste.
          </p>
          <ul className="space-y-4">
            {[
              "Chi ricopia ore, rapportini e bolle nel foglio, e quanti giorni dopo?",
              "Quante versioni dello stesso file girano oggi tra ufficio, geometra e cantiere?",
              "Chi si accorgerebbe di una formula sbagliata prima che costi soldi veri?",
              "Il margine di un cantiere lo sai mentre è aperto o a fine lavori?",
              "Lo scontrino del negozio arriva in ufficio, o resta nel furgone?",
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
            Prova su una tua commessa vera
          </h2>
          <p className="text-white/70 mb-8 text-lg">
            Portaci il foglio che usi oggi. Ti mostriamo la stessa commessa dentro Edilizia in Cloud, dalla timbratura
            alla fattura.
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
