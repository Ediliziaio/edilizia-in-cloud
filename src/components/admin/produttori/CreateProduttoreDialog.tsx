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
import { Factory, Building2, Loader2, Plus } from "lucide-react";

type BillingMode = "fabbrica_paga" | "reseller_paga";

const MODELS: { value: BillingMode; label: string; desc: string; Icon: typeof Factory }[] = [
  { value: "fabbrica_paga", label: "Paga il produttore", desc: "I rivenditori sono gratuiti (comped). Fatturiamo il produttore.", Icon: Factory },
  { value: "reseller_paga", label: "Paga ogni rivenditore", desc: "Ogni rivenditore ha il proprio abbonamento.", Icon: Building2 },
];

/** Dialog super-admin per creare un nuovo produttore white-label (azienda + accesso admin). */
export function CreateProduttoreDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [nome, setNome] = useState("");
  const [emailAdmin, setEmailAdmin] = useState("");
  const [mode, setMode] = useState<BillingMode>("fabbrica_paga");

  const reset = () => { setNome(""); setEmailAdmin(""); setMode("fabbrica_paga"); };

  const crea = useMutation({
    mutationFn: async () => {
      const n = nome.trim();
      const e = emailAdmin.trim().toLowerCase();
      if (!n) throw new Error("Inserisci il nome del produttore");
      if (!e || !e.includes("@")) throw new Error("Inserisci un'email admin valida");
      const { data, error } = await supabase.functions.invoke("create-produttore", {
        body: { nome: n, email_admin: e, billing_mode: mode },
      });
      if (error) throw new Error(error.message ?? "Creazione fallita");
      const r = data as { success?: boolean; error?: string } | null;
      if (r && r.success === false) throw new Error(r.error ?? "Creazione fallita");
    },
    onSuccess: () => {
      toast.success("Produttore creato", { description: "Invito inviato all'admin del produttore." });
      reset();
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["admin-produttori"] });
    },
    onError: (e) => toast.error("Creazione fallita", { description: (e as Error).message }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!crea.isPending) { onOpenChange(v); if (!v) reset(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Factory className="h-5 w-5" /> Nuovo produttore
          </DialogTitle>
          <DialogDescription>
            Crea l&apos;accesso di un produttore white-label. Riceverà un invito email per impostare la
            password e potrà gestire i propri rivenditori, il brand e il dominio.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="p-nome">Nome produttore</Label>
            <Input id="p-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Es. Serramenti Rossi S.p.A." />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-email">Email admin produttore</Label>
            <Input id="p-email" type="email" value={emailAdmin} onChange={(e) => setEmailAdmin(e.target.value)} placeholder="admin@serramentirossi.it" />
          </div>
          <div className="space-y-1.5">
            <Label>Modello di fatturazione</Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {MODELS.map(({ value, label, desc, Icon }) => {
                const selected = mode === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setMode(value)}
                    aria-pressed={selected}
                    className={cn(
                      "rounded-lg border p-3 text-left transition-colors",
                      selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50",
                    )}
                  >
                    <Icon className={cn("h-4 w-4", selected ? "text-primary" : "text-muted-foreground")} />
                    <div className="mt-1.5 text-sm font-semibold">{label}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{desc}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={crea.isPending}>Annulla</Button>
          <Button onClick={() => crea.mutate()} disabled={crea.isPending} className="gap-1.5">
            {crea.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Crea produttore
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
