import { useEffect } from "react";
import { Link } from "react-router-dom";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";

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
        SE NON TI FA GUADAGNARE, IL PROGRAMMA E GRATIS PER SEMPRE
      </span>
    </div>
  );
}

const teamMembers = [
  {
    name: "Marco Verdi",
    role: "CEO & Fondatore",
    bio: "15 anni nel settore edile come imprenditore prima di fondare Edilizia in Cloud. Ha gestito direttamente cantieri fino a 5M di fatturato.",
  },
  {
    name: "Sara Colombo",
    role: "Head of Customer Success",
    bio: "Si assicura che ogni cliente ottenga risultati concreti nelle prime 4 settimane di utilizzo. Conosce il software meglio di chiunque altro.",
  },
  {
    name: "Luca Ferretti",
    role: "Lead Developer",
    bio: "Responsabile dell'architettura tecnica. Ha costruito sistemi gestionali per PMI per oltre 10 anni prima di portare la sua esperienza nell'edilizia.",
  },
  {
    name: "Anna Ricci",
    role: "Consulente del Controllo",
    bio: "Consulente di gestione con specializzazione nel controllo di gestione per imprese edili. Traduce i numeri del cantiere in decisioni strategiche.",
  },
];

const values = [
  {
    title: "Trasparenza",
    desc: "I numeri non mentono. Noi nemmeno. Prezzi chiari, nessun costo nascosto, nessuna sorpresa a fine mese.",
  },
  {
    title: "Semplicita",
    desc: "La potenza di un ERP, la semplicita di un'app. Se ci vogliono piu di 5 minuti per imparare una funzione, la riprogettamo.",
  },
  {
    title: "Risultati",
    desc: "Se non ti fa guadagnare, e gratis. Sempre. Non e uno slogan: e scritto nel contratto.",
  },
];

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const colors = ["#0fa68c", "#1a2744", "#2a7fba", "#6b5ea8"];
  const colorIndex =
    name.charCodeAt(0) % colors.length;

  return (
    <div
      className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-xl mx-auto mb-4 flex-shrink-0"
      style={{ background: colors[colorIndex] }}
    >
      {initials}
    </div>
  );
}

export default function ChiSiamo() {
  useEffect(() => {
    document.title = "Chi Siamo — Edilizia in Cloud";
  }, []);

  return (
    <div className="min-h-screen bg-white text-[#1a2744] overflow-x-hidden">
      <PromoBanner />
      <LandingNavbar />

      {/* Hero */}
      <section
        style={{ background: "linear-gradient(135deg, #1a2744 0%, #0f1d35 100%)" }}
        className="pt-36 pb-20 px-6 text-center"
      >
        <div className="max-w-3xl mx-auto">
          <div
            className="inline-block px-4 py-1.5 rounded-full text-xs font-bold tracking-widest uppercase mb-6"
            style={{ background: "rgba(15,166,140,0.18)", color: "#0fa68c" }}
          >
            La nostra storia
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-white leading-tight mb-5">
            Costruito da Chi Conosce il Cantiere
          </h1>
          <p className="text-lg md:text-xl text-white/70 leading-relaxed">
            Non siamo una software house. Siamo imprenditori che hanno vissuto gli stessi problemi
            che vuoi risolvere.
          </p>
        </div>
      </section>

      {/* Founder Story */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-3xl mx-auto">
          <div
            className="inline-block px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase mb-6"
            style={{ background: "rgba(15,166,140,0.1)", color: "#0fa68c" }}
          >
            La storia del fondatore
          </div>
          <h2 className="text-2xl md:text-3xl font-bold text-[#1a2744] mb-8 leading-snug">
            Da imprenditore edile a costruttore di software. Per necessita.
          </h2>
          <div className="space-y-6 text-[#1a2744]/65 leading-relaxed text-base">
            <p>
              Marco Verdi ha trascorso piu di un decennio a gestire cantieri nel nord Italia. Ristrutturazioni
              residenziali, capannoni industriali, lavori pubblici. Fatturava bene, i clienti erano soddisfatti,
              le squadre erano affidabili. Eppure, a fine anno, i numeri non tornavano mai. Commesse che sembravano
              redditizie si rivelavano in perdita. I costi della manodopera erano sempre piu alti del previsto.
              La cassa andava e veniva senza logica apparente.
            </p>
            <p>
              Ha provato ogni strumento sul mercato: ERP costosissimi pensati per le multinazionali, fogli Excel
              sempre piu complicati, software generici che richiedevano mesi di customizzazione. Niente funzionava
              davvero per una PMI edile. Tutto era troppo complicato, troppo costoso, o semplicemente pensato per
              un settore diverso. Nel 2021, assunto un programmatore, ha iniziato a costruire il tool che avrebbe
              voluto avere sin dall'inizio: semplice, focalizzato, costruito attorno ai numeri reali del cantiere.
            </p>
            <p>
              Dopo 18 mesi di test interni su impresa propria, i risultati erano evidenti: margini aumentati del
              12%, zero sorprese di cassa, meno ore perse in amministrazione. Colleghi imprenditori hanno iniziato
              a chiedergli di usarlo. E cosi Edilizia in Cloud ha smesso di essere un tool interno e e diventato
              quello che e oggi: il software gestionale pensato da chi il cantiere lo ha vissuto dall'interno.
            </p>
          </div>
        </div>
      </section>

      {/* Valori */}
      <section className="py-20 px-6" style={{ background: "#f7f9fc" }}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
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
            {values.map((v, i) => (
              <div
                key={i}
                className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm text-center"
              >
                <div
                  className="w-12 h-12 rounded-xl mx-auto mb-5 flex items-center justify-center"
                  style={{ background: "rgba(15,166,140,0.1)" }}
                >
                  {i === 0 ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="#0fa68c" strokeWidth="1.5" className="w-6 h-6">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  ) : i === 1 ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="#0fa68c" strokeWidth="1.5" className="w-6 h-6">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 8v4l3 3" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="#0fa68c" strokeWidth="1.5" className="w-6 h-6">
                      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                      <polyline points="16 7 22 7 22 13" />
                    </svg>
                  )}
                </div>
                <h3 className="text-lg font-bold text-[#1a2744] mb-3">{v.title}</h3>
                <p className="text-[#1a2744]/55 text-sm leading-relaxed">{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <div
              className="inline-block px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase mb-4"
              style={{ background: "rgba(15,166,140,0.1)", color: "#0fa68c" }}
            >
              Il team
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-[#1a2744]">
              Le persone dietro il software
            </h2>
            <p className="text-[#1a2744]/50 text-sm mt-3 max-w-md mx-auto">
              Un team piccolo e focalizzato. Ogni persona conosce il settore edile e si prende cura
              dei clienti come se fossero partner.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {teamMembers.map((member) => (
              <div
                key={member.name}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center hover:shadow-md transition-shadow"
              >
                <Avatar name={member.name} />
                <h3 className="font-bold text-[#1a2744] mb-0.5">{member.name}</h3>
                <p
                  className="text-xs font-semibold mb-3 uppercase tracking-wide"
                  style={{ color: "#0fa68c" }}
                >
                  {member.role}
                </p>
                <p className="text-[#1a2744]/55 text-xs leading-relaxed">{member.bio}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Finale */}
      <section
        style={{ background: "linear-gradient(135deg, #1a2744 0%, #0f1d35 100%)" }}
        className="py-20 px-6 text-center"
      >
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
            Vuoi conoscerci meglio?
          </h2>
          <p className="text-white/60 mb-8 text-sm leading-relaxed">
            Una chiamata di 30 minuti e tutto quello che serve. Ti mostriamo il software, rispondiamo
            alle tue domande, e decidi senza fretta.
          </p>
          <Link
            to="/demo"
            className="inline-block px-8 py-4 rounded-full text-white font-bold text-base transition-all hover:opacity-90 hover:scale-105 shadow-lg"
            style={{ background: "#0fa68c", boxShadow: "0 8px 30px rgba(15,166,140,0.3)" }}
          >
            Prenota una Demo Gratuita →
          </Link>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
