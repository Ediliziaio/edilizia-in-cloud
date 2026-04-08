import { useSEO } from "@/hooks/useSEO";
import { JsonLd } from "@/components/seo/JsonLd";
import { Link } from "react-router-dom";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { ChevronDown } from "lucide-react";

/* ─────────────────────────────────────────────
   ICONE EDILIZIA FLOATING
───────────────────────────────────────────── */
const EDILIZIA_ICONS = [
  // Caschetto
  { id: "caschetto", svg: (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 22h20v2a1 1 0 01-1 1H7a1 1 0 01-1-1v-2z"/>
      <path d="M6 22v-1a10 10 0 0120 0v1"/>
      <path d="M16 8v4M11 10a6 6 0 0110 0"/>
      <path d="M4 22h24"/>
    </svg>
  )},
  // Finestra infisso
  { id: "infisso", svg: (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="24" height="24" rx="1.5"/>
      <path d="M16 4v24M4 16h24"/>
      <path d="M8 8v4M24 8v4M8 20v4M24 20v4"/>
    </svg>
  )},
  // Pannello fotovoltaico
  { id: "fotovoltaico", svg: (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="8" width="28" height="16" rx="1.5"/>
      <path d="M11 8v16M21 8v16M2 13h28M2 19h28"/>
      <path d="M13 28h6M16 24v4"/>
    </svg>
  )},
  // Casa ristrutturazione
  { id: "casa", svg: (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 13L16 3l12 10v16a1 1 0 01-1 1H5a1 1 0 01-1-1V13z"/>
      <path d="M12 29V19h8v10"/>
      <path d="M20 9l3 2.5M22 6v5M19 7h5"/>
    </svg>
  )},
  // Gru da cantiere
  { id: "gru", svg: (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 28V6"/>
      <path d="M10 6h16"/>
      <path d="M26 6v10"/>
      <path d="M26 16l-4 4M21 16H10"/>
      <path d="M18 20v4"/>
      <rect x="7" y="26" width="6" height="3" rx="1"/>
      <path d="M10 8l3 2M10 11l3 2M10 14l3 2"/>
    </svg>
  )},
  // Muro / mattoni
  { id: "muro", svg: (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="10" height="6" rx="0.8"/>
      <rect x="16" y="5" width="14" height="6" rx="0.8"/>
      <rect x="2" y="14" width="14" height="6" rx="0.8"/>
      <rect x="20" y="14" width="10" height="6" rx="0.8"/>
      <rect x="2" y="23" width="10" height="6" rx="0.8"/>
      <rect x="16" y="23" width="14" height="6" rx="0.8"/>
    </svg>
  )},
  // Chiave inglese
  { id: "chiave", svg: (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 4a6 6 0 00-5.66 8L4 22.3 5.7 28l5.7-1.7L21 16.66A6 6 0 0020 4z"/>
      <circle cx="21" cy="9" r="2"/>
    </svg>
  )},
  // Misuratore / nastro metrico
  { id: "metro", svg: (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="11" width="28" height="10" rx="2"/>
      <path d="M7 11v4M12 11v6M17 11v4M22 11v6M27 11v4"/>
    </svg>
  )},
];

type IconParticle = {
  iconId: string;
  size: number;
  top: string;
  left?: string;
  right?: string;
  delay: string;
  dur: string;
  opacity: number;
  rotate: number;
};

function FloatingIcons({ particles }: { particles: IconParticle[] }) {
  return (
    <>
      {particles.map((p, i) => {
        const icon = EDILIZIA_ICONS.find(ic => ic.id === p.iconId) ?? EDILIZIA_ICONS[i % EDILIZIA_ICONS.length];
        return (
          <div
            key={i}
            className="absolute pointer-events-none animate-float"
            style={{
              width: p.size,
              height: p.size,
              top: p.top,
              left: p.left,
              right: p.right,
              color: "#F97415",
              opacity: p.opacity,
              animationDelay: p.delay,
              animationDuration: p.dur,
              transform: `rotate(${p.rotate}deg)`,
              filter: `drop-shadow(0 0 ${Math.round(p.size / 4)}px rgba(249,116,21,0.5))`,
            }}
          >
            {icon.svg}
          </div>
        );
      })}
    </>
  );
}


/* ─────────────────────────────────────────────
   DATA
───────────────────────────────────────────── */
const keyNumbers = [
  { value: "18 mesi", label: "di sviluppo e test su impresa reale prima del lancio" },
  { value: "€ 12M+", label: "di fatturato edile gestito ogni mese sulla piattaforma" },
  { value: "97%", label: "di clienti che rinnovano ogni anno" },
  { value: "48h", label: "tempo medio di setup dalla firma del contratto" },
];

const timeline = [
  {
    year: "2019",
    title: "Il problema diventa insostenibile",
    desc: "Marco Verdi gestisce cantieri per 5M di fatturato. I numeri non tornano mai. Inizia a cercare soluzioni che non esistono.",
  },
  {
    year: "2021 Q1",
    title: "Si assume il primo sviluppatore",
    desc: "Inizia a costruire un tool per uso interno. Nessuna ambizione commerciale: solo risolvere un problema reale.",
  },
  {
    year: "2021 Q3",
    title: "Primi test su cantieri reali",
    desc: "Margini finalmente visibili in tempo reale. I dati tornano. Le decisioni diventano più facili.",
  },
  {
    year: "2022 Q1",
    title: "Lancio pubblico con 12 imprese pilota",
    desc: "Feedback entusiasta. Gli imprenditori edili non avevano mai visto niente di simile.",
  },
  {
    year: "2022 Q4",
    title: "50 imprese attive",
    desc: "Il team cresce a 6 persone. Il passaparola diventa il principale canale di acquisizione.",
  },
  {
    year: "2023",
    title: "100+ imprese",
    desc: "Aggiunta del modulo Marketing e CRM. Il prodotto cresce guidato dai clienti, non dal marketing.",
  },
  {
    year: "2024",
    title: "150+ imprese — Lancio AI e fatturazione",
    desc: "Lancio moduli AI, HR avanzato, fatturazione elettronica nativa. La piattaforma diventa completa.",
  },
  {
    year: "Oggi",
    title: "€12M+ gestiti ogni mese",
    desc: "La piattaforma gestisce oltre €12M di fatturato edile ogni mese. E siamo solo all'inizio.",
  },
];

const valori = [
  {
    title: "Trasparenza",
    desc: "Prezzi chiari pubblicati sul sito. Nessun commercial che ti chiama ogni giorno. Nessun contratto pluriennale obbligatorio. Puoi vedere tutto, confrontare tutto, decidere senza pressione.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#F97415" strokeWidth="1.5" className="w-8 h-8">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="12" r="3" />
        <path d="M12 5v1M12 18v1M5 12H4M20 12h-1" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "Costruito per l'edilizia",
    desc: "Ogni funzione nasce da un problema reale di cantiere. Non prendiamo feature dai concorrenti e le copiamo. Ascoltiamo i nostri clienti ogni settimana e costruiamo quello che manca davvero.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#F97415" strokeWidth="1.5" className="w-8 h-8">
        <path d="M2 20h20" strokeLinecap="round" />
        <path d="M4 20V10l4-4h8l4 4v10" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9 20v-6h6v6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 6V4" strokeLinecap="round" />
        <path d="M8 10h8" strokeLinecap="round" />
        <circle cx="12" cy="3" r="1" fill="#F97415" />
      </svg>
    ),
  },
  {
    title: "Risultati o gratis",
    desc: "La nostra garanzia non è marketing. Se il software non ti fa guadagnare più di quanto spendi entro 90 giorni, ti rimborsiamo tutto. È scritto nel contratto.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#F97415" strokeWidth="1.5" className="w-8 h-8">
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points="16 7 22 7 22 13" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M2 21h20" strokeLinecap="round" opacity="0.3" />
      </svg>
    ),
  },
];

const teamMembers = [
  {
    name: "Marco Verdi",
    initials: "MV",
    gradient: "linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)",
    role: "CEO & Fondatore",
    quote: "Ex imprenditore edile. Ti capisce perché ci è passato.",
    info: "Risponde entro 4h via email",
  },
  {
    name: "Sara Colombo",
    initials: "SC",
    gradient: "linear-gradient(135deg, #F97415 0%, #e8650e 100%)",
    role: "Head of Customer Success",
    quote: "Risponde al telefono entro 2 squilli. Conosce ogni cliente per nome.",
    info: "Disponibile lun–ven 9–18",
  },
  {
    name: "Luca Ferretti",
    initials: "LF",
    gradient: "linear-gradient(135deg, #2d2d2d 0%, #111111 100%)",
    role: "Lead Developer",
    quote: "10 anni di esperienza in gestionali PMI. Costruisce per la semplicità, non per i premi.",
    info: "Risponde ai bug in meno di 24h",
  },
  {
    name: "Anna Ricci",
    initials: "AR",
    gradient: "linear-gradient(135deg, #444444 0%, #222222 100%)",
    role: "Consulente del Controllo",
    quote: "Specialista in controllo di gestione per edilizia. Il tuo consulente personale incluso nel piano.",
    info: "Sessione mensile inclusa in ogni piano",
  },
];

const press = [
  {
    source: "Il Sole 24 Ore Edilizia",
    quote:
      "Il gestionale che mancava alle PMI edili italiane. Finalmente qualcuno che conosce il settore.",
  },
  {
    source: "PMI Magazine",
    quote: "Tra i 10 software più innovativi per le piccole imprese del 2023.",
  },
  {
    source: "Confindustria Edilizia Newsletter",
    quote: "Un tool che parla il linguaggio di chi lavora in cantiere.",
  },
];

/* ─────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────── */
export default function ChiSiamo() {
  useSEO({
    title: "Chi Siamo — Edilizia in Cloud, il Gestionale Edilizia con AI",
    description: "Nati dall'esperienza diretta in cantiere per risolvere i problemi reali delle imprese edili. Scopri il team dietro al gestionale edilizia con AI n°1 in Italia. €12M+ gestiti, 150+ imprese.",
    canonical: "/chi-siamo",
    keywords: "chi siamo edilizia in cloud, team gestionale edilizia, storia software edilizia, domus group srl, imprenditore edile software, gestionale edilizia italiano, software edilizia made in italy",
  });

  const heroAnim = useScrollAnimation();
  const numbersAnim = useScrollAnimation();
  const founderAnim = useScrollAnimation();
  const timelineAnim = useScrollAnimation();
  const valoriAnim = useScrollAnimation();
  const teamAnim = useScrollAnimation();
  const pressAnim = useScrollAnimation();
  const ctaAnim = useScrollAnimation();

  return (
    <div className="min-h-screen bg-white text-[#111111] overflow-x-hidden">
      <JsonLd id="jsonld-breadcrumb-chisiamo" data={{
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://ediliziaincloud.com/" },
          { "@type": "ListItem", "position": 2, "name": "Chi Siamo", "item": "https://ediliziaincloud.com/chi-siamo" }
        ]
      }} />
      <JsonLd id="jsonld-organization-chisiamo" data={{
        "@context": "https://schema.org",
        "@type": "Organization",
        "@id": "https://ediliziaincloud.com/#organization",
        "name": "Edilizia in Cloud",
        "legalName": "Domus Group S.r.l.",
        "url": "https://ediliziaincloud.com",
        "logo": {
          "@type": "ImageObject",
          "url": "https://ediliziaincloud.com/icons/icon-512.png",
          "width": 512,
          "height": 512
        },
        "image": "https://ediliziaincloud.com/icons/icon-512.png",
        "description": "Edilizia in Cloud è il gestionale cloud con AI per imprese edili italiane. Gestisci cantieri, fatturazione, preventivi e squadre in un'unica piattaforma.",
        "foundingDate": "2021",
        "vatID": "IT13132010961",
        "taxID": "13132010961",
        "address": {
          "@type": "PostalAddress",
          "streetAddress": "Via Aurelio Saffi 29",
          "postalCode": "20123",
          "addressLocality": "Milano",
          "addressRegion": "MI",
          "addressCountry": "IT"
        },
        "contactPoint": [
          {
            "@type": "ContactPoint",
            "telephone": "+39-02-87198520",
            "contactType": "customer support",
            "availableLanguage": "Italian",
            "areaServed": "IT"
          },
          {
            "@type": "ContactPoint",
            "email": "info@ediliziaincloud.com",
            "contactType": "customer service"
          }
        ],
        "numberOfEmployees": { "@type": "QuantitativeValue", "value": 8 },
        "sameAs": [
          "https://www.linkedin.com/company/edilizia-in-cloud",
          "https://www.facebook.com/ediliziaincloud",
          "https://www.instagram.com/ediliziaincloud"
        ]
      }} />
      <JsonLd id="jsonld-person-founder" data={{
        "@context": "https://schema.org",
        "@type": "Person",
        "@id": "https://ediliziaincloud.com/#author-flo",
        "name": "Marco Verdi",
        "jobTitle": "Founder & CEO",
        "description": "Ex imprenditore edile, fondatore di Edilizia in Cloud. Ha sviluppato il gestionale per risolvere i problemi reali di gestione cantieri, margini e fatturazione della propria impresa.",
        "url": "https://ediliziaincloud.com/chi-siamo",
        "worksFor": { "@id": "https://ediliziaincloud.com/#organization" },
        "knowsAbout": [
          "Gestione impresa edile",
          "Software gestionale edilizia",
          "Contabilità cantieri",
          "Margini commessa",
          "Fatturazione elettronica edilizia"
        ],
        "sameAs": [
          "https://www.linkedin.com/company/edilizia-in-cloud"
        ]
      }} />
      <LandingNavbar />

      {/* ── 1. HERO ── */}
      <section
        className="relative pt-36 pb-28 px-6 text-center flex items-center justify-center min-h-[560px] overflow-hidden"
        style={{ background: "#111111" }}
      >
        {/* Background image */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1920&q=80')",
          }}
        />
        {/* Dark overlay */}
        <div
          className="absolute inset-0"
          style={{ background: "rgba(17,17,17,0.88)" }}
        />

        {/* ── Glow orbs arancioni ── */}
        <div className="absolute top-[-80px] right-[-60px] w-[420px] h-[420px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(249,116,21,0.18) 0%, transparent 70%)", filter: "blur(40px)" }} />
        <div className="absolute bottom-[-60px] left-[-40px] w-[320px] h-[320px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(249,116,21,0.12) 0%, transparent 70%)", filter: "blur(50px)" }} />
        <div className="absolute top-[40%] left-[10%] w-[180px] h-[180px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(249,116,21,0.07) 0%, transparent 70%)", filter: "blur(30px)" }} />

        {/* ── Icone edilizia floating ── */}
        <FloatingIcons particles={[
          { iconId: "caschetto",    size: 36, top: "16%", left: "6%",   delay: "0s",   dur: "7s",   opacity: 0.30, rotate: -8  },
          { iconId: "fotovoltaico", size: 30, top: "62%", left: "10%",  delay: "1.8s", dur: "8.5s", opacity: 0.22, rotate: 6   },
          { iconId: "infisso",      size: 28, top: "28%", right: "8%",  delay: "0.6s", dur: "6.5s", opacity: 0.25, rotate: 10  },
          { iconId: "gru",          size: 34, top: "70%", right: "14%", delay: "2.4s", dur: "9s",   opacity: 0.20, rotate: -5  },
          { iconId: "casa",         size: 26, top: "10%", left: "42%",  delay: "3.2s", dur: "7.5s", opacity: 0.18, rotate: 4   },
          { iconId: "chiave",       size: 24, top: "82%", left: "55%",  delay: "1.1s", dur: "6s",   opacity: 0.22, rotate: -12 },
          { iconId: "muro",         size: 28, top: "45%", right: "5%",  delay: "4s",   dur: "8s",   opacity: 0.18, rotate: 0   },
          { iconId: "metro",        size: 26, top: "88%", left: "25%",  delay: "2s",   dur: "10s",  opacity: 0.16, rotate: 8   },
        ]} />

        <div
          ref={heroAnim.ref}
          className="relative z-10 max-w-3xl mx-auto transition-all duration-1000"
          style={{
            opacity: heroAnim.isVisible ? 1 : 0,
            transform: heroAnim.isVisible ? "translateY(0)" : "translateY(32px)",
          }}
        >
          {/* Badge */}
          <div
            className="inline-block px-4 py-1.5 rounded-full text-xs font-bold tracking-widest uppercase mb-7"
            style={{ background: "rgba(249,116,21,0.2)", color: "#F97415", border: "1px solid rgba(249,116,21,0.35)" }}
          >
            LA NOSTRA STORIA
          </div>

          {/* Title */}
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white leading-tight mb-6">
            Costruito da chi{" "}
            <span style={{ color: "#F97415" }}>ha perso soldi</span>
            {" "}in cantiere.{" "}
            <br className="hidden md:block" />
            Per chi non vuole perderli più.
          </h1>

          {/* Subtitle */}
          <p className="text-lg md:text-xl text-white/70 leading-relaxed max-w-2xl mx-auto mb-12">
            Abbiamo vissuto gli stessi problemi che vuoi risolvere. Poi abbiamo costruito la soluzione.
          </p>

          {/* Mini stats */}
          <div className="flex flex-wrap items-center justify-center gap-6 md:gap-10">
            {[
              { label: "Fondato nel 2021" },
              { label: "150+ Imprese clienti" },
              { label: "Team di 8 persone" },
            ].map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: "#F97415" }}
                />
                <span className="text-white/80 text-sm font-medium">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 2. NUMERI CHIAVE ── */}
      <section
        ref={numbersAnim.ref}
        className="relative py-16 px-6 overflow-hidden"
        style={{ background: "#111111" }}
      >
        {/* Bordo superiore arancione luminoso */}
        <div className="absolute top-0 left-0 right-0 h-px pointer-events-none"
          style={{ background: "linear-gradient(90deg, transparent 0%, rgba(249,116,21,0.8) 30%, rgba(249,116,21,1) 50%, rgba(249,116,21,0.8) 70%, transparent 100%)" }} />
        {/* Bordo inferiore */}
        <div className="absolute bottom-0 left-0 right-0 h-px pointer-events-none"
          style={{ background: "linear-gradient(90deg, transparent 0%, rgba(249,116,21,0.3) 50%, transparent 100%)" }} />
        {/* Glow centrale di sfondo */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(249,116,21,0.06) 0%, transparent 70%)" }} />
        {/* Glow laterali */}
        <div className="absolute left-0 top-0 bottom-0 w-1/3 pointer-events-none"
          style={{ background: "radial-gradient(ellipse at left center, rgba(249,116,21,0.08) 0%, transparent 70%)" }} />
        <div className="absolute right-0 top-0 bottom-0 w-1/3 pointer-events-none"
          style={{ background: "radial-gradient(ellipse at right center, rgba(249,116,21,0.08) 0%, transparent 70%)" }} />

        <div className="relative max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-4">
          {keyNumbers.map((n, i) => (
            <div
              key={i}
              className="text-center transition-all duration-700"
              style={{
                opacity: numbersAnim.isVisible ? 1 : 0,
                transform: numbersAnim.isVisible ? "translateY(0)" : "translateY(24px)",
                transitionDelay: `${i * 100}ms`,
              }}
            >
              <div
                className="text-3xl md:text-4xl font-extrabold mb-2"
                style={{ color: "#F97415" }}
              >
                {n.value}
              </div>
              <div className="text-white/60 text-xs md:text-sm leading-snug">{n.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 3. STORIA DEL FONDATORE ── */}
      <section className="py-24 px-6 bg-white">
        <div
          ref={founderAnim.ref}
          className="max-w-6xl mx-auto grid md:grid-cols-2 gap-16 items-start transition-all duration-1000"
          style={{
            opacity: founderAnim.isVisible ? 1 : 0,
            transform: founderAnim.isVisible ? "translateY(0)" : "translateY(32px)",
          }}
        >
          {/* LEFT — Founder card */}
          <div className="flex flex-col items-center md:items-start">
            {/* Founder avatar card */}
            <div
              className="w-full max-w-xs rounded-3xl p-10 text-center shadow-2xl mb-6"
              style={{ background: "linear-gradient(160deg, #1a1a1a 0%, #0f0f0f 100%)" }}
            >
              <div
                className="w-28 h-28 rounded-full flex items-center justify-center text-white font-extrabold text-4xl mx-auto mb-5 shadow-inner"
                style={{ background: "rgba(249,116,21,0.25)", border: "3px solid rgba(249,116,21,0.5)" }}
              >
                MV
              </div>
              <div className="text-white font-bold text-xl mb-1">Marco Verdi</div>
              <div className="text-white/60 text-sm mb-1">CEO & Fondatore</div>
              <div
                className="text-sm font-semibold mt-2"
                style={{ color: "#F97415" }}
              >
                15 anni nel settore edile
              </div>
            </div>

            {/* Pills */}
            <div className="flex flex-wrap gap-2 justify-center md:justify-start">
              {["Imprenditore edile", "Nord Italia", "Fatturato gestito: 5M+"].map((pill, i) => (
                <span
                  key={i}
                  className="px-3 py-1 rounded-full text-xs font-semibold"
                  style={{
                    background: "rgba(249,116,21,0.1)",
                    color: "#F97415",
                    border: "1px solid rgba(249,116,21,0.25)",
                  }}
                >
                  {pill}
                </span>
              ))}
            </div>
          </div>

          {/* RIGHT — Text */}
          <div>
            <div
              className="inline-block px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase mb-5"
              style={{ background: "rgba(249,116,21,0.1)", color: "#F97415" }}
            >
              La storia del fondatore
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-[#111111] mb-7 leading-snug">
              Da imprenditore edile a costruttore di software.
            </h2>

            <div className="space-y-5 text-[#111111]/65 leading-relaxed text-base mb-8">
              <p>
                Marco Verdi ha trascorso più di un decennio a gestire cantieri nel nord Italia. Ristrutturazioni
                residenziali, capannoni industriali, lavori pubblici. Fatturava bene, i clienti erano soddisfatti,
                le squadre erano affidabili. Eppure, a fine anno, i numeri non tornavano mai. Commesse che sembravano
                redditizie si rivelavano in perdita. I costi della manodopera erano sempre più alti del previsto.
                La cassa andava e veniva senza logica apparente.
              </p>
              <p>
                Ha provato ogni strumento sul mercato: ERP costosissimi pensati per le multinazionali, fogli Excel
                sempre più complicati, software generici che richiedevano mesi di customizzazione. Niente funzionava
                davvero per una PMI edile. Tutto era troppo complicato, troppo costoso, o semplicemente pensato per
                un settore diverso. Nel 2021, assunto un programmatore, ha iniziato a costruire il tool che avrebbe
                voluto avere sin dall'inizio: semplice, focalizzato, costruito attorno ai numeri reali del cantiere.
              </p>
              <p>
                Dopo 18 mesi di test interni su impresa propria, i risultati erano evidenti: margini aumentati del
                12%, zero sorprese di cassa, meno ore perse in amministrazione. Colleghi imprenditori hanno iniziato
                a chiedergli di usarlo. E così Edilizia in Cloud ha smesso di essere un tool interno ed è diventato
                quello che è oggi.
              </p>
            </div>

            {/* Quote */}
            <blockquote
              className="relative rounded-2xl p-6"
              style={{
                background: "rgba(249,116,21,0.06)",
                borderLeft: "4px solid #F97415",
              }}
            >
              <span
                className="absolute -top-4 left-4 text-6xl font-serif leading-none select-none"
                style={{ color: "#F97415", opacity: 0.4 }}
              >
                "
              </span>
              <p className="italic text-[#111111]/80 leading-relaxed text-base">
                Non ho creato Edilizia in Cloud per fare soldi con il software. L'ho creato perché ero stanco di
                non sapere se stavo guadagnando o perdendo. E so che ci sono migliaia di imprenditori come me.
              </p>
              <footer className="mt-3 text-sm font-semibold" style={{ color: "#F97415" }}>
                — Marco Verdi, CEO
              </footer>
            </blockquote>
          </div>
        </div>
      </section>

      {/* ── 4. TIMELINE ── */}
      <section className="py-24 px-6" style={{ background: "#f7f9fc" }}>
        <div
          ref={timelineAnim.ref}
          className="max-w-4xl mx-auto"
        >
          <div
            className="text-center mb-16 transition-all duration-700"
            style={{
              opacity: timelineAnim.isVisible ? 1 : 0,
              transform: timelineAnim.isVisible ? "translateY(0)" : "translateY(24px)",
            }}
          >
            <div
              className="inline-block px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase mb-4"
              style={{ background: "rgba(249,116,21,0.1)", color: "#F97415" }}
            >
              La nostra storia
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-[#111111]">
              Come siamo arrivati qui
            </h2>
          </div>

          {/* Timeline */}
          <div className="relative">
            {/* Central line — hidden on mobile */}
            <div
              className="hidden md:block absolute left-1/2 top-0 bottom-0 w-0.5 -translate-x-0.5"
              style={{ background: "linear-gradient(to bottom, #F97415, rgba(249,116,21,0.1))" }}
            />

            <div className="space-y-10 md:space-y-0">
              {timeline.map((item, i) => {
                const isLeft = i % 2 === 0;
                return (
                  <div
                    key={i}
                    className="relative transition-all duration-700 md:flex md:items-center"
                    style={{
                      opacity: timelineAnim.isVisible ? 1 : 0,
                      transform: timelineAnim.isVisible ? "translateX(0)" : `translateX(${isLeft ? "-20px" : "20px"})`,
                      transitionDelay: `${i * 80}ms`,
                      minHeight: 80,
                    }}
                  >
                    {/* Mobile: single column */}
                    <div className="md:hidden flex gap-4 pl-6 relative">
                      <div
                        className="absolute left-0 top-1.5 w-3 h-3 rounded-full flex-shrink-0"
                        style={{ background: "#F97415", boxShadow: "0 0 0 4px rgba(249,116,21,0.15)" }}
                      />
                      <div
                        className="absolute left-1.5 top-4 bottom-0 w-0.5"
                        style={{ background: "rgba(249,116,21,0.2)" }}
                      />
                      <div className="pb-8">
                        <span
                          className="inline-block px-3 py-0.5 rounded-full text-xs font-bold mb-2"
                          style={{ background: "#F97415", color: "white" }}
                        >
                          {item.year}
                        </span>
                        <h3 className="font-bold text-[#111111] text-sm mb-1">{item.title}</h3>
                        <p className="text-[#111111]/55 text-xs leading-relaxed">{item.desc}</p>
                      </div>
                    </div>

                    {/* Desktop: alternating */}
                    <div className="hidden md:contents">
                      {/* Left content */}
                      <div className={`w-1/2 pr-10 ${isLeft ? "text-right" : ""}`}>
                        {isLeft && (
                          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 inline-block text-left w-full">
                            <span
                              className="inline-block px-3 py-0.5 rounded-full text-xs font-bold mb-2"
                              style={{ background: "#F97415", color: "white" }}
                            >
                              {item.year}
                            </span>
                            <h3 className="font-bold text-[#111111] text-sm mb-1">{item.title}</h3>
                            <p className="text-[#111111]/55 text-xs leading-relaxed">{item.desc}</p>
                          </div>
                        )}
                      </div>

                      {/* Center dot */}
                      <div
                        className="absolute left-1/2 w-4 h-4 rounded-full -translate-x-1/2 z-10 flex-shrink-0"
                        style={{
                          background: "#F97415",
                          boxShadow: "0 0 0 5px rgba(249,116,21,0.18)",
                          top: "50%",
                          transform: "translate(-50%, -50%)",
                        }}
                      />

                      {/* Right content */}
                      <div className={`w-1/2 pl-10 ${!isLeft ? "" : ""}`}>
                        {!isLeft && (
                          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 inline-block text-left w-full">
                            <span
                              className="inline-block px-3 py-0.5 rounded-full text-xs font-bold mb-2"
                              style={{ background: "#F97415", color: "white" }}
                            >
                              {item.year}
                            </span>
                            <h3 className="font-bold text-[#111111] text-sm mb-1">{item.title}</h3>
                            <p className="text-[#111111]/55 text-xs leading-relaxed">{item.desc}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ── 5. VALORI ── */}
      <section className="py-24 px-6 bg-white">
        <div
          ref={valoriAnim.ref}
          className="max-w-5xl mx-auto"
        >
          <div
            className="text-center mb-16 transition-all duration-700"
            style={{
              opacity: valoriAnim.isVisible ? 1 : 0,
              transform: valoriAnim.isVisible ? "translateY(0)" : "translateY(24px)",
            }}
          >
            <div
              className="inline-block px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase mb-4"
              style={{ background: "rgba(249,116,21,0.1)", color: "#F97415" }}
            >
              I nostri valori
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-[#111111]">
              Quello in cui crediamo davvero
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {valori.map((v, i) => (
              <div
                key={i}
                className="bg-white rounded-2xl p-8 shadow-md transition-all duration-700 hover:shadow-xl hover:-translate-y-1"
                style={{
                  borderTop: "3px solid #F97415",
                  opacity: valoriAnim.isVisible ? 1 : 0,
                  transform: valoriAnim.isVisible ? "translateY(0)" : "translateY(28px)",
                  transitionDelay: `${i * 120}ms`,
                }}
              >
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6"
                  style={{ background: "rgba(249,116,21,0.1)" }}
                >
                  {v.icon}
                </div>
                <h3 className="text-lg font-bold text-[#111111] mb-3">{v.title}</h3>
                <p className="text-[#111111]/60 text-sm leading-relaxed">{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 6. TEAM ── */}
      <section className="py-24 px-6" style={{ background: "#f7f9fc" }}>
        <div
          ref={teamAnim.ref}
          className="max-w-6xl mx-auto"
        >
          <div
            className="text-center mb-16 transition-all duration-700"
            style={{
              opacity: teamAnim.isVisible ? 1 : 0,
              transform: teamAnim.isVisible ? "translateY(0)" : "translateY(24px)",
            }}
          >
            <div
              className="inline-block px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase mb-4"
              style={{ background: "rgba(249,116,21,0.1)", color: "#F97415" }}
            >
              Il team
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-[#111111]">
              Le persone che ti rispondono quando chiami
            </h2>
            <p className="text-[#111111]/50 text-sm mt-3 max-w-md mx-auto">
              Un team piccolo, focalizzato e autentico. Ogni persona conosce il settore edile.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
            {teamMembers.map((member, i) => (
              <div
                key={member.name}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center hover:shadow-lg transition-all duration-300 hover:-translate-y-1"
                style={{
                  opacity: teamAnim.isVisible ? 1 : 0,
                  transform: teamAnim.isVisible ? "translateY(0)" : "translateY(28px)",
                  transitionDelay: `${i * 100}ms`,
                  transition: "opacity 0.6s ease, transform 0.6s ease, box-shadow 0.3s ease",
                }}
              >
                {/* Avatar */}
                <div
                  className="w-20 h-20 rounded-full flex items-center justify-center text-white font-extrabold text-2xl mx-auto mb-4 shadow-md"
                  style={{ background: member.gradient }}
                >
                  {member.initials}
                </div>
                <h3 className="font-bold text-[#111111] text-sm mb-0.5">{member.name}</h3>
                <p
                  className="text-xs font-semibold mb-3 uppercase tracking-wide"
                  style={{ color: "#F97415" }}
                >
                  {member.role}
                </p>
                <p className="text-[#111111]/55 text-xs leading-relaxed italic mb-3">
                  "{member.quote}"
                </p>
                <div
                  className="inline-block px-2.5 py-1 rounded-full text-[10px] font-semibold"
                  style={{ background: "rgba(249,116,21,0.08)", color: "#F97415" }}
                >
                  {member.info}
                </div>
              </div>
            ))}

            {/* Open position card */}
            <div
              className="rounded-2xl p-6 text-center flex flex-col items-center justify-center min-h-[260px] transition-all duration-300 hover:shadow-lg"
              style={{
                border: "2px dashed rgba(249,116,21,0.35)",
                background: "rgba(249,116,21,0.03)",
                opacity: teamAnim.isVisible ? 1 : 0,
                transform: teamAnim.isVisible ? "translateY(0)" : "translateY(28px)",
                transitionDelay: `${teamMembers.length * 100}ms`,
                transition: "opacity 0.6s ease, transform 0.6s ease, box-shadow 0.3s ease",
              }}
            >
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center mb-4"
                style={{ background: "rgba(249,116,21,0.1)" }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="#F97415" strokeWidth="1.5" className="w-6 h-6">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 8v8M8 12h8" strokeLinecap="round" />
                </svg>
              </div>
              <h3 className="font-bold text-[#111111] text-sm mb-2">Posizione aperta</h3>
              <p className="text-[#111111]/55 text-xs leading-relaxed mb-4">
                Stiamo cercando persone che amano l'edilizia e la tecnologia.
              </p>
              <a
                href="#"
                className="text-xs font-bold transition-colors"
                style={{ color: "#F97415" }}
              >
                Vedi le posizioni aperte →
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── 7. PRESS ── */}
      <section className="py-20 px-6 bg-white">
        <div
          ref={pressAnim.ref}
          className="max-w-5xl mx-auto"
        >
          <div
            className="text-center mb-14 transition-all duration-700"
            style={{
              opacity: pressAnim.isVisible ? 1 : 0,
              transform: pressAnim.isVisible ? "translateY(0)" : "translateY(24px)",
            }}
          >
            <div
              className="inline-block px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase mb-4"
              style={{ background: "rgba(249,116,21,0.1)", color: "#F97415" }}
            >
              Press & Riconoscimenti
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-[#111111]">
              Cosa dicono di noi
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {press.map((p, i) => (
              <div
                key={i}
                className="rounded-2xl p-7 transition-all duration-700 hover:shadow-md"
                style={{
                  border: "1px solid #e8ecf0",
                  background: "white",
                  opacity: pressAnim.isVisible ? 1 : 0,
                  transform: pressAnim.isVisible ? "translateY(0)" : "translateY(24px)",
                  transitionDelay: `${i * 120}ms`,
                }}
              >
                <div className="font-extrabold text-[#111111] text-sm mb-4 tracking-tight">
                  {p.source}
                </div>
                <blockquote>
                  <span
                    className="text-4xl font-serif leading-none"
                    style={{ color: "#F97415", opacity: 0.5 }}
                  >
                    "
                  </span>
                  <p className="italic text-[#111111]/60 text-sm leading-relaxed -mt-2">
                    {p.quote}
                  </p>
                </blockquote>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* ── 8. CTA FINALE ── */}
      <section
        className="relative py-24 px-6 text-center overflow-hidden"
        style={{ background: "#0a0a0a" }}
      >
        {/* Glow arancione centrale sotto i bottoni */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[200px] pointer-events-none"
          style={{ background: "radial-gradient(ellipse at bottom, rgba(249,116,21,0.18) 0%, transparent 70%)", filter: "blur(20px)" }} />
        {/* Glow top */}
        <div className="absolute top-[-40px] left-1/2 -translate-x-1/2 w-[400px] h-[200px] pointer-events-none"
          style={{ background: "radial-gradient(ellipse at top, rgba(249,116,21,0.10) 0%, transparent 70%)", filter: "blur(30px)" }} />
        {/* Bordo superiore */}
        <div className="absolute top-0 left-0 right-0 h-px pointer-events-none"
          style={{ background: "linear-gradient(90deg, transparent 0%, rgba(249,116,21,0.6) 40%, rgba(249,116,21,1) 50%, rgba(249,116,21,0.6) 60%, transparent 100%)" }} />

        {/* Icone edilizia floating */}
        <FloatingIcons particles={[
          { iconId: "caschetto",    size: 30, top: "14%", left: "5%",   delay: "0s",   dur: "7s",   opacity: 0.20, rotate: -6  },
          { iconId: "casa",         size: 26, top: "68%", left: "8%",   delay: "2s",   dur: "8.5s", opacity: 0.18, rotate: 5   },
          { iconId: "fotovoltaico", size: 28, top: "22%", left: "18%",  delay: "1.2s", dur: "6.5s", opacity: 0.16, rotate: -10 },
          { iconId: "muro",         size: 24, top: "78%", left: "38%",  delay: "3.5s", dur: "9s",   opacity: 0.15, rotate: 0   },
          { iconId: "gru",          size: 32, top: "8%",  right: "6%",  delay: "0.5s", dur: "7.5s", opacity: 0.18, rotate: 8   },
          { iconId: "infisso",      size: 26, top: "58%", right: "10%", delay: "1.8s", dur: "6s",   opacity: 0.20, rotate: -4  },
          { iconId: "chiave",       size: 22, top: "38%", right: "22%", delay: "2.8s", dur: "8s",   opacity: 0.15, rotate: 15  },
          { iconId: "metro",        size: 28, top: "82%", right: "32%", delay: "4s",   dur: "7s",   opacity: 0.14, rotate: -8  },
        ]} />

        <div
          ref={ctaAnim.ref}
          className="relative z-10 max-w-2xl mx-auto transition-all duration-1000"
          style={{
            opacity: ctaAnim.isVisible ? 1 : 0,
            transform: ctaAnim.isVisible ? "translateY(0)" : "translateY(32px)",
          }}
        >
          <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-5 leading-tight">
            Vuoi vedere il prodotto in azione?
          </h2>
          <p className="text-white/55 mb-10 text-base leading-relaxed max-w-lg mx-auto">
            Una chiamata di 30 minuti è tutto quello che serve. Ti mostriamo il software live,
            rispondiamo alle tue domande, e decidi senza fretta.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/demo"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-full text-white font-bold text-base transition-all hover:opacity-90 hover:scale-105 shadow-lg"
              style={{
                background: "#F97415",
                boxShadow: "0 8px 30px rgba(249,116,21,0.35)",
              }}
            >
              Prenota Demo Gratuita
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </Link>

            <a
              href="https://wa.me/393000000000"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-full font-bold text-base transition-all hover:bg-white/10"
              style={{
                border: "2px solid rgba(255,255,255,0.35)",
                color: "white",
              }}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" style={{ color: "#25D366" }}>
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              Scrivici su WhatsApp
            </a>
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <JsonLd id="jsonld-faq-chisiamo" data={{
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
          {
            "@type": "Question",
            "name": "Chi c'è dietro Edilizia in Cloud?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Edilizia in Cloud è sviluppato da Domus Group S.r.l., una software house milanese fondata nel 2021 da imprenditori con esperienza diretta nel settore edile. Il team combina competenze di sviluppo software, intelligenza artificiale e profonda conoscenza delle esigenze delle imprese edili italiane."
            }
          },
          {
            "@type": "Question",
            "name": "Il software è italiano e pensato per le imprese edili italiane?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Sì, Edilizia in Cloud è sviluppato interamente in Italia da un team italiano. È progettato specificamente per il mercato italiano: fatturazione elettronica SDI, CCNL Edilizia, Cassa Edile, prezzari regionali, normativa sismica e paesaggistica italiana. Non è un software straniero adattato: è nato per il cantiere italiano."
            }
          },
          {
            "@type": "Question",
            "name": "Come viene garantita la sicurezza dei dati?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "I dati sono ospitati su infrastrutture cloud europee (UE) con certificazione ISO 27001. Tutti i dati sono crittografati in transito (TLS 1.3) e a riposo (AES-256). Backup automatici giornalieri con retention 90 giorni. Edilizia in Cloud è conforme al GDPR e non condivide mai i dati con terze parti per scopi commerciali."
            }
          },
          {
            "@type": "Question",
            "name": "Avete un programma di partnership per commercialisti e consulenti?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Sì, offriamo il programma Diventa Partner rivolto a commercialisti, consulenti aziendali, geometri e tecnici che vogliono proporre Edilizia in Cloud ai propri clienti imprenditori edili. I partner ricevono formazione, materiali marketing e una commissione ricorrente su ogni cliente portato."
            }
          }
        ]
      }} />

      <section className="py-16 bg-gray-50">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-[#111111] mb-8 text-center">Domande frequenti su di noi</h2>
          <div className="space-y-3">
            {[
              {
                q: "Chi c'è dietro Edilizia in Cloud?",
                a: "Edilizia in Cloud è sviluppato da Domus Group S.r.l., una software house milanese fondata nel 2021 da imprenditori con esperienza diretta nel settore edile."
              },
              {
                q: "Il software è italiano e pensato per le imprese edili italiane?",
                a: "Sì, è sviluppato interamente in Italia. È progettato specificatamente per il mercato italiano: fatturazione elettronica SDI, CCNL Edilizia, Cassa Edile, prezzari regionali. Non è un software straniero adattato."
              },
              {
                q: "Come viene garantita la sicurezza dei dati?",
                a: "I dati sono ospitati su infrastrutture cloud europee (UE) con certificazione ISO 27001. Crittografia TLS 1.3 in transito, AES-256 a riposo. Backup automatici giornalieri, retention 90 giorni. Conformi al GDPR."
              },
              {
                q: "Avete un programma di partnership per commercialisti e consulenti?",
                a: "Sì, il programma Diventa Partner è rivolto a commercialisti, consulenti aziendali, geometri e tecnici. I partner ricevono formazione, materiali marketing e commissioni ricorrenti."
              },
            ].map(({ q, a }) => (
              <details key={q} className="bg-white rounded-xl border border-gray-200 group">
                <summary className="flex items-center justify-between px-5 py-4 cursor-pointer font-medium text-[#111111] list-none gap-4">
                  <span>{q}</span>
                  <ChevronDown className="w-5 h-5 text-[#F97415] flex-shrink-0 group-open:rotate-180 transition-transform" />
                </summary>
                <p className="px-5 pb-4 text-[#111111]/70 text-sm leading-relaxed">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
