/**
 * RechargeDialog — Dialog ricarica wallet generico (Email/AI/WhatsApp).
 *
 * Sostituisce 3 tab di ricarica duplicati nel SettingsCredits originale.
 * Config-driven: ogni wallet ha pacchetti standard + custom amount.
 *
 * Sicurezza:
 *   - importo minimo 5€
 *   - importo massimo 1000€ (anti-typo, evita errori)
 *   - chiamata edge function che redireziona a Stripe Checkout
 */

import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { safeRedirect } from "@/utils/safeRedirect";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { Loader2, CreditCard, Mail, Bot, MessageSquare, Image as ImageIcon, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WalletType } from "@/hooks/credits/useWallets";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  walletType: WalletType;
}

interface PackageDef {
  amount: number;
  label?: string; // optional badge
  popular?: boolean;
}

// Pacchetti diversificati: piccolo per try, medio per uso normale, grande per imprese
const PACKAGES: Record<WalletType, PackageDef[]> = {
  email:    [
    { amount: 10 },
    { amount: 25, popular: true, label: "Più scelto" },
    { amount: 50 },
    { amount: 100 },
    { amount: 250, label: "Risparmia 5%" },
    { amount: 500, label: "Risparmia 10%" },
  ],
  ai:       [
    { amount: 10 },
    { amount: 25, popular: true, label: "Più scelto" },
    { amount: 50 },
    { amount: 100 },
    { amount: 250 },
    { amount: 500 },
  ],
  whatsapp: [
    { amount: 10 },
    { amount: 25, popular: true, label: "Più scelto" },
    { amount: 50 },
    { amount: 100 },
    { amount: 250 },
    { amount: 500 },
  ],
  render:   [], // gestito separatamente — pacchetti a quantita
};

// Pacchetti Render: caricati da render_credit_packs (gestiti da super-admin).
// In caso di errore/DB vuoto, fallback ai 3 pack di default per non rompere UX.
interface RenderPackage {
  qty: number;
  priceEur: number;
  label?: string;
  popular?: boolean;
}
const RENDER_PACKAGES_FALLBACK: RenderPackage[] = [
  { qty: 10,  priceEur: 9,  label: "Ricarica veloce" },
  { qty: 30,  priceEur: 25, label: "Top-up mensile", popular: true },
  { qty: 100, priceEur: 69, label: "Render Business" },
];

const META: Record<WalletType, { label: string; icon: React.ReactNode; color: string; checkoutType: string }> = {
  email:    { label: "Email Marketing", icon: <Mail className="h-5 w-5" />,            color: "text-blue-600",    checkoutType: "email_credits" },
  ai:       { label: "Agenti AI",       icon: <Bot className="h-5 w-5" />,             color: "text-violet-600",  checkoutType: "ai_credits" },
  whatsapp: { label: "WhatsApp",        icon: <MessageSquare className="h-5 w-5" />,   color: "text-emerald-600", checkoutType: "whatsapp_credits" },
  render:   { label: "Render AI",       icon: <ImageIcon className="h-5 w-5" />,       color: "text-amber-600",   checkoutType: "render_credits" },
};

export function RechargeDialog({ open, onOpenChange, walletType }: Props) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const meta = META[walletType];
  const [customAmount, setCustomAmount] = useState("");
  const [loadingAmount, setLoadingAmount] = useState<number | null>(null);

  // Stima email/SMS per importo
  const { data: pricePerUnit } = useQuery({
    queryKey: ["wallet-unit-price", walletType],
    queryFn: async () => {
      if (walletType !== "email") return null;
      const { data } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", "credits_email_price_per_email")
        .maybeSingle();
      return parseFloat(data?.value || "0.003");
    },
    enabled: walletType === "email",
  });

  // Pacchetti Render dinamici dal DB (gestiti via super-admin).
  // Se la query fallisce o non torna righe, fallback su array hardcoded.
  const { data: renderPacks } = useQuery({
    queryKey: ["render-credit-packs-active"],
    queryFn: async (): Promise<RenderPackage[]> => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("v_active_render_packs" as any)
        .select("sku, label, credits_amount, price_eur, sort_order")
        .order("sort_order", { ascending: true });
      if (error || !data || data.length === 0) return RENDER_PACKAGES_FALLBACK;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = data as any[];
      // Marca come "popular" il pack a sort_order=2 (Top-up mensile) o il primo medio
      const popularSort = 2;
      return rows.map((r) => ({
        qty: Number(r.credits_amount),
        priceEur: Number(r.price_eur),
        label: r.label ?? undefined,
        popular: Number(r.sort_order) === popularSort,
      }));
    },
    enabled: walletType === "render" && open,
    staleTime: 5 * 60 * 1000,
  });
  const RENDER_PACKAGES = renderPacks ?? RENDER_PACKAGES_FALLBACK;

  async function purchase(amount: number) {
    if (!companyId) {
      toast.error("Sessione non valida");
      return;
    }
    if (amount < 5) {
      toast.error("Importo minimo: €5");
      return;
    }
    if (amount > 1000) {
      toast.error("Importo massimo: €1.000 per ricarica. Per importi superiori contatta il supporto.");
      return;
    }
    setLoadingAmount(amount);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout-session", {
        body: { company_id: companyId, type: meta.checkoutType, amount_eur: amount },
      });
      if (error) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let errBody: any = null;
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const ctx = (error as any).context;
          if (ctx instanceof Response) errBody = await ctx.json();
        } catch { /* ignore */ }
        throw new Error(errBody?.error ?? errBody?.message ?? error.message ?? "Errore");
      }
      if (data?.url) {
        safeRedirect(data.url);
      } else {
        toast.error(data?.error ?? "Errore creazione sessione di pagamento");
      }
    } catch (e) {
      toast.error((e as Error).message ?? "Errore");
    } finally {
      setLoadingAmount(null);
    }
  }

  /** Per render: pacchetto a quantita fissa, edge function riceve qty non amount_eur */
  async function purchaseRender(qty: number) {
    if (!companyId) { toast.error("Sessione non valida"); return; }
    setLoadingAmount(qty);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout-session", {
        body: { company_id: companyId, type: "render_credits", qty },
      });
      if (error) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let errBody: any = null;
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const ctx = (error as any).context;
          if (ctx instanceof Response) errBody = await ctx.json();
        } catch { /* ignore */ }
        throw new Error(errBody?.error ?? errBody?.message ?? error.message ?? "Errore");
      }
      if (data?.url) safeRedirect(data.url);
      else toast.error(data?.error ?? "Errore creazione sessione di pagamento");
    } catch (e) {
      toast.error((e as Error).message ?? "Errore");
    } finally {
      setLoadingAmount(null);
    }
  }

  const packages = PACKAGES[walletType];
  const isRender = walletType === "render";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className={meta.color}>{meta.icon}</span>
            Ricarica crediti {meta.label}
          </DialogTitle>
          <DialogDescription>
            Pagamento sicuro via Stripe (carta o SEPA). I crediti vengono accreditati immediatamente
            dopo il pagamento.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* RENDER: pacchetti speciali a quantita fissa */}
          {isRender && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Pacchetti Render
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {RENDER_PACKAGES.map((pkg) => {
                  const isLoading = loadingAmount === pkg.qty;
                  const pricePerRender = (pkg.priceEur / pkg.qty).toFixed(2);
                  return (
                    <Card
                      key={pkg.qty}
                      className={cn(
                        "cursor-pointer text-center transition-all hover:border-primary hover:shadow-sm",
                        pkg.popular && "border-primary shadow-sm",
                      )}
                      onClick={() => !loadingAmount && purchaseRender(pkg.qty)}
                    >
                      <CardContent className="space-y-2 p-4">
                        {pkg.label && (
                          <p className="text-xs font-medium text-muted-foreground">{pkg.label}</p>
                        )}
                        {pkg.popular && (
                          <Badge className="text-[10px]">Più scelto</Badge>
                        )}
                        <p className="text-3xl font-extrabold text-primary tabular-nums">
                          €{pkg.priceEur}
                        </p>
                        <p className="text-base font-semibold">{pkg.qty} render</p>
                        <p className="text-[11px] text-muted-foreground">
                          €{pricePerRender} / render
                        </p>
                        <Button
                          size="sm"
                          variant={pkg.popular ? "default" : "outline"}
                          className="w-full"
                          disabled={loadingAmount !== null}
                        >
                          {isLoading ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <>Acquista <ArrowRight className="ml-1 h-3 w-3" /></>
                          )}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Ogni render consuma 1 credito. I crediti non scadono.
              </p>
            </div>
          )}

          {/* Pacchetti EUR (email/AI/whatsapp) */}
          {!isRender && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Pacchetti consigliati
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {packages.map((pkg) => {
                const estimatedEmails = pricePerUnit ? Math.floor(pkg.amount / pricePerUnit) : 0;
                const isLoading = loadingAmount === pkg.amount;
                return (
                  <Card
                    key={pkg.amount}
                    className={cn(
                      "cursor-pointer text-center transition-all hover:border-primary hover:shadow-sm",
                      pkg.popular && "border-primary shadow-sm",
                    )}
                    onClick={() => !loadingAmount && purchase(pkg.amount)}
                  >
                    <CardContent className="space-y-2 p-3">
                      {pkg.label && (
                        <Badge
                          variant={pkg.popular ? "default" : "outline"}
                          className="text-[10px]"
                        >
                          {pkg.label}
                        </Badge>
                      )}
                      <p className="text-2xl font-extrabold text-primary tabular-nums">
                        €{pkg.amount}
                      </p>
                      {walletType === "email" && estimatedEmails > 0 && (
                        <p className="text-[10px] text-muted-foreground">
                          ~{estimatedEmails.toLocaleString("it-IT")} email
                        </p>
                      )}
                      <Button
                        size="sm"
                        variant={pkg.popular ? "default" : "outline"}
                        className="w-full"
                        disabled={loadingAmount !== null}
                      >
                        {isLoading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <>
                            Acquista <ArrowRight className="ml-1 h-3 w-3" />
                          </>
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
          )}

          {/* Custom amount — non disponibile per render (qty fissa) */}
          {!isRender && (
          <div className="rounded-xl border bg-muted/20 p-3">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Importo personalizzato
            </Label>
            <div className="mt-2 flex items-end gap-2">
              <div className="flex-1">
                <Input
                  type="number"
                  min="5"
                  max="1000"
                  step="5"
                  placeholder="es. 75"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  className="text-lg font-semibold"
                />
                <p className="mt-1 text-[10px] text-muted-foreground">Min €5 · Max €1.000</p>
              </div>
              <Button
                onClick={() => purchase(Math.floor(Number(customAmount)))}
                disabled={
                  !customAmount ||
                  Number.isNaN(Number(customAmount)) ||
                  Number(customAmount) < 5 ||
                  Number(customAmount) > 1000 ||
                  loadingAmount !== null
                }
              >
                {loadingAmount !== null && Number(customAmount) === loadingAmount ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <CreditCard className="mr-1.5 h-4 w-4" />
                )}
                Paga €{customAmount || "—"}
              </Button>
            </div>
          </div>
          )}
        </div>

        <DialogFooter className="text-xs text-muted-foreground">
          🔒 Pagamenti gestiti da Stripe · Conformi PCI-DSS · Ricevuta via email
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
