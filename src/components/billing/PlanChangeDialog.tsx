/**
 * PlanChangeDialog + CancelPlanDialog — secondo step del dialog "Modifica abbonamento".
 *
 * Flusso (stile GHL, tutto in-app fino a Stripe):
 *   Upgrade/Downgrade → popup con i piani del listino (radio card) → "Continua"
 *     → edge customer-portal { flow: "change_plan" } → pagina Stripe di CONFERMA
 *       cambio piano (prorata calcolato da Stripe, nessuna doppia subscription).
 *   Annulla → popup retention: prima i piani più economici come alternativa,
 *     poi "Annulla comunque" → pagina Stripe di annullamento (flow: "cancel").
 *
 * I piani mostrati sono SOLO i full plan globali attivi con prezzo Stripe
 * configurato (Starter/Pro/Enterprise) — mai piani ad-hoc o produttore.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Loader2, Sparkles, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useBillingInfo, useOpenBillingPortal } from "@/hooks/useBilling";
import { formatCurrency } from "@/lib/formatters";

// ─── DATA ─────────────────────────────────────────────────────────────────────

interface SelectablePlan {
  id: string;
  name: string;
  description: string | null;
  priceMonthly: number;
  priceYearly: number;
  features: string[];
  position: number;
  hasYearlyPrice: boolean;
}

/** Full plan globali attivi acquistabili in self-service (con prezzo Stripe). */
function useSelectablePlans() {
  return useQuery({
    queryKey: ["billing-selectable-plans"],
    queryFn: async (): Promise<SelectablePlan[]> => {
      const { data, error } = await supabase
        .from("subscription_plans")
        .select("id, name, description, price_monthly, price_yearly, features, position, stripe_price_monthly_id, stripe_price_yearly_id, is_full_plan, produttore_id, is_active")
        .eq("is_active", true)
        .eq("is_full_plan", true)
        .is("produttore_id", null)
        .not("stripe_price_monthly_id", "is", null)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        priceMonthly: Number(p.price_monthly) || 0,
        priceYearly: Number(p.price_yearly) || 0,
        features: Array.isArray(p.features) ? (p.features as string[]).filter((f) => typeof f === "string") : [],
        position: p.position ?? 0,
        hasYearlyPrice: !!p.stripe_price_yearly_id,
      }));
    },
    staleTime: 30 * 60 * 1000,
  });
}

// ─── UI: radio card singolo piano (stile modal-pricing) ──────────────────────

function PlanOptionCard({
  plan, cycle, selected,
}: {
  plan: SelectablePlan;
  cycle: "monthly" | "yearly";
  selected: boolean;
}) {
  const yearly = cycle === "yearly" && plan.hasYearlyPrice;
  const price = yearly ? plan.priceYearly : plan.priceMonthly;
  return (
    <label
      className={`relative flex flex-col p-4 cursor-pointer rounded-xl border-2 transition-all ${
        selected ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/40"
      }`}
    >
      <RadioGroupItem value={plan.id} className="sr-only" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{plan.name}</h3>
          {plan.description && (
            <p className="text-xs text-muted-foreground line-clamp-2">{plan.description}</p>
          )}
        </div>
        <div className="flex items-baseline shrink-0">
          <span className="text-2xl font-bold tabular-nums">{formatCurrency(price)}</span>
          <span className="ml-1 text-xs text-muted-foreground">/{yearly ? "anno" : "mese"}</span>
        </div>
      </div>
      {plan.features.length > 0 && (
        <ul className="space-y-1.5 mt-3">
          {plan.features.slice(0, 4).map((feature) => (
            <li key={feature} className="flex items-start text-xs text-muted-foreground">
              <Check className="w-3.5 h-3.5 mr-1.5 mt-px text-primary shrink-0" />
              <span className="min-w-0">{feature}</span>
            </li>
          ))}
          {plan.features.length > 4 && (
            <li className="text-xs text-muted-foreground/70 pl-5">
              + altre {plan.features.length - 4} funzionalità
            </li>
          )}
        </ul>
      )}
      {selected && (
        <span className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
          <Check className="h-3 w-3 text-primary-foreground" />
        </span>
      )}
    </label>
  );
}

// ─── DIALOG: UPGRADE / DOWNGRADE ─────────────────────────────────────────────

export function PlanChangeDialog({
  open, onOpenChange, direction,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  direction: "upgrade" | "downgrade";
}) {
  const { data: billing } = useBillingInfo();
  const { data: plans = [], isLoading } = useSelectablePlans();
  const { mutate: openPortal, isPending } = useOpenBillingPortal();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const cycle: "monthly" | "yearly" = billing?.billingCycle === "yearly" ? "yearly" : "monthly";
  const currentPrice = billing?.planPriceMonthly ?? 0;

  const options = useMemo(
    () =>
      plans.filter((p) =>
        // Confronto sempre sul mensile: è la scala di prezzo dei piani.
        // Il piano identico a quello attuale non è mai un'opzione.
        p.id !== billing?.planId &&
        (direction === "upgrade" ? p.priceMonthly > currentPrice : p.priceMonthly < currentPrice)
      ),
    [plans, billing?.planId, currentPrice, direction]
  );

  const selected = options.find((p) => p.id === selectedId) ?? null;

  const confirm = () => {
    if (!selected) return;
    openPortal({
      flow: "change_plan",
      planId: selected.id,
      billingPeriod: selected.hasYearlyPrice ? cycle : "monthly",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {direction === "upgrade" ? "Scegli il piano superiore" : "Scegli il piano più economico"}
          </DialogTitle>
          <DialogDescription>
            {direction === "upgrade"
              ? "Sblocca più funzionalità da subito. Confermi il cambio su Stripe: paghi solo la differenza pro-rata."
              : "Il cambio è confermato su Stripe: l'eventuale credito residuo viene scalato dai prossimi addebiti."}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : options.length === 0 ? (
          <div className="py-8 text-center space-y-2">
            <p className="font-medium text-sm">
              {direction === "upgrade"
                ? "Sei già sul piano più completo."
                : "Non ci sono piani più economici del tuo."}
            </p>
            <p className="text-xs text-muted-foreground">
              Hai esigenze particolari?{" "}
              <a href="mailto:info@ediliziaincloud.com" className="text-primary hover:underline">Contattaci</a>
            </p>
          </div>
        ) : (
          <RadioGroup
            value={selectedId ?? ""}
            onValueChange={setSelectedId}
            className="gap-3 py-2"
          >
            {options.map((plan) => (
              <PlanOptionCard key={plan.id} plan={plan} cycle={cycle} selected={selectedId === plan.id} />
            ))}
          </RadioGroup>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
          <Button onClick={confirm} disabled={!selected || isPending} className="w-full">
            {isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
            {selected ? `Continua con ${selected.name}` : "Seleziona un piano"}
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="w-full">
            Annulla
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── DIALOG: ANNULLAMENTO (con retention) ────────────────────────────────────

export function CancelPlanDialog({
  open, onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: billing } = useBillingInfo();
  const { data: plans = [] } = useSelectablePlans();
  const { mutate: openPortal, isPending } = useOpenBillingPortal();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Distinguo quale azione è partita per mostrare lo spinner giusto.
  const [action, setAction] = useState<"downgrade" | "cancel" | null>(null);

  const cycle: "monthly" | "yearly" = billing?.billingCycle === "yearly" ? "yearly" : "monthly";
  const currentPrice = billing?.planPriceMonthly ?? 0;

  const cheaper = useMemo(
    () => plans.filter((p) => p.id !== billing?.planId && p.priceMonthly < currentPrice),
    [plans, billing?.planId, currentPrice]
  );
  const selected = cheaper.find((p) => p.id === selectedId) ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-rose-500" />
            Prima di annullare…
          </DialogTitle>
          <DialogDescription>
            {cheaper.length > 0
              ? "Perderai commesse, fatture e documenti attivi. Un piano più economico ti mantiene tutto a meno."
              : "Perderai l'accesso a commesse, fatture e documenti al termine del periodo già pagato."}
          </DialogDescription>
        </DialogHeader>

        {cheaper.length > 0 && (
          <RadioGroup
            value={selectedId ?? ""}
            onValueChange={setSelectedId}
            className="gap-3 py-2"
          >
            {cheaper.map((plan) => (
              <PlanOptionCard key={plan.id} plan={plan} cycle={cycle} selected={selectedId === plan.id} />
            ))}
          </RadioGroup>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
          {cheaper.length > 0 && (
            <Button
              disabled={!selected || isPending}
              className="w-full"
              onClick={() => {
                if (!selected) return;
                setAction("downgrade");
                openPortal({
                  flow: "change_plan",
                  planId: selected.id,
                  billingPeriod: selected.hasYearlyPrice ? cycle : "monthly",
                });
              }}
            >
              {isPending && action === "downgrade" ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
              {selected ? `Passa a ${selected.name}` : "Scegli un piano più economico"}
            </Button>
          )}
          <Button
            variant="ghost"
            disabled={isPending}
            className="w-full text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30"
            onClick={() => {
              setAction("cancel");
              openPortal({ flow: "cancel" });
            }}
          >
            {isPending && action === "cancel" ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
            Voglio comunque annullare il piano
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending} className="w-full">
            Ho cambiato idea, resto così
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
