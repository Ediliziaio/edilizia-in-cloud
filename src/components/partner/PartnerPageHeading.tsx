import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PartnerPageHeading({
  title, description, actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">{description}</p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function PartnerPageLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Button asChild variant="outline" size="sm">
      <Link to={to}>{children}<ArrowRight className="h-4 w-4" /></Link>
    </Button>
  );
}

export function PartnerLoadError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-card p-4">
      <div className="flex items-center gap-2 text-sm">
        <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
        {message}
      </div>
      <Button variant="outline" size="sm" onClick={retry}>Riprova</Button>
    </div>
  );
}
