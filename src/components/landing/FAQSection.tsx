import { landingFaqs as faqs } from "@/lib/marketing/landingFaqs";
import { useState } from "react";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { ChevronDown } from "lucide-react";


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
                      className="w-full flex items-center justify-between gap-4 p-5 md:p-6 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40 rounded-lg group"
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
          <button
            type="button"
            onClick={() => { import("@/components/landing/QuickContactModal").then(m => m.openContactModal()); }}
            className="inline-flex items-center gap-2 px-7 py-3 rounded-full font-semibold text-sm text-white transition-all duration-200 hover:scale-105"
            style={{
              backgroundColor: "#111111",
              boxShadow: "0 4px 16px rgba(26, 39, 68, 0.2)",
            }}
          >
            Prenota una call gratuita — 30 minuti
          </button>
        </div>
      </div>
    </section>
  );
}
