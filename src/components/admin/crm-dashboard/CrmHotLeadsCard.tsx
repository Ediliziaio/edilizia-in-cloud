/**
 * CrmHotLeadsCard — riga "LEAD CALDI · AZIONE OGGI" in Overview.
 *
 * I contatti più caldi (ai_score desc) con la prossima mossa suggerita dall'AI,
 * il valore previsto e l'ultima attività. Dati reali da marketing_contacts.
 * Empty-state onesto se non ci sono contatti con punteggio.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Flame, MapPin, ArrowRight, Loader2 } from "lucide-react";

interface HotLead {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  ai_score: number | null;
  ai_score_tier: string | null;
  ai_next_action: string | null;
  ai_predicted_value_eur: number | null;
  province: string | null;
  source: string | null;
}

const eur = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Math.round(n || 0));

function tierColor(tier: string | null, score: number | null): string {
  const t = (tier || "").toLowerCase();
  if (t.includes("cald") || t.includes("hot") || (score ?? 0) >= 70) return "hsl(var(--chart-5))";
  if (t.includes("tiep") || t.includes("warm") || (score ?? 0) >= 40) return "hsl(var(--chart-3))";
  return "hsl(var(--chart-1))";
}

export function CrmHotLeadsCard({ companyId }: { companyId: string }) {
  const q = useQuery({
    queryKey: ["crm-dash", "hot-leads", companyId],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_contacts")
        .select("id,first_name,last_name,company_name,ai_score,ai_score_tier,ai_next_action,ai_predicted_value_eur,province,source")
        .eq("company_id", companyId)
        .not("ai_score", "is", null)
        .order("ai_score", { ascending: false })
        .limit(6);
      if (error) return [] as HotLead[];
      return (data ?? []) as HotLead[];
    },
  });

  const leads = (q.data ?? []).filter((l) => (l.ai_score ?? 0) > 0);

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Flame className="h-4 w-4 text-orange-500" aria-hidden="true" /> Lead caldi · azione oggi
          {leads.length > 0 && (
            <span className="ml-auto text-xs font-normal text-muted-foreground">i {leads.length} più caldi</span>
          )}
        </div>

        {q.isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          </div>
        ) : leads.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nessun lead con punteggio AI. Importa contatti o lascia che lo scoring li valuti.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {leads.map((l) => {
              const color = tierColor(l.ai_score_tier, l.ai_score);
              const name = [l.first_name, l.last_name].filter(Boolean).join(" ").trim() || l.company_name || "Contatto";
              return (
                <div key={l.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold leading-tight">{name}</div>
                      {l.company_name && l.company_name !== name && (
                        <div className="truncate text-[11px] text-muted-foreground">{l.company_name}</div>
                      )}
                    </div>
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold text-white"
                      style={{ background: color }}
                    >
                      {Math.round(l.ai_score ?? 0)}
                    </span>
                  </div>

                  {l.ai_predicted_value_eur ? (
                    <div className="mt-1.5 text-sm font-bold" style={{ color }}>
                      {eur(l.ai_predicted_value_eur)}
                    </div>
                  ) : null}

                  {l.ai_next_action && (
                    <div className="mt-1.5 flex items-start gap-1 text-[12px] text-foreground/80">
                      <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="line-clamp-2">{l.ai_next_action}</span>
                    </div>
                  )}

                  {(l.province || l.source) && (
                    <div className="mt-2 flex items-center gap-2 border-t pt-1.5 text-[11px] text-muted-foreground">
                      {l.province && (
                        <span className="inline-flex items-center gap-0.5">
                          <MapPin className="h-3 w-3" aria-hidden="true" /> {l.province}
                        </span>
                      )}
                      {l.source && <span className="truncate">· {l.source}</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
