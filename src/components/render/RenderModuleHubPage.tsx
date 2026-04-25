import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  GalleryHorizontalEnd,
  Image,
  Link2,
  Plus,
  Search,
  SlidersHorizontal,
  UserRound,
  Zap,
  XCircle,
} from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { RenderCreditsWidget } from "@/components/render/RenderCreditsWidget";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  loadRenderGalleryMeta,
  resolveRenderGalleryMeta,
  type RenderGalleryMeta,
} from "@/lib/render/renderGalleryMeta";

type StatusKey = "pending" | "processing" | "completed" | "failed";

const STATUS_CONFIG: Record<StatusKey, { label: string; color: "default" | "secondary" | "destructive" | "outline"; icon: LucideIcon }> = {
  pending: { label: "In coda", color: "secondary", icon: Clock },
  processing: { label: "In elaborazione", color: "default", icon: Zap },
  completed: { label: "Completato", color: "secondary", icon: CheckCircle2 },
  failed: { label: "Errore", color: "destructive", icon: XCircle },
};

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

type RecentRenderRow = {
  id: string;
  status: string;
  result_url: string | null;
  result_urls: string[] | null;
  created_at: string;
  render_type: string;
  created_by: string | null;
  contact_id: string | null;
  opportunity_id: string | null;
  meta: RenderGalleryMeta;
};

const normalizeStatus = (value: string | null | undefined): StatusKey => {
  if (value === "completed" || value === "processing" || value === "pending" || value === "failed") return value;
  if (value === "completato") return "completed";
  if (value === "errore") return "failed";
  if (value === "analyzing" || value === "analysis_done") return "processing";
  return "pending";
};

const getRenderDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Data non disponibile"
    : format(date, "d MMM yyyy, HH:mm", { locale: it });
};

export function RenderModuleHubPage({
  moduleId,
  moduleName,
  breadcrumbLabel,
  badgeLabel,
  title,
  description,
  icon: ModuleIcon,
  accentClassName,
  iconBgClassName,
  newPath,
  galleryPath,
  newButtonLabel = "Nuovo render",
  galleryButtonLabel = "Apri galleria",
  workflow,
  qualityCards,
  emptyTitle,
  emptyDescription,
  sessionTitle = "Sessioni di lavoro",
  sessionDescription = "Filtra per stato, CRM, data, autore o collegamento commerciale.",
  recentDescription = "Anteprime completate salvate in galleria.",
  unavailableTitle = "Generazione non ancora collegata",
  unavailableDescription = "Il motore tecnico e pronto, ma il flusso di generazione non e ancora esposto in produzione.",
  imageFit = "cover",
}: RenderModuleHubConfig) {
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const [sessionSearch, setSessionSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [crmFilter, setCrmFilter] = useState("all");

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["render-module-hub", companyId, moduleId],
    queryFn: async () => {
      if (!companyId) return [] as RecentRenderRow[];
      const { data, error } = await supabase
        .from("company_renders_recent" as never)
        .select("id,status,result_url,result_urls,created_at,render_type,created_by,contact_id,opportunity_id" as never)
        .eq("company_id", companyId)
        .eq("render_type", moduleId)
        .order("created_at", { ascending: false })
        .limit(24);

      if (error) throw error;
      const rows = (data ?? []) as unknown as Omit<RecentRenderRow, "meta">[];
      const metaMaps = await loadRenderGalleryMeta(rows);
      return rows.map((row) => ({
        ...row,
        meta: resolveRenderGalleryMeta(row, metaMaps),
      }));
    },
    enabled: !!companyId,
    refetchInterval: (query) =>
      (query.state.data as Array<{ status: string }> | undefined)?.some((item) => normalizeStatus(item.status) === "processing")
        ? 12_000
        : false,
  });

  const stats = useMemo(() => {
    const completed = sessions.filter((item) => normalizeStatus(item.status) === "completed").length;
    const processing = sessions.filter((item) => {
      const status = normalizeStatus(item.status);
      return status === "processing" || status === "pending";
    }).length;
    const linked = sessions.filter((item) => item.contact_id || item.opportunity_id).length;
    return { total: sessions.length, completed, processing, linked };
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    const needle = sessionSearch.trim().toLowerCase();
    return sessions.filter((session) => {
      const status = normalizeStatus(session.status);
      const linked = Boolean(session.contact_id || session.opportunity_id);
      const haystack = [
        status,
        getRenderDate(session.created_at),
        session.meta.createdByName,
        session.meta.contactName,
        session.meta.opportunityName,
      ].filter(Boolean).join(" ").toLowerCase();

      return (!needle || haystack.includes(needle)) &&
        (statusFilter === "all" || status === statusFilter) &&
        (crmFilter === "all" || (crmFilter === "linked" ? linked : !linked));
    });
  }, [crmFilter, sessionSearch, sessions, statusFilter]);

  const completedPreviews = sessions
    .filter((item) => normalizeStatus(item.status) === "completed" && item.result_url)
    .slice(0, 6);

  const detailPath = (id: string) => galleryPath ? `${galleryPath}/${id}` : null;
  const hasProcessing = sessions.some((item) => {
    const status = normalizeStatus(item.status);
    return status === "processing" || status === "pending";
  });

  const statCards = [
    { label: "Render recenti", value: stats.total, icon: GalleryHorizontalEnd },
    { label: "Completati", value: stats.completed, icon: CheckCircle2 },
    { label: "In lavorazione", value: stats.processing, icon: Zap },
    { label: "Collegati CRM", value: stats.linked, icon: Link2 },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/azienda/render" className="hover:text-foreground">Render AI</Link>
        <span>/</span>
        <span className="text-foreground">{breadcrumbLabel}</span>
      </div>

      <section className="overflow-hidden rounded-2xl border bg-[linear-gradient(135deg,#f8fbff_0%,#eef6ff_48%,#f7fbf4_100%)] p-5 shadow-sm sm:p-7">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary shadow-sm">
              <ModuleIcon className={`h-3.5 w-3.5 ${accentClassName}`} />
              {badgeLabel}
            </div>
            <h1 className="max-w-3xl text-3xl font-bold leading-tight text-slate-950 sm:text-4xl">
              {title}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              {description}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {newPath ? (
                <Button size="lg" className="gap-2 shadow-sm" onClick={() => navigate(newPath)}>
                  <Plus className="h-4 w-4" />
                  {newButtonLabel}
                </Button>
              ) : (
                <Badge variant="outline" className="h-11 rounded-md bg-white/80 px-4 text-sm text-slate-700">
                  {unavailableTitle}
                </Badge>
              )}
              {galleryPath && (
                <Button variant="outline" size="lg" className="gap-2 bg-white/80" onClick={() => navigate(galleryPath)}>
                  <GalleryHorizontalEnd className="h-4 w-4" />
                  {galleryButtonLabel}
                </Button>
              )}
            </div>
            {!newPath && (
              <p className="mt-3 max-w-2xl text-xs leading-5 text-slate-500">
                {unavailableDescription}
              </p>
            )}
          </div>

          <div className="rounded-2xl border bg-white/90 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold">Credito render</p>
                <p className="text-xs text-muted-foreground">Disponibilita prima della generazione</p>
              </div>
              <RenderCreditsWidget />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {statCards.map(({ label, value, icon: Icon }) => (
                <div key={label} className="rounded-xl border bg-slate-50/80 p-3">
                  <Icon className={`mb-2 h-4 w-4 ${accentClassName}`} />
                  <p className="text-xl font-bold leading-none">{value}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Qualita del workflow
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {workflow.map(({ icon: Icon, title: stepTitle, description: stepDescription }) => (
            <Card key={stepTitle} className="bg-muted/20">
              <CardContent className="flex flex-col gap-2 py-4">
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconBgClassName}`}>
                  <Icon className={`h-4 w-4 ${accentClassName}`} />
                </div>
                <p className="text-xs font-semibold">{stepTitle}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">{stepDescription}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        {qualityCards.map(({ icon: Icon, title: cardTitle, description: cardDescription }) => (
          <Card key={cardTitle} className="border-primary/10 bg-primary/[0.03]">
            <CardContent className="flex gap-3 p-4">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconBgClassName}`}>
                <Icon className={`h-4 w-4 ${accentClassName}`} />
              </div>
              <div>
                <p className="text-sm font-semibold">{cardTitle}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{cardDescription}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      {(completedPreviews.length > 0 || isLoading) && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Render recenti
              </h2>
              <p className="text-xs text-muted-foreground">{recentDescription}</p>
            </div>
            {galleryPath && completedPreviews.length > 0 && (
              <Button variant="ghost" size="sm" className="gap-1" onClick={() => navigate(galleryPath)}>
                Vedi tutti
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          {isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((item) => <Skeleton key={item} className="aspect-[16/10] rounded-xl" />)}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {completedPreviews.map((item) => {
                const path = detailPath(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    className="group relative aspect-[16/10] overflow-hidden rounded-xl border bg-muted text-left shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
                    onClick={() => path && navigate(path)}
                    disabled={!path}
                  >
                    <img
                      src={item.result_url ?? ""}
                      alt={`Render ${moduleName}`}
                      className={`h-full w-full ${imageFit === "contain" ? "object-contain" : "object-cover"} transition-transform duration-300 group-hover:scale-105`}
                      loading="lazy"
                      decoding="async"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3">
                      <p className="text-xs font-medium text-white">{getRenderDate(item.created_at)}</p>
                      <Badge className="mt-1 border-0 bg-white/90 text-[10px] text-slate-900">
                        {moduleName}
                      </Badge>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      <section className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {sessionTitle}
              {hasProcessing && (
                <span className={`ml-2 inline-flex items-center gap-1 ${accentClassName}`}>
                  <Zap className="h-3 w-3 animate-pulse" />
                  In elaborazione
                </span>
              )}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">{sessionDescription}</p>
          </div>
          {sessions.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_150px_160px] lg:w-[680px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={sessionSearch}
                  onChange={(event) => setSessionSearch(event.target.value)}
                  className="pl-9"
                  placeholder="Cerca sessioni..."
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue placeholder="Stato" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti gli stati</SelectItem>
                  <SelectItem value="completed">Completati</SelectItem>
                  <SelectItem value="processing">In elaborazione</SelectItem>
                  <SelectItem value="pending">In coda</SelectItem>
                  <SelectItem value="failed">Errori</SelectItem>
                </SelectContent>
              </Select>
              <Select value={crmFilter} onValueChange={setCrmFilter}>
                <SelectTrigger><SelectValue placeholder="CRM" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti CRM</SelectItem>
                  <SelectItem value="linked">Collegati</SelectItem>
                  <SelectItem value="unlinked">Non collegati</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((item) => <Skeleton key={item} className="h-24 w-full rounded-xl" />)}
          </div>
        ) : sessions.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <ModuleIcon className="h-8 w-8 text-muted-foreground/40" />
              </div>
              <div>
                <p className="font-medium">{emptyTitle}</p>
                <p className="mt-1 text-sm text-muted-foreground">{emptyDescription}</p>
              </div>
              {newPath && (
                <Button onClick={() => navigate(newPath)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Crea il primo render
                </Button>
              )}
            </CardContent>
          </Card>
        ) : filteredSessions.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <SlidersHorizontal className="mx-auto h-10 w-10 text-muted-foreground/35" />
              <p className="mt-3 font-medium">Nessuna sessione con questi filtri</p>
              <p className="mt-1 text-sm text-muted-foreground">Riduci i filtri o prova una ricerca diversa.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {filteredSessions.map((session) => {
              const status = normalizeStatus(session.status);
              const cfg = STATUS_CONFIG[status];
              const Icon = cfg.icon;
              const resultUrl = session.result_url;
              const path = detailPath(session.id);
              return (
                <Card
                  key={session.id}
                  className="cursor-pointer transition-colors hover:border-primary/40 hover:bg-muted/20"
                  onClick={() => path && navigate(path)}
                >
                  <CardContent className="grid gap-3 p-3 sm:grid-cols-[96px_minmax(0,1fr)_auto] sm:items-center">
                    <div className="h-20 overflow-hidden rounded-xl bg-muted sm:h-16">
                      {resultUrl ? (
                        <img
                          src={resultUrl}
                          alt={`Render ${moduleName}`}
                          className={`h-full w-full ${imageFit === "contain" ? "object-contain" : "object-cover"}`}
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Image className="h-5 w-5 text-muted-foreground/40" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant={cfg.color} className="h-5 gap-1 text-xs">
                          <Icon className="h-2.5 w-2.5" />
                          {cfg.label}
                        </Badge>
                        <Badge variant="outline" className="h-5 text-xs">
                          {moduleName}
                        </Badge>
                        {(session.contact_id || session.opportunity_id) && (
                          <Badge variant="secondary" className="h-5 gap-1 text-xs">
                            <Link2 className="h-3 w-3" />
                            CRM
                          </Badge>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>{getRenderDate(session.created_at)}</span>
                        {session.meta.createdByName && (
                          <span className="inline-flex items-center gap-1">
                            <UserRound className="h-3 w-3" />
                            {session.meta.createdByName}
                          </span>
                        )}
                        {session.meta.contactName && <span>Contatto: {session.meta.contactName}</span>}
                        {session.meta.opportunityName && <span>Opportunita: {session.meta.opportunityName}</span>}
                      </div>
                    </div>

                    {status === "processing" || status === "pending" ? (
                      <Zap className={`hidden h-4 w-4 shrink-0 animate-pulse sm:block ${accentClassName}`} />
                    ) : (
                      <ArrowRight className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
