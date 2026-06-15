import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Check, CheckCircle2, Rocket, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Checklist di setup del motore outreach — trasforma il cockpit "tutto a zero"
 * in un percorso guidato. Legge lo stato REALE (brand/domini/caselle/sequenze/
 * arruolamenti) dalle tabelle esistenti e mostra cosa manca. Si auto-nasconde
 * (slim banner) quando il setup è completo. Solo lettura, nessun deploy.
 *
 * Stile: stepper verticale alla Instantly/Smartlead — pallini numerati connessi
 * da una linea, step completati spuntati, step corrente evidenziato con accent.
 */

interface SetupState { brands: number; domains: number; senders: number; sequences: number; enrollments: number }

export function OutreachSetupChecklist({ companyId }: { companyId: string }) {
  const setup = useQuery({
    queryKey: ["outreach-setup", companyId],
    staleTime: 30_000,
    queryFn: async (): Promise<SetupState> => {
      const [brands, domains, senders, sequences, enrollments] = await Promise.all([
        supabase.from("outreach_brands").select("id", { count: "exact", head: true }).eq("company_id", companyId),
        supabase.from("outreach_sending_domains").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "active"),
        supabase.from("outreach_sender_accounts").select("id", { count: "exact", head: true }).eq("company_id", companyId).in("status", ["active", "warming"]),
        supabase.from("outreach_sequences").select("id", { count: "exact", head: true }).eq("company_id", companyId),
        supabase.from("outreach_enrollments").select("id", { count: "exact", head: true }).eq("company_id", companyId),
      ]);
      return {
        brands: brands.count ?? 0,
        domains: domains.count ?? 0,
        senders: senders.count ?? 0,
        sequences: sequences.count ?? 0,
        enrollments: enrollments.count ?? 0,
      };
    },
  });

  if (setup.isLoading) return <div className="h-44 animate-pulse rounded-xl border border-border bg-card" />;
  const d = setup.data ?? { brands: 0, domains: 0, senders: 0, sequences: 0, enrollments: 0 };

  const steps = [
    { done: d.brands > 0, label: "Crea un brand", hint: "Deliverability → + Brand", why: "Pool isolato di domini e caselle (reputazione separata per marchio)." },
    { done: d.domains > 0, label: "Verifica un dominio", hint: "Deliverability → + Dominio, poi configura SPF/DKIM/DMARC", why: "Senza DNS a posto le email finiscono in spam." },
    { done: d.senders > 0, label: "Attiva una casella", hint: "Deliverability → + Casella sul dominio", why: "È il mittente da cui parte il cold (con warm-up)." },
    { done: d.sequences > 0, label: "Crea una sequenza", hint: "Sequenze → + Nuova sequenza", why: "La cadenza multi-step che il contatto riceverà." },
    { done: d.enrollments > 0, label: "Arruola una lista", hint: "Lead & Liste → Arruola", why: "Mette i contatti in cadenza: da qui partono gli invii." },
  ];
  const done = steps.filter((s) => s.done).length;
  const total = steps.length;
  // Indice del primo step non completato → "step corrente" del wizard.
  const currentIdx = steps.findIndex((s) => !s.done);

  if (done === total) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-800 shadow-sm">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
        </span>
        <span><strong>Motore configurato.</strong> Sei operativo: arruola altre liste o crea nuove sequenze per scalare il volume.</span>
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      {/* Header card */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Rocket className="h-5 w-5 text-primary" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">Configura il motore</h3>
          <p className="text-sm text-muted-foreground">Completa questi passaggi per avviare il primo invio.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden h-1.5 w-28 overflow-hidden rounded-full bg-muted sm:block">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(done / total) * 100}%` }} />
          </div>
          <span className="text-sm font-semibold tabular-nums text-muted-foreground">{done}/{total}</span>
        </div>
      </div>

      {/* Stepper */}
      <ol className="px-5 py-4">
        {steps.map((s, i) => {
          const isCurrent = i === currentIdx;
          const isLast = i === steps.length - 1;
          return (
            <li key={i} className="relative flex gap-3.5 pb-4 last:pb-0">
              {/* Connettore verticale */}
              {!isLast && (
                <span
                  className={cn(
                    "absolute left-[15px] top-8 h-[calc(100%-1.5rem)] w-px",
                    s.done ? "bg-emerald-300" : "bg-border",
                  )}
                  aria-hidden
                />
              )}
              {/* Pallino step */}
              <span
                className={cn(
                  "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums transition-colors",
                  s.done
                    ? "border-emerald-300 bg-emerald-100 text-emerald-700"
                    : isCurrent
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-muted text-muted-foreground",
                )}
              >
                {s.done ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              {/* Testo */}
              <div className="min-w-0 flex-1 pt-1">
                <p className={cn("text-sm", s.done ? "text-muted-foreground line-through" : isCurrent ? "font-semibold" : "font-medium")}>
                  {s.label}
                </p>
                {!s.done && (
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1 font-medium text-primary">
                      <ArrowRight className="h-3 w-3 shrink-0" />{s.hint}
                    </span>
                    <span>— {s.why}</span>
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
