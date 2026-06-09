import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Settings, Save, AlertCircle, RefreshCw, Loader2 } from "lucide-react";

interface SelfData { name: string | null; email: string | null; sector: string | null }

/**
 * Impostazioni del PRODUTTORE — dati della propria azienda (nome, email).
 * Lettura via RLS (own company); scrittura via update-produttore (che vincola
 * la modifica alla company del chiamante). Il form viene montato solo a dati
 * caricati, così i valori iniziali entrano senza setState-in-effect.
 */
export default function ProduttoreImpostazioni() {
  const { profile, effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id ?? profile?.company_id ?? null;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["produttore-self", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<SelfData> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const { data, error } = await sb.from("companies").select("name, email, sector").eq("id", companyId).maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? { name: null, email: null, sector: null }) as SelfData;
    },
  });

  return (
    <div className="mx-auto max-w-3xl p-6">
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Settings className="h-6 w-6" /> Impostazioni
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">I dati della tua azienda produttore.</p>
      </header>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-9 w-32 rounded-lg" />
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center">
          <AlertCircle className="mx-auto mb-3 h-8 w-8 text-destructive opacity-70" />
          <p className="font-medium">Errore nel caricamento</p>
          <Button variant="outline" className="mt-4 gap-1.5" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" /> Riprova
          </Button>
        </div>
      ) : (
        <SettingsForm key={`${data?.name ?? ""}|${data?.email ?? ""}`} companyId={companyId!} initial={data!} />
      )}
    </div>
  );
}

function SettingsForm({ companyId, initial }: { companyId: string; initial: SelfData }) {
  const qc = useQueryClient();
  const [name, setName] = useState(initial.name ?? "");
  const [email, setEmail] = useState(initial.email ?? "");

  const dirty =
    name.trim() !== (initial.name ?? "").trim() ||
    email.trim() !== (initial.email ?? "").trim();

  const save = useMutation({
    mutationFn: async () => {
      const n = name.trim();
      if (!n) throw new Error("Il nome dell'azienda è obbligatorio");
      const { data: res, error } = await supabase.functions.invoke("update-produttore", {
        body: { name: n, email: email.trim() },
      });
      if (error) throw new Error(error.message);
      const r = res as { success?: boolean; error?: string } | null;
      if (r && r.success === false) throw new Error(r.error ?? "Salvataggio fallito");
    },
    onSuccess: () => {
      toast.success("Impostazioni salvate");
      qc.invalidateQueries({ queryKey: ["produttore-self", companyId] });
    },
    onError: (e) => toast.error("Salvataggio fallito", { description: (e as Error).message }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Dati azienda</CardTitle>
        <CardDescription>Nome ed email di contatto della tua azienda produttore.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="p-name">Nome azienda</Label>
          <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="La tua azienda" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-email">Email di contatto</Label>
          <Input id="p-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="info@tuazienda.it" />
        </div>
        {initial.sector && (
          <div className="space-y-1.5">
            <Label>Settore</Label>
            <Input value={initial.sector} disabled className="capitalize" />
          </div>
        )}
        <div className="flex justify-end">
          <Button className="gap-1.5" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salva
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
