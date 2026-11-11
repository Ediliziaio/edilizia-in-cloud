import { lazy, Suspense, useState } from "react";
import {
  Link,
  useLocation,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Download,
  FileEdit,
  GitCompareArrows,
  Loader2,
  Plus,
  Share2,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { renderModuleHubConfigs } from "@/lib/render/renderModuleHubConfigs";
import {
  renderArchiveReturn,
  renderDetailWithReturn,
} from "@/lib/render/renderNavigation";
import {
  asRecord,
  loadRenderVariants,
  loadStoredRender,
  renderSessionSource,
  renderVariantKey,
  storedRenderOriginal,
} from "@/lib/render/renderSessionData";
import { renderPlanOrigin } from "@/lib/render/renderPlanOrigin";
import { savedRenderChoices } from "@/lib/render/renderSavedChoices";
import { formatRenderDate, renderStatusLabel } from "@/lib/render/renderStatus";
import { downloadRenderImage } from "@/lib/render/downloadRenderImage";
import { RenderDetailViewer, RenderImage } from "./RenderDetailViewer";
import { RenderSavedChoices } from "./RenderSavedChoices";
import { RenderProjectContext } from "./RenderProjectContext";
import { RenderCrmSummaryCard } from "./RenderCrmSummaryCard";
import { RenderPdfDownloadButton } from "./RenderPdfDownloadButton";
import type { RenderComparisonTarget } from "./RenderComparisonDialog";

const Comparison = lazy(() => import("./RenderComparisonDialog"));

export function RenderSessionDetailPage({ moduleId }: { moduleId: string }) {
  const { id } = useParams<{ id: string }>();
  const { effectiveCompany } = useAuth();
  const company = effectiveCompany?.id;
  const permissions = usePermissions();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [comparing, setComparing] = useState<RenderComparisonTarget[] | null>(
    null,
  );
  const [downloading, setDownloading] = useState(false);
  const spec = renderModuleHubConfigs[moduleId];
  const source = renderSessionSource(moduleId);
  const back = renderArchiveReturn(
    params.get("torna"),
    spec.galleryPath || `/azienda/render/${moduleId}`,
  );
  const currentPath = `${location.pathname}${location.search}`;
  const detail = useQuery({
    queryKey: ["render-stored-session", company, moduleId, id],
    queryFn: ({ signal }) => loadStoredRender(company!, moduleId, id!, signal),
    enabled: !!company && !!id,
    staleTime: 30_000,
    retry: 1,
    refetchInterval: (query) =>
      ["processing", "pending"].includes(query.state.data?.status ?? "")
        ? 5_000
        : false,
  });
  const session = detail.data;
  const original = useQuery({
    queryKey: [
      "render-stored-original",
      company,
      moduleId,
      id,
      session?.originalPath,
      session?.originalPublicUrl,
    ],
    queryFn: () => storedRenderOriginal(session!),
    enabled: !!session,
    staleTime: 50 * 60 * 1000,
    retry: 1,
  });
  const family = session ? renderVariantKey(session) : null;
  const variants = useInfiniteQuery({
    queryKey: ["render-session-variants", company, family],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      loadRenderVariants(company!, session!, pageParam, signal),
    getNextPageParam: (page) => page.next,
    enabled: !!company && !!session && !!family,
    staleTime: 30_000,
    retry: 1,
  });
  const related = [
    ...new Map(
      (variants.data?.pages.flatMap((page) => page.rows) ?? [])
        .filter((row) => row.id !== id)
        .map((row) => [row.id, row]),
    ).values(),
  ];

  if (detail.isLoading)
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[60dvh] w-full rounded-xl" />
      </div>
    );
  if (detail.isError)
    return (
      <div
        role="alert"
        className="space-y-3 rounded-xl border p-10 text-center"
      >
        <AlertTriangle className="mx-auto h-8 w-8 text-destructive" />
        <h1 className="font-semibold">Impossibile caricare il render</h1>
        <p className="text-sm text-muted-foreground">
          Controlla la connessione e riprova.
        </p>
        <div className="flex justify-center gap-2">
          <Button variant="outline" asChild>
            <Link to={back}>Torna alla galleria</Link>
          </Button>
          <Button onClick={() => void detail.refetch()}>Riprova</Button>
        </div>
      </div>
    );
  if (!session)
    return (
      <div className="space-y-4 py-12 text-center">
        <h1 className="text-lg font-semibold">Render non disponibile</h1>
        <p className="text-sm text-muted-foreground">
          Il risultato non è presente o non è accessibile in questa azienda.
        </p>
        <Button variant="outline" asChild>
          <Link to={back}>Torna alla galleria</Link>
        </Button>
      </div>
    );

  const origin = renderPlanOrigin(session.config);
  const title =
    origin?.roomName ||
    session.title ||
    `Render ${spec.moduleName.toLowerCase()}`;
  const requestedImage = Number(params.get("immagine") || 0);
  const imageIndex =
    Number.isInteger(requestedImage) &&
    requestedImage >= 0 &&
    requestedImage < session.results.length
      ? requestedImage
      : 0;
  const result = session.results[imageIndex];
  const plan = asRecord(session.config.planimetria);
  const sourceLabel =
    plan.partenza === "vista_3d"
      ? "Modello 3D di partenza"
      : plan.partenza === "foto"
        ? "Foto di partenza"
        : "Immagine di partenza";
  const choices = savedRenderChoices(session.config);
  const active =
    session.status === "pending" || session.status === "processing";
  const StatusIcon =
    session.status === "completed"
      ? CheckCircle2
      : session.status === "failed"
        ? AlertTriangle
        : session.status === "draft"
          ? FileEdit
          : Clock;
  const currentTarget: RenderComparisonTarget | null = result
    ? {
        id: session.id,
        module: moduleId,
        url: result,
        title,
        createdAt: session.created_at,
      }
    : null;

  const download = async () => {
    if (!result || downloading) return;
    setDownloading(true);
    try {
      await downloadRenderImage(
        result,
        `render-${moduleId}-${id}-${imageIndex + 1}.png`,
      );
    } catch {
      toast.error("Impossibile scaricare l’immagine. Riprova.");
    } finally {
      setDownloading(false);
    }
  };
  const share = async () => {
    if (!result) return;
    try {
      if (navigator.share) await navigator.share({ title, url: result });
      else {
        await navigator.clipboard.writeText(result);
        toast.success("Link del render copiato");
      }
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError"))
        toast.error("Condivisione non disponibile. Puoi scaricare l’immagine.");
    }
  };

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 pb-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Button asChild variant="outline" size="icon" className="shrink-0">
            <Link to={back} aria-label={`Torna alla galleria ${spec.moduleName.toLowerCase()} con i filtri`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{spec.moduleName}</p>
            <h1 className="mt-1 text-xl font-bold sm:text-2xl">{title}</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatRenderDate(session.created_at)}
              {session.results.length > 1
                ? ` · immagine ${imageIndex + 1} di ${session.results.length}`
                : ""}
            </p>
          </div>
        </div>
        <Badge
          variant={session.status === "failed" ? "destructive" : "secondary"}
          className="gap-1.5"
        >
          <StatusIcon className="h-3.5 w-3.5" />
          {renderStatusLabel(session.status)}
        </Badge>
      </header>

      {active && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-xl border bg-muted/30 p-4"
        >
          <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" />
          <div>
            <p className="text-sm font-medium">
              {session.status === "pending"
                ? "Render in coda"
                : "Elaborazione in corso"}
            </p>
            <p className="text-xs text-muted-foreground">
              Lo stato si aggiorna automaticamente.
            </p>
          </div>
        </div>
      )}
      {session.status === "failed" && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/5 p-4"
        >
          <h2 className="text-sm font-semibold text-destructive">
            Generazione non riuscita
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {session.error ||
              "Apri il modulo per rivedere la configurazione prima di riprovare."}
          </p>
        </div>
      )}
      {session.status === "draft" && (
        <div className="rounded-xl border bg-muted/30 p-4 text-sm">
          La configurazione è da completare. Questa foto non è una generazione
          in coda.
        </div>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          {session.status === "completed" && result ? (
            <>
              <RenderDetailViewer
                key={session.id}
                beforeUrl={original.data}
                afterUrl={result}
                beforeLabel={sourceLabel}
                title={title}
              />
              <div className="flex flex-wrap gap-2 rounded-xl border bg-card p-3">
                <Button
                  size="sm"
                  onClick={() => void download()}
                  disabled={downloading}
                >
                  {downloading ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-1.5 h-4 w-4" />
                  )}
                  Scarica immagine
                </Button>
                <RenderPdfDownloadButton
                  beforeUrl={original.data}
                  beforeLabel={sourceLabel}
                  afterUrl={result}
                  title={title}
                  subtitle={`${spec.moduleName} · ${formatRenderDate(session.created_at)}`}
                  filename={`render-${moduleId}-${id}-${imageIndex + 1}.pdf`}
                  label="PDF del render"
                  allowMobile
                  completeMetadata
                  metadata={[
                    {
                      label: "Data",
                      value: formatRenderDate(session.created_at),
                    },
                    ...(origin
                      ? [
                          { label: "Stanza", value: origin.roomName },
                          {
                            label: "Versione della planimetria",
                            value: origin.version,
                          },
                        ]
                      : []),
                    ...choices.map((choice) => ({
                      label: `${choice.group} · ${choice.label}`,
                      value: choice.value,
                    })),
                  ]}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void share()}
                >
                  <Share2 className="mr-1.5 h-4 w-4" />
                  Condividi
                </Button>
              </div>
            </>
          ) : original.data ? (
            <section className="overflow-hidden rounded-xl border">
              <h2 className="border-b p-3 text-sm font-medium">
                {sourceLabel}
              </h2>
              <RenderImage url={original.data} label={sourceLabel} />
            </section>
          ) : (
            <div className="rounded-xl border border-dashed p-12 text-center text-sm text-muted-foreground">
              {original.isLoading
                ? "Caricamento dell’immagine di partenza…"
                : "Nessuna immagine disponibile per questa sessione."}
            </div>
          )}

          {session.results.length > 1 && (
            <section className="space-y-3 rounded-xl border bg-card p-4">
              <h2 className="text-sm font-semibold">
                Immagini di questa sessione
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {session.results.map((url, index) => (
                  <div key={`${url}:${index}`} className="space-y-2">
                    <button
                      type="button"
                      aria-label={`Mostra immagine ${index + 1}`}
                      aria-pressed={imageIndex === index}
                      onClick={() => {
                        const next = new URLSearchParams(params);
                        next.set("immagine", String(index));
                        setParams(next, { replace: true });
                      }}
                      className={`w-full overflow-hidden rounded-lg border p-1 focus-visible:ring-2 focus-visible:ring-primary ${imageIndex === index ? "border-primary ring-1 ring-primary" : ""}`}
                    >
                      <img
                        src={url}
                        alt={`Risultato ${index + 1}`}
                        className="aspect-video w-full bg-muted object-contain"
                        loading="lazy"
                      />
                      <span className="block py-1 text-xs">
                        Immagine {index + 1}
                      </span>
                    </button>
                    {currentTarget && index !== imageIndex && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto w-full whitespace-normal text-xs"
                        onClick={() =>
                          setComparing([
                            currentTarget,
                            {
                              ...currentTarget,
                              url,
                              title: `${title} · immagine ${index + 1}`,
                            },
                          ])
                        }
                      >
                        Confronta con questa
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {!!family && (
            <section
              className="space-y-3 rounded-xl border bg-card p-4"
              aria-label="Altri render della stessa sorgente"
            >
              <div>
                <h2 className="text-base font-semibold">
                  {origin
                    ? "Altre varianti di questa stanza"
                    : "Altri render della stessa immagine"}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {origin
                    ? `Stessa planimetria, stanza e versione ${origin.version}.`
                    : "Risultati dello stesso modulo che conservano il medesimo riferimento alla sorgente."}
                </p>
              </div>
              {variants.isLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : variants.isError ? (
                <div role="alert">
                  <p className="text-sm text-muted-foreground">
                    Le varianti non sono disponibili.
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void variants.refetch()}
                  >
                    Riprova varianti
                  </Button>
                </div>
              ) : !related.length ? (
                <p className="text-sm text-muted-foreground">
                  Non ci sono altre varianti completate in questo gruppo.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {related.map((variant) => (
                    <article
                      key={variant.id}
                      className="overflow-hidden rounded-lg border"
                    >
                      <Link
                        to={renderDetailWithReturn(moduleId, variant.id, back)}
                        className="block focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <img
                          src={variant.results[0]}
                          alt={`Variante del ${formatRenderDate(variant.created_at)}`}
                          className="aspect-video w-full bg-muted object-contain"
                          loading="lazy"
                        />
                        <p className="p-2 text-xs">
                          {formatRenderDate(variant.created_at)}
                        </p>
                      </Link>
                      {currentTarget && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full border-t text-xs"
                          onClick={() =>
                            setComparing([
                              currentTarget,
                              {
                                id: variant.id,
                                module: moduleId,
                                url: variant.results[0],
                                title: `${title} · variante`,
                                createdAt: variant.created_at,
                              },
                            ])
                          }
                        >
                          <GitCompareArrows className="mr-1 h-3.5 w-3.5" />
                          Confronta
                        </Button>
                      )}
                    </article>
                  ))}
                </div>
              )}
              {variants.hasNextPage && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={variants.isFetchingNextPage}
                  onClick={() => void variants.fetchNextPage()}
                >
                  {variants.isFetchingNextPage
                    ? "Caricamento…"
                    : "Carica altre varianti"}
                </Button>
              )}
            </section>
          )}
          <RenderCrmSummaryCard
            key={session.id}
            createdBy={session.createdBy}
            contactId={session.contactId}
            opportunityId={session.opportunityId}
            sessionId={session.id}
            sessionTable={
              source.table as Parameters<
                typeof RenderCrmSummaryCard
              >[0]["sessionTable"]
            }
            editable={!permissions.solaLettura}
          />
        </div>
        <aside className="min-w-0 space-y-4">
          {origin && (
            <RenderProjectContext origin={origin} returnTo={currentPath} />
          )}
          <RenderSavedChoices config={session.config} />
          {session.notes && (
            <section className="rounded-xl border bg-card p-4">
              <h2 className="text-sm font-semibold">Note del render</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                {session.notes}
              </p>
            </section>
          )}
          {spec.newPath && (
            <Button variant="outline" className="w-full" asChild>
              <Link
                to={
                  moduleId === "bagno"
                    ? `${spec.newPath}?template=${encodeURIComponent(session.id)}`
                    : spec.newPath
                }
              >
                <Plus className="mr-1.5 h-4 w-4" />
                {moduleId === "bagno"
                  ? "Riutilizza le scelte del bagno"
                  : `Nuovo render ${spec.moduleName.toLowerCase()}`}
              </Link>
            </Button>
          )}
        </aside>
      </div>
      {comparing && (
        <Suspense
          fallback={
            <p className="text-sm text-muted-foreground">
              Caricamento confronto…
            </p>
          }
        >
          <Comparison
            targets={comparing}
            open
            onOpenChange={(open) => {
              if (!open) setComparing(null);
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
