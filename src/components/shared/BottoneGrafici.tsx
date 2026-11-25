import { BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BOTTONE_SECONDARIO } from "@/components/orders/TestataScheda";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

/** Il bottone «Grafici» delle pagine di analisi: acceso in arancio tenue quando i grafici sono aperti. */
export function BottoneGrafici({ aperti, onCambia, className }: { aperti: boolean; onCambia: (aperti: boolean) => void; className?: string }) {
  const t = useT();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-pressed={aperti}
      onClick={() => onCambia(!aperti)}
      className={cn(
        BOTTONE_SECONDARIO,
        "rounded-lg shadow-none",
        aperti && "border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100 dark:border-orange-500/40 dark:bg-orange-500/10 dark:text-orange-300",
        className,
      )}
    >
      <BarChart3 />
      {t("Grafici")}
    </Button>
  );
}
