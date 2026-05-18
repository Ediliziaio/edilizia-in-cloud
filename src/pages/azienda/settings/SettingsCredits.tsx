/**
 * SettingsCredits — Pagina Crediti & Saldo (refactored).
 *
 * Tab:
 *   1. Riepilogo: KPI globali + 4 wallet card + grafico consumo
 *   2. Auto Top-up: configurazione per wallet (email/AI/whatsapp)
 *   3. Storico: tabella unificata filtrata per wallet/tipo/data
 *
 * Sostituisce 952 righe duplicative con architettura pulita basata su:
 *   - useWallets() hook centralizzato
 *   - <WalletCard /> componente riusabile
 *   - <RechargeDialog /> dialog ricarica generico per i 4 wallet
 *   - <AutoTopupConfig /> form auto top-up generico
 *   - <CreditsHistory /> storico unificato con filtri
 *   - <ConsumoForecastChart /> grafico forecast con Recharts
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
import { RechargeDialog } from "@/components/credits/RechargeDialog";
import { AutoTopupConfig } from "@/components/credits/AutoTopupConfig";
import { CreditsHistory } from "@/components/credits/CreditsHistory";
import { ConsumoForecastChart } from "@/components/credits/ConsumoForecastChart";
import { EmailQuotaWidget } from "@/components/email-marketing/EmailQuotaWidget";
import TeamAIUsage from "@/components/credits/TeamAIUsage";
import {
  Wallet, AlertTriangle, TrendingDown, Zap, Clock, Mail, Bot,
} from "lucide-react";
import { computeCreditForecast } from "@/lib/creditForecasting";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { subDays } from "date-fns";

const LOW_BALANCE_THRESHOLD = 5;

/**
 * @prop embedded — Se true, nasconde l'h1 header (la pagina è già montata
 *                  dentro un tab con titolo proprio, evita doppio h1 a11y/SEO).
 */
interface SettingsCreditsProps {
  embedded?: boolean;
}

export default function SettingsCredits({ embedded = false }: SettingsCreditsProps = {}) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const [searchParams] = useSearchParams();
  // v8.6.61 — "riepilogo" rimosso dai Tabs (è sempre visibile in alto).
  // Tabs ora gestisce solo i 3 contenuti opzionali: team_ai / topup / storico.
  const [activeTab, setActiveTab] = useState<"team_ai" | "topup" | "storico">("topup");
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
      {/* ── Header ──────────────────────────────────────────────────── */}
      {/* v8.6.59 — in modalità embedded (es. tab Portafoglio della dashboard
          abbonamento) nascondiamo l'h1 per evitare doppio heading; saldo
          totale mostrato comunque come riga compatta. */}
      {embedded ? (
        // v8.6.60 — Nessun header embedded: il saldo totale è già nella hero
        // card sotto i tabs. Evitiamo la tripla esposizione del valore.
        hasBlocked ? (
          <p className="text-sm font-medium text-destructive">
            ⚠ Uno o più servizi sono bloccati per saldo insufficiente.
          </p>
        ) : null
      ) : (
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Wallet className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Crediti & Saldo</h1>
              <p className="text-sm text-muted-foreground">
                Saldo totale:{" "}
                <span className="font-semibold text-foreground">{formatEur(totalBalanceEur)}</span>
                {hasBlocked && (
                  <>
                    {" · "}
                    <span className="font-medium text-destructive">servizi bloccati</span>
                  </>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Alert globali ───────────────────────────────────────────── */}
      {hasBlocked && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Uno o più servizi sono bloccati</strong> per saldo insufficiente. Ricarica i
            crediti per ripristinare il servizio.
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

      {/* ─── Riepilogo (sempre visibile, sia standalone che embedded) ────── */}
      <div className="space-y-5">
        {/* Hero saldo totale */}
        <Card className="overflow-hidden border-l-4 border-l-primary">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                <Wallet className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Saldo Totale (Email + AI + WhatsApp)
                </p>
                <p className="text-3xl font-bold tabular-nums text-primary">
                  {formatEur(totalBalanceEur)}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Wallet con saldo
              </p>
              <p className="text-sm font-medium tabular-nums">
                {wallets.filter((w) => w.balance > 0).length} su {wallets.length}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* 4 wallet card */}
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
          <AccordionItem value="topup" className="border rounded-lg px-4">
            <AccordionTrigger className="text-sm font-semibold hover:no-underline">
              <span className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-muted-foreground" />
                Auto-ricarica
                <span className="text-xs font-normal text-muted-foreground">
                  Configura le ricariche automatiche per evitare blocchi
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="pt-2 pb-4 space-y-3">
              <Alert className="border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                <Zap className="h-4 w-4 text-emerald-600" />
                <AlertDescription className="text-emerald-900 dark:text-emerald-200 text-xs">
                  <strong>Auto-ricarica attiva di default</strong> con soglia €5 e ricarica €25.
                  La ricarica scatta solo se hai una carta salvata su Stripe — effettua una
                  ricarica manuale almeno una volta per associarla.
                </AlertDescription>
              </Alert>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <AutoTopupConfig walletType="email" />
                <AutoTopupConfig walletType="ai" />
                <AutoTopupConfig walletType="whatsapp" />
                <AutoTopupConfig walletType="render" />
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="storico" className="border rounded-lg px-4">
            <AccordionTrigger className="text-sm font-semibold hover:no-underline">
              <span className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Storico transazioni
                <span className="text-xs font-normal text-muted-foreground">
                  Filtro per wallet, tipo e data
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
                Consumo AI per utente
                <span className="text-xs font-normal text-muted-foreground">
                  Top consumatori del team
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
            <TabsTrigger value="team_ai" className="gap-1.5">
              <Bot className="h-4 w-4" /> Consumo AI Team
            </TabsTrigger>
            <TabsTrigger value="topup" className="gap-1.5">
              <Zap className="h-4 w-4" /> Auto Top-up
            </TabsTrigger>
            <TabsTrigger value="storico" className="gap-1.5">
              <Clock className="h-4 w-4" /> Storico
            </TabsTrigger>
          </TabsList>

          <TabsContent value="topup" className="space-y-4 mt-4">
            <Alert className="border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/50 dark:bg-emerald-950/20">
              <Zap className="h-4 w-4 text-emerald-600" />
              <AlertDescription className="text-emerald-900 dark:text-emerald-200 text-xs">
                <strong>Auto-ricarica attiva di default</strong> con soglia €5 e ricarica €25.
                La ricarica scatta solo se hai una carta salvata su Stripe — effettua una
                ricarica manuale almeno una volta per associarla.
              </AlertDescription>
            </Alert>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <AutoTopupConfig walletType="email" />
              <AutoTopupConfig walletType="ai" />
              <AutoTopupConfig walletType="whatsapp" />
              <AutoTopupConfig walletType="render" />
            </div>
          </TabsContent>

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
