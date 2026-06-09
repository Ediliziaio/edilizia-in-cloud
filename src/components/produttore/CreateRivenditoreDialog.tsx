import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useResellerPlans } from "@/hooks/useResellerPlans";
import { Building2, Factory, CreditCard, Loader2, Plus, Info, Check, Package } from "lucide-react";

const PAY = [
  { comped: true, label: "Paghi tu", desc: "Il rivenditore usa il software gratis, l'abbonamento lo paghi tu (produttore).", Icon: Factory },
  { comped: false, label: "Paga il rivenditore", desc: "Il rivenditore ha il proprio abbonamento e lo paga lui.", Icon: CreditCard },
];

/**
 * Dialog del PRODUTTORE per creare un rivenditore white-label.
 * Scelta esplicita di "chi paga" (per-rivenditore), default dal modello del produttore.
 * key-remount dal parent per resettare lo stato ad ogni apertura (no setState-in-effect).
 */
export function CreateRivenditoreDialog({
  open, onOpenChange, companyId, defaultComped,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyId: string | null;
  defaultComped: boolean;
}) {
  const qc = useQueryClient();
  const { data: plans = [], isLoading: plansLoading } = useResellerPlans();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [comped, setComped] = useState(defaultComped);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  // Selezione derivata: default al primo piano (Starter) finché l'utente non sceglie,
  // senza setState-in-effect (coerente col remount-by-key del dialog).
  const planId = selectedPlanId ?? plans[0]?.id ?? "";
  const selectedPlan = plans.find((p) => p.id === planId) ?? null;

  const crea = useMutation({
    mutationFn: async () => {
      const n = nome.trim();
      const e = email.trim().toLowerCase();
      if (!n) throw new Error("Inserisci il nome del rivenditore");
      if (!e || !e.includes("@")) throw new Error("Inserisci un'email admin valida");
      if (!planId) throw new Error("Seleziona un piano");
      const { data, error } = await supabase.functions.invoke("create-reseller", {
        body: { nome: n, email_admin: e, billing_comped: comped, subscription_plan_id: planId },
      });
      if (error) throw new Error(error.message ?? "Creazione fallita");
      const r = data as { success?: boolean; error?: string } | null;
      if (r && r.success === false) throw new Error(r.error ?? "Creazione fallita");
    },
    onSuccess: () => {
      toast.success("Rivenditore creato", { description: "Invito inviato all'admin del rivenditore." });
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["produttore-rivenditori", companyId] });
      qc.invalidateQueries({ queryKey: ["produttore-fatturazione", companyId] });
    },
    onError: (e) => toast.error("Creazione fallita", { description: (e as Error).message }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!crea.isPending) onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" /> Nuovo rivenditore
          </DialogTitle>
          <DialogDescription>
            Crea l&apos;area dedicata di un rivenditore, col tuo brand. Riceverà un invito email per
            impostare la password.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="r-nome">Nome rivenditore</Label>
            <Input id="r-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Es. Serramenti Bianchi" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-email">Email admin rivenditore</Label>
            <Input id="r-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@serramentibianchi.it" />
          </div>

          <div className="space-y-1.5">
            <Label>Piano del rivenditore</Label>
            {plansLoading ? (
              <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">Caricamento piani…</div>
            ) : plans.length === 0 ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                Nessun piano disponibile. Contatta il supporto.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {plans.map((p) => {
                  const selected = planId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedPlanId(p.id)}
                      aria-pressed={selected}
                      className={cn(
                        "relative rounded-lg border p-3 text-left transition-colors",
                        selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50",
                      )}
                    >
                      {selected && (
                        <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                          <Check className="h-3 w-3" />
                        </span>
                      )}
                      <Package className={cn("h-4 w-4", selected ? "text-primary" : "text-muted-foreground")} />
                      <div className="mt-1.5 text-sm font-semibold">{p.name}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">€{p.price_monthly}/mese</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Chi paga l&apos;abbonamento?</Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {PAY.map(({ comped: val, label, desc, Icon }) => {
                const selected = comped === val;
                return (
                  <button
                    key={String(val)}
                    type="button"
                    onClick={() => setComped(val)}
                    aria-pressed={selected}
                    className={cn(
                      "relative rounded-lg border p-3 text-left transition-colors",
                      selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50",
                    )}
                  >
                    {selected && (
                      <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                    <Icon className={cn("h-4 w-4", selected ? "text-primary" : "text-muted-foreground")} />
                    <div className="mt-1.5 text-sm font-semibold">{label}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {selectedPlan && (
            <p className="text-xs text-muted-foreground">
              <strong className="text-foreground">{selectedPlan.name}</strong> · €{selectedPlan.price_monthly}/mese —{" "}
              {comped ? "lo paghi tu" : "lo paga il rivenditore"}
            </p>
          )}

          <div className="flex gap-2 rounded-lg border border-blue-200 bg-blue-50 p-2.5 text-xs text-blue-800">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Il rivenditore accederà da <strong>app.ediliziaincloud.com</strong> o dal <strong>tuo dominio</strong>:
              per lui è un&apos;area come le altre, col tuo brand. Tu vedi i suoi dati; lui non vede te.
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={crea.isPending}>Annulla</Button>
          <Button onClick={() => crea.mutate()} disabled={crea.isPending || !planId} className="gap-1.5">
            {crea.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Crea rivenditore
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
