import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

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
  return (
    <Alert variant="destructive" className="rounded-2xl">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>{message}</p>
        {onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry}>
            Riprova
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
