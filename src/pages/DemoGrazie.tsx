import { Link } from "react-router-dom";
import { useSEO } from "@/hooks/useSEO";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import { CalendarioInPagina } from "@/components/marketing/CalendarioInPagina";

/**
 * /demo/grazie — dove si arriva dopo aver chiesto la demo.
 *
 * Ha un indirizzo suo, non è uno stato del modulo: così la conversione si
 * misura (una pagina vista = una richiesta), il link si può rimandare a chi ha
 * già lasciato i dati, e il tasto «indietro» non riporta dentro il form.
 * Il pezzo che conta è il calendario: chi ha appena scritto i suoi dati è nel
 * momento in cui è più disposto a fissare la data, e aspettare la telefonata
 * costa appuntamenti.
 */
export default function DemoGrazie() {
  useSEO({
    title: "Richiesta ricevuta — Fissa la tua demo",
    description:
      "Abbiamo ricevuto la tua richiesta. Scegli qui giorno e ora della demo: trenta minuti sul tuo modo di lavorare.",
    canonical: "/demo/grazie",
    noindex: true,
  });

  return (
    <div className="min-h-screen bg-white">
      <LandingNavbar />

      <main>
        <section className="px-5 pb-10 pt-28 sm:px-6 sm:pt-32" style={{ background: "#111111" }}>
          <div className="mx-auto max-w-3xl text-center">
            <div
              className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full"
              style={{ background: "rgba(249,116,21,0.16)" }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="#F97415" strokeWidth="2.5" className="h-7 w-7">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h1 className="text-[28px] font-extrabold leading-[1.15] text-white sm:text-4xl">
              Richiesta ricevuta. Ora scegli quando.
            </h1>
            <p className="mt-4 text-base leading-relaxed text-white/70 sm:text-lg">
              Trenta minuti sul tuo modo di lavorare: cantieri, preventivi, margini.
              Scegli il giorno e l&apos;ora che ti comodano — la demo è confermata subito.
            </p>
          </div>
        </section>

        <section className="px-5 py-10 sm:px-6 sm:py-14" style={{ background: "#f7f9fc" }}>
          <div className="mx-auto max-w-3xl">
            <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-xl sm:p-6">
              <CalendarioInPagina slug="demo-edilizia-in-cloud" />
            </div>

            <div className="mt-8 text-center">
              <p className="text-sm text-[#111111]/60">
                Preferisci essere richiamato? Ti chiamiamo noi entro 24 ore lavorative,
                senza che tu faccia niente.
              </p>
              <div className="mt-5 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
                <Link
                  to="/"
                  className="inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-bold text-white transition-all hover:opacity-90"
                  style={{ background: "#F97415" }}
                >
                  Torna alla home
                </Link>
                <Link
                  to="/funzionalita"
                  className="inline-flex items-center justify-center rounded-full border-2 border-[#F97415]/30 px-6 py-3 text-sm font-bold text-[#F97415] transition-all hover:bg-[#F97415]/5"
                >
                  Intanto guarda cosa fa
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
