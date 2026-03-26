import { useState } from "react";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { ChevronDown } from "lucide-react";

interface FAQItem {
  question: string;
  answer: string;
}

const faqs: FAQItem[] = [
  {
    question: "Devo essere esperto di informatica?",
    answer:
      "No. Il sistema e' progettato per imprenditori edili, non per informatici. L'interfaccia e' intuitiva e il nostro team ti configura tutto in 48 ore. Se hai dubbi, c'e' supporto italiano sempre disponibile.",
  },
  {
    question: "Quanto tempo ci vuole per vedere i primi risultati?",
    answer:
      "La maggior parte delle imprese identifica le prime inefficienze gia' nelle prime 2 settimane. Risultati concreti sui margini in 60-90 giorni.",
  },
  {
    question: "Posso importare i dati che ho gia' su Excel?",
    answer:
      "Si'. Il nostro team importa i tuoi dati esistenti gratuitamente durante l'onboarding. Excel, CSV, altri gestionali: gestiamo noi la migrazione.",
  },
  {
    question: "Funziona anche da cantiere con il telefono?",
    answer:
      "Si', e' completamente responsive e funziona offline. I tuoi operai o capocantiere possono aggiornare lo stato lavori direttamente dallo smartphone.",
  },
  {
    question: "Se non mi convince, posso disdire?",
    answer:
      "Puoi disdire in qualsiasi momento, senza penali. E ricorda: se il programma non ti fa guadagnare piu' di quanto spendi, e' gratis per sempre — e' la nostra garanzia.",
  },
  {
    question: "E' sicuro? Dove sono i miei dati?",
    answer:
      "I dati sono conservati su server europei (GDPR compliant), con backup automatici giornalieri e cifratura end-to-end. I tuoi dati sono solo tuoi.",
  },
  {
    question: "Posso integrarlo con il mio commercialista?",
    answer:
      "Si'. Puoi esportare report in PDF/Excel pronti per il commercialista. Integrazione diretta con i principali gestionali contabili in arrivo.",
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
              color: "#0fa68c",
              backgroundColor: "rgba(15, 166, 140, 0.08)",
              border: "1px solid rgba(15, 166, 140, 0.2)",
            }}
          >
            Domande Frequenti
          </p>
          <h2 className="text-3xl md:text-5xl font-extrabold text-[#1a2744] mb-4">
            Hai domande? <span style={{ color: "#0fa68c" }}>Abbiamo le risposte</span>
          </h2>
          <p className="text-gray-500 text-sm md:text-base">
            Hai altre domande?{" "}
            <a
              href="mailto:info@ediliziaincloud.it"
              className="font-semibold underline underline-offset-2 hover:opacity-80 transition-opacity"
              style={{ color: "#0fa68c" }}
            >
              Scrivici su info@ediliziaincloud.it
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
                    ? "1px solid rgba(15, 166, 140, 0.25)"
                    : "1px solid rgba(26, 39, 68, 0.07)",
                  boxShadow: isOpen
                    ? "0 4px 20px rgba(15, 166, 140, 0.08)"
                    : "0 2px 8px rgba(26, 39, 68, 0.04)",
                }}
              >
                {/* Left accent bar */}
                <div className="flex">
                  <div
                    className="w-1 flex-shrink-0 rounded-l-2xl transition-all duration-300"
                    style={{
                      backgroundColor: isOpen ? "#0fa68c" : "transparent",
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
                        style={{ color: isOpen ? "#0fa68c" : "#1a2744" }}
                      >
                        {faq.question}
                      </span>
                      <ChevronDown
                        size={20}
                        className="flex-shrink-0 transition-transform duration-300"
                        style={{
                          color: isOpen ? "#0fa68c" : "#1a2744",
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
          <p className="text-gray-400 text-sm mb-4">Non hai ancora la risposta che cerchi?</p>
          <a
            href="#cta-finale"
            onClick={(e) => {
              e.preventDefault();
              document.querySelector("#cta-finale")?.scrollIntoView({ behavior: "smooth" });
            }}
            className="inline-flex items-center gap-2 px-7 py-3 rounded-full font-semibold text-sm text-white transition-all duration-200 hover:scale-105"
            style={{
              backgroundColor: "#1a2744",
              boxShadow: "0 4px 16px rgba(26, 39, 68, 0.2)",
            }}
          >
            Parla con noi — e' gratis
          </a>
        </div>
      </div>
    </section>
  );
}
