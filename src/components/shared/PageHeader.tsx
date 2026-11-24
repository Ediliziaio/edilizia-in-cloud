import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  badge?: React.ReactNode;
  backLink?: string;
}

export function PageHeader({ title, description, actions, badge, backLink }: PageHeaderProps) {
  const t = useT();
  return (
    <div className="mb-4 flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between lg:mb-5">
      <div className="min-w-0 sm:flex-1 sm:basis-56">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {backLink && (
            <Link to={backLink} aria-label={t("Torna indietro")} className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground lg:size-8">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </Link>
          )}
          <h1 className="min-w-0 break-words text-xl font-semibold tracking-tight text-foreground">{title}</h1>
          {badge}
        </div>
        {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
      </div>
      {actions && <div className="flex min-w-0 flex-wrap items-center gap-2 max-lg:[&>button]:min-h-11 max-lg:[&>a]:min-h-11">{actions}</div>}
    </div>
  );
}
