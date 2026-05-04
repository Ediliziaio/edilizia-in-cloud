import { zodResolver } from "@hookform/resolvers/zod";
import { BookOpen, Check } from "lucide-react";
import { useState } from "react";
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

export function LeadMagnet() {
  const [submitted, setSubmitted] = useState(false);
  const form = useForm<LeadForm>({
    resolver: zodResolver(leadSchema),
    defaultValues: { email: "", privacy: false },
  });

  async function onSubmit(values: LeadForm) {
    trackEvent("landing_ai_lead_magnet_submit", { email_domain: values.email.split("@")[1] ?? "" });
    await fetch("/api/lead-magnet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
          <div className="mx-auto max-w-sm [perspective:1000px]">
            <div className="relative h-[440px] overflow-hidden rounded-md bg-[#6B1A1A] p-8 text-[#e9c46a] shadow-2xl shadow-eic-navy/20 [transform:rotateY(-12deg)_rotateX(4deg)]">
              <div className="absolute inset-y-0 left-0 w-8 rounded-l-md bg-black/20" />
              <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/12 to-transparent" />
              <BookOpen className="h-12 w-12" strokeWidth={1.5} />
              <p className="mt-14 text-sm font-black uppercase tracking-[0.28em]">Manuale riservato</p>
              <h3 className="mt-5 font-display text-4xl font-black leading-tight text-[#f6d88d]">
                Imprese Edili & AI
              </h3>
              <p className="mt-6 text-xl font-semibold text-white/86">31 sprechi che spesso restano invisibili.</p>
              <p className="absolute bottom-8 left-8 text-sm font-black uppercase tracking-[0.22em] text-white/70">EdiliziaInCloud</p>
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
