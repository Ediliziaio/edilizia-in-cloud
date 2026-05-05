/**
 * AllocazioneOperaiAIDialog — Suggerimenti AI allocazione operai per ordine
 *
 * Edge: ai-allocazione-operai
 * Mostra: lista operai consigliati con motivazione + score + ruolo proposto
 * Permette: cliccare "Assegna" per inserire in order_employees (al costo orario default)
 */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Sparkles, Wand2, Loader2, AlertTriangle, Users, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Suggerimento {
  employee_id: string;
  nome: string;
  ruolo_proposto: string;
  motivazione: string;
  score: number;
}

interface Props {
  orderId: string;
  companyId: string;
}

const RUOLO_BADGE: Record<string, string> = {
  capocantiere: "bg-amber-100 text-amber-700 border-amber-300",
  operaio_principale: "bg-emerald-100 text-emerald-700 border-emerald-300",
  operaio_supporto: "bg-blue-100 text-blue-700 border-blue-300",
  specialista: "bg-violet-100 text-violet-700 border-violet-300",
};

export function AllocazioneOperaiAIDialog({ orderId, companyId }: Props) {
  const [open, setOpen] = useState(false);
  const [num, setNum] = useState(3);
  const [suggerimenti, setSuggerimenti] = useState<Suggerimento[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [alternative, setAlternative] = useState<string | null>(null);

  const generaMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("ai-allocazione-operai", {
        body: { order_id: orderId, company_id: companyId, num_richiesti: num },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? "Suggerimento fallito");
      return data;
    },
    onSuccess: (data) => {
      setSuggerimenti(data.suggerimenti ?? []);
      setWarnings(data.warning ?? []);
      setAlternative(data.alternative ?? null);
      toast.success(`AI: ${data.suggerimenti?.length ?? 0} operai suggeriti`);
    },
    onError: (err) => {
      toast.error(`AI: ${err instanceof Error ? err.message : String(err)}`);
    },
  });

  const assegnaMutation = useMutation({
    mutationFn: async (employeeId: string) => {
      // Recupera hourly rate dall'employee
      const { data: emp } = await supabase
        .from("employees")
        .select("gross_salary, monthly_hours")
        .eq("id", employeeId)
        .single();
      const hourlyRate = emp?.gross_salary && emp?.monthly_hours
        ? Math.round((emp.gross_salary / emp.monthly_hours) * 100) / 100
        : 0;

      const { error } = await supabase
        .from("order_employees")
        .insert({
          order_id: orderId,
          employee_id: employeeId,
          hours_worked: 0,
          hourly_rate: hourlyRate,
          total_cost: 0,
        });
      if (error) throw error;
    },
    onSuccess: () => toast.success("Operaio assegnato all'ordine"),
    onError: (err) => toast.error(`Errore: ${err instanceof Error ? err.message : String(err)}`),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Sparkles className="h-4 w-4 text-violet-600" />
          Suggerisci Operai AI
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            AI Allocazione Operai
            <Badge variant="outline" className="ml-2 text-xs bg-violet-50 text-violet-700 border-violet-300">
              <Sparkles className="h-3 w-3 mr-1" /> Silvio AI
            </Badge>
          </DialogTitle>
          <DialogDescription>
            L'AI analizza carico operai, area geografica, ruoli e suggerisce il team
            ottimale per questo cantiere.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <label>Numero operai richiesti:</label>
            <input
              type="number"
              min={1} max={10}
              value={num}
              onChange={(e) => setNum(Math.max(1, Math.min(10, Number(e.target.value) || 3)))}
              className="w-16 h-8 px-2 border rounded text-center"
            />
            <Button
              size="sm"
              onClick={() => generaMutation.mutate()}
              disabled={generaMutation.isPending}
              className="gap-1 ml-auto"
            >
              {generaMutation.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Wand2 className="h-4 w-4" />}
              Genera suggerimento
            </Button>
          </div>

          {warnings.length > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle className="text-sm">Avvisi</AlertTitle>
              <AlertDescription className="text-xs">
                <ul className="list-disc pl-4 space-y-0.5">
                  {warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {alternative && (
            <Alert>
              <Sparkles className="h-4 w-4 text-violet-600" />
              <AlertDescription className="text-xs">{alternative}</AlertDescription>
            </Alert>
          )}

          {suggerimenti && suggerimenti.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nessun operaio suggerito (verifica i warnings sopra).
            </p>
          )}

          {suggerimenti && suggerimenti.length > 0 && (
            <div className="space-y-2">
              {suggerimenti.map((s) => (
                <div
                  key={s.employee_id}
                  className="border rounded-lg p-3 hover:bg-muted/30 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="font-medium">{s.nome}</div>
                      <Badge
                        variant="outline"
                        className={cn("text-[10px] mt-1", RUOLO_BADGE[s.ruolo_proposto] ?? "")}
                      >
                        {s.ruolo_proposto?.replace(/_/g, " ")}
                      </Badge>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">Score AI</div>
                      <div className="font-mono font-semibold text-violet-700">{s.score}/100</div>
                    </div>
                  </div>
                  <p className="text-xs italic text-muted-foreground">"{s.motivazione}"</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => assegnaMutation.mutate(s.employee_id)}
                    disabled={assegnaMutation.isPending}
                    className="w-full gap-1 h-7 text-xs"
                  >
                    <CheckCircle2 className="h-3 w-3" /> Assegna a questo ordine
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Chiudi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
