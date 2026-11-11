import { Link, useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RenderCreditsWidget } from "./RenderCreditsWidget";
import { RenderArchivePanel } from "./RenderArchivePanel";
import { useAuth } from "@/contexts/AuthContext";
import { useRenderHistory } from "@/lib/render/renderHistory";

export type RenderModuleHubStep = {
  icon: LucideIcon;
  title: string;
  description: string;
};

export type RenderModuleHubConfig = {
  moduleId: string;
  moduleName: string;
  breadcrumbLabel: string;
  badgeLabel: string;
  title: string;
  description: string;
  icon: LucideIcon;
  accentClassName: string;
  iconBgClassName: string;
  newPath?: string;
  galleryPath?: string;
  newButtonLabel?: string;
  galleryButtonLabel?: string;
  workflow: RenderModuleHubStep[];
  qualityCards: RenderModuleHubStep[];
  emptyTitle: string;
  emptyDescription: string;
  sessionTitle?: string;
  sessionDescription?: string;
  recentDescription?: string;
  unavailableTitle?: string;
  unavailableDescription?: string;
  imageFit?: "cover" | "contain";
};

export function RenderModuleHubPage({
  moduleId,
  moduleName,
  title,
  description,
  icon: Icon,
  iconBgClassName,
  newPath,
  newButtonLabel = "Nuovo render",
  workflow,
  qualityCards,
}: RenderModuleHubConfig) {
  const { effectiveCompany } = useAuth();
  const navigate = useNavigate();
  const companyId = effectiveCompany?.id;
  const history = useRenderHistory(companyId, moduleId);
  const start = newPath ? () => navigate(newPath) : undefined;
  return (
    <div className="space-y-5 sm:space-y-7">
      <Button asChild variant="ghost" size="sm" className="-ml-3">
        <Link to="/azienda/render">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Tutti i render
        </Link>
      </Button>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span
            className={`hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl sm:flex ${iconBgClassName}`}
          >
            <Icon className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {description}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <RenderCreditsWidget />
          {start && (
            <Button onClick={start} size="sm">
              <Plus className="mr-1.5 h-4 w-4" />
              {newButtonLabel}
            </Button>
          )}
        </div>
      </header>
      <RenderArchivePanel
        key={`${companyId}:${moduleId}`}
        title={`Archivio ${moduleName.toLowerCase()}`}
        modules={[{ id: moduleId, title: moduleName }]}
        items={history.items}
        companyId={companyId}
        total={history.total}
        isLoading={history.isLoading}
        isFetching={history.isFetching}
        error={history.isError && !history.items.length ? history.error : null}
        onRefresh={() => {
          void history.refetch();
        }}
        hasMore={history.hasNextPage}
        loadingMore={history.isFetchingNextPage}
        moreError={history.isFetchNextPageError}
        scanning={history.scanAll}
        onLoadMore={() => {
          void history.fetchNextPage();
        }}
        onExpandHistory={history.expandHistory}
        onNewRender={start}
      />
      <details className="rounded-xl border p-4">
        <summary className="cursor-pointer text-sm font-medium">
          Come ottenere un buon risultato
        </summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...workflow, ...qualityCards].map((step, index) => (
            <div key={index} className="text-sm">
              <p className="font-medium">{step.title}</p>
              <p className="mt-1 text-muted-foreground">{step.description}</p>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
