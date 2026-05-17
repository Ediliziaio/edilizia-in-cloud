import { zodResolver } from "@hookform/resolvers/zod";
import { BookOpen, Bot, Check, FileSearch, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { fetchWithTimeout } from "@/lib/utils/fetchWithTimeout";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { trackEvent } from "@/lib/track";
import { leadMagnet } from "../content";
import { FadeUp } from "./FadeUp";

const leadSchema = z.object({
  email: z.string().email("Inserisci una email valida."),
  privacy: z.boolean().refine(Boolean, "Devi accettare la privacy per ricevere il manuale."),
});

type LeadForm = z.infer<typeof leadSchema>;

gsap.registerPlugin(useGSAP, ScrollTrigger);

export function LeadMagnet() {
  const visualRef = useRef<HTMLDivElement>(null);
  const [submitted, setSubmitted] = useState(false);
  const form = useForm<LeadForm>({
    resolver: zodResolver(leadSchema),
    defaultValues: { email: "", privacy: false },
  });

  useGSAP(() => {
    const motion = gsap.matchMedia();

    motion.add("(prefers-reduced-motion: reduce)", () => {
      gsap.set(".manual-cover, .manual-signal, .manual-scan-line, .manual-pill", {
        opacity: 1,
        scale: 1,
        y: 0,
        clearProps: "transform",
      });
    });

    motion.add("(prefers-reduced-motion: no-preference)", () => {
      const timeline = gsap.timeline({
        scrollTrigger: {
          trigger: visualRef.current,
          start: "top 82%",
          once: true,
        },
        defaults: { ease: "power3.out" },
      });

      timeline
        .from(".manual-cover", { opacity: 0, y: 38, rotateY: -18, duration: 0.72 })
        .from(".manual-pill", { opacity: 0, y: 16, scale: 0.9, stagger: 0.08, duration: 0.42 }, 0.22)
        .from(".manual-signal", { opacity: 0, scale: 0.4, stagger: 0.06, duration: 0.4 }, 0.34);

      gsap.to(".manual-scan-line", {
        y: 330,
        opacity: 0.78,
        duration: 2.8,
        repeat: -1,
        ease: "power1.inOut",
      });

      gsap.to(".manual-signal", {
        scale: 1.28,
        opacity: 0.22,
        duration: 1.6,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
        stagger: 0.15,
      });
    });

    return () => motion.revert();
  }, { scope: visualRef });

  async function onSubmit(values: LeadForm) {
    trackEvent("landing_ai_lead_magnet_submit", { email_domain: values.email.split("@")[1] ?? "" });
    await fetchWithTimeout("/api/lead-magnet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      timeoutMs: 8_000,
      context: "lead-magnet.submit",
      body: JSON.stringify({ ...values, source: "landing_ai_imprenditore_edile" }),
    }).catch(() => undefined);
    form.reset();
    setSubmitted(true);
  }

  return (
    <section className="relative overflow-hidden bg-eic-cream px-5 py-24 md:px-8 lg:py-32">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(30,58,95,.055) 1px, transparent 1px), linear-gradient(90deg, rgba(30,58,95,.055) 1px, transparent 1px)",
          backgroundSize: "58px 58px",
        }}
      />
      <div className="relative mx-auto grid max-w-6xl gap-12 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
        <FadeUp>
          <div ref={visualRef} className="mx-auto max-w-sm [perspective:1000px]">
            <div className="manual-cover relative h-[400px] overflow-hidden rounded-md bg-[#6B1A1A] p-6 text-[#e9c46a] shadow-2xl shadow-eic-navy/20 [transform:rotateY(-8deg)_rotateX(3deg)] sm:h-[440px] sm:p-8 sm:[transform:rotateY(-12deg)_rotateX(4deg)]">
              <div className="absolute inset-y-0 left-0 w-8 rounded-l-md bg-black/20" />
              <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/12 to-transparent" />
              <div className="manual-scan-line pointer-events-none absolute left-8 right-5 top-12 h-px bg-gradient-to-r from-transparent via-white to-transparent shadow-[0_0_26px_rgba(255,255,255,0.9)]" />
              <span className="manual-signal pointer-events-none absolute right-10 top-14 h-20 w-20 rounded-full border border-eic-orange/35" />
              <span className="manual-signal pointer-events-none absolute bottom-24 left-12 h-14 w-14 rounded-full border border-[#f6d88d]/35" />
              <BookOpen className="h-10 w-10 sm:h-12 sm:w-12" strokeWidth={1.5} />
              <p className="mt-12 text-xs font-black uppercase tracking-[0.28em] sm:mt-14 sm:text-sm">Manuale riservato</p>
              <h3 className="mt-5 font-display text-[2.1rem] font-black leading-tight text-[#f6d88d] sm:text-4xl">
                Imprese Edili & AI
              </h3>
              <p className="mt-5 max-w-[15rem] text-lg font-semibold leading-snug text-white/86 sm:mt-6 sm:text-xl">
                31 sprechi che spesso restano invisibili.
              </p>
              <div className="manual-pill absolute right-6 top-28 rounded-md border border-white/14 bg-white/10 px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-white/82 backdrop-blur">
                <Sparkles className="mr-1 inline h-3.5 w-3.5 text-eic-orange" strokeWidth={1.5} />
                Audit AI
              </div>
              <div className="manual-pill absolute bottom-20 right-6 hidden max-w-[180px] rounded-md border border-white/14 bg-black/24 p-3 text-sm leading-5 text-white/82 backdrop-blur sm:block">
                <FileSearch className="mb-2 h-4 w-4 text-eic-orange" strokeWidth={1.5} />
                Margini, ritardi e cassa letti da Silvio.
              </div>
              <div className="manual-pill absolute bottom-28 left-10 hidden max-w-[165px] rounded-md border border-eic-orange/24 bg-eic-orange/18 p-3 text-sm leading-5 text-white/86 backdrop-blur sm:block">
                <Bot className="mb-2 h-4 w-4 text-[#f6d88d]" strokeWidth={1.5} />
                Priorità operative pronte per il titolare.
              </div>
              <p className="absolute bottom-7 left-6 text-xs font-black uppercase tracking-[0.22em] text-white/70 sm:bottom-8 sm:left-8 sm:text-sm">EdiliziaInCloud</p>
            </div>
          </div>
        </FadeUp>
        <FadeUp>
          <p className="text-sm font-black uppercase tracking-[0.22em] text-eic-orange">{leadMagnet.eyebrow}</p>
          <h2 className="mt-5 text-display-lg font-black text-eic-ink">{leadMagnet.title}</h2>
          <p className="mt-6 text-lg leading-8 text-eic-ink/70">{leadMagnet.body}</p>
          <ul className="mt-8 space-y-3">
            {leadMagnet.bullets.map((bullet) => (
              <li key={bullet} className="flex gap-3 text-eic-ink/75">
                <Check className="mt-1 h-4 w-4 shrink-0 text-eic-orange" strokeWidth={1.5} />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
          <form onSubmit={form.handleSubmit(onSubmit)} className="mt-8 rounded-md border border-eic-navy/10 bg-white p-5 shadow-2xl shadow-eic-navy/6">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <Input
                type="email"
                placeholder="La tua email aziendale"
                className="h-14 rounded-md"
                {...form.register("email")}
              />
              <Button
                type="submit"
                disabled={form.formState.isSubmitting}
                className="h-14 rounded-full bg-eic-orange px-8 font-semibold text-white transition hover:scale-[1.02] hover:bg-eic-orange hover:shadow-lg hover:shadow-eic-orange/30"
              >
                {form.formState.isSubmitting ? "Invio..." : leadMagnet.cta}
              </Button>
            </div>
            <label className="mt-4 flex items-start gap-3 text-sm text-eic-ink/62">
              <Checkbox
                checked={form.watch("privacy") === true}
                onCheckedChange={(checked) => form.setValue("privacy", checked === true, { shouldValidate: true })}
              />
              Accetto la privacy policy e voglio ricevere il manuale.
            </label>
            {(form.formState.errors.email || form.formState.errors.privacy) && (
              <p className="mt-3 text-sm font-medium text-red-600">
                {form.formState.errors.email?.message || form.formState.errors.privacy?.message}
              </p>
            )}
            {submitted && (
              <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                Richiesta registrata. Ti inviamo il manuale all'email indicata.
              </p>
            )}
            <p className="mt-4 text-xs italic text-eic-ink/52">{leadMagnet.microTrust}</p>
          </form>
        </FadeUp>
      </div>
    </section>
  );
}
