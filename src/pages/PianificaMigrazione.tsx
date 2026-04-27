import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  Clock,
  Database,
  FileSpreadsheet,
  FileText,
  Users,
  HardHat,
  Receipt,
  Truck,
  BookOpen,
  Image as ImageIcon,
  Calendar,
  Lock,
  Phone,
  Mail,
  CheckCheck,
  AlertTriangle,
  Layers,
  Building2,
  Zap,
} from "lucide-react";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import { useSEO, SITE_URL } from "@/hooks/useSEO";
import { JsonLd } from "@/components/seo/JsonLd";
import { HubSeoSchema } from "@/components/seo/HubSeoSchema";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";

/* ──────────────────────────────────────────────────────────────
   DATA
────────────────────────────────────────────────────────────── */

const sourceSoftware = [
  { name: "Primus", desc: "ACCA Software", logo: "P" },
  { name: "Edilnet", desc: "TeamSystem Edilizia", logo: "E" },
  { name: "TeamSystem", desc: "Studio commercialista", logo: "T" },
  { name: "Buildertrend", desc: "Software USA", logo: "B" },
  { name: "STR Vision", desc: "STR S.p.A.", logo: "S" },
  { name: "Excel / Google Sheets", desc: "Fogli di calcolo", logo: "X" },
  { name: "Carta + cartelle", desc: "Archivio fisico", logo: "📂" },
  { name: "Altro gestionale", desc: "Custom o legacy", logo: "?" },
];

const cosaImportiamo = [
  { icon: HardHat, label: "Cantieri attivi e chiusi", note: "Stato avanzamento, fasi, SAL" },
  { icon: Users, label: "Anagrafica clienti & fornitori", note: "P.IVA, contatti, condizioni" },
  { icon: Receipt, label: "Fatture emesse e ricevute", note: "Ultimi 5 anni, formato XML/PDF" },
  { icon: FileText, label: "Preventivi & computi metrici", note: "Voci, prezzi, listini DEI" },
  { icon: Truck, label: "DDT e movimenti magazzino", note: "Carichi, scarichi, giacenze" },
  { icon: BookOpen, label: "Prima nota & scadenzario", note: "Cassa, banca, partite aperte" },
  { icon: ImageIcon, label: "Foto cantiere & documenti", note: "POS, DURC, attestati, allegati" },
  { icon: Calendar, label: "Storico ore & timbrature", note: "Personale e subappalti" },
];

const cosaNonImportiamo = [
  "Dati incompleti o corrotti (te li segnaliamo prima)",
  "Documenti più vecchi di 10 anni (li archiviamo, non li migriamo attivi)",
  "Personalizzazioni ad-hoc del vecchio gestionale (le ricostruiamo native)",
  "File protetti da password di cui non hai le chiavi",
];

const processo = [
  {
    n: "01",
    title: "Audit gratuito (giorno 0)",
    desc: "Una call di 30 minuti con un nostro specialista migrazioni. Ci dici cosa usi oggi, ci mandi un export di prova. Ti diciamo subito cosa è migrabile e cosa no — senza fronzoli.",
    duration: "30 min",
    icon: Phone,
  },
  {
    n: "02",
    title: "Mappatura dati (giorni 1–2)",
    desc: "Riceviamo i tuoi file (export, backup, dump SQL, Excel, PDF). Mappiamo ogni campo del vecchio gestionale al nostro schema. Tu non fai nulla: lavoriamo sui tuoi dati in ambiente isolato e cifrato.",
    duration: "1–2 giorni",
    icon: Database,
  },
  {
    n: "03",
    title: "Import in ambiente di test (giorno 3)",
    desc: "Ti consegniamo un account di staging con tutti i tuoi dati già dentro. Tu controlli: cantieri, fatture, anagrafiche, archivio. Ti mandiamo il report con i numeri (record importati, scarti, anomalie).",
    duration: "1 giorno",
    icon: Layers,
  },
  {
    n: "04",
    title: "Correzioni & validazione (giorno 4)",
    desc: "Se manca qualcosa, lo aggiungiamo. Se qualcosa è sbagliato, lo correggiamo. Ripetiamo finché non firmi tu il go-live. Nessuna pressione: andiamo live solo quando dici tu.",
    duration: "1 giorno",
    icon: CheckCircle2,
  },
  {
    n: "05",
    title: "Go-live & onboarding (giorno 5)",
    desc: "Spostiamo il tuo account da staging a produzione. Formazione 1-on-1 di 90 minuti per te e il tuo team. Da quel momento sei operativo. Setup completo in 48 ore garantite.",
    duration: "90 min",
    icon: Zap,
  },
  {
    n: "06",
    title: "Affiancamento 30 giorni",
    desc: "Per i primi 30 giorni hai un Customer Success dedicato che ti risponde in <2h via WhatsApp/email. Tutti i tuoi dubbi, in tempo reale. Senza ticket, senza attese, senza chatbot.",
    duration: "30 gg",
    icon: ShieldCheck,
  },
];

const garanzie = [
  {
    icon: Clock,
    title: "Setup in 48 ore o è gratis",
    desc: "Se non andiamo live entro 48 ore lavorative dalla consegna dei dati, la migrazione è gratuita. Punto.",
  },
  {
    icon: ShieldCheck,
    title: "Migrazione 100% assistita e gratuita",
    desc: "Zero costi nascosti. Il nostro team fa tutto: import, mappatura, validazione. Tu approvi e basta.",
  },
  {
    icon: Lock,
    title: "I tuoi dati restano tuoi",
    desc: "Server europei, GDPR, ISO 27001. Cifratura AES-256 a riposo, TLS 1.3 in transito. Backup giornalieri.",
  },
  {
    icon: CheckCheck,
    title: "Cancelli quando vuoi",
    desc: "Nessun contratto pluriennale. Se nei primi 30 giorni cambi idea, ti rimborsiamo e ti restituiamo i dati.",
  },
];

const faqs = [
  {
    q: "Quanto costa la migrazione?",
    a: "È completamente gratuita per chi attiva un piano Edilizia in Cloud. Non c'è un setup fee nascosto, non ci sono costi a record, non c'è una fee per cantiere. Te la facciamo perché è nel nostro interesse che tu sia operativo subito.",
  },
  {
    q: "Quanto tempo dura la migrazione?",
    a: "48 ore garantite per il go-live, una volta ricevuti i dati. La timeline standard è: audit (giorno 0) → mappatura (1–2) → staging (3) → validazione (4) → go-live (5). Puoi continuare a usare il tuo vecchio software in parallelo finché non firmi tu il passaggio definitivo.",
  },
  {
    q: "Da quali software riuscite a migrare?",
    a: "Abbiamo già migrato clienti da Primus, Edilnet, TeamSystem, STR Vision, Buildertrend, fogli Excel/Google Sheets, archivi cartacei, gestionali custom in PHP/Access. Ci serve un export — anche imperfetto — e ci pensiamo noi. Se hai un caso particolare, lo valutiamo nell'audit gratuito.",
  },
  {
    q: "Devo bloccare l'attività durante la migrazione?",
    a: "No. Continui a lavorare sul tuo gestionale attuale. Noi lavoriamo in parallelo su un ambiente di staging isolato. Solo al go-live (90 minuti) c'è uno switchover, che programmiamo a fine giornata o nel weekend per non interromperti.",
  },
  {
    q: "Cosa succede ai miei dati se decido di non procedere?",
    a: "Li cancelliamo entro 7 giorni dalla tua richiesta. Ti consegniamo un export completo in formato standard (CSV/JSON/XML) di tutto quello che hai caricato. Nessuna trattenuta, nessuna penale. È scritto nel DPA (Data Processing Agreement) firmato all'audit.",
  },
  {
    q: "Importate anche fatture elettroniche e cassetto SDI?",
    a: "Sì. Riprendiamo le tue fatture XML B2B/PA degli ultimi 5 anni, conserviamo digitalmente tutto a norma CAD/AgID, e colleghiamo il tuo Cassetto Fiscale per sincronizzare automaticamente le ricevute SDI. Niente ricaricamenti manuali.",
  },
  {
    q: "Cosa succede se durante la migrazione trovate dati sbagliati nel vecchio gestionale?",
    a: "Te li segnaliamo prima del go-live, in un report dettagliato. Ti diamo le opzioni: (a) li correggiamo noi se ci dai il via, (b) li importiamo così come sono e li sistemiamo dopo, (c) li scartiamo. La decisione resta tua. Niente sorprese a posteriori.",
  },
  {
    q: "Avete un NDA per i dati sensibili?",
    a: "Sì. Firmiamo NDA + DPA prima di vedere qualsiasi tuo file. I tuoi dati sono trattati solo dal team di migrazione (3 persone in Italia, sede Milano), in ambiente isolato, e cancellati dai nostri ambienti di lavoro al go-live. Conformi GDPR.",
  },
];

/* ──────────────────────────────────────────────────────────────
   FORM
────────────────────────────────────────────────────────────── */

interface FormData {
  nome: string;
  email: string;
  telefono: string;
  azienda: string;
  software_attuale: string;
  num_cantieri: string;
  anni_dati: string;
  note: string;
  privacy: boolean;
  marketing: boolean;
}

const SOFTWARE_OPTIONS = [
  "Primus (ACCA)",
  "Edilnet / TeamSystem Edilizia",
  "TeamSystem",
  "STR Vision",
  "Buildertrend",
  "Excel / Google Sheets",
  "Archivio cartaceo / cartelle",
  "Gestionale custom o legacy",
  "Altro",
];

const NUM_CANTIERI_OPTIONS = ["1–5", "6–15", "16–30", "31–60", "60+"];
const ANNI_DATI_OPTIONS = ["< 1 anno", "1–3 anni", "3–5 anni", "5–10 anni", "> 10 anni"];

export default function PianificaMigrazione() {
  useSEO({
    title: "Pianifica la migrazione — Setup in 48 ore | Edilizia in Cloud",
    description: "Migra dal tuo gestionale attuale a Edilizia in Cloud in 48 ore. Migrazione gratuita assistita: cantieri, fatture, anagrafiche, archivio storico. Da Primus, Edilnet, TeamSystem, Excel.",
    canonical: "/pianifica-migrazione",
    keywords: "migrazione gestionale edilizia, passare da primus, migrare da edilnet, importare dati gestionale, setup gestionale edilizia 48 ore, migrazione gratuita software edilizia",
  });

  const heroAnim = useScrollAnimation();
  const sourcesAnim = useScrollAnimation();
  const importAnim = useScrollAnimation();
  const processoAnim = useScrollAnimation();
  const garanzieAnim = useScrollAnimation();
  const formAnim = useScrollAnimation();
  const faqAnim = useScrollAnimation();

  const [form, setForm] = useState<FormData>({
    nome: "",
    email: "",
    telefono: "",
    azienda: "",
    software_attuale: "",
    num_cantieri: "",
    anni_dati: "",
    note: "",
    privacy: false,
    marketing: false,
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const validate = () => {
    const e: Partial<Record<keyof FormData, string>> = {};
    if (!form.nome.trim()) e.nome = "Campo obbligatorio";
    if (!form.email.trim()) e.email = "Campo obbligatorio";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Email non valida";
    if (!form.telefono.trim()) e.telefono = "Campo obbligatorio";
    if (!form.azienda.trim()) e.azienda = "Campo obbligatorio";
    if (!form.software_attuale) e.software_attuale = "Seleziona un'opzione";
    if (!form.num_cantieri) e.num_cantieri = "Seleziona un'opzione";
    if (!form.privacy) e.privacy = "Devi accettare la Privacy Policy";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleChange = (
    ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const target = ev.target as HTMLInputElement;
    const { name, type } = target;
    const value = type === "checkbox" ? target.checked : target.value;
    setForm((p) => ({ ...p, [name]: value }));
    if (errors[name as keyof FormData]) {
      setErrors((p) => ({ ...p, [name]: undefined }));
    }
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      try {
        const mod = await import("@/integrations/supabase/client");
        await mod.supabase.from("demo_requests").insert({
          nome: form.nome,
          email: form.email.toLowerCase(),
          telefono: form.telefono,
          azienda: form.azienda,
          messaggio: `[MIGRAZIONE] Software attuale: ${form.software_attuale} | Cantieri: ${form.num_cantieri} | Anni dati: ${form.anni_dati || "—"} | Note: ${form.note || "—"}`,
          marketing_consent: form.marketing,
          source: "pianifica_migrazione",
          status: "pending",
        });
      } catch {
        /* fallback silenzioso */
      }
      setSubmitted(true);
    } catch {
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = (field: keyof FormData) =>
    `w-full px-4 py-3 rounded-lg border text-[#111111] text-base sm:text-sm focus:outline-none focus:ring-2 transition-all ${
      errors[field]
        ? "border-red-400 focus:ring-red-200"
        : "border-gray-200 focus:ring-[#F97415]/30 focus:border-[#F97415]"
    }`;

  return (
    <div className="min-h-screen bg-white text-[#111111] overflow-x-hidden">
      {/* SEO */}
      <HubSeoSchema
        pageName="Pianifica la migrazione"
        pagePath="/pianifica-migrazione"
        pageDescription="Migrazione gratuita assistita in 48 ore dal tuo gestionale edilizia attuale (Primus, Edilnet, TeamSystem, STR, Excel) a Edilizia in Cloud. Cantieri, fatture, anagrafiche, archivio storico."
        breadcrumbs={[
          { name: "Home", url: "/" },
          { name: "Pianifica la migrazione", url: "/pianifica-migrazione" },
        ]}
      />
      <JsonLd
        id="jsonld-service-migrazione"
        data={{
          "@context": "https://schema.org",
          "@type": "Service",
          "@id": `${SITE_URL}/pianifica-migrazione#service`,
          name: "Migrazione gestionale edilizia",
          provider: { "@id": `${SITE_URL}/#organization` },
          areaServed: { "@type": "Country", name: "Italia" },
          description:
            "Migrazione gratuita assistita dal tuo gestionale edilizia attuale (Primus, Edilnet, TeamSystem, STR, Excel) a Edilizia in Cloud. Setup in 48 ore garantite. Cantieri, fatture, anagrafiche, archivio storico. GDPR compliant.",
          serviceType: "Software migration & onboarding",
          offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "EUR",
            availability: "https://schema.org/InStock",
            url: `${SITE_URL}/pianifica-migrazione`,
            eligibleRegion: { "@type": "Country", name: "Italy" },
          },
        }}
      />
      <JsonLd
        id="jsonld-faq-migrazione"
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "@id": `${SITE_URL}/pianifica-migrazione#faq`,
          mainEntity: faqs.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }}
      />

      <LandingNavbar />

      {/* ── HERO ── */}
      <section
        className="relative pt-28 sm:pt-36 pb-14 sm:pb-20 px-5 sm:px-6 overflow-hidden"
        style={{ background: "linear-gradient(180deg, #0a0a0a 0%, #111111 100%)" }}
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] pointer-events-none"
          style={{ background: "radial-gradient(ellipse at top, rgba(249,116,21,0.18) 0%, transparent 70%)", filter: "blur(40px)" }} />

        <div
          ref={heroAnim.ref}
          className="relative z-10 max-w-5xl mx-auto text-center transition-all duration-1000"
          style={{
            opacity: heroAnim.isVisible ? 1 : 0,
            transform: heroAnim.isVisible ? "translateY(0)" : "translateY(32px)",
          }}
        >
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold tracking-widest uppercase mb-7"
            style={{ background: "rgba(249,116,21,0.18)", color: "#F97415", border: "1px solid rgba(249,116,21,0.35)" }}
          >
            <Clock className="w-3.5 h-3.5" />
            Setup in 48 ore garantite
          </div>

          <h1 className="text-[28px] leading-[1.15] sm:text-4xl md:text-6xl font-extrabold text-white sm:leading-tight mb-5 sm:mb-6 px-1">
            Migra dal tuo gestionale attuale.{" "}
            <span style={{ color: "#F97415" }}>Senza perdere un dato. Senza fermare l'attività.</span>
          </h1>

          <p className="text-base sm:text-lg md:text-xl text-white/70 leading-relaxed max-w-3xl mx-auto mb-8 sm:mb-10">
            Importiamo gratis cantieri, fatture, anagrafiche e archivio storico dal tuo software.
            Tu approvi, noi facciamo. In 48 ore sei operativo su Edilizia in Cloud.
          </p>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 sm:gap-4 mb-10 sm:mb-12">
            <a
              href="#form"
              className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-6 sm:px-8 py-4 rounded-full text-white font-bold text-base hover:scale-105 transition-all shadow-lg"
              style={{ background: "#F97415", boxShadow: "0 8px 30px rgba(249,116,21,0.35)" }}
            >
              Pianifica la mia migrazione
              <ArrowRight className="w-5 h-5" />
            </a>
            <a
              href="#processo"
              className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-6 sm:px-8 py-4 rounded-full font-bold text-base text-white hover:bg-white/10 transition-all"
              style={{ border: "2px solid rgba(255,255,255,0.35)" }}
            >
              Come funziona
            </a>
          </div>

          {/* Trust pills */}
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-white/65">
            <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-[#F97415]" /> Migrazione 100% gratuita</span>
            <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-[#F97415]" /> Zero downtime</span>
            <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-[#F97415]" /> GDPR + ISO 27001</span>
            <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-[#F97415]" /> Cancelli quando vuoi</span>
          </div>
        </div>
      </section>

      {/* ── DA QUALI SOFTWARE ── */}
      <section className="py-14 sm:py-20 px-5 sm:px-6 bg-white">
        <div
          ref={sourcesAnim.ref}
          className="max-w-6xl mx-auto"
        >
          <div
            className="text-center mb-12 transition-all duration-700"
            style={{
              opacity: sourcesAnim.isVisible ? 1 : 0,
              transform: sourcesAnim.isVisible ? "translateY(0)" : "translateY(24px)",
            }}
          >
            <span
              className="inline-block px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase mb-4"
              style={{ background: "rgba(249,116,21,0.1)", color: "#F97415" }}
            >
              Migriamo da qualsiasi sorgente
            </span>
            <h2 className="text-2xl md:text-4xl font-bold text-[#111111] mb-3">
              Qualunque sia il tuo gestionale attuale, lo trasferiamo
            </h2>
            <p className="text-[#111111]/60 max-w-2xl mx-auto">
              Più di 200 imprese sono già passate a noi. Da gestionali enterprise, da fogli Excel, da archivi cartacei.
              Hai un caso particolare? Ne parliamo nell'audit gratuito.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {sourceSoftware.map((s, i) => (
              <div
                key={s.name}
                className="bg-white rounded-xl border border-gray-100 p-5 text-center hover:border-[#F97415]/30 hover:shadow-md transition-all duration-300"
                style={{
                  opacity: sourcesAnim.isVisible ? 1 : 0,
                  transform: sourcesAnim.isVisible ? "translateY(0)" : "translateY(20px)",
                  transitionDelay: `${i * 60}ms`,
                  transition: "opacity 0.6s ease, transform 0.6s ease, border-color 0.3s ease, box-shadow 0.3s ease",
                }}
              >
                <div
                  className="w-12 h-12 rounded-lg mx-auto mb-3 flex items-center justify-center font-extrabold text-lg"
                  style={{ background: "rgba(249,116,21,0.1)", color: "#F97415" }}
                >
                  {s.logo}
                </div>
                <div className="font-bold text-[#111111] text-sm">{s.name}</div>
                <div className="text-[#111111]/55 text-xs mt-0.5">{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── COSA IMPORTIAMO / NON IMPORTIAMO ── */}
      <section className="py-14 sm:py-20 px-5 sm:px-6" style={{ background: "#f7f9fc" }}>
        <div ref={importAnim.ref} className="max-w-6xl mx-auto">
          <div
            className="text-center mb-14 transition-all duration-700"
            style={{
              opacity: importAnim.isVisible ? 1 : 0,
              transform: importAnim.isVisible ? "translateY(0)" : "translateY(24px)",
            }}
          >
            <h2 className="text-2xl md:text-4xl font-bold text-[#111111] mb-3">
              Cosa portiamo dentro Edilizia in Cloud
            </h2>
            <p className="text-[#111111]/60 max-w-2xl mx-auto">
              Trasparenza totale: ti diciamo prima cosa è migrabile e cosa no. Niente sorprese al go-live.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Cosa importiamo */}
            <div
              className="bg-white rounded-3xl p-8 shadow-sm transition-all duration-700"
              style={{
                border: "1px solid rgba(249,116,21,0.15)",
                opacity: importAnim.isVisible ? 1 : 0,
                transform: importAnim.isVisible ? "translateY(0)" : "translateY(28px)",
              }}
            >
              <div className="flex items-center gap-3 mb-6">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ background: "rgba(249,116,21,0.12)" }}
                >
                  <CheckCircle2 className="w-5 h-5" style={{ color: "#F97415" }} />
                </div>
                <h3 className="font-bold text-[#111111] text-lg">Cosa importiamo</h3>
              </div>
              <ul className="space-y-3">
                {cosaImportiamo.map((item) => (
                  <li key={item.label} className="flex items-start gap-3">
                    <span
                      className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
                      style={{ background: "rgba(249,116,21,0.08)" }}
                    >
                      <item.icon className="w-4 h-4" style={{ color: "#F97415" }} />
                    </span>
                    <div>
                      <div className="font-semibold text-[#111111] text-sm">{item.label}</div>
                      <div className="text-[#111111]/55 text-xs">{item.note}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Cosa non importiamo */}
            <div
              className="bg-white rounded-3xl p-8 shadow-sm transition-all duration-700"
              style={{
                border: "1px solid #e8ecf0",
                opacity: importAnim.isVisible ? 1 : 0,
                transform: importAnim.isVisible ? "translateY(0)" : "translateY(28px)",
                transitionDelay: "120ms",
              }}
            >
              <div className="flex items-center gap-3 mb-6">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ background: "rgba(17,17,17,0.06)" }}
                >
                  <XCircle className="w-5 h-5 text-[#111111]/60" />
                </div>
                <h3 className="font-bold text-[#111111] text-lg">Cosa NON importiamo (e perché)</h3>
              </div>
              <ul className="space-y-3 mb-6">
                {cosaNonImportiamo.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <AlertTriangle className="w-4 h-4 text-[#111111]/40 mt-0.5 flex-shrink-0" />
                    <span className="text-[#111111]/70 text-sm leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
              <div
                className="rounded-xl p-4 text-xs leading-relaxed"
                style={{ background: "rgba(249,116,21,0.06)", color: "#111111", border: "1px solid rgba(249,116,21,0.15)" }}
              >
                <strong style={{ color: "#F97415" }}>Promessa:</strong> Quello che decidiamo di non importare lo archiviamo
                in cold storage cifrato, sempre accessibile via richiesta. Non perdi nulla, anche se non lo vedi nel
                gestionale attivo.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── PROCESSO ── */}
      <section id="processo" className="py-16 sm:py-24 px-5 sm:px-6 bg-white">
        <div ref={processoAnim.ref} className="max-w-5xl mx-auto">
          <div
            className="text-center mb-16 transition-all duration-700"
            style={{
              opacity: processoAnim.isVisible ? 1 : 0,
              transform: processoAnim.isVisible ? "translateY(0)" : "translateY(24px)",
            }}
          >
            <span
              className="inline-block px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase mb-4"
              style={{ background: "rgba(249,116,21,0.1)", color: "#F97415" }}
            >
              Il processo
            </span>
            <h2 className="text-2xl md:text-4xl font-bold text-[#111111] mb-3">
              Da gestionale vecchio a Edilizia in Cloud in 5 giorni
            </h2>
            <p className="text-[#111111]/60 max-w-2xl mx-auto">
              Una timeline reale. Niente "fra 3 mesi facciamo un kick-off". Si comincia oggi, si va live venerdì.
            </p>
          </div>

          <div className="space-y-4">
            {processo.map((step, i) => (
              <div
                key={step.n}
                className="bg-white rounded-2xl p-6 md:p-7 transition-all duration-700 hover:shadow-md"
                style={{
                  border: "1px solid #e8ecf0",
                  opacity: processoAnim.isVisible ? 1 : 0,
                  transform: processoAnim.isVisible ? "translateX(0)" : "translateX(-20px)",
                  transitionDelay: `${i * 90}ms`,
                }}
              >
                <div className="flex flex-col md:flex-row md:items-start gap-5">
                  <div className="flex items-center gap-4 md:w-44 md:flex-shrink-0">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center font-extrabold text-lg flex-shrink-0"
                      style={{ background: "rgba(249,116,21,0.12)", color: "#F97415" }}
                    >
                      {step.n}
                    </div>
                    <div
                      className="md:hidden inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold"
                      style={{ background: "#111111", color: "white" }}
                    >
                      <Clock className="w-3 h-3" />
                      {step.duration}
                    </div>
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <step.icon className="w-5 h-5" style={{ color: "#F97415" }} />
                      <h3 className="font-bold text-[#111111] text-lg">{step.title}</h3>
                    </div>
                    <p className="text-[#111111]/65 text-sm leading-relaxed">{step.desc}</p>
                  </div>

                  <div
                    className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold flex-shrink-0 self-start"
                    style={{ background: "#111111", color: "white" }}
                  >
                    <Clock className="w-3 h-3" />
                    {step.duration}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Total */}
          <div
            className="mt-8 rounded-2xl p-6 text-center transition-all duration-700"
            style={{
              background: "linear-gradient(135deg, #F97415 0%, #C94F06 100%)",
              opacity: processoAnim.isVisible ? 1 : 0,
              transform: processoAnim.isVisible ? "translateY(0)" : "translateY(20px)",
              transitionDelay: `${processo.length * 90}ms`,
            }}
          >
            <div className="text-white/80 text-xs font-bold tracking-widest uppercase mb-1">Totale</div>
            <div className="text-white text-2xl md:text-3xl font-extrabold">5 giorni dalla call all'operatività</div>
            <div className="text-white/85 text-sm mt-1">+ 30 giorni di affiancamento dedicato dopo il go-live</div>
          </div>
        </div>
      </section>

      {/* ── GARANZIE ── */}
      <section className="py-14 sm:py-20 px-5 sm:px-6" style={{ background: "#0a0a0a" }}>
        <div ref={garanzieAnim.ref} className="max-w-6xl mx-auto">
          <div
            className="text-center mb-14 transition-all duration-700"
            style={{
              opacity: garanzieAnim.isVisible ? 1 : 0,
              transform: garanzieAnim.isVisible ? "translateY(0)" : "translateY(24px)",
            }}
          >
            <span
              className="inline-block px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase mb-4"
              style={{ background: "rgba(249,116,21,0.18)", color: "#F97415", border: "1px solid rgba(249,116,21,0.35)" }}
            >
              Le nostre garanzie
            </span>
            <h2 className="text-2xl md:text-4xl font-bold text-white mb-3">
              Quattro promesse scritte nel contratto
            </h2>
            <p className="text-white/60 max-w-2xl mx-auto">
              Non sono claim di marketing. Sono nel DPA e nell'order form. Se non rispettiamo una di queste, ti rimborsiamo.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {garanzie.map((g, i) => (
              <div
                key={g.title}
                className="rounded-2xl p-6 transition-all duration-700"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  opacity: garanzieAnim.isVisible ? 1 : 0,
                  transform: garanzieAnim.isVisible ? "translateY(0)" : "translateY(24px)",
                  transitionDelay: `${i * 90}ms`,
                }}
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: "rgba(249,116,21,0.15)" }}
                >
                  <g.icon className="w-5 h-5" style={{ color: "#F97415" }} />
                </div>
                <h3 className="font-bold text-white text-base mb-2">{g.title}</h3>
                <p className="text-white/60 text-sm leading-relaxed">{g.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FORM ── */}
      <section id="form" className="py-16 sm:py-24 px-5 sm:px-6 bg-white">
        <div ref={formAnim.ref} className="max-w-3xl mx-auto">
          <div
            className="text-center mb-10 transition-all duration-700"
            style={{
              opacity: formAnim.isVisible ? 1 : 0,
              transform: formAnim.isVisible ? "translateY(0)" : "translateY(24px)",
            }}
          >
            <span
              className="inline-block px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase mb-4"
              style={{ background: "rgba(249,116,21,0.1)", color: "#F97415" }}
            >
              Audit gratuito
            </span>
            <h2 className="text-2xl md:text-4xl font-bold text-[#111111] mb-3">
              Prenota la call di valutazione
            </h2>
            <p className="text-[#111111]/60">
              30 minuti con uno specialista migrazioni. Ti diciamo subito cosa è migrabile, in quanto tempo, a costo zero.
              <br />
              <span className="font-semibold text-[#111111]">Risposta entro 24h lavorative.</span>
            </p>
          </div>

          {submitted ? (
            <div
              className="rounded-3xl p-10 text-center transition-all duration-700"
              style={{
                background: "linear-gradient(135deg, rgba(249,116,21,0.08) 0%, rgba(249,116,21,0.03) 100%)",
                border: "1px solid rgba(249,116,21,0.25)",
              }}
            >
              <div
                className="w-16 h-16 rounded-full mx-auto mb-5 flex items-center justify-center"
                style={{ background: "#F97415" }}
              >
                <CheckCheck className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-[#111111] mb-3">Richiesta ricevuta ✓</h3>
              <p className="text-[#111111]/65 max-w-md mx-auto mb-6">
                Uno specialista migrazioni ti contatta entro 24 ore lavorative su <strong>{form.email}</strong> o
                al telefono <strong>{form.telefono}</strong> per fissare la call di audit.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  to="/funzionalita"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full font-bold text-sm border border-[#111111]/15 text-[#111111] hover:bg-gray-50 transition"
                >
                  Esplora le funzionalità
                </Link>
                <Link
                  to="/casi-studio"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full font-bold text-sm text-white transition"
                  style={{ background: "#F97415" }}
                >
                  Leggi i casi studio
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              noValidate
              className="bg-white rounded-3xl p-6 md:p-10 shadow-xl transition-all duration-700"
              style={{
                border: "1px solid #e8ecf0",
                opacity: formAnim.isVisible ? 1 : 0,
                transform: formAnim.isVisible ? "translateY(0)" : "translateY(28px)",
              }}
            >
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[#111111] mb-1.5">Nome e cognome *</label>
                  <input name="nome" value={form.nome} onChange={handleChange} className={inputClass("nome")} placeholder="Mario Rossi" />
                  {errors.nome && <p className="text-red-500 text-xs mt-1">{errors.nome}</p>}
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#111111] mb-1.5">Azienda *</label>
                  <input name="azienda" value={form.azienda} onChange={handleChange} className={inputClass("azienda")} placeholder="Rossi Costruzioni S.r.l." />
                  {errors.azienda && <p className="text-red-500 text-xs mt-1">{errors.azienda}</p>}
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#111111] mb-1.5">Email *</label>
                  <input type="email" name="email" value={form.email} onChange={handleChange} className={inputClass("email")} placeholder="mario@rossi.it" />
                  {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#111111] mb-1.5">Telefono *</label>
                  <input name="telefono" value={form.telefono} onChange={handleChange} className={inputClass("telefono")} placeholder="+39 333 1234567" />
                  {errors.telefono && <p className="text-red-500 text-xs mt-1">{errors.telefono}</p>}
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#111111] mb-1.5">Software attuale *</label>
                  <select name="software_attuale" value={form.software_attuale} onChange={handleChange} className={inputClass("software_attuale")}>
                    <option value="">Seleziona…</option>
                    {SOFTWARE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {errors.software_attuale && <p className="text-red-500 text-xs mt-1">{errors.software_attuale}</p>}
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#111111] mb-1.5">Numero cantieri/anno *</label>
                  <select name="num_cantieri" value={form.num_cantieri} onChange={handleChange} className={inputClass("num_cantieri")}>
                    <option value="">Seleziona…</option>
                    {NUM_CANTIERI_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {errors.num_cantieri && <p className="text-red-500 text-xs mt-1">{errors.num_cantieri}</p>}
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-[#111111] mb-1.5">Anni di archivio storico</label>
                  <select name="anni_dati" value={form.anni_dati} onChange={handleChange} className={inputClass("anni_dati")}>
                    <option value="">Seleziona…</option>
                    {ANNI_DATI_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-[#111111] mb-1.5">Note (opzionale)</label>
                  <textarea
                    name="note"
                    value={form.note}
                    onChange={handleChange}
                    className={inputClass("note")}
                    rows={3}
                    placeholder="Es. Abbiamo 4 sedi, 2 export Excel separati, archivio anche cartaceo da digitalizzare…"
                  />
                </div>
              </div>

              {/* Consent */}
              <div className="mt-6 space-y-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" name="privacy" checked={form.privacy} onChange={handleChange} className="mt-1 accent-[#F97415]" />
                  <span className="text-xs text-[#111111]/70 leading-relaxed">
                    Ho letto la <Link to="/privacy" className="underline font-semibold">Privacy Policy</Link> (art. 13 GDPR) e
                    autorizzo Domus Group S.r.l. al trattamento dei dati per la valutazione della migrazione (base giuridica: art. 6.1.b GDPR — pre-contrattuale). *
                  </span>
                </label>
                {errors.privacy && <p className="text-red-500 text-xs">{errors.privacy}</p>}

                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" name="marketing" checked={form.marketing} onChange={handleChange} className="mt-1 accent-[#F97415]" />
                  <span className="text-xs text-[#111111]/70 leading-relaxed">
                    Acconsento a ricevere comunicazioni commerciali (case study, novità prodotto). Facoltativo, revocabile in ogni momento.
                  </span>
                </label>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="mt-7 w-full inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full text-white font-bold text-base transition-all hover:scale-[1.01] disabled:opacity-60 disabled:cursor-not-allowed shadow-lg"
                style={{ background: "#F97415", boxShadow: "0 8px 30px rgba(249,116,21,0.3)" }}
              >
                {submitting ? "Invio…" : "Pianifica la mia migrazione"}
                {!submitting && <ArrowRight className="w-5 h-5" />}
              </button>

              <p className="text-center text-xs text-[#111111]/50 mt-4">
                Risposta entro 24h lavorative · Audit gratuito · Nessun obbligo
              </p>
            </form>
          )}
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-14 sm:py-20 px-5 sm:px-6" style={{ background: "#f7f9fc" }}>
        <div ref={faqAnim.ref} className="max-w-3xl mx-auto">
          <div
            className="text-center mb-10 transition-all duration-700"
            style={{
              opacity: faqAnim.isVisible ? 1 : 0,
              transform: faqAnim.isVisible ? "translateY(0)" : "translateY(24px)",
            }}
          >
            <span
              className="inline-block px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase mb-4"
              style={{ background: "rgba(249,116,21,0.1)", color: "#F97415" }}
            >
              Domande frequenti
            </span>
            <h2 className="text-2xl md:text-4xl font-bold text-[#111111]">
              Le risposte che chiedi sempre prima di firmare
            </h2>
          </div>

          <div className="space-y-3">
            {faqs.map((f, i) => (
              <details
                key={f.q}
                className="bg-white rounded-2xl group transition-all duration-700"
                style={{
                  border: "1px solid #e8ecf0",
                  opacity: faqAnim.isVisible ? 1 : 0,
                  transform: faqAnim.isVisible ? "translateY(0)" : "translateY(16px)",
                  transitionDelay: `${i * 60}ms`,
                }}
              >
                <summary className="flex items-center justify-between gap-4 p-5 cursor-pointer list-none">
                  <span className="font-semibold text-[#111111] text-sm md:text-base">{f.q}</span>
                  <span
                    className="w-6 h-6 rounded-full flex items-center justify-center text-lg leading-none flex-shrink-0 group-open:rotate-45 transition-transform"
                    style={{ background: "rgba(249,116,21,0.1)", color: "#F97415" }}
                  >
                    +
                  </span>
                </summary>
                <p className="px-5 pb-5 text-[#111111]/65 text-sm leading-relaxed">{f.a}</p>
              </details>
            ))}
          </div>

          {/* Bottom CTA */}
          <div className="text-center mt-12">
            <p className="text-[#111111]/55 text-sm mb-4">Non hai trovato la tua domanda?</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a
                href="mailto:info@ediliziaincloud.com?subject=Domanda%20migrazione"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full font-semibold text-sm bg-white border border-[#111111]/15 text-[#111111] hover:border-[#F97415] hover:text-[#F97415] transition"
              >
                <Mail className="w-4 h-4" />
                Scrivici via email
              </a>
              <a
                href="#form"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full font-bold text-sm text-white transition"
                style={{ background: "#F97415" }}
              >
                <Building2 className="w-4 h-4" />
                Pianifica una call
              </a>
            </div>
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
