/**
 * PaywallCard — fallback standard per `<FeatureGate>` quando una feature è
 * disabilitata e vogliamo mostrare un "upgrade nudge" inline invece di
 * nascondere il contenuto (null fallback).
 *
 * Uso tipico:
 *   <FeatureGate
 *     featureKey="ai_render"
 *     fallback={<PaywallCard featureKey="ai_render" title="Render fotorealistici AI" />}
 *   >
 *     <RenderButton />
 *   </FeatureGate>
 *
 * Variante inline (più compatta) da mettere accanto a un pulsante disabilitato:
 *   <PaywallCard featureKey="ai_render" variant="inline" />
 *
 * Il componente NON esegue check: è un componente presentazionale che dà per
 * scontato che il caller abbia già verificato che la feature sia bloccata.
 * La logica di gating resta nel `FeatureGate` padre o nel `useFeatureAccess`.
 */

import { Link } from "react-router-dom";
import { Lock, ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface PaywallCardProps {
  /** Chiave della feature (serve solo per passare a UpgradePage via state). */
  featureKey?: string;
  /** Titolo user-friendly (es. "Render fotorealistici AI"). */
  title?: string;
  /** Descrizione breve di cosa si sbloccherebbe. */
  description?: string;
  /** Nome del piano richiesto (es. "Professional"). */
  requiredPlan?: string;
  /** Prezzo addon mensile (es. "29€/mese"). */
  pricePerMonth?: string;
  /** Variante visuale: `card` (default), `inline` (compatta), `minimal` (solo testo + link). */
  variant?: "card" | "inline" | "minimal";
  /** Override destinazione CTA. Default: /azienda/impostazioni/abbonamento. */
  upgradeHref?: string;
}

const DEFAULT_UPGRADE_HREF = "/azienda/impostazioni/abbonamento";

export function PaywallCard({
  featureKey,
  title = "Funzionalità non inclusa",
  description = "Questa funzionalità non è attiva sul tuo piano. Aggiorna l'abbonamento per sbloccarla.",
  requiredPlan,
  pricePerMonth,
  variant = "card",
  upgradeHref = DEFAULT_UPGRADE_HREF,
}: PaywallCardProps) {
  // Passiamo featureKey via state così UpgradePage può mostrarla.
  const linkTo = {
    pathname: upgradeHref,
    search: "",
  };
  const linkState = featureKey ? { deniedFeature: featureKey } : undefined;

  if (variant === "minimal") {
    return (
      <p className="text-sm text-muted-foreground flex items-center gap-2">
        <Lock className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{title}.</span>
        <Link
          to={linkTo}
          state={linkState}
          className="underline hover:text-foreground font-medium"
        >
          Sblocca
        </Link>
      </p>
    );
  }

  if (variant === "inline") {
    return (
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-dashed bg-muted/30 p-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="h-8 w-8 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium text-sm">{title}</p>
              {requiredPlan && (
                <Badge variant="secondary" className="text-xs">
                  {requiredPlan}
                </Badge>
              )}
              {pricePerMonth && (
                <Badge variant="outline" className="text-xs">
                  {pricePerMonth}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        <Button asChild size="sm" className="shrink-0 w-full sm:w-auto">
          <Link to={linkTo} state={linkState}>
            Sblocca
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    );
  }

  // variant === "card"
  return (
    <Card className="border-dashed">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">{title}</CardTitle>
              {requiredPlan && (
                <Badge variant="secondary" className="text-xs">
                  {requiredPlan}
                </Badge>
              )}
              {pricePerMonth && (
                <Badge variant="outline" className="text-xs">
                  {pricePerMonth}
                </Badge>
              )}
            </div>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col sm:flex-row gap-2">
        <Button asChild className="w-full sm:w-auto">
          <Link to={linkTo} state={linkState}>
            Vedi piani disponibili
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
        <Button asChild variant="outline" className="w-full sm:w-auto">
          <a href="mailto:commerciale@ediliziaincloud.it?subject=Richiesta%20attivazione%20funzionalità">
            Contatta il commerciale
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}
