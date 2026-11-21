import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function StudioPageHeader({
  title, description, icon: Icon, action,
}: {
  title: string;
  description?: string;
  icon: LucideIcon;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 border-b border-border/70 pb-5">
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-100/75 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 sm:size-12">
          <Icon aria-hidden="true" className="size-5" />
        </div>
        <div className="min-w-0">
          <h1 className="break-words text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
          {description && <p className="mt-0.5 break-words text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {action && <div className="max-w-full">{action}</div>}
    </header>
  );
}
