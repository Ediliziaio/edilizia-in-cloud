import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Bot, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SilvioHub } from "@/components/silvio/SilvioHub";
export default function SilvioActivityPage() {
  const [params] = useSearchParams();
  const requested = params.get("richiamo") || "";
  const callbackId = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(requested) ? requested : undefined;
  const tab = callbackId || params.get("vista") === "richiami" ? "richiami" : "assistenza";
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-3 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-blue-50 p-3 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
            <Bot className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-semibold">Centro attività di Silvio</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Richieste, conferme e risultati del tuo assistente.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/azienda/silvio-ai">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Chat con Silvio
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/azienda/centralino">
              <Phone className="mr-2 h-4 w-4" />
              Centralino
            </Link>
          </Button>
        </div>
      </div>
      <SilvioHub defaultTab={tab} callbackId={callbackId} />
    </div>
  );
}
