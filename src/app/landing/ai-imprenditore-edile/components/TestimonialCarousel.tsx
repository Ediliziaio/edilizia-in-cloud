import useEmblaCarousel from "embla-carousel-react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { testimonials } from "../content";
import { FadeUp } from "./FadeUp";

export function TestimonialCarousel() {
  const [emblaRef, emblaApi] = useEmblaCarousel({ align: "start", loop: false });

  return (
    <section className="relative overflow-hidden bg-white px-5 py-24 md:px-8 lg:py-32">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-eic-orange/50 to-transparent" />
      <div className="mx-auto max-w-6xl">
        <FadeUp className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <h2 className="max-w-4xl text-display-lg font-black text-eic-ink">{testimonials.title}</h2>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              className="rounded-full border-eic-navy/20"
              onClick={() => emblaApi?.scrollPrev()}
              aria-label="Testimonianza precedente"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="rounded-full border-eic-navy/20"
              onClick={() => emblaApi?.scrollNext()}
              aria-label="Testimonianza successiva"
            >
              <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
            </Button>
          </div>
        </FadeUp>
        <div ref={emblaRef} className="mt-12 overflow-hidden">
          <div className="flex gap-5">
            {testimonials.items.map((item) => (
              <article
                key={item.author}
                className="group relative min-w-0 flex-[0_0_88%] overflow-hidden rounded-md border border-eic-navy/10 bg-white p-8 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-eic-orange/35 hover:shadow-2xl hover:shadow-eic-navy/10 md:flex-[0_0_calc(50%-10px)] lg:flex-[0_0_calc(33.333%-14px)]"
              >
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-eic-orange via-eic-orange-soft to-transparent opacity-70" />
                <p className="font-display text-8xl leading-none text-eic-orange/30">“</p>
                <p className="-mt-10 font-display text-[22px] italic leading-8 text-eic-ink">“{item.quote}”</p>
                <div className="mt-8 border-t border-eic-navy/10 pt-5">
                  <p className="font-black text-eic-ink">{item.author}</p>
                  <p className="text-sm text-eic-ink/58">{item.role}</p>
                </div>
                <div className="mt-5 flex gap-2">
                  <span className="rounded-full bg-eic-orange/10 px-3 py-1 text-xs font-black text-eic-orange">caso reale</span>
                  <span className="rounded-full bg-eic-navy/5 px-3 py-1 text-xs font-bold text-eic-navy/60">operativo</span>
                </div>
              </article>
            ))}
          </div>
        </div>
        <FadeUp className="mt-10 rounded-md bg-eic-orange/10 px-6 py-4 text-center font-mono text-sm font-semibold text-eic-orange">
          {testimonials.stats}
        </FadeUp>
      </div>
    </section>
  );
}
