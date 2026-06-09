import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  Wallet, Building2, Factory, CreditCard, Info, Check, Users, BadgeEuro, AlertCircle, RefreshCw,
} from "lucide-react";

type BillingMode = "fabbrica_paga" | "reseller_paga";

interface Riv {
  id: string;
  name: string;
  status: string | null;
  billing_comped: boolean | null;
}

const MODELS: { value: BillingMode; label: string; desc: string; Icon: typeof Factory }[] = [
  {
    value: "fabbrica_paga",
    label: "Paghi tu per tutti",
    desc: "I rivenditori usano il software gratis: ricevi un'unica fattura per tutti i tuoi rivenditori.",
    Icon: Factory,
  },
  {
    value: "reseller_paga",
    label: "Paga ogni rivenditore",
    desc: "Ogni rivenditore ha il proprio abbonamento. Tu non vieni fatturato per i loro account.",
    Icon: Building2,
  },
];

/**
 * Fatturazione del PRODUTTORE — sceglie il modello di billing per i rivenditori
 * e ne vede lo stato. Il modello è il default applicato ai NUOVI rivenditori
 * (create-reseller imposta billing_comped di conseguenza). Webhook Stripe = Fase 3.
 */
export default function ProduttoreFatturazione() {
  const { profile, effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id ?? profile?.company_id ?? null;
  const qc = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["produttore-fatturazione", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      // parent_company_id / reseller_billing_mode / billing_comped non ancora nei tipi generati.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const { data: comp, error: e1 } = await sb
        .from("companies").select("reseller_billing_mode").eq("id", companyId).maybeSingle();
      if (e1) throw new Error(e1.message);
      const { data: rivs, error: e2 } = await sb
        .from("companies")
        .select("id, name, status, billing_comped")
        .eq("parent_company_id", companyId)
        .order("created_at", { ascending: false });
      if (e2) throw new Error(e2.message);
      return {
        mode: (comp?.reseller_billing_mode ?? "fabbrica_paga") as BillingMode,
        rivenditori: (rivs ?? []) as Riv[],
      };
    },
  });

  const saveMode = useMutation({
    mutationFn: async (m: BillingMode) => {
      if (!companyId) throw new Error("Azienda non trovata");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("companies").update({ reseller_billing_mode: m }).eq("id", companyId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Modello di fatturazione aggiornato");
      qc.invalidateQueries({ queryKey: ["produttore-fatturazione", companyId] });
    },
    onError: (e) => toast.error("Salvataggio fallito", { description: (e as Error).message }),
  });

  const rivenditori = data?.rivenditori ?? [];
  const comped = rivenditori.filter((r) => r.billing_comped).length;
  const paganti = rivenditori.length - comped;

  // UI ottimistica senza stato locale: durante il salvataggio mostro il valore
  // in volo (mutation.variables), poi torna a quello del server.
  const serverMode: BillingMode = data?.mode ?? "fabbrica_paga";
  const mode: BillingMode = saveMode.isPending && saveMode.variables ? saveMode.variables : serverMode;

  const pickMode = (m: BillingMode) => {
    if (m === mode || saveMode.isPending) return;
    saveMode.mutate(m);
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-6">
        <Skeleton className="h-9 w-64" />
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Wallet className="h-6 w-6" /> Fatturazione
        </h1>
        <div className="mt-6 rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center">
          <AlertCircle className="mx-auto mb-3 h-8 w-8 text-destructive opacity-70" />
          <p className="font-medium">Errore nel caricamento</p>
          <p className="mx-auto mb-4 mt-1 max-w-sm text-sm text-muted-foreground">
            Non è stato possibile caricare i dati di fatturazione. Riprova tra poco.
          </p>
          <Button variant="outline" className="gap-1.5" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" /> Riprova
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Wallet className="h-6 w-6" /> Fatturazione
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Scegli chi paga il software dei tuoi rivenditori e tieni d&apos;occhio lo stato.
        </p>
      </div>

      {/* KPI */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted"><Users className="h-5 w-5" /></div>
            <div>
              <div className="text-2xl font-bold leading-none">{rivenditori.length}</div>
              <div className="mt-1 text-xs text-muted-foreground">Rivenditori</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700"><Factory className="h-5 w-5" /></div>
            <div>
              <div className="text-2xl font-bold leading-none">{comped}</div>
              <div className="mt-1 text-xs text-muted-foreground">Paghi tu</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-700"><BadgeEuro className="h-5 w-5" /></div>
            <div>
              <div className="text-2xl font-bold leading-none">{paganti}</div>
              <div className="mt-1 text-xs text-muted-foreground">Pagano loro</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Modello */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Modello di fatturazione</CardTitle>
          <CardDescription>
            Si applica ai <strong>nuovi</strong> rivenditori che crei. Quelli esistenti mantengono il modello con cui sono stati creati.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {MODELS.map(({ value, label, desc, Icon }) => {
            const selected = mode === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => pickMode(value)}
                disabled={saveMode.isPending}
                aria-pressed={selected}
                className={cn(
                  "relative rounded-xl border p-4 text-left transition-colors disabled:opacity-70",
                  selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50",
                )}
              >
                {selected && (
                  <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                )}
                <Icon className={cn("h-5 w-5", selected ? "text-primary" : "text-muted-foreground")} />
                <div className="mt-2 font-semibold">{label}</div>
                <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
              </button>
            );
          })}
        </CardContent>
      </Card>

      {/* Elenco rivenditori */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Stato rivenditori</CardTitle>
          <CardDescription>Chi paga per ciascun rivenditore.</CardDescription>
        </CardHeader>
        <CardContent>
          {rivenditori.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              Nessun rivenditore ancora. Creane uno dalla sezione <strong>Rivenditori</strong>.
            </div>
          ) : (
            <ul className="divide-y">
              {rivenditori.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{r.name}</div>
                    <div className="text-xs text-muted-foreground">{r.status ?? "—"}</div>
                  </div>
                  {r.billing_comped ? (
                    <Badge variant="outline" className="shrink-0 gap-1 border-emerald-200 text-emerald-700">
                      <Factory className="h-3.5 w-3.5" /> Paghi tu
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="shrink-0 gap-1 border-blue-200 text-blue-700">
                      <CreditCard className="h-3.5 w-3.5" /> Paga lui
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="mt-5 flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          La riscossione automatica (Stripe) e le fatture aggregate sono in arrivo: per ora questo pannello
          definisce il modello e mostra lo stato. La fatturazione effettiva viene gestita dal nostro team.
        </span>
      </div>
    </div>
  );
}
