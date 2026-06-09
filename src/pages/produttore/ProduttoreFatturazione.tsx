import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { companyStatusLabelIt } from "@/lib/companyStatusLabel";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  Wallet, Building2, Factory, CreditCard, Info, Check, AlertCircle, RefreshCw, TrendingDown, Receipt,
  Loader2, Plus, ExternalLink,
} from "lucide-react";

type BillingMode = "fabbrica_paga" | "reseller_paga";

interface BillingItem { id: string; name: string; status: string | null; plan_name: string | null; list_price: number; your_price: number }
interface SelfPaid { id: string; name: string; plan_name: string | null; list_price: number; status: string | null }
interface Billing {
  success?: boolean;
  error?: string;
  wholesale_pct: number;
  payment_method: string | null;
  billing_mode: BillingMode;
  items: BillingItem[];
  self_paid: SelfPaid[];
  totals: { list: number; yours: number; saving: number };
}

interface CardInfo { hasMethod: boolean; brand?: string; last4?: string; expMonth?: number; expYear?: number }

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
 * Fatturazione del PRODUTTORE — "Il tuo conto": quanto paghi alla piattaforma per i
 * rivenditori che paghi tu (comped), col prezzo wholesale (listino scontato della %
 * impostata dal super admin). Più il modello di default e i rivenditori che pagano da sé.
 * Riscossione automatica (Stripe) = Step 2.
 */
export default function ProduttoreFatturazione() {
  const { profile, effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id ?? profile?.company_id ?? null;
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: b, isLoading, isError, refetch } = useQuery({
    queryKey: ["produttore-billing", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<Billing> => {
      const { data, error } = await supabase.functions.invoke("get-produttore-billing", { body: {} });
      if (error) throw new Error(error.message);
      const r = data as Billing | null;
      if (!r || r.success === false) throw new Error(r?.error ?? "Errore nel caricamento");
      return r;
    },
  });

  const saveMode = useMutation({
    mutationFn: async (m: BillingMode) => {
      if (!companyId) throw new Error("Azienda non trovata");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("companies").update({ reseller_billing_mode: m }).eq("id", companyId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Modello di fatturazione aggiornato");
      qc.invalidateQueries({ queryKey: ["produttore-billing", companyId] });
    },
    onError: (e) => toast.error("Salvataggio fallito", { description: (e as Error).message }),
  });

  // Stato carta del produttore (riusa stripe-payment-method, già company-agnostico).
  const { data: card, isLoading: cardLoading } = useQuery({
    queryKey: ["produttore-card", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<CardInfo> => {
      const { data, error } = await supabase.functions.invoke("stripe-payment-method", { body: {} });
      if (error) return { hasMethod: false };
      return (data ?? { hasMethod: false }) as CardInfo;
    },
  });

  const addCard = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("create-produttore-setup-session", { body: {} });
      if (error) throw new Error(error.message);
      const url = (data as { url?: string } | null)?.url;
      if (!url) throw new Error("URL di pagamento non disponibile");
      return url;
    },
    onSuccess: (url) => { window.location.href = url; },
    onError: (e) => toast.error("Impossibile avviare l'inserimento carta", { description: (e as Error).message }),
  });

  const managePortal = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("customer-portal", { body: {} });
      if (error) throw new Error(error.message);
      const url = (data as { url?: string } | null)?.url;
      if (!url) throw new Error("URL del portale non disponibile");
      return url;
    },
    onSuccess: (url) => { window.location.href = url; },
    onError: (e) => toast.error("Impossibile aprire la gestione carta", { description: (e as Error).message }),
  });

  // Ritorno da Stripe Checkout (setup): toast + refetch + pulizia del parametro.
  useEffect(() => {
    const setup = searchParams.get("setup");
    if (!setup) return;
    if (setup === "success") {
      toast.success("Carta aggiunta", { description: "Il metodo di pagamento è stato registrato." });
      qc.invalidateQueries({ queryKey: ["produttore-card", companyId] });
    } else if (setup === "cancel") {
      toast.info("Operazione annullata");
    }
    searchParams.delete("setup");
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams, qc, companyId]);

  const serverMode: BillingMode = b?.billing_mode ?? "fabbrica_paga";
  const mode: BillingMode = saveMode.isPending && saveMode.variables ? saveMode.variables : serverMode;
  const pickMode = (m: BillingMode) => { if (m === mode || saveMode.isPending) return; saveMode.mutate(m); };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-44 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  if (isError || !b) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Wallet className="h-6 w-6" /> Fatturazione</h1>
        <div className="mt-6 rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center">
          <AlertCircle className="mx-auto mb-3 h-8 w-8 text-destructive opacity-70" />
          <p className="font-medium">Errore nel caricamento</p>
          <p className="mx-auto mb-4 mt-1 max-w-sm text-sm text-muted-foreground">
            Non è stato possibile caricare il conto. Riprova tra poco.
          </p>
          <Button variant="outline" className="gap-1.5" onClick={() => refetch()}><RefreshCw className="h-4 w-4" /> Riprova</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Wallet className="h-6 w-6" /> Fatturazione</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Quanto paghi per i tuoi rivenditori e con quale modello.
        </p>
      </div>

      {/* Il tuo conto */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Receipt className="h-5 w-5" /> Il tuo conto</CardTitle>
          <CardDescription>Quanto paghi alla piattaforma per i rivenditori che paghi tu (comped).</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-3xl font-bold leading-none">
                €{b.totals.yours}<span className="text-base font-normal text-muted-foreground">/mese</span>
              </div>
              <div className="mt-1.5 text-xs text-muted-foreground">
                {b.wholesale_pct > 0
                  ? <>Listino €{b.totals.list} · <span className="font-medium text-emerald-700">risparmi €{b.totals.saving}</span></>
                  : <>Al prezzo di listino</>}
              </div>
            </div>
            {b.wholesale_pct > 0 && (
              <Badge variant="outline" className="gap-1 border-emerald-200 text-emerald-700">
                <TrendingDown className="h-3.5 w-3.5" /> -{b.wholesale_pct}% wholesale
              </Badge>
            )}
          </div>

          {b.items.length > 0 ? (
            <ul className="mt-4 divide-y rounded-lg border">
              {b.items.map((it) => (
                <li key={it.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{it.name}</div>
                    <div className="text-xs text-muted-foreground">{it.plan_name ?? "—"}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    {b.wholesale_pct > 0 && it.list_price > 0 && (
                      <span className="mr-2 text-xs text-muted-foreground line-through">€{it.list_price}</span>
                    )}
                    <span className="font-semibold">€{it.your_price}</span>
                    <span className="text-xs text-muted-foreground">/mese</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              Nessun rivenditore che paghi tu al momento.
            </p>
          )}

          {/* Metodo di pagamento */}
          <div className="mt-4 rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm">
                <CreditCard className="h-4 w-4 shrink-0 text-muted-foreground" />
                {cardLoading ? (
                  <span className="text-muted-foreground">Verifica metodo di pagamento…</span>
                ) : card?.hasMethod ? (
                  <span>
                    <span className="font-medium capitalize">{card.brand}</span> ···· {card.last4}
                    {card.expMonth && card.expYear && (
                      <span className="text-muted-foreground"> · scad {String(card.expMonth).padStart(2, "0")}/{String(card.expYear).slice(-2)}</span>
                    )}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Nessun metodo di pagamento</span>
                )}
              </div>
              {!cardLoading && (card?.hasMethod ? (
                <Button size="sm" variant="outline" className="gap-1.5" disabled={managePortal.isPending} onClick={() => managePortal.mutate()}>
                  {managePortal.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
                  Gestisci
                </Button>
              ) : (
                <Button size="sm" className="gap-1.5" disabled={addCard.isPending} onClick={() => addCard.mutate()}>
                  {addCard.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Aggiungi carta
                </Button>
              ))}
            </div>
            <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              La riscossione automatica del conto è in arrivo: la carta serve ad attivarla. Per ora la fatturazione è gestita dal nostro team.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Pagano loro */}
      {b.self_paid.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Pagano loro</CardTitle>
            <CardDescription>Rivenditori con abbonamento proprio: pagano la piattaforma direttamente, non sono sul tuo conto.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {b.self_paid.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2.5 text-sm first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{r.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {companyStatusLabelIt(r.status)}{r.plan_name ? ` · ${r.plan_name}` : ""}
                    </div>
                  </div>
                  <Badge variant="outline" className="shrink-0 gap-1 border-blue-200 text-blue-700">
                    <CreditCard className="h-3.5 w-3.5" /> €{r.list_price}/mese
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Modello di default */}
      <Card>
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
    </div>
  );
}
