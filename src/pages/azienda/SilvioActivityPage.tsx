import { Link, Navigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Bot, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { centralinoCallbackHref } from "@/lib/centralinoNavigation";
import { SilvioHub } from "@/components/silvio/SilvioHub";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
export default function SilvioActivityPage() {
  const t = useT();
  const [params] = useSearchParams();
  const callbackId = params.get("richiamo");
  if (callbackId || params.get("vista") === "richiami" || params.get("tab") === "richiami") {
    return <Navigate to={centralinoCallbackHref(callbackId || undefined)} replace />;
  }
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-3 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-blue-50 p-3 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
            <Bot className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-semibold">{t("Centro attività di Silvio")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("Richieste, conferme e risultati del tuo assistente.")}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/azienda/silvio-ai">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t("Chat con Silvio")}
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/azienda/centralino">
              <Phone className="mr-2 h-4 w-4" />
              {t("Centralino")}
            </Link>
          </Button>
        </div>
      </div>
      <SilvioHub defaultTab="assistenza" />
    </div>
  );
}
