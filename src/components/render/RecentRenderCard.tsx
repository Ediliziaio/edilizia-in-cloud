import { useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  FileEdit,
  Image as ImageIcon,
  LayoutPanelTop,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  getRenderDetailPath,
  renderDetailWithReturn,
} from "@/lib/render/renderNavigation";
import {
  formatRenderDate,
  isRenderStale,
  normalizeRenderStatus,
  renderStatusLabel,
} from "@/lib/render/renderStatus";
import {
  recentRenderImage,
  recentRenderTitle,
  type RecentRender,
} from "@/lib/render/recentRenders";

function RenderPreview({
  item,
  title,
  list,
}: {
  item: RecentRender;
  title: string;
  list: boolean;
}) {
  const url = recentRenderImage(item);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const status = normalizeRenderStatus(item.status);
  const active = status === "pending" || status === "processing";
  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden bg-slate-100 ${list ? "h-24 w-28 rounded-lg sm:h-28 sm:w-44" : "aspect-[16/10] w-full border-b"}`}
    >
      {url && unavailable !== url ? (
        <img
          src={url}
          alt={title}
          className="h-full w-full object-contain"
          loading="lazy"
          decoding="async"
          onError={() => setUnavailable(url)}
        />
      ) : (
        <div className="flex flex-col items-center gap-2 px-2 text-center text-slate-500">
          {active ? (
            <Loader2
              className="h-7 w-7 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : (
            <ImageIcon className="h-7 w-7 opacity-50" aria-hidden="true" />
          )}
          <span className="text-xs">
            {active
              ? "Render in preparazione"
              : status === "draft"
                ? "Configurazione da completare"
                : status === "failed"
                  ? "Generazione non riuscita"
                  : "Anteprima non disponibile"}
          </span>
        </div>
      )}
    </div>
  );
}

export function RecentRenderCard({
  item,
  moduleName,
  list,
  returnTo,
  onOpen,
  selection,
  grouped,
}: {
  item: RecentRender;
  moduleName: string;
  list: boolean;
  returnTo?: string;
  onOpen?: () => void;
  selection?: { checked: boolean; disabled: boolean; toggle: () => void };
  grouped?: boolean;
}) {
  const title = recentRenderTitle(item, moduleName);
  const status = normalizeRenderStatus(item.status);
  const stale = isRenderStale(item.status, item.created_at);
  const StatusIcon =
    status === "completed"
      ? CheckCircle2
      : status === "failed" || stale
        ? AlertTriangle
        : status === "draft"
          ? FileEdit
          : Clock;
  const statusClass =
    status === "completed"
      ? "bg-emerald-50 text-emerald-700"
      : status === "failed"
        ? "bg-rose-50 text-rose-700"
        : status === "draft"
          ? "bg-slate-100 text-slate-600"
          : "bg-amber-50 text-amber-800";
  const person = item.meta.contactName || item.meta.opportunityName;
  const Heading = grouped ? "h4" : "h3";
  return (
    <article
      className={`group relative overflow-hidden rounded-xl border bg-card transition-colors hover:border-primary/40 ${list ? "sm:flex sm:items-center" : "flex h-full flex-col"}`}
    >
      {selection && (
        <div
          className={
            list ? "px-3 pt-3 sm:py-3 sm:pr-0" : "absolute right-2 top-2 z-10"
          }
        >
          <label className="flex cursor-pointer items-center gap-1.5 rounded-md border bg-background/95 px-2 py-1 text-[11px]">
            <Checkbox
              aria-label={`Seleziona ${title} del ${formatRenderDate(item.created_at)} per confronto`}
              checked={selection.checked}
              disabled={selection.disabled}
              onCheckedChange={selection.toggle}
            />
            Confronta
          </label>
        </div>
      )}
      <Link
        to={
          returnTo
            ? renderDetailWithReturn(item.render_type, item.id, returnTo)
            : getRenderDetailPath(item.render_type, item.id)
        }
        onClick={onOpen}
        aria-label={`Apri render ${title}${title !== moduleName ? ` · ${moduleName}` : ""} · ${formatRenderDate(item.created_at)}`}
        className={`min-w-0 flex-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${list ? "flex items-center gap-3 p-3 sm:gap-5" : "block"}`}
      >
        <RenderPreview item={item} title={`Render ${title}`} list={list} />
        <div className={`min-w-0 space-y-2 ${list ? "flex-1 py-1" : "p-4"}`}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              {moduleName}
            </span>
            <Badge
              variant="secondary"
              className={`gap-1 border-0 px-2 py-0.5 text-[11px] font-medium ${statusClass}`}
            >
              <StatusIcon className="h-3 w-3" aria-hidden="true" />
              {stale ? "Da verificare" : renderStatusLabel(item.status)}
            </Badge>
          </div>
          <div className="flex items-start justify-between gap-2">
            <Heading
              className="line-clamp-2 text-sm font-semibold leading-snug text-foreground sm:text-base"
              title={title}
            >
              {title}
            </Heading>
            <ArrowUpRight
              className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
              aria-hidden="true"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            <time dateTime={item.created_at}>
              {formatRenderDate(item.created_at)}
            </time>
            {item.meta.createdByName && (
              <span> · {item.meta.createdByName}</span>
            )}
          </p>
          {person && person !== title && (
            <p
              className="truncate text-xs text-muted-foreground"
              title={person}
            >
              {person}
            </p>
          )}
        </div>
      </Link>
      {item.planOrigin && (
        <div
          className={`border-t bg-muted/25 px-4 py-3 ${list ? "sm:w-56 sm:shrink-0 sm:border-l sm:border-t-0" : "mt-auto"}`}
        >
          {item.planOrigin.projectAvailable === false ? (
            <p className="text-xs text-muted-foreground">
              Planimetria non disponibile · versione {item.planOrigin.version}
            </p>
          ) : (
            <Link
              to={item.planOrigin.projectPath}
              onClick={onOpen}
              className="flex min-w-0 items-start gap-2 rounded text-xs text-muted-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label={`Apri planimetria ${item.planOrigin.projectTitle || "collegata"} per ${title}`}
            >
              <LayoutPanelTop
                className="mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              <span className="min-w-0">
                <span
                  className="block truncate font-medium text-foreground"
                  title={item.planOrigin.projectTitle}
                >
                  {item.planOrigin.projectTitle || "Planimetria collegata"}
                </span>
                <span className="mt-0.5 block">
                  Dalla planimetria · versione {item.planOrigin.version}
                </span>
              </span>
            </Link>
          )}
        </div>
      )}
    </article>
  );
}
