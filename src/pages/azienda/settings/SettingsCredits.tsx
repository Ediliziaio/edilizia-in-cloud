/**
 * SettingsCredits — Crediti & saldo.
 *
 * Il credito in euro è uno solo (company_credit_pool dal 07/09/2026): AI, email e WhatsApp attingono tutti da lì,
 * i render si comprano a pacchetti a parte. La pagina mostra il saldo, la ricarica (anche automatica), come si
 * usano i crediti, lo storico e il consumo dell'AI per persona.
 *
 * 09/10/2026: una testata sola (il titolo lo mette il layout delle impostazioni, il saldo sta nel riquadro) e una
 * sola frase per i servizi bloccati, anche dentro Piano abbonamento → Crediti. Nel menu «Ricarica» restano due voci:
 * «Agenti AI» e «WhatsApp» facevano pagare un prodotto Stripe che accredita lo specchio non più letto (vedi
 * stripe-webhook, `ai_credits`/`whatsapp_credits`): chi pagasse da lì non riceverebbe credito. Il webhook non è
 * cambiato; la correzione (far passare quei prodotti da `pool_ricarica`) è un lavoro a parte.
 */

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatEur } from "@/modules/ai-agents/lib/creditCalculator";
import { useWallets, type WalletType } from "@/hooks/credits/useWallets";
import { WalletCard } from "@/components/credits/WalletCard";
import { SmsWalletCard } from "@/components/credits/SmsWalletCard";
import { RechargeDialog } from "@/components/credits/RechargeDialog";
import { UnifiedAutoTopupCard } from "@/components/credits/UnifiedAutoTopupCard";
import { ConsumptionByService } from "@/components/credits/ConsumptionByService";
import { CreditsHistory } from "@/components/credits/CreditsHistory";
import { ConsumoForecastChart } from "@/components/credits/ConsumoForecastChart";
import { EmailQuotaWidget } from "@/components/email-marketing/EmailQuotaWidget";
import TeamAIUsage from "@/components/credits/TeamAIUsage";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  Wallet, AlertTriangle, TrendingDown, Clock, Mail, Bot, Plus, Sparkles,
} from "lucide-react";
import { computeCreditForecast } from "@/lib/creditForecasting";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { subDays } from "date-fns";

const LOW_BALANCE_THRESHOLD = 5;

/**
 * @prop embedded — Se true la pagina è dentro Piano abbonamento → Crediti: cambia solo l'elenco in fondo
 *                  (voci chiuse invece di schede), la testata non c'è in nessuno dei due casi.
 */
interface SettingsCreditsProps {
  embedded?: boolean;
}

export default function SettingsCredits({ embedded = false }: SettingsCreditsProps = {}) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const [searchParams] = useSearchParams();
  // v8.8 — auto-ricarica spostata in alto come card unica (UnifiedAutoTopupCard):
  // i Tabs gestiscono solo storico e consumo AI team.
  const [activeTab, setActiveTab] = useState<"team_ai" | "storico">("storico");
  const { wallets, totalBalanceEur, hasBlocked, isLoading } = useWallets();

  // Dialog state per ricarica
  const [rechargeWallet, setRechargeWallet] = useState<WalletType | null>(null);

  // Toast su success/cancel pagamento
  useEffect(() => {
    const payment = searchParams.get("payment");
    if (payment === "success") {
      toast.success("Pagamento completato! I crediti verranno accreditati a breve.");
    } else if (payment === "cancelled") {
      toast.info("Pagamento annullato.");
    }
  }, [searchParams]);

  // Forecast email per ETA su WalletCard
  const { data: emailLogShort } = useQuery({
    queryKey: ["email-credits-log-forecast", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const from = subDays(new Date(), 14).toISOString();
      const { data } = await supabase
        .from("email_credits_log")
        .select("created_at, amount_eur, type")
        .eq("company_id", companyId)
        .gte("created_at", from)
        .order("created_at", { ascending: true });
      return data ?? [];
    },
    enabled: !!companyId,
  });

  const emailWallet = wallets.find((w) => w.type === "email");
  const emailForecast =
    emailLogShort && emailLogShort.length > 0 && emailWallet
      ? computeCreditForecast(emailWallet.balance, emailLogShort as never, 14)
      : null;

  // Wallets con saldo basso (non bloccati)
  const lowWallets = wallets.filter(
    (w) =>
      w.currency === "eur" &&
      w.balance > 0 &&
      w.balance < LOW_BALANCE_THRESHOLD &&
      !w.blocked,
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Niente testata: il titolo della pagina lo mette già il layout delle impostazioni (un solo h1) e il saldo
          sta nel riquadro qui sotto. Una sola frase per i servizi bloccati, sia qui sia dentro Piano abbonamento. */}
      {hasBlocked && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Uno o più servizi sono fermi</strong> per saldo insufficiente. Ricarica i crediti per farli ripartire.
          </AlertDescription>
        </Alert>
      )}

      {!hasBlocked && lowWallets.length > 0 && (
        <Alert className="border-amber-300 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/20">
          <TrendingDown className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-900 dark:text-amber-200">
            <strong>Saldo in esaurimento</strong> su{" "}
            {lowWallets.map((w) => w.label).join(", ")}. Ricarica prima che i servizi vengano
            sospesi.
          </AlertDescription>
        </Alert>
      )}

      {/* ─── 1. RICARICA (in alto): saldo totale + ricarica manuale + auto ── */}
      <div className="space-y-5">
        {/* Hero saldo totale + bottone Ricarica unico */}
        <Card className="overflow-hidden border-l-4 border-l-primary">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                <Wallet className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Saldo totale
                </p>
                <p className="text-3xl font-bold tabular-nums text-primary">
                  {formatEur(totalBalanceEur)}
                </p>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="lg" className="gap-2">
                  <Plus className="h-4 w-4" /> Ricarica
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {/* Il credito è uno solo: AI, email e WhatsApp si ricaricano da qui. I render hanno i loro pacchetti. */}
                <DropdownMenuItem onClick={() => setRechargeWallet("email")}>
                  <Wallet className="mr-2 h-4 w-4 text-violet-600" /> Crediti (AI, email, WhatsApp)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setRechargeWallet("render")}>
                  <Sparkles className="mr-2 h-4 w-4 text-pink-600" /> Render AI (pacchetti)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </CardContent>
        </Card>

        {/* Auto-ricarica UNICA per tutti i servizi */}
        <UnifiedAutoTopupCard onRecharge={() => setRechargeWallet("email")} />

        {/* ─── 2. COME STAI USANDO I CREDITI (consumi per servizio/periodo) ── */}
        <ConsumptionByService />

        {/* Saldi per servizio (dettaglio + ricarica puntuale) */}
        <div>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <Wallet className="h-3.5 w-3.5" />
            Saldo per servizio
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
            {wallets.map((w) => (
              <WalletCard
                key={w.type}
                wallet={w}
                lowBalanceThreshold={LOW_BALANCE_THRESHOLD}
                daysRemaining={w.type === "email" ? emailForecast?.daysRemaining ?? null : null}
                onRecharge={() => setRechargeWallet(w.type)}
              />
            ))}
            <SmsWalletCard />
          </div>
        </div>

        {/* Quota inclusa nel piano */}
        <div>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <Mail className="h-3.5 w-3.5" />
            Quota inclusa nel piano
          </h2>
          <EmailQuotaWidget />
        </div>

        {/* Grafico consumo email */}
        {emailWallet && (
          <ConsumoForecastChart currentBalanceEur={emailWallet.balance} />
        )}
      </div>

      {/* ─── Sezioni aggiuntive ──────────────────────────────────────────────
          v8.6.61 — In embedded mode (dashboard abbonamento), niente doppio
          livello di tab nested: usiamo Accordion stacked. Standalone tiene i
          Tabs storici per chi naviga direttamente a /crediti. */}
      {embedded ? (
        <Accordion type="multiple" className="space-y-2">
          <AccordionItem value="storico" className="border rounded-lg px-4">
            <AccordionTrigger className="text-sm font-semibold hover:no-underline">
              <span className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Storico transazioni
                <span className="text-xs font-normal text-muted-foreground">
                  Filtra per servizio, tipo e data
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="pt-2 pb-4">
              <CreditsHistory />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="team_ai" className="border rounded-lg px-4">
            <AccordionTrigger className="text-sm font-semibold hover:no-underline">
              <span className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-muted-foreground" />
                Consumo AI per persona
                <span className="text-xs font-normal text-muted-foreground">
                  Chi usa di più
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="pt-2 pb-4">
              <TeamAIUsage />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      ) : (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <TabsList className="h-auto flex-wrap gap-1">
            <TabsTrigger value="storico" className="gap-1.5">
              <Clock className="h-4 w-4" /> Storico
            </TabsTrigger>
            <TabsTrigger value="team_ai" className="gap-1.5">
              <Bot className="h-4 w-4" /> Consumo AI per persona
            </TabsTrigger>
          </TabsList>

          <TabsContent value="team_ai" className="space-y-4 mt-4">
            <TeamAIUsage />
          </TabsContent>

          <TabsContent value="storico" className="mt-4">
            <CreditsHistory />
          </TabsContent>
        </Tabs>
      )}

      {/* ── Dialog Ricarica ──────────────────────────────────────────── */}
      {rechargeWallet && (
        <RechargeDialog
          open={!!rechargeWallet}
          onOpenChange={(v) => !v && setRechargeWallet(null)}
          walletType={rechargeWallet}
        />
      )}
    </div>
  );
}
