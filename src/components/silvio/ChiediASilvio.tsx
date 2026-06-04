/**
 * ChiediASilvio — pulsante contestuale che apre la pagina "Silvio AI" con una
 * domanda già pre-caricata (deep-link `?ask=`). Permette di portare l'assistente
 * (già integrato col gestionale) dentro ogni scheda: commessa, cliente, fattura…
 *
 * Esempio:
 *   <ChiediASilvio ask={`Analizza la commessa ${codice}: avanzamento, costi vs
 *     preventivo, scadenze e criticità.`} />
 */
import { useNavigate } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type BtnVariant = React.ComponentProps<typeof Button>["variant"];
type BtnSize = React.ComponentProps<typeof Button>["size"];

export function ChiediASilvio({
  ask,
  label = "Chiedi a Silvio",
  variant = "outline",
  size = "sm",
  className,
}: {
  /** Domanda pre-caricata che Silvio riceve all'apertura della pagina. */
  ask: string;
  label?: string;
  variant?: BtnVariant;
  size?: BtnSize;
  className?: string;
}) {
  const navigate = useNavigate();
  const handle = () => {
    const q = ask.trim();
    if (!q) {
      navigate("/azienda/silvio-ai");
      return;
    }
    navigate(`/azienda/silvio-ai?ask=${encodeURIComponent(q)}`);
  };
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={handle}
      className={cn("gap-1.5", className)}
      title="Apri Silvio AI con questa domanda già pronta"
    >
      <Sparkles className="h-4 w-4 text-orange-500" />
      {label}
    </Button>
  );
}

export default ChiediASilvio;
