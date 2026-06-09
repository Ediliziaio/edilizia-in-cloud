import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Users, Plus, Building2, Loader2, AlertCircle, RefreshCw } from "lucide-react";

interface Rivenditore {
  id: string;
  name: string;
  status: string | null;
  billing_comped: boolean | null;
  created_at: string;
}

/**
 * Dashboard Produttore — lista dei rivenditori (company figlie con
 * parent_company_id = la mia azienda) + creazione via edge function create-reseller.
 */
export default function ProduttoreDashboard() {
  const { profile, effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id ?? profile?.company_id ?? null;
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState("");
  const [emailAdmin, setEmailAdmin] = useState("");

  const { data: rivenditori = [], isLoading, isError, refetch } = useQuery<Rivenditore[]>({
    queryKey: ["produttore-rivenditori", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      // parent_company_id non è ancora nei tipi generati (migration locale).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("companies")
        .select("id, name, status, billing_comped, created_at")
        .eq("parent_company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as Rivenditore[];
    },
  });

  const crea = useMutation({
    mutationFn: async () => {
      const n = nome.trim();
      const e = emailAdmin.trim().toLowerCase();
      if (!n) throw new Error("Inserisci il nome del rivenditore");
      if (!e || !e.includes("@")) throw new Error("Inserisci un'email admin valida");
      const { data, error } = await supabase.functions.invoke("create-reseller", {
        body: { nome: n, email_admin: e },
      });
      if (error) throw new Error(error.message ?? "Creazione fallita");
      const r = data as { success?: boolean; error?: string } | null;
      if (r?.success === false) throw new Error(r?.error ?? "Creazione fallita");
    },
    onSuccess: () => {
      toast.success("Rivenditore creato", { description: "Invito inviato all'admin del rivenditore." });
      setOpen(false);
      setNome("");
      setEmailAdmin("");
      qc.invalidateQueries({ queryKey: ["produttore-rivenditori", companyId] });
    },
    onError: (e) => toast.error("Creazione fallita", { description: (e as Error).message }),
  });

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Users className="h-6 w-6" /> I tuoi rivenditori
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Crea e gestisci gli accessi dei tuoi rivenditori, col tuo brand.
          </p>
        </div>
        <Button className="gap-1.5" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Crea rivenditore
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center">
          <AlertCircle className="mx-auto mb-3 h-8 w-8 text-destructive opacity-70" />
          <p className="font-medium">Errore nel caricamento dei rivenditori</p>
          <p className="mx-auto mb-4 mt-1 max-w-sm text-sm text-muted-foreground">
            Riprova tra poco. Se il problema persiste, contatta il supporto.
          </p>
          <Button variant="outline" className="gap-1.5" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" /> Riprova
          </Button>
        </div>
      ) : rivenditori.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <Building2 className="mx-auto mb-3 h-10 w-10 text-muted-foreground opacity-40" />
          <p className="font-medium">Nessun rivenditore ancora</p>
          <p className="mx-auto mb-4 mt-1 max-w-sm text-sm text-muted-foreground">
            Crea il primo rivenditore: avrà la sua area dedicata, con il tuo logo e dominio.
          </p>
          <Button className="gap-1.5" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Crea il primo rivenditore
          </Button>
        </div>
      ) : (
        <ul className="space-y-2">
          {rivenditori.map((r) => (
            <li key={r.id} className="flex items-center justify-between rounded-xl border bg-card p-4">
              <div className="min-w-0">
                <div className="truncate font-medium">{r.name}</div>
                <div className="text-xs text-muted-foreground">
                  Creato il {new Date(r.created_at).toLocaleDateString("it-IT")}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant={r.status === "active" ? "default" : "secondary"}>{r.status ?? "—"}</Badge>
                <Badge variant="outline">{r.billing_comped ? "Pago io" : "Paga lui"}</Badge>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Crea rivenditore</DialogTitle>
            <DialogDescription>
              Crea l'area dedicata di un rivenditore col tuo brand. Riceverà un invito via email per impostare la password.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="r-nome">Nome rivenditore</Label>
              <Input id="r-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Es. Serramenti Bianchi" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-email">Email admin rivenditore</Label>
              <Input id="r-email" type="email" value={emailAdmin} onChange={(e) => setEmailAdmin(e.target.value)} placeholder="admin@serramentibianchi.it" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={crea.isPending}>Annulla</Button>
            <Button onClick={() => crea.mutate()} disabled={crea.isPending} className="gap-1.5">
              {crea.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Crea
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
