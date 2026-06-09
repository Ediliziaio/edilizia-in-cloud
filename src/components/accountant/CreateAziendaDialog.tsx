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
import { Building2, Loader2, Plus, Info } from "lucide-react";
import { accountantKeys } from "@/hooks/accountant/useAccountantPortalData";

/**
 * Dialog del COMMERCIALISTA per creare una nuova azienda cliente, auto-associata
 * allo studio (delega operativa). key-remount dal parent per resettare lo stato.
 */
export function CreateAziendaDialog({
  open, onOpenChange, firmId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  firmId: string | null;
}) {
  const qc = useQueryClient();
  const [nome, setNome] = useState("");
  const [piva, setPiva] = useState("");
  const [cf, setCf] = useState("");
  const [email, setEmail] = useState("");

  const crea = useMutation({
    mutationFn: async () => {
      const n = nome.trim();
      if (!n) throw new Error("Inserisci il nome dell'azienda");
      const e = email.trim().toLowerCase();
      if (e && !/^\S+@\S+\.\S+$/.test(e)) throw new Error("Email admin non valida");
      const { data, error } = await supabase.functions.invoke("create-accountant-company", {
        body: { name: n, vat_number: piva.trim() || null, fiscal_code: cf.trim() || null, admin_email: e || null },
      });
      if (error) throw new Error(error.message ?? "Creazione fallita");
      const r = data as { success?: boolean; error?: string } | null;
      if (r && r.success === false) throw new Error(r.error ?? "Creazione fallita");
    },
    onSuccess: () => {
      toast.success("Azienda creata", { description: "È stata associata al tuo studio." });
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: accountantKeys.companies(firmId) });
    },
    onError: (e) => toast.error("Creazione fallita", { description: (e as Error).message }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!crea.isPending) onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" /> Nuova azienda cliente
          </DialogTitle>
          <DialogDescription>
            Crea un'azienda e associala subito al tuo studio, con accesso operativo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="a-nome">Nome azienda</Label>
            <Input id="a-nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} placeholder="Es. Rossi Costruzioni S.r.l." />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="a-piva">P.IVA <span className="text-muted-foreground">(opz.)</span></Label>
              <Input id="a-piva" value={piva} onChange={(e) => setPiva(e.target.value)} placeholder="IT01234567890" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="a-cf">Cod. Fiscale <span className="text-muted-foreground">(opz.)</span></Label>
              <Input id="a-cf" value={cf} onChange={(e) => setCf(e.target.value)} placeholder="RSSMRA…" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="a-email">Email admin cliente <span className="text-muted-foreground">(opz.)</span></Label>
            <Input id="a-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="titolare@azienda.it" />
          </div>
          <div className="flex gap-2 rounded-lg border border-blue-200 bg-blue-50 p-2.5 text-xs text-blue-800">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              L&apos;azienda nasce in <strong>prova</strong> con il tuo <strong>accesso operativo</strong>. Se inserisci
              un&apos;email, il titolare riceve un invito per accedere; altrimenti la gestisci solo tu.
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={crea.isPending}>Annulla</Button>
          <Button onClick={() => crea.mutate()} disabled={crea.isPending || !nome.trim()} className="gap-1.5">
            {crea.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Crea azienda
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
