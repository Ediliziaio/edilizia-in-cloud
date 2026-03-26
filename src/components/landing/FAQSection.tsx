import { useState } from "react";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { ChevronDown } from "lucide-react";

interface FAQItem {
  question: string;
  answer: string;
}

const faqs: FAQItem[] = [
  {
    question: "Devo essere esperto di informatica per usarlo?",
    answer:
      "No. Il sistema è progettato per imprenditori edili, non per informatici. L'interfaccia è talmente intuitiva che la maggior parte degli utenti la usa autonomamente dopo 2 ore. Il nostro team ti configura tutto in 48 ore e resta disponibile via telefono, email e WhatsApp.",
  },
  {
    question: "Quanto tempo ci vuole per vedere i primi risultati concreti?",
    answer:
      "Le prime inefficienze le identifichi nelle prime 2 settimane — commesse in perdita, ore non imputate, fornitori cari. Risultati concreti sui margini in 60-90 giorni. Molte imprese recuperano l'intero costo annuale del software già nel primo trimestre.",
  },
  {
    question: "Posso importare i dati che ho su Excel o altri gestionali?",
    answer:
      "Sì. Il nostro team di onboarding migra i tuoi dati esistenti gratuitamente: Excel, CSV, altri gestionali o anche fogli cartacei. Non perdi nulla e non riparti da zero. Di solito bastano 48 ore per essere operativi.",
  },
  {
    question: "Funziona anche in cantiere, da smartphone o tablet?",
    answer:
      "Sì, completamente. App mobile nativa per iOS e Android, con modalità offline per le zone senza segnale. I capocantiere e gli operai aggiornano avanzamento lavori, timbrature e giornale direttamente dal telefono.",
  },
  {
    question: "Cosa include esattamente la demo gratuita?",
    answer:
      "Una sessione di 30-45 minuti con un nostro consulente specializzato in imprese edili. Ti mostriamo il software sul tuo caso specifico — non una demo generica — e rispondiamo a tutte le domande. Nessun obbligo d'acquisto.",
  },
  {
    question: "I miei dati sono al sicuro? Chi li vede?",
    answer:
      "I dati sono conservati su server europei, conformi al GDPR, con backup automatici giornalieri e cifratura end-to-end. Solo tu e il tuo team potete accedere ai tuoi dati. Noi non li vendiamo, non li analizziamo e non li cediamo a terzi — mai.",
  },
  {
    question: "Posso disdire quando voglio? Ci sono penali?",
    answer:
      "Puoi disdire in qualsiasi momento, senza penali e senza preavviso. E ricorda: se il software non ti fa guadagnare più di quanto spendi, è gratis per sempre — questa è la nostra garanzia scritta.",
  },
];

const MAX_OPEN = 2;

export default function FAQSection() {
  const { ref, isVisible } = useScrollAnimation({ threshold: 0.1 });
  const [openItems, setOpenItems] = useState<number[]>([0]);

  const toggle = (index: number) => {
    setOpenItems((prev) => {
      if (prev.includes(index)) {
        return prev.filter((i) => i !== index);
      }
      if (prev.length >= MAX_OPEN) {
        return [...prev.slice(1), index];
      }
      return [...prev, index];
    });
  };

  return (
    <section className="py-24 md:py-32" style={{ backgroundColor: "#f8fafb" }}>
      <div ref={ref} className="max-w-3xl mx-auto px-6">
        {/* Header */}
        <div
          className="text-center mb-12 md:mb-14 transition-all duration-700"
          style={{
            opacity: isVisible ? 1 : 0,
            transform: isVisible ? "translateY(0)" : "translateY(20px)",
          }}
        >
          <p
            className="inline-block mb-4 px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-widest"
            style={{
              color: "#F97415",
              backgroundColor: "rgba(249, 116, 21, 0.08)",
              border: "1px solid rgba(249, 116, 21, 0.2)",
            }}
          >
            Domande Frequenti
          </p>
          <h2 className="text-3xl md:text-5xl font-extrabold text-[#111111] mb-4">
            Le domande più comuni. <span style={{ color: "#F97415" }}>Risposte dirette.</span>
          </h2>
          <p className="text-gray-500 text-sm md:text-base">
            Non hai trovato quello che cercavi?{" "}
            <a
              href="mailto:info@ediliziaincloud.com"
              className="font-semibold underline underline-offset-2 hover:opacity-80 transition-opacity"
              style={{ color: "#F97415" }}
            >
              Scrivici — rispondiamo entro 24 ore
            </a>
          </p>
        </div>

        {/* FAQ Accordion */}
        <div className="space-y-3">
          {faqs.map((faq, i) => {
            const isOpen = openItems.includes(i);
            return (
              <div
                key={i}
                className="transition-all duration-700 rounded-2xl overflow-hidden"
                style={{
                  transitionDelay: isVisible ? `${150 + i * 80}ms` : "0ms",
                  opacity: isVisible ? 1 : 0,
                  transform: isVisible ? "translateY(0)" : "translateY(16px)",
                  backgroundColor: "white",
                  border: isOpen
                    ? "1px solid rgba(249, 116, 21, 0.25)"
                    : "1px solid rgba(26, 39, 68, 0.07)",
                  boxShadow: isOpen
                    ? "0 4px 20px rgba(249, 116, 21, 0.08)"
                    : "0 2px 8px rgba(26, 39, 68, 0.04)",
                }}
              >
                {/* Left accent bar */}
                <div className="flex">
                  <div
                    className="w-1 flex-shrink-0 rounded-l-2xl transition-all duration-300"
                    style={{
                      backgroundColor: isOpen ? "#F97415" : "transparent",
                    }}
                  />

                  <div className="flex-1">
                    {/* Question button */}
                    <button
                      onClick={() => toggle(i)}
                      className="w-full flex items-center justify-between gap-4 p-5 md:p-6 text-left focus:outline-none group"
                      aria-expanded={isOpen}
                    >
                      <span
                        className="font-semibold text-sm md:text-base transition-colors duration-200"
                        style={{ color: isOpen ? "#F97415" : "#111111" }}
                      >
                        {faq.question}
                      </span>
                      <ChevronDown
                        size={20}
                        className="flex-shrink-0 transition-transform duration-300"
                        style={{
                          color: isOpen ? "#F97415" : "#111111",
                          opacity: isOpen ? 1 : 0.4,
                          transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                        }}
                      />
                    </button>

                    {/* Answer */}
                    <div
                      className="overflow-hidden transition-all duration-300 ease-in-out"
                      style={{
                        maxHeight: isOpen ? "300px" : "0px",
                        opacity: isOpen ? 1 : 0,
                      }}
                    >
                      <p className="px-5 md:px-6 pb-5 md:pb-6 text-gray-500 text-sm md:text-base leading-relaxed">
                        {faq.answer}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom nudge */}
        <div
          className="text-center mt-12 transition-all duration-700"
          style={{
            transitionDelay: isVisible ? "800ms" : "0ms",
            opacity: isVisible ? 1 : 0,
            transform: isVisible ? "translateY(0)" : "translateY(16px)",
          }}
        >
          <p className="text-gray-400 text-sm mb-4">Preferisci parlare con una persona?</p>
          <a
            href="#cta-finale"
            onClick={(e) => {
              e.preventDefault();
              document.querySelector("#cta-finale")?.scrollIntoView({ behavior: "smooth" });
            }}
            className="inline-flex items-center gap-2 px-7 py-3 rounded-full font-semibold text-sm text-white transition-all duration-200 hover:scale-105"
            style={{
              backgroundColor: "#111111",
              boxShadow: "0 4px 16px rgba(26, 39, 68, 0.2)",
            }}
          >
            Prenota una call gratuita — 30 minuti
          </a>
        </div>
      </div>
    </section>
  );
}
