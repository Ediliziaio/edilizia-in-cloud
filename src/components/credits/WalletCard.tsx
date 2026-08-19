/**
 * WalletCard — Card singolo wallet (Email/AI/WhatsApp/Render).
 *
 * Mostra:
 *   - Saldo grande con badge stato (Bloccato / Saldo Basso)
 *   - Speso + Ricaricato (icona freccia)
 *   - CreditUsageBar di consumo
 *   - ETA esaurimento se forecast disponibile
 *   - Bottone "Ricarica" inline che apre dialog (callback onRecharge)
 *
 * Sostituisce il blocco wallet card duplicato dentro SettingsCredits con un
 * componente unico riusabile + più ricco di info.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CreditUsageBar } from "@/modules/ai-agents/components/CreditUsageBar";
import { formatEur } from "@/modules/ai-agents/lib/creditCalculator";
import { cn } from "@/lib/utils";
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, Mail, Bot,
  MessageSquare, Image as ImageIcon, TrendingDown, Zap, Calendar,
} from "lucide-react";
import type { Wallet } from "@/hooks/credits/useWallets";

interface Props {
  wallet: Wallet;
  /** Soglia EUR sotto cui mostrare badge "Saldo basso" (default 5€) */
  lowBalanceThreshold?: number;
  /** ETA esaurimento in giorni (da forecast) — opzionale */
  daysRemaining?: number | null;
  /** Click su "Ricarica" — apre dialog di acquisto */
  onRecharge?: () => void;
  /** Click su "Auto Top-up" — apre config */
  onAutoTopup?: () => void;
}

const ICONS: Record<Wallet["type"], React.ReactNode> = {
  email:    <Mail className="h-5 w-5" />,
  ai:       <Bot className="h-5 w-5" />,
  whatsapp: <MessageSquare className="h-5 w-5" />,
  render:   <ImageIcon className="h-5 w-5" />,
};

const COLORS: Record<Wallet["type"], { border: string; icon: string; bg: string }> = {
  email:    { border: "border-l-blue-500",    icon: "text-blue-600",    bg: "bg-blue-50/50" },
  ai:       { border: "border-l-violet-500",  icon: "text-violet-600",  bg: "bg-violet-50/50" },
  whatsapp: { border: "border-l-emerald-500", icon: "text-emerald-600", bg: "bg-emerald-50/50" },
  render:   { border: "border-l-amber-500",   icon: "text-amber-600",   bg: "bg-amber-50/50" },
};

function formatBalance(w: Wallet, amount: number): string {
  if (w.currency === "count") return `${amount.toLocaleString("it-IT")} render`;
  return formatEur(amount);
}

export function WalletCard({
  wallet,
  lowBalanceThreshold = 5,
  daysRemaining,
  onRecharge,
  onAutoTopup,
}: Props) {
  // Due borsellini: l'omaggio del mese (scade) e la ricarica (resta).
  // Il saldo grande e' la somma — e' quello che il cliente puo' spendere.
  const freeBalance = wallet.freeBalance ?? 0;
  const freeGranted = wallet.freeGranted ?? 0;
  const hasFree = wallet.currency === "eur" && freeGranted > 0;
  const totalBalance = wallet.balance + (wallet.currency === "eur" ? freeBalance : 0);

  const lowBalance =
    wallet.currency === "eur" &&
    totalBalance > 0 &&
    totalBalance < lowBalanceThreshold;
  const colors = COLORS[wallet.type];

  return (
    <Card
      className={cn(
        "overflow-hidden border-l-4 transition-shadow hover:shadow-sm",
        wallet.blocked ? "border-l-destructive bg-rose-50/30" : colors.border,
      )}
    >
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm font-medium">
          <span className={cn("flex items-center gap-2", colors.icon)}>
            {ICONS[wallet.type]}
            <span className="text-foreground">{wallet.label}</span>
          </span>
          {wallet.blocked && (
            <Badge variant="destructive" className="gap-0.5 text-[10px]">
              <AlertTriangle className="h-2.5 w-2.5" />
              Bloccato
            </Badge>
          )}
          {!wallet.blocked && lowBalance && (
            <Badge
              variant="outline"
              className="gap-0.5 border-amber-400 bg-amber-50 text-[10px] text-amber-700"
            >
              <TrendingDown className="h-2.5 w-2.5" />
              Basso
            </Badge>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Saldo principale */}
        <p
          className={cn(
            "text-3xl font-extrabold tabular-nums",
            wallet.blocked && "text-destructive",
          )}
        >
          {formatBalance(wallet, totalBalance)}
        </p>

        {/* Da dove viene il saldo: l'omaggio scade a fine mese, la ricarica no. */}
        {hasFree && (
          <div className="space-y-1 rounded-md bg-muted/50 px-2 py-1.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Zap className="h-3 w-3 text-violet-600" />
                Inclusi nel piano
              </span>
              <span className="tabular-nums font-medium">
                {formatEur(freeBalance)} di {formatEur(freeGranted)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1 text-muted-foreground">
                <ArrowUpRight className="h-3 w-3 text-emerald-600" />
                Ricaricati da te
              </span>
              <span className="tabular-nums font-medium">{formatEur(wallet.balance)}</span>
            </div>
            <p className="pt-0.5 text-[11px] leading-tight text-muted-foreground">
              I crediti inclusi si rinnovano il primo del mese e non si sommano.
              Quelli ricaricati restano finché non li usi.
            </p>
          </div>
        )}

        {/* ETA esaurimento (se forecast disponibile e relevante) */}
        {wallet.currency === "eur" && daysRemaining != null && daysRemaining < 60 && totalBalance > 0 && (
          <div
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs",
              daysRemaining < 7
                ? "bg-rose-100 text-rose-800"
                : daysRemaining < 14
                  ? "bg-amber-100 text-amber-800"
                  : "bg-blue-50 text-blue-800",
            )}
          >
            <Calendar className="h-3 w-3" />
            <span>
              {daysRemaining < 1
                ? "Esaurimento imminente"
                : `~${Math.round(daysRemaining)} giorni di autonomia`}
            </span>
          </div>
        )}

        {/* Storico mini */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-1 text-muted-foreground">
            <ArrowDownRight className="h-3 w-3 text-destructive" />
            <span>
              Speso{" "}
              <strong className="tabular-nums">
                {wallet.currency === "count"
                  ? `${wallet.spent}`
                  : formatEur(wallet.spent)}
              </strong>
            </span>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <ArrowUpRight className="h-3 w-3 text-emerald-500" />
            <span>
              Ricaricato{" "}
              <strong className="tabular-nums">
                {wallet.currency === "count"
                  ? `${wallet.recharged}`
                  : formatEur(wallet.recharged)}
              </strong>
            </span>
          </div>
        </div>

        {/* Barra utilizzo (solo se ha senso) */}
        {wallet.recharged > 0 && (
          <CreditUsageBar
            spentEur={wallet.spent}
            rechargedEur={wallet.recharged}
            label={`Utilizzo ${wallet.label}`}
            unit={wallet.currency}
            unitSuffix={wallet.currency === "count" ? "render" : ""}
          />
        )}

        {/* Azioni */}
        {(onRecharge || onAutoTopup) && (
          <div className="flex gap-2 pt-1">
            {onRecharge && (
              <Button
                size="sm"
                variant={wallet.blocked || lowBalance ? "default" : "outline"}
                className="flex-1"
                onClick={onRecharge}
                disabled={!wallet.rechargeable}
                title={!wallet.rechargeable ? "Disponibile a breve" : undefined}
              >
                <Zap className="mr-1.5 h-3.5 w-3.5" />
                {wallet.rechargeable ? "Ricarica" : "In arrivo"}
              </Button>
            )}
            {onAutoTopup && wallet.rechargeable && (
              <Button
                size="sm"
                variant="outline"
                onClick={onAutoTopup}
                title="Configura ricarica automatica"
              >
                <Zap className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
