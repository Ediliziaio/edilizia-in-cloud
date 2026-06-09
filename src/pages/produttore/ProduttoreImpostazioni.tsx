import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Settings, Save, AlertCircle, RefreshCw, Loader2, KeyRound, Mail, ShieldCheck,
  Globe, Users, Factory, CreditCard, Package, Percent, Hash,
} from "lucide-react";

interface SelfData {
  name: string | null;
  email: string | null;
  sector: string | null;
  billing_mode: "fabbrica_paga" | "reseller_paga";
  wholesale_pct: number;
  reseller_limit: number;
  plan_name: string | null;
  custom_domain: string | null;
  custom_domain_verified: boolean;
  rivenditori_count: number;
}

/**
 * Impostazioni del PRODUTTORE — accesso (email + password), dati azienda e
 * panoramica. Password/email passano da supabase.auth (self-service); i dati
 * azienda da update-produttore; le info in lettura via RLS (azienda propria).
 */
export default function ProduttoreImpostazioni() {
  const { profile, effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id ?? profile?.company_id ?? null;
  const loginEmail = (profile as { email?: string | null } | null)?.email ?? "";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["produttore-self", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<SelfData> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const [compRes, brandRes, countRes] = await Promise.all([
        sb.from("companies")
          .select("name, email, sector, reseller_billing_mode, reseller_wholesale_pct, reseller_limit, subscription_plans:subscription_plan_id(name)")
          .eq("id", companyId).maybeSingle(),
        sb.from("company_branding").select("custom_domain, custom_domain_verified").eq("company_id", companyId).maybeSingle(),
        sb.from("companies").select("id", { count: "exact", head: true }).eq("parent_company_id", companyId),
      ]);
      if (compRes.error) throw new Error(compRes.error.message);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const c = (compRes.data ?? {}) as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b = (brandRes.data ?? {}) as any;
      return {
        name: c.name ?? null,
        email: c.email ?? null,
        sector: c.sector ?? null,
        billing_mode: (c.reseller_billing_mode ?? "fabbrica_paga") as SelfData["billing_mode"],
        wholesale_pct: Number(c.reseller_wholesale_pct ?? 0),
        reseller_limit: Number(c.reseller_limit ?? 0),
        plan_name: c.subscription_plans?.name ?? null,
        custom_domain: b.custom_domain ?? null,
        custom_domain_verified: !!b.custom_domain_verified,
        rivenditori_count: countRes.count ?? 0,
      };
    },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Settings className="h-6 w-6" /> Impostazioni
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Accesso, dati azienda e panoramica del tuo portale.</p>
      </header>

      <AccountCard key={loginEmail} loginEmail={loginEmail} />

      {isLoading ? (
        <Skeleton className="h-48 w-full rounded-xl" />
      ) : isError ? (
        <Card>
          <CardContent className="py-8 text-center">
            <AlertCircle className="mx-auto mb-3 h-8 w-8 text-destructive opacity-70" />
            <p className="font-medium">Errore nel caricamento</p>
            <Button variant="outline" className="mt-4 gap-1.5" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" /> Riprova
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <SettingsForm key={`${data?.name ?? ""}|${data?.email ?? ""}`} companyId={companyId!} initial={data!} />
          <InfoCard data={data!} />
        </>
      )}
    </div>
  );
}

function AccountCard({ loginEmail }: { loginEmail: string }) {
  const [email, setEmail] = useState(loginEmail);
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");

  const changeEmail = useMutation({
    mutationFn: async () => {
      const e = email.trim().toLowerCase();
      if (!e.includes("@")) throw new Error("Email non valida");
      const { error } = await supabase.auth.updateUser({ email: e });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => toast.success("Email di conferma inviata", { description: "Controlla la nuova casella per confermare il cambio." }),
    onError: (e) => toast.error("Cambio email fallito", { description: (e as Error).message }),
  });

  const changePassword = useMutation({
    mutationFn: async () => {
      if (newPw.length < 8) throw new Error("La password deve avere almeno 8 caratteri");
      if (newPw !== confirmPw) throw new Error("Le password non coincidono");
      const { error } = await supabase.auth.updateUser({ password: newPw });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Password aggiornata"); setNewPw(""); setConfirmPw(""); },
    onError: (e) => toast.error("Cambio password fallito", { description: (e as Error).message }),
  });

  const emailDirty = email.trim().toLowerCase() !== loginEmail.trim().toLowerCase();
  const pwValid = newPw.length >= 8 && newPw === confirmPw;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-5 w-5" /> Accesso</CardTitle>
        <CardDescription>Email e password con cui accedi al portale.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="acc-email" className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> Email di accesso</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input id="acc-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
            <Button variant="outline" className="gap-1.5 sm:w-auto" disabled={!emailDirty || changeEmail.isPending} onClick={() => changeEmail.mutate()}>
              {changeEmail.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Cambia email
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Cambiandola riceverai un'email di conferma sul nuovo indirizzo.</p>
        </div>

        <div className="space-y-1.5 border-t pt-4">
          <Label className="flex items-center gap-1.5"><KeyRound className="h-3.5 w-3.5" /> Cambia password</Label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="Nuova password" autoComplete="new-password" />
            <Input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} placeholder="Conferma password" autoComplete="new-password" />
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">Almeno 8 caratteri.</p>
            <Button className="gap-1.5" disabled={!pwValid || changePassword.isPending} onClick={() => changePassword.mutate()}>
              {changePassword.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Aggiorna password
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
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

function InfoCard({ data }: { data: SelfData }) {
  const rows = [
    {
      Icon: Globe, label: "Dominio",
      value: data.custom_domain
        ? <span className="inline-flex items-center gap-1">{data.custom_domain}{data.custom_domain_verified ? <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> : <Badge variant="outline" className="text-[10px]">in attesa</Badge>}</span>
        : <span className="text-muted-foreground">Non configurato</span>,
    },
    { Icon: Users, label: "Rivenditori", value: <>{data.rivenditori_count}{data.reseller_limit > 0 ? <span className="text-muted-foreground"> / {data.reseller_limit}</span> : ""}</> },
    { Icon: data.billing_mode === "reseller_paga" ? CreditCard : Factory, label: "Modello di fatturazione", value: data.billing_mode === "reseller_paga" ? "Paga ogni rivenditore" : "Paghi tu per tutti" },
    { Icon: Percent, label: "Sconto wholesale", value: `${data.wholesale_pct}%` },
    { Icon: Hash, label: "Tetto rivenditori", value: data.reseller_limit > 0 ? String(data.reseller_limit) : "Illimitato" },
    { Icon: Package, label: "Piano predefinito nuovi rivenditori", value: data.plan_name ?? "—" },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Panoramica</CardTitle>
        <CardDescription>Le impostazioni del tuo portale (in sola lettura).</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="divide-y">
          {rows.map(({ Icon, label, value }) => (
            <div key={label} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
              <dt className="flex items-center gap-2 text-sm text-muted-foreground"><Icon className="h-4 w-4" /> {label}</dt>
              <dd className="text-right text-sm font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
