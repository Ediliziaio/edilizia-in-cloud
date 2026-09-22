import { useCallback } from "react";
import { Link } from "react-router-dom";
import { Clock, MessageCircle, ShieldCheck, Users } from "lucide-react";
import { useSEO } from "@/hooks/useSEO";
import { trackPixel } from "@/lib/meta/fbcTracker";
import { CalendarioInPagina, type PrenotazioneFatta } from "@/components/marketing/CalendarioInPagina";
import logo from "@/assets/edilizia-in-cloud-logo-small.webp";

/**
 * /calendario-demo — landing minimale con un solo obiettivo: fissare la
 * videochiamata demo. Nessuna navbar/menu (niente vie di fuga), il calendario
 * di prenotazione (slug "demo-edilizia-in-cloud") embeddato direttamente in
 * pagina — stesso componente/pattern di /offerta-2-mesi-gratis — e WhatsApp
 * come canale alternativo per chi preferisce scriversi prima di vedersi in
 * video.
 */

const ARANCIO = "#F97415";

const WHATSAPP_NUMBER = "393501780908";
const WHATSAPP_MESSAGE = "Buongiorno, vorrei fissare una videochiamata di presentazione di Edilizia in Cloud";
const LINK_WHATSAPP = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`;

export default function CalendarioDemo() {
  useSEO({
    title: "Prenota la tua demo | Edilizia in Cloud",
    description:
      "Scegli giorno e ora per una videochiamata di 30 minuti con Edilizia in Cloud, oppure scrivici su WhatsApp. Senza impegno.",
    canonical: "/calendario-demo",
  });

  // Una prenotazione confermata nel calendario è la conversione di questa pagina.
  const prenotato = useCallback((p: PrenotazioneFatta) => {
    trackPixel("Lead", { content_name: "calendario_demo", content_category: "prenotazione_demo" });
    const gtag = (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag;
    gtag?.("event", "prenotazione_demo", { pagina: "calendario-demo", giorno: p.date, ora: p.time });
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-[#f7f9fc] text-[#111111]">
      <header className="px-5 py-6 sm:px-6">
        <Link to="/" aria-label="Edilizia in Cloud — torna alla home">
          <img src={logo} alt="Edilizia in Cloud" width={160} height={40} className="h-9 w-auto" />
        </Link>
      </header>

      <main className="flex-1 px-5 py-10 sm:px-6">
        <div className="mx-auto w-full max-w-2xl text-center">
          <p className="text-sm font-bold uppercase tracking-widest" style={{ color: ARANCIO }}>
            Parliamone
          </p>
          <h1 className="mt-3 text-4xl font-extrabold leading-tight text-balance md:text-5xl">
            Vediamo insieme come Edilizia in Cloud lavora per la tua impresa.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-[#111111]/70">
            Trenta minuti in videochiamata, senza impegno: ti mostriamo cantieri, margini e fatturazione
            dentro un'unica piattaforma, sui dati reali della tua azienda. Scegli giorno e ora qui sotto, o
            scrivici subito su WhatsApp se preferisci sentirci prima.
          </p>
        </div>

        <div className="mx-auto mt-10 w-full max-w-3xl">
          <div className="rounded-3xl border border-gray-100 bg-white p-3 shadow-xl sm:p-5">
            <CalendarioInPagina slug="demo-edilizia-in-cloud" onPrenotato={prenotato} />
          </div>

          <div className="mt-8 flex justify-center">
            <a
              href={LINK_WHATSAPP}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackPixel("Contact", { content_name: "calendario_demo_whatsapp" })}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-[#25D366] px-8 py-4 text-base font-bold text-[#128C4A] transition-colors hover:bg-[#25D366]/10 sm:w-auto"
            >
              <MessageCircle className="h-5 w-5" aria-hidden="true" />
              Preferisci scriverci? Vai su WhatsApp
            </a>
          </div>

          <ul className="mt-10 flex flex-col items-center gap-4 text-sm font-medium text-[#111111]/70 sm:flex-row sm:justify-center sm:gap-8">
            <li className="flex items-center gap-2">
              <Clock className="h-5 w-5" style={{ color: ARANCIO }} aria-hidden="true" />
              30 minuti, in video
            </li>
            <li className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" style={{ color: ARANCIO }} aria-hidden="true" />
              Nessun impegno
            </li>
            <li className="flex items-center gap-2">
              <Users className="h-5 w-5" style={{ color: ARANCIO }} aria-hidden="true" />
              Porta chi vuoi in azienda
            </li>
          </ul>
        </div>
      </main>

      <footer className="px-5 py-8 text-center text-xs text-[#111111]/50 sm:px-6">
        © {new Date().getFullYear()} Edilizia in Cloud
      </footer>
    </div>
  );
}
