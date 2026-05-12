import { ArrowRight, MessageCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/track";
import { cta, demoSilvio } from "../content";
import { FadeUp } from "./FadeUp";

function ChatMockup() {
  return (
    <div className="rounded-md border border-white/15 bg-black/30 p-4 shadow-2xl shadow-black/30 backdrop-blur">
      <div className="rounded-md bg-[#0b141a] p-4 text-sm text-white">
        <div className="mb-4 flex items-center gap-3 border-b border-white/10 pb-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-eic-orange font-black">S</div>
          <div>
            <p className="font-semibold">Silvio</p>
            <p className="text-xs text-white/50">online</p>
          </div>
        </div>
        <div className="mb-4 grid grid-cols-3 gap-2">
          {["margine", "incassi", "cantieri"].map((item) => (
            <span key={item} className="rounded-md border border-white/10 bg-white/[0.05] px-2 py-1 text-center text-[11px] font-bold text-white/56">
              {item}
            </span>
          ))}
        </div>
        <div className="space-y-3">
          <div className="ml-auto max-w-[82%] rounded-md bg-[#005c4b] p-3">
            Silvio, quanto sto perdendo sul prossimo cantiere?
          </div>
          <div className="max-w-[88%] rounded-md bg-[#202c33] p-3">
            Ho visto il computo e i prezzi. Se non correggi subappalto idraulico e posa, margine stimato -7,4%.
          </div>
          <div className="max-w-[88%] rounded-md bg-[#202c33] p-3">
            Vuoi che ti preparo un'extra da inviare al cliente?
          </div>
          <div className="max-w-[48%] rounded-md bg-[#202c33] p-3">
            <span className="inline-flex gap-1">
              <span className="h-2 w-2 animate-bounce rounded-full bg-white/60 [animation-delay:0ms]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-white/60 [animation-delay:120ms]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-white/60 [animation-delay:240ms]" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DemoSilvioCTA() {
  return (
    <section className="relative overflow-hidden bg-eic-navy px-5 py-24 text-white md:px-8 lg:py-32">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
        }}
      />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l from-eic-orange/16 to-transparent" />
      <div className="relative mx-auto grid max-w-6xl gap-12 lg:grid-cols-2 lg:items-center">
        <FadeUp>
          <p className="text-sm font-black uppercase tracking-[0.22em] text-eic-orange">{demoSilvio.eyebrow}</p>
          <h2 className="mt-5 text-display-lg font-black">{demoSilvio.title}</h2>
          <div className="mt-7 space-y-4 text-lg leading-8 text-white/72">
            {demoSilvio.body.map((paragraph, index) => (
              <p key={`${paragraph}-${index}`} className={index === 1 ? "font-semibold text-white" : ""}>
                {paragraph}
              </p>
            ))}
          </div>
          <div className="mt-10 space-y-5">
            <Button
              asChild
              className="h-14 rounded-full bg-eic-orange px-8 font-semibold text-white transition hover:scale-[1.02] hover:bg-eic-orange hover:shadow-lg hover:shadow-eic-orange/30"
            >
              <a
                href={cta.whatsappHref}
                onClick={() => trackEvent("landing_ai_silvio_whatsapp_click", { section_name: "demo_silvio" })}
              >
                <MessageCircle className="h-4 w-4" strokeWidth={1.5} />
                {demoSilvio.cta}
              </a>
            </Button>
            <p className="text-sm text-white/64">
              {demoSilvio.secondary}{" "}
              <Link
                to={cta.primaryHref}
                onClick={() => trackEvent("landing_ai_cta_consulenza_click", { section_name: "demo_silvio_secondary" })}
                className="font-semibold text-white underline underline-offset-4"
              >
                {demoSilvio.secondaryCta}
                <ArrowRight className="ml-1 inline h-3 w-3" strokeWidth={1.5} />
              </Link>
            </p>
          </div>
        </FadeUp>
        <FadeUp transition={{ delay: 0.12 }}>
          <ChatMockup />
        </FadeUp>
      </div>
    </section>
  );
}
