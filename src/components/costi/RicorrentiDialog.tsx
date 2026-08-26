/**
 * RicorrentiDialog — le spese ricorrenti dell'azienda, in un posto solo.
 *
 * Prima "Genera ricorrenti" era un bottone cieco: non vedevi quali voci
 * fossero ricorrenti, né cosa avrebbe creato. Qui: l'elenco delle voci madri
 * (con cadenza, prossima scadenza e peso mensile), l'interruttore per la
 * generazione automatica del 1° del mese, e la generazione manuale con esito.
 *
 * Le occorrenze generate nascono "once": la voce ricorrente resta una sola.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Repeat, CalendarClock, Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/formatters";

interface VoceRicorrente {
  id: string;
  name: string;
  amount: number;
  category: string | null;
  cost_type: string;
  recurrence: "monthly" | "quarterly" | "yearly";
  recurrence_auto: boolean;
  recurrence_end_date: string | null;
  due_date: string;
  prossima: string | null; // yyyy-MM-dd della prossima occorrenza, null se terminata
}

const CADENZA_LABEL: Record<string, string> = {
  monthly: "Mensile",
  quarterly: "Trimestrale",
  yearly: "Annuale",
};

/** Peso mensile equivalente: quarterly/3, yearly/12. */
function pesoMensile(v: VoceRicorrente): number {
  const div = v.recurrence === "monthly" ? 1 : v.recurrence === "quarterly" ? 3 : 12;
  return v.amount / div;
}

/**
 * Prossima occorrenza dalla due_date della madre: stesso giorno-àncora con
 * clamp a fine mese dei generatori (edge generate-recurring-costs).
 */
function prossimaOccorrenza(dueDate: string, recurrence: string, endDate: string | null, oggi: Date): string | null {
  const base = new Date(dueDate);
  const step = recurrence === "monthly" ? 1 : recurrence === "quarterly" ? 3 : 12;
  const anchorDay = base.getDate();
  for (let k = 0; k <= 24; k += 1) {
    const lastDay = new Date(base.getFullYear(), base.getMonth() + k * step + 1, 0).getDate();
    const d = new Date(base.getFullYear(), base.getMonth() + k * step, Math.min(anchorDay, lastDay));
    if (endDate && d > new Date(endDate)) return null;
    if (d >= oggi) return format(d, "yyyy-MM-dd");
  }
  return null;
}

export function RicorrentiDialog({
  open, onOpenChange, companyId, onGenerated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | undefined;
  onGenerated: () => void;
}) {
  const queryClient = useQueryClient();
  const [generating, setGenerating] = useState(false);

  const { data: voci = [], isLoading } = useQuery({
    queryKey: ["costi-ricorrenti", companyId],
    queryFn: async (): Promise<VoceRicorrente[]> => {
      const { data, error } = await supabase
        .from("company_costs")
        .select("id, name, amount, category, cost_type, recurrence, recurrence_auto, recurrence_end_date, due_date")
        .eq("company_id", companyId!)
        .neq("recurrence", "once")
        .order("amount", { ascending: false });
      if (error) throw error;
      const oggi = new Date();
      return (data || []).map((c: any) => ({
        ...c,
        amount: Number(c.amount) || 0,
        prossima: prossimaOccorrenza(c.due_date, c.recurrence, c.recurrence_end_date, oggi),
      }));
    },
    enabled: !!companyId && open,
    staleTime: 60 * 1000,
  });

  const totaleMensile = voci.reduce((s, v) => s + (v.prossima ? pesoMensile(v) : 0), 0);
  const conAuto = voci.filter((v) => v.recurrence_auto).length;

  const toggleAuto = async (voce: VoceRicorrente, value: boolean) => {
    const { error } = await supabase
      .from("company_costs")
      .update({ recurrence_auto: value })
      .eq("id", voce.id);
    if (error) {
      toast({ title: "Errore nel salvataggio", description: error.message, variant: "destructive" });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["costi-ricorrenti", companyId] });
  };

  const generaOra = async () => {
    if (generating) return;
    setGenerating(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("generate-recurring-costs", {
        body: { company_id: companyId },
      });
      if (error) throw error;
      const created = result?.created || 0;
      toast(
        created > 0
          ? { title: `Create ${created} nuove scadenze`, description: "Le trovi nella lista Spese, tra i previsti." }
          : { title: "Niente da creare", description: "Le scadenze dei prossimi 3 mesi esistono già." },
      );
      onGenerated();
    } catch (err) {
      toast({
        title: "Errore nella generazione",
        description: err instanceof Error ? err.message : "Riprova tra qualche istante.",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Repeat className="h-4 w-4 text-orange-600" /> Spese ricorrenti
          </DialogTitle>
          <DialogDescription>
            Ogni voce qui sotto crea da sola le prossime scadenze (3 mesi in avanti).
            Con l'interruttore acceso succede in automatico il 1° del mese; senza, si genera da qui.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : voci.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-muted-foreground">
            Nessuna spesa ricorrente. Quando crei un costo, scegli ricorrenza
            &ldquo;Mensile&rdquo; (o trimestrale, o annuale): da lì in poi le prossime
            scadenze nascono da sole.
          </div>
        ) : (
          <>
            <div className="max-h-[50vh] space-y-1.5 overflow-y-auto pr-1">
              {voci.map((v) => (
                <div key={v.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{v.name}</p>
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span>{CADENZA_LABEL[v.recurrence] ?? v.recurrence}</span>
                      {v.prossima ? (
                        <span className="flex items-center gap-1">
                          <CalendarClock className="h-3 w-3" />
                          prossima {format(new Date(v.prossima), "d MMM yyyy", { locale: it })}
                        </span>
                      ) : (
                        <Badge variant="outline" className="h-4 px-1 text-[10px]">terminata</Badge>
                      )}
                      {v.category && <span className="truncate">· {v.category}</span>}
                    </p>
                  </div>
                  <div className="text-right text-sm font-semibold tabular-nums">
                    {formatCurrency(v.amount)}
                    {v.recurrence !== "monthly" && (
                      <p className="text-[11px] font-normal text-muted-foreground">
                        ≈ {formatCurrency(pesoMensile(v))}/mese
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-center gap-0.5 pl-1">
                    <Switch
                      checked={v.recurrence_auto}
                      onCheckedChange={(val) => toggleAuto(v, val)}
                      aria-label={`Generazione automatica per ${v.name}`}
                    />
                    <span className="text-[10px] text-muted-foreground">auto</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
              <p className="text-sm text-muted-foreground">
                {voci.length} voci · valgono <strong className="text-foreground">{formatCurrency(totaleMensile)}/mese</strong>
                {conAuto > 0 && <span> · {conAuto} in automatico</span>}
              </p>
              <Button size="sm" onClick={generaOra} disabled={generating} className="gap-1.5">
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Repeat className="h-4 w-4" />}
                {generating ? "Generazione..." : "Genera le prossime scadenze"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
