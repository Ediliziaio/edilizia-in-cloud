import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Circle, Rocket, ArrowRight } from "lucide-react";

/**
 * Checklist di setup del motore outreach — trasforma il cockpit "tutto a zero"
 * in un percorso guidato. Legge lo stato REALE (brand/domini/caselle/sequenze/
 * arruolamenti) dalle tabelle esistenti e mostra cosa manca. Si auto-nasconde
 * (slim banner) quando il setup è completo. Solo lettura, nessun deploy.
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

  if (setup.isLoading) return <div className="h-28 animate-pulse rounded-xl bg-muted/40" />;
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

  if (done === total) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-2.5 text-sm text-emerald-800">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
        <span><strong>Motore configurato.</strong> Sei operativo: arruola altre liste o crea nuove sequenze per scalare il volume.</span>
      </div>
    );
  }

  return (
    <Card className="border-orange-200 bg-orange-50/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Rocket className="h-5 w-5 text-orange-500" /> Configura il motore
          <span className="ml-auto text-sm font-normal text-muted-foreground">{done}/{total}</span>
        </CardTitle>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-orange-100">
          <div className="h-full bg-orange-500 transition-all" style={{ width: `${(done / total) * 100}%` }} />
        </div>
      </CardHeader>
      <CardContent>
        <ol className="space-y-2">
          {steps.map((s, i) => (
            <li key={i} className="flex items-start gap-2.5">
              {s.done
                ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50" />}
              <div className="min-w-0">
                <p className={`text-sm ${s.done ? "text-muted-foreground line-through" : "font-medium"}`}>{s.label}</p>
                {!s.done && (
                  <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                    <ArrowRight className="h-3 w-3 shrink-0 text-orange-400" />
                    <span className="font-medium text-orange-700">{s.hint}</span>
                    <span>— {s.why}</span>
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
