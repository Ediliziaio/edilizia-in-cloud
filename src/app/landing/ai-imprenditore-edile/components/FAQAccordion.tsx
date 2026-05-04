import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { trackEvent } from "@/lib/track";
import { faq } from "../content";
import { FadeUp } from "./FadeUp";

export function FAQAccordion() {
  return (
    <section className="relative overflow-hidden bg-eic-cream px-5 py-24 md:px-8 lg:py-32">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.4]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(30,58,95,.055) 1px, transparent 1px), linear-gradient(90deg, rgba(30,58,95,.055) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />
      <div className="relative mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.36fr_0.64fr]">
        <FadeUp>
          <p className="text-sm font-black uppercase tracking-[0.22em] text-eic-orange">Domande frequenti</p>
          <h2 className="mt-4 text-display-lg font-black text-eic-ink">{faq.title}</h2>
          <p className="mt-5 text-base leading-7 text-eic-ink/62">
            Risposte dirette per capire se il sistema è adatto alla tua impresa, senza frasi vaghe.
          </p>
        </FadeUp>
        <FadeUp className="rounded-md border border-eic-navy/10 bg-white px-5 shadow-2xl shadow-eic-navy/6 md:px-8">
          <Accordion
            type="single"
            collapsible
            onValueChange={(value) => {
              if (!value) return;
              trackEvent("landing_ai_faq_open", { value });
            }}
          >
            {faq.items.map((item, index) => (
              <AccordionItem key={item.q} value={`${index + 1}`}>
                <AccordionTrigger className="py-6 text-left text-xl font-black tracking-[-0.02em] hover:no-underline">
                  “{item.q}”
                </AccordionTrigger>
                <AccordionContent className="pb-6 text-base leading-7 text-eic-ink/70">{item.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </FadeUp>
      </div>
    </section>
  );
}
