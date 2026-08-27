/**
 * Badge compatto del wallet SMS — mostra crediti residui.
 * Rosso se sotto soglia, arancione se warning, verde se ok.
 */
import { Wallet, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSmsWallet } from "@/hooks/useSmsWallet";
import { Skeleton } from "@/components/ui/skeleton";

interface SmsWalletBadgeProps {
  onRicarica: () => void;
}

export function SmsWalletBadge({ onRicarica }: SmsWalletBadgeProps) {
  const { wallet, isLoadingWallet, creditiResidui, isSottoSoglia, isBlocco } = useSmsWallet();

  if (isLoadingWallet) return <Skeleton className="h-8 w-32" />;
  if (!wallet) return null;

  const isCritical = isBlocco(0);
  const isWarning  = isSottoSoglia(50);

  const colorClass = isCritical
    ? "bg-destructive/10 border-destructive/30 text-destructive"
    : isWarning
    ? "bg-amber-50 border-amber-200 text-amber-700"
    : "bg-emerald-50 border-emerald-200 text-emerald-700";

  return (
    <div className={`flex items-center gap-2 border rounded-lg px-3 py-1.5 text-sm ${colorClass}`}>
      {(isCritical || isWarning) ? (
        <AlertTriangle className="h-4 w-4 shrink-0" />
      ) : (
        <Wallet className="h-4 w-4 shrink-0" />
      )}
      <span className="font-medium tabular-nums">
        {new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" }).format(creditiResidui)}
      </span>
      {isWarning && (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 text-xs px-2 ml-1"
          onClick={onRicarica}
        >
          Ricarica
        </Button>
      )}
    </div>
  );
}
