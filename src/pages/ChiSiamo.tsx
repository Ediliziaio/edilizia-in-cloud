import { useEffect } from "react";
import { useSEO } from "@/hooks/useSEO";
import { Link } from "react-router-dom";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";

/* ─────────────────────────────────────────────
   PROMO BANNER
───────────────────────────────────────────── */
function PromoBanner() {
  return (
    <div className="fixed top-0 left-0 right-0 z-[60] bg-[#0fa68c] text-white py-2 text-center overflow-hidden">
      <span
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.12) 50%, transparent 100%)",
          backgroundSize: "200% 100%",
        }}
      />
      <span className="relative flex items-center justify-center gap-2 text-xs md:text-sm font-bold tracking-wide">
        SE NON TI FA GUADAGNARE, IL PROGRAMMA È GRATIS PER SEMPRE
      </span>
    </div>
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
      <svg viewBox="0 0 24 24" fill="none" stroke="#0fa68c" strokeWidth="1.5" className="w-8 h-8">
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
      <svg viewBox="0 0 24 24" fill="none" stroke="#0fa68c" strokeWidth="1.5" className="w-8 h-8">
        <path d="M2 20h20" strokeLinecap="round" />
        <path d="M4 20V10l4-4h8l4 4v10" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9 20v-6h6v6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 6V4" strokeLinecap="round" />
        <path d="M8 10h8" strokeLinecap="round" />
        <circle cx="12" cy="3" r="1" fill="#0fa68c" />
      </svg>
    ),
  },
  {
    title: "Risultati o gratis",
    desc: "La nostra garanzia non è marketing. Se il software non ti fa guadagnare più di quanto spendi entro 90 giorni, ti rimborsiamo tutto. È scritto nel contratto.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#0fa68c" strokeWidth="1.5" className="w-8 h-8">
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
    gradient: "linear-gradient(135deg, #1a2744 0%, #0f3460 100%)",
    role: "CEO & Fondatore",
    quote: "Ex imprenditore edile. Ti capisce perché ci è passato.",
    info: "Risponde entro 4h via email",
  },
  {
    name: "Sara Colombo",
    initials: "SC",
    gradient: "linear-gradient(135deg, #0fa68c 0%, #0d8a75 100%)",
    role: "Head of Customer Success",
    quote: "Risponde al telefono entro 2 squilli. Conosce ogni cliente per nome.",
    info: "Disponibile lun–ven 9–18",
  },
  {
    name: "Luca Ferretti",
    initials: "LF",
    gradient: "linear-gradient(135deg, #2a5298 0%, #1a3a6b 100%)",
    role: "Lead Developer",
    quote: "10 anni di esperienza in gestionali PMI. Costruisce per la semplicità, non per i premi.",
    info: "Risponde ai bug in meno di 24h",
  },
  {
    name: "Anna Ricci",
    initials: "AR",
    gradient: "linear-gradient(135deg, #6b5ea8 0%, #4a3f78 100%)",
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
    title: "Chi Siamo — Il Team di Edilizia in Cloud",
    description: "Scopri la storia di Edilizia in Cloud: nati dall'esperienza diretta nel settore edile per risolvere i problemi reali degli imprenditori. 18 mesi di sviluppo, €12M+ gestiti.",
    canonical: "/chi-siamo",
    keywords: "chi siamo edilizia in cloud, team software edilizia, storia edilizia in cloud, domus group srl",
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
    <div className="min-h-screen bg-white text-[#1a2744] overflow-x-hidden">
      <PromoBanner />
      <LandingNavbar />

      {/* ── 1. HERO ── */}
      <section
        className="relative pt-36 pb-28 px-6 text-center flex items-center justify-center min-h-[560px]"
        style={{ background: "#0f1d35" }}
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
          style={{ background: "rgba(26,39,68,0.88)" }}
        />

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
            style={{ background: "rgba(15,166,140,0.2)", color: "#0fa68c", border: "1px solid rgba(15,166,140,0.35)" }}
          >
            LA NOSTRA STORIA
          </div>

          {/* Title */}
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white leading-tight mb-6">
            Costruito da chi{" "}
            <span style={{ color: "#0fa68c" }}>ha perso soldi</span>
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
                  style={{ background: "#0fa68c" }}
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
        className="py-16 px-6"
        style={{ background: "#0f1d35" }}
      >
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-4">
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
                style={{ color: "#0fa68c" }}
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
              style={{ background: "linear-gradient(160deg, #1a2744 0%, #0f1d35 100%)" }}
            >
              <div
                className="w-28 h-28 rounded-full flex items-center justify-center text-white font-extrabold text-4xl mx-auto mb-5 shadow-inner"
                style={{ background: "rgba(15,166,140,0.25)", border: "3px solid rgba(15,166,140,0.5)" }}
              >
                MV
              </div>
              <div className="text-white font-bold text-xl mb-1">Marco Verdi</div>
              <div className="text-white/60 text-sm mb-1">CEO & Fondatore</div>
              <div
                className="text-sm font-semibold mt-2"
                style={{ color: "#0fa68c" }}
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
                    background: "rgba(15,166,140,0.1)",
                    color: "#0fa68c",
                    border: "1px solid rgba(15,166,140,0.25)",
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
              style={{ background: "rgba(15,166,140,0.1)", color: "#0fa68c" }}
            >
              La storia del fondatore
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-[#1a2744] mb-7 leading-snug">
              Da imprenditore edile a costruttore di software.
            </h2>

            <div className="space-y-5 text-[#1a2744]/65 leading-relaxed text-base mb-8">
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
                background: "rgba(15,166,140,0.06)",
                borderLeft: "4px solid #0fa68c",
              }}
            >
              <span
                className="absolute -top-4 left-4 text-6xl font-serif leading-none select-none"
                style={{ color: "#0fa68c", opacity: 0.4 }}
              >
                "
              </span>
              <p className="italic text-[#1a2744]/80 leading-relaxed text-base">
                Non ho creato Edilizia in Cloud per fare soldi con il software. L'ho creato perché ero stanco di
                non sapere se stavo guadagnando o perdendo. E so che ci sono migliaia di imprenditori come me.
              </p>
              <footer className="mt-3 text-sm font-semibold" style={{ color: "#0fa68c" }}>
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
              style={{ background: "rgba(15,166,140,0.1)", color: "#0fa68c" }}
            >
              La nostra storia
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-[#1a2744]">
              Come siamo arrivati qui
            </h2>
          </div>

          {/* Timeline */}
          <div className="relative">
            {/* Central line — hidden on mobile */}
            <div
              className="hidden md:block absolute left-1/2 top-0 bottom-0 w-0.5 -translate-x-0.5"
              style={{ background: "linear-gradient(to bottom, #0fa68c, rgba(15,166,140,0.1))" }}
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
                        style={{ background: "#0fa68c", boxShadow: "0 0 0 4px rgba(15,166,140,0.15)" }}
                      />
                      <div
                        className="absolute left-1.5 top-4 bottom-0 w-0.5"
                        style={{ background: "rgba(15,166,140,0.2)" }}
                      />
                      <div className="pb-8">
                        <span
                          className="inline-block px-3 py-0.5 rounded-full text-xs font-bold mb-2"
                          style={{ background: "#0fa68c", color: "white" }}
                        >
                          {item.year}
                        </span>
                        <h3 className="font-bold text-[#1a2744] text-sm mb-1">{item.title}</h3>
                        <p className="text-[#1a2744]/55 text-xs leading-relaxed">{item.desc}</p>
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
                              style={{ background: "#0fa68c", color: "white" }}
                            >
                              {item.year}
                            </span>
                            <h3 className="font-bold text-[#1a2744] text-sm mb-1">{item.title}</h3>
                            <p className="text-[#1a2744]/55 text-xs leading-relaxed">{item.desc}</p>
                          </div>
                        )}
                      </div>

                      {/* Center dot */}
                      <div
                        className="absolute left-1/2 w-4 h-4 rounded-full -translate-x-1/2 z-10 flex-shrink-0"
                        style={{
                          background: "#0fa68c",
                          boxShadow: "0 0 0 5px rgba(15,166,140,0.18)",
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
                              style={{ background: "#0fa68c", color: "white" }}
                            >
                              {item.year}
                            </span>
                            <h3 className="font-bold text-[#1a2744] text-sm mb-1">{item.title}</h3>
                            <p className="text-[#1a2744]/55 text-xs leading-relaxed">{item.desc}</p>
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
              style={{ background: "rgba(15,166,140,0.1)", color: "#0fa68c" }}
            >
              I nostri valori
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-[#1a2744]">
              Quello in cui crediamo davvero
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {valori.map((v, i) => (
              <div
                key={i}
                className="bg-white rounded-2xl p-8 shadow-md transition-all duration-700 hover:shadow-xl hover:-translate-y-1"
                style={{
                  borderTop: "3px solid #0fa68c",
                  opacity: valoriAnim.isVisible ? 1 : 0,
                  transform: valoriAnim.isVisible ? "translateY(0)" : "translateY(28px)",
                  transitionDelay: `${i * 120}ms`,
                }}
              >
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6"
                  style={{ background: "rgba(15,166,140,0.1)" }}
                >
                  {v.icon}
                </div>
                <h3 className="text-lg font-bold text-[#1a2744] mb-3">{v.title}</h3>
                <p className="text-[#1a2744]/60 text-sm leading-relaxed">{v.desc}</p>
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
              style={{ background: "rgba(15,166,140,0.1)", color: "#0fa68c" }}
            >
              Il team
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-[#1a2744]">
              Le persone che ti rispondono quando chiami
            </h2>
            <p className="text-[#1a2744]/50 text-sm mt-3 max-w-md mx-auto">
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
                <h3 className="font-bold text-[#1a2744] text-sm mb-0.5">{member.name}</h3>
                <p
                  className="text-xs font-semibold mb-3 uppercase tracking-wide"
                  style={{ color: "#0fa68c" }}
                >
                  {member.role}
                </p>
                <p className="text-[#1a2744]/55 text-xs leading-relaxed italic mb-3">
                  "{member.quote}"
                </p>
                <div
                  className="inline-block px-2.5 py-1 rounded-full text-[10px] font-semibold"
                  style={{ background: "rgba(15,166,140,0.08)", color: "#0fa68c" }}
                >
                  {member.info}
                </div>
              </div>
            ))}

            {/* Open position card */}
            <div
              className="rounded-2xl p-6 text-center flex flex-col items-center justify-center min-h-[260px] transition-all duration-300 hover:shadow-lg"
              style={{
                border: "2px dashed rgba(15,166,140,0.35)",
                background: "rgba(15,166,140,0.03)",
                opacity: teamAnim.isVisible ? 1 : 0,
                transform: teamAnim.isVisible ? "translateY(0)" : "translateY(28px)",
                transitionDelay: `${teamMembers.length * 100}ms`,
                transition: "opacity 0.6s ease, transform 0.6s ease, box-shadow 0.3s ease",
              }}
            >
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center mb-4"
                style={{ background: "rgba(15,166,140,0.1)" }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="#0fa68c" strokeWidth="1.5" className="w-6 h-6">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 8v8M8 12h8" strokeLinecap="round" />
                </svg>
              </div>
              <h3 className="font-bold text-[#1a2744] text-sm mb-2">Posizione aperta</h3>
              <p className="text-[#1a2744]/55 text-xs leading-relaxed mb-4">
                Stiamo cercando persone che amano l'edilizia e la tecnologia.
              </p>
              <a
                href="#"
                className="text-xs font-bold transition-colors"
                style={{ color: "#0fa68c" }}
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
              style={{ background: "rgba(15,166,140,0.1)", color: "#0fa68c" }}
            >
              Press & Riconoscimenti
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-[#1a2744]">
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
                <div className="font-extrabold text-[#1a2744] text-sm mb-4 tracking-tight">
                  {p.source}
                </div>
                <blockquote>
                  <span
                    className="text-4xl font-serif leading-none"
                    style={{ color: "#0fa68c", opacity: 0.5 }}
                  >
                    "
                  </span>
                  <p className="italic text-[#1a2744]/60 text-sm leading-relaxed -mt-2">
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
        className="py-24 px-6 text-center"
        style={{ background: "#0a0f1e" }}
      >
        <div
          ref={ctaAnim.ref}
          className="max-w-2xl mx-auto transition-all duration-1000"
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
                background: "#0fa68c",
                boxShadow: "0 8px 30px rgba(15,166,140,0.35)",
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

      <LandingFooter />
    </div>
  );
}
