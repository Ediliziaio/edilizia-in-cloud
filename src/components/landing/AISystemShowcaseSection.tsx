import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import SilvioCervello from "@/components/landing/SilvioCervello";
import { AiProduceLavoro, SegnaliCantiere } from "@/components/landing/SilvioAlLavoro";
import { agentGroups } from "@/components/landing/silvioReparti";
import {
  ArrowRight,
  BriefcaseBusiness,
  Camera,
  ClipboardList,
  Euro,
  FileText,
  LineChart,
  MessageSquare,
  PackageCheck,
  Sparkles,
  Users,
} from "lucide-react";


const painFlows = [
  {
    problem: "Non so se sto guadagnando",
    answer: "Silvio controlla margini, costi, ore e materiali, poi prepara azioni concrete: avvisi, report e prossime mosse.",
    icon: LineChart,
  },
  {
    problem: "I preventivi si raffreddano",
    answer: "Invia solleciti, prepara follow-up WhatsApp, ricorda al venditore chi richiamare e quando intervenire.",
    icon: MessageSquare,
  },
  {
    problem: "Magazzino e materiali sono confusi",
    answer: "Collega ordini, DDT, arrivi merce e uscita cantiere, così sa cosa manca prima che il lavoro si blocchi.",
    icon: PackageCheck,
  },
  {
    problem: "Il campo non aggiorna l'ufficio",
    answer: "Genera rapportini, aggiorna il diario lavori, raccoglie foto e ricorda a operai e collaboratori cosa fare.",
    icon: Camera,
  },
];

const aiProductionTools = [
  {
    title: "Analisi computo metrico",
    text: "Carichi il computo, Silvio legge voci, quantità, lavorazioni e segnala incoerenze prima del preventivo.",
    icon: ClipboardList,
    tag: "Computo",
  },
  {
    title: "Generatore preventivi",
    text: "Trasforma computi, listini e richieste cliente in preventivi chiari, completi e pronti da inviare.",
    icon: FileText,
    tag: "Preventivo",
  },
  {
    title: "Preventivi ad alta conversione",
    text: "Riscrive proposta, valore, garanzie, urgenza e follow-up per aiutare il cliente a decidere senza trattare solo sul prezzo.",
    icon: BriefcaseBusiness,
    tag: "Vendita",
  },
  {
    title: "Rapportini automatici",
    text: "Da foto, note vocali e attività di cantiere crea rapportini ordinati e aggiornamenti per ufficio e cliente.",
    icon: Camera,
    tag: "Cantiere",
  },
  {
    title: "Render e prima/dopo",
    text: "Genera visual dimostrativi per far vedere il risultato finale e allegarli alla trattativa o al preventivo.",
    icon: Sparkles,
    tag: "Render",
  },
  {
    title: "Azioni e solleciti",
    text: "Prepara messaggi, solleciti, promemoria e compiti per collaboratori, venditori, ufficio e squadre.",
    icon: MessageSquare,
    tag: "Operativo",
  },
];


function openContactModal() {
  import("@/components/landing/QuickContactModal").then((module) => module.openContactModal());
}

function useGsapSection() {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    async function run() {
      if (!ref.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const [{ default: gsap }, { ScrollTrigger }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);

      gsap.registerPlugin(ScrollTrigger);

      const ctx = gsap.context(() => {
        gsap.from("[data-ai-reveal]", {
          opacity: 0,
          y: 28,
          duration: 0.75,
          ease: "power3.out",
          stagger: 0.08,
          scrollTrigger: {
            trigger: ref.current,
            start: "top 72%",
          },
        });

        // Skip se nessun target nel DOM (altrimenti GSAP logga warning a
        // ogni mount). data-ai-float è opzionale nel template — se non
        // c'è, salta semplicemente l'animazione.
        if (document.querySelectorAll("[data-ai-float]").length > 0) {
          gsap.to("[data-ai-float]", {
            y: -10,
            duration: 2.4,
            repeat: -1,
            yoyo: true,
            ease: "sine.inOut",
            stagger: 0.18,
          });
        }

        gsap.fromTo(
          "[data-ai-scan]",
          { yPercent: -120, opacity: 0 },
          {
            yPercent: 130,
            opacity: 1,
            duration: 2.2,
            repeat: -1,
            ease: "power1.inOut",
            stagger: 0.4,
          }
        );
      }, ref);

      cleanup = () => ctx.revert();
    }

    run();
    return () => cleanup?.();
  }, []);

  return ref;
}

export default function AISystemShowcaseSection() {
  const sectionRef = useGsapSection();

  return (
    <section ref={sectionRef} className="relative overflow-hidden bg-[#f8fafc] py-14 pb-28 md:py-28">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-eic-orange to-transparent" />
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div data-ai-reveal className="mx-auto max-w-3xl text-center">
          <div className="inline-flex max-w-full items-center justify-center gap-2 rounded-full bg-orange-100 px-3 py-1 text-center text-[10px] font-black uppercase tracking-[0.14em] text-eic-orange-dark sm:text-xs sm:tracking-[0.18em]">
            <Sparkles className="h-3.5 w-3.5" />
            Il sistema operativo AI dell'impresa edile
          </div>
          <h2 className="mt-4 text-[1.9rem] font-black leading-[1.08] tracking-normal md:tracking-tight text-[#111111] sm:text-4xl md:text-5xl">
            Non solo moduli. Una regia centrale che legge l'azienda e fa partire il lavoro.
          </h2>
          <p className="mt-5 hidden text-lg leading-8 text-gray-600 lg:block">
            Silvio coordina 19 persone AI specialistiche: crea bozze di fatture, manda solleciti,
            genera rapportini, ricorda ai collaboratori cosa fare e segnala dove intervenire.
          </p>
        </div>

        <div className="mt-6 lg:hidden">
          <SilvioCervello groups={agentGroups} />
        </div>

        <p className="mx-auto mt-5 max-w-3xl text-center text-sm leading-7 text-gray-600 sm:text-base lg:hidden">
          Silvio coordina 19 persone AI specialistiche: crea bozze di fatture, manda solleciti,
          genera rapportini, ricorda ai collaboratori cosa fare e segnala dove intervenire.
        </p>

        <div className="mt-8 grid gap-5 md:mt-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="hidden lg:block">
            <SilvioCervello groups={agentGroups} />
          </div>

          <div className="space-y-3 md:space-y-4" data-ai-reveal>
            {[
              { icon: Euro, title: "Margini e cassa", text: "Controlla incassi, prepara solleciti, segnala commesse sotto target e ti mostra quali costi stanno mangiando margine." },
              { icon: ClipboardList, title: "Cantieri e campo", text: "Genera rapportini, aggiorna il diario lavori, legge foto e note dal campo e ricorda alle squadre le attività aperte." },
              { icon: FileText, title: "Documenti e DDT", text: "Prepara bozze di fatture, collega DDT, ordini e documenti alla commessa giusta, senza inseguire cartelle e chat." },
              { icon: Users, title: "Clienti e vendite", text: "Avvisa chi richiamare, prepara follow-up WhatsApp, spinge preventivi caldi e tiene viva la pipeline commerciale." },
            ].map((item) => (
              <div key={item.title} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg md:p-5">
                <div className="flex gap-3 md:gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-eic-orange-dark md:h-11 md:w-11">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-[#111111] md:text-lg">{item.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-gray-600 md:leading-7">{item.text}</p>
                  </div>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={openContactModal}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-eic-orange px-5 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-orange-900/20 transition hover:bg-eic-orange-dark sm:w-auto md:px-6 md:py-4 md:text-base"
            >
              Fai lavorare Silvio sulla tua impresa
              <ArrowRight className="h-5 w-5" />
            </button>
          </div>
        </div>

        <SegnaliCantiere />

        <div data-ai-reveal className="mt-12 overflow-hidden rounded-[26px] border border-gray-200 bg-white p-4 shadow-xl md:mt-16 md:rounded-[32px] md:p-8">
          <div className="grid gap-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-eic-orange-dark md:text-sm md:tracking-[0.2em]">AI che produce lavoro</p>
              <h2 className="mt-3 text-[2rem] font-black leading-[1.05] tracking-normal md:tracking-tight text-[#111111] md:text-4xl">
                Dal computo metrico al preventivo, dal cantiere al rapportino.
              </h2>
              <p className="mt-4 text-sm leading-7 text-gray-600 md:text-base md:leading-8">
                Silvio non si limita a mostrare dati: legge documenti, genera bozze operative,
                prepara preventivi più forti, produce rapportini e crea render quando servono alla vendita.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Link
                  to="/funzionalita/preventivi-edilizia/"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-[#111111] px-5 py-3 text-sm font-extrabold text-white transition hover:bg-[#222]"
                >
                  Vedi preventivi AI
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/funzionalita/"
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-gray-200 px-5 py-3 text-sm font-extrabold text-[#111111] transition hover:border-eic-orange hover:text-eic-orange-dark"
                >
                  Tutti i moduli AI
                </Link>
              </div>
            </div>

            <AiProduceLavoro tools={aiProductionTools} />
          </div>
        </div>

        <div data-ai-reveal className="mt-12 md:mt-16">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-eic-orange-dark md:text-sm md:tracking-[0.2em]">Per problemi reali, non per menu software</p>
            <h2 className="mt-3 text-[2rem] font-black leading-[1.05] tracking-normal md:tracking-tight text-[#111111] md:text-4xl">
              L'imprenditore non cerca moduli. Cerca risposte.
            </h2>
          </div>
          <div className="mt-8 grid gap-3 md:mt-10 md:grid-cols-2 md:gap-5 lg:grid-cols-4">
            {painFlows.map((flow) => (
              <div key={flow.problem} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:-translate-y-1 hover:shadow-xl md:p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-eic-orange/10 text-eic-orange-dark md:h-12 md:w-12">
                  <flow.icon className="h-5 w-5 md:h-6 md:w-6" />
                </div>
                <h3 className="mt-4 text-base font-black text-[#111111] md:mt-5 md:text-lg">{flow.problem}</h3>
                <p className="mt-2 text-sm leading-6 text-gray-600 md:mt-3 md:leading-7">{flow.answer}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 text-center">
            <button
              type="button"
              onClick={openContactModal}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-eic-orange px-7 py-4 text-base font-extrabold text-white shadow-lg shadow-orange-900/20 transition hover:bg-eic-orange-dark"
            >
              Scopri dove perdi margine
              <ArrowRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
