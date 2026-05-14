import { AlertTriangle, Home, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LoadingTimeoutFallbackProps {
  title: string;
  description: string;
  detail?: string;
  onRetry?: () => void;
  retryLabel?: string;
  homePath?: string;
}

export function LoadingTimeoutFallback({
  title,
  description,
  detail,
  onRetry,
  retryLabel = "Riprova",
  homePath = "/azienda",
}: LoadingTimeoutFallbackProps) {
  const handleReload = () => {
    if (onRetry) {
      onRetry();
      return;
    }
    window.location.reload();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
        {detail && (
          <p className="mt-3 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            {detail}
          </p>
        )}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={handleReload}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {retryLabel}
          </Button>
          <Button variant="outline" onClick={() => { window.location.href = homePath; }}>
            <Home className="mr-2 h-4 w-4" />
            Vai alla home
          </Button>
        </div>
      </div>
    </div>
  );
}
