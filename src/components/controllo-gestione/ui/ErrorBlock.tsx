import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface ErrorBlockProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export function ErrorBlock({
  title = "Non sono riuscito a caricare i dati",
  message = "Riprova tra qualche secondo. Se il problema persiste, contatta il supporto.",
  onRetry,
}: ErrorBlockProps) {
  const t = useT();
  return (
    <Alert variant="destructive" className="rounded-2xl">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>{t(title)}</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>{t(message)}</p>
        {onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry}>
            {t("Riprova")}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
