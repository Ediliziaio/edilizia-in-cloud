import { useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RenderCreditsWidget } from "@/components/render/RenderCreditsWidget";
import {
  Image, Plus, GalleryHorizontalEnd, Zap, Clock, CheckCircle2, XCircle,
  Upload, Wand2, Share2, Sparkles, Search, UserRound, Link2, ArrowRight,
  SlidersHorizontal, ShieldCheck,
} from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import {
  loadRenderGalleryMeta,
  resolveRenderGalleryMeta,
  type RenderGalleryMeta,
} from "@/lib/render/renderGalleryMeta";

const STATUS_CONFIG = {
  pending:    { label: "In coda",         color: "secondary",    icon: Clock },
  processing: { label: "In elaborazione", color: "default",      icon: Zap },
  completed:  { label: "Completato",      color: "secondary",    icon: CheckCircle2 },
  failed:     { label: "Fallito",         color: "destructive",  icon: XCircle },
} as const;

const HOW_IT_WORKS = [
  {
    icon: Upload,
    title: "Foto reale",
    desc: "Usa uno scatto leggibile della facciata o del vano, con infissi e contorni visibili.",
  },
  {
    icon: Wand2,
    title: "Analisi aperture",
    desc: "Il sistema mantiene prospettiva, muri, vetri, soglie e rapporto con la facciata.",
  },
  {
    icon: Sparkles,
    title: "Scelte tecniche",
    desc: "Configura materiale, colore, profilo, maniglia, vetro, cassonetto e oscuranti.",
  },
  {
    icon: Share2,
    title: "Output commerciale",
    desc: "Salva in galleria, collega a CRM, scarica PDF e condividi con il cliente.",
  },
];

const QUALITY_CHECKS = [
  {
    icon: ShieldCheck,
    title: "Stessa facciata",
    desc: "Il render deve preservare facciata, prospettiva, soglie, davanzali e contesto.",
  },
  {
    icon: SlidersHorizontal,
    title: "Scelte complete",
    desc: "Più dettagli tecnici inserisci, meno l'AI inventa materiali o accessori.",
  },
  {
    icon: Link2,
    title: "CRM ordinato",
    desc: "Associa il render a contatto o opportunità per recuperarlo nei preventivi.",
  },
];

type RenderSessionHubItem = {
  id: string;
  status: string;
  original_photo_url: string | null;
  result_urls: string[] | null;
  config: Record<string, unknown> | null;
  created_at: string;
  created_by: string | null;
  contact_id: string | null;
  opportunity_id: string | null;
  meta: RenderGalleryMeta;
};

type RenderGalleryHubItem = {
  id: string;
  session_id: string | null;
  render_url: string;
  original_url: string | null;
  config_summary: Record<string, string> | null;
  created_at: string;
};

export default function RenderHub() {
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const [sessionSearch, setSessionSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [crmFilter, setCrmFilter] = useState("all");

  // ── Sessioni recenti (ultime 10) ─────────────────────────────────────────────
  const { data: sessions = [], isLoading: loadingSessions } = useQuery({
    queryKey: ["render-sessions", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("render_sessions")
        .select("id, status, original_photo_url, result_urls, config, created_at, created_by, contact_id, opportunity_id")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      const rows = (data ?? []) as Omit<RenderSessionHubItem, "meta">[];
      const metaMaps = await loadRenderGalleryMeta(rows);
      return rows.map((row) => ({
        ...row,
        meta: resolveRenderGalleryMeta(row, metaMaps),
      })) as RenderSessionHubItem[];
    },
    enabled: !!companyId,
    // Poll solo se ci sono sessioni in elaborazione — evita 1 req/12s quando la pagina è idle
    refetchInterval: (query) =>
      (query.state.data as Array<{ status: string }> | undefined)?.some(s => s.status === "processing")
        ? 12_000
        : false,
  });

  // ── Galleria recente (ultime 6) ──────────────────────────────────────────────
  const { data: gallery = [], isLoading: loadingGallery } = useQuery({
    queryKey: ["render-gallery", companyId, "hub"],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("render_gallery")
        .select("id, session_id, render_url, original_url, config_summary, created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return (data ?? []) as RenderGalleryHubItem[];
    },
    enabled: !!companyId,
  });

  const hasProcessing = sessions.some(s => s.status === "processing");

  const filteredSessions = useMemo(() => {
    const needle = sessionSearch.trim().toLowerCase();
    return sessions.filter((session) => {
      const config = session.config as { nuovo_infisso?: { materiale?: string; colore?: { nome?: string } } } | null;
      const infisso = config?.nuovo_infisso;
      const haystack = [
        session.status,
        infisso?.materiale,
        infisso?.colore?.nome,
        session.meta.createdByName,
        session.meta.contactName,
        session.meta.opportunityName,
        format(new Date(session.created_at), "d MMMM yyyy HH:mm", { locale: it }),
      ].filter(Boolean).join(" ").toLowerCase();

      const matchesSearch = !needle || haystack.includes(needle);
      const matchesStatus = statusFilter === "all" || session.status === statusFilter;
      const linked = Boolean(session.contact_id || session.opportunity_id);
      const matchesCrm =
        crmFilter === "all" ||
        (crmFilter === "linked" && linked) ||
        (crmFilter === "unlinked" && !linked);

      return matchesSearch && matchesStatus && matchesCrm;
    });
  }, [crmFilter, sessionSearch, sessions, statusFilter]);

  const stats = useMemo(() => ({
    total: sessions.length,
    completed: sessions.filter((session) => session.status === "completed").length,
    processing: sessions.filter((session) => session.status === "processing" || session.status === "pending").length,
    linked: sessions.filter((session) => session.contact_id || session.opportunity_id).length,
  }), [sessions]);

  const statCards = [
    { label: "Render recenti", value: stats.total, icon: GalleryHorizontalEnd },
    { label: "Completati", value: stats.completed, icon: CheckCircle2 },
    { label: "In lavorazione", value: stats.processing, icon: Zap },
    { label: "Collegati CRM", value: stats.linked, icon: Link2 },
  ];

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/azienda/render" className="hover:text-foreground">Render AI</Link>
        <span>/</span>
        <span className="text-foreground">Infissi</span>
      </div>

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <section className="overflow-hidden rounded-2xl border bg-[linear-gradient(135deg,#f8fbff_0%,#eef6ff_48%,#f7fbf4_100%)] p-5 shadow-sm sm:p-7">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary shadow-sm">
              <ShieldCheck className="h-3.5 w-3.5" />
              Render infissi
            </div>
            <h1 className="max-w-2xl text-3xl font-bold leading-tight text-slate-950 sm:text-4xl">
              Nuovi infissi sulla stessa facciata, con controllo tecnico e commerciale.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Configura profili, vetro, maniglie, cassonetti e oscuranti mantenendo prospettiva,
              facciata e aperture reali. Ogni render resta collegabile a contatti e opportunità.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button
                size="lg"
                className="gap-2 shadow-sm"
                onClick={() => navigate("/azienda/render/infissi/new")}
              >
                <Plus className="h-4 w-4" />
                Nuovo render
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="gap-2 bg-white/80"
                onClick={() => navigate("/azienda/render/infissi/gallery")}
              >
                <GalleryHorizontalEnd className="h-4 w-4" />
                Apri galleria
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border bg-white/90 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold">Credito render</p>
                <p className="text-xs text-muted-foreground">Disponibilità prima della generazione</p>
              </div>
              <RenderCreditsWidget />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {statCards.map(({ label, value, icon: Icon }) => (
                <div key={label} className="rounded-xl border bg-slate-50/80 p-3">
                  <Icon className="mb-2 h-4 w-4 text-primary" />
                  <p className="text-xl font-bold leading-none">{value}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Come funziona ────────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
          Qualità del workflow
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {HOW_IT_WORKS.map(({ icon: Icon, title, desc }) => (
            <Card key={title} className="bg-muted/20">
              <CardContent className="py-4 flex flex-col gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <p className="text-xs font-semibold">{title}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {QUALITY_CHECKS.map(({ icon: Icon, title, desc }) => (
          <Card key={title} className="border-primary/10 bg-primary/[0.03]">
            <CardContent className="flex gap-3 p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold">{title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{desc}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Galleria recente ──────────────────────────────────────────────────── */}
      {(gallery.length > 0 || loadingGallery) && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Render recenti
              </h2>
              <p className="text-xs text-muted-foreground">Anteprime salvate nella galleria infissi</p>
            </div>
            {gallery.length > 0 && (
              <Button variant="ghost" size="sm" className="gap-1" onClick={() => navigate("/azienda/render/infissi/gallery")}>
                Vedi tutti
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          {loadingGallery ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="aspect-[16/10] rounded-xl" />)}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {gallery.map(item => (
                <button
                  type="button"
                  key={item.id}
                  className="group relative aspect-[16/10] overflow-hidden rounded-xl border bg-muted text-left shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
                  onClick={() => navigate(`/azienda/render/infissi/gallery/${item.session_id ?? item.id}`)}
                >
                  <img
                    src={item.render_url}
                    alt="Render"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3">
                    <p className="text-xs font-medium text-white">
                      {format(new Date(item.created_at), "d MMM yyyy, HH:mm", { locale: it })}
                    </p>
                    {item.config_summary?.materiale && (
                      <Badge className="mt-1 border-0 bg-white/90 text-[10px] capitalize text-slate-900">
                        {item.config_summary.materiale}
                      </Badge>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Sessioni recenti ──────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Sessioni infissi
              {hasProcessing && (
                <span className="ml-2 inline-flex items-center gap-1 text-primary">
                  <Zap className="h-3 w-3 animate-pulse" />
                  In elaborazione
                </span>
              )}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Filtra per stato, CRM o cerca materiale, colore, contatto e autore.
            </p>
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
                <SelectTrigger>
                  <SelectValue placeholder="Stato" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti gli stati</SelectItem>
                  <SelectItem value="completed">Completati</SelectItem>
                  <SelectItem value="processing">In elaborazione</SelectItem>
                  <SelectItem value="pending">In coda</SelectItem>
                  <SelectItem value="failed">Falliti</SelectItem>
                </SelectContent>
              </Select>
              <Select value={crmFilter} onValueChange={setCrmFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="CRM" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti CRM</SelectItem>
                  <SelectItem value="linked">Collegati</SelectItem>
                  <SelectItem value="unlinked">Non collegati</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {loadingSessions ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
          </div>
        ) : sessions.length === 0 ? (
          <Card>
            <CardContent className="py-14 flex flex-col items-center gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                <Image className="h-8 w-8 text-muted-foreground/40" />
              </div>
              <div>
                <p className="font-medium">Nessun render ancora</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Carica una foto della facciata e configura i tuoi infissi
                </p>
              </div>
              <Button onClick={() => navigate("/azienda/render/infissi/new")}>
                <Plus className="h-4 w-4 mr-2" />
                Crea il primo render
              </Button>
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
            {filteredSessions.map(session => {
              const cfg = STATUS_CONFIG[session.status as keyof typeof STATUS_CONFIG] ??
                STATUS_CONFIG.pending;
              const Icon = cfg.icon;
              const resultUrl = session.result_urls?.[0];
              const ni = (session.config as { nuovo_infisso?: { materiale?: string; colore?: { nome?: string } } } | null)
                ?.nuovo_infisso;

              return (
                <Card
                  key={session.id}
                  className="cursor-pointer transition-colors hover:border-primary/40 hover:bg-muted/20"
                  onClick={() => navigate(`/azienda/render/infissi/gallery/${session.id}`)}
                >
                  <CardContent className="grid gap-3 p-3 sm:grid-cols-[96px_minmax(0,1fr)_auto] sm:items-center">
                    {/* Thumbnail */}
                    <div className="h-20 overflow-hidden rounded-xl bg-muted sm:h-16">
                      {resultUrl ? (
                        <img src={resultUrl} alt="render" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Image className="h-5 w-5 text-muted-foreground/40" />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge
                          variant={cfg.color as "default" | "secondary" | "destructive"}
                          className="h-5 gap-1 text-xs"
                        >
                          <Icon className="h-2.5 w-2.5" />
                          {cfg.label}
                        </Badge>
                        {ni?.materiale && (
                          <Badge variant="outline" className="h-5 text-xs capitalize">
                            {ni.materiale}
                          </Badge>
                        )}
                        {ni?.colore?.nome && (
                          <Badge variant="outline" className="h-5 text-xs">
                            {ni.colore.nome}
                          </Badge>
                        )}
                        {(session.contact_id || session.opportunity_id) && (
                          <Badge variant="secondary" className="h-5 gap-1 text-xs">
                            <Link2 className="h-3 w-3" />
                            CRM
                          </Badge>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>{format(new Date(session.created_at), "d MMM yyyy, HH:mm", { locale: it })}</span>
                        {session.meta.createdByName && (
                          <span className="inline-flex items-center gap-1">
                            <UserRound className="h-3 w-3" />
                            {session.meta.createdByName}
                          </span>
                        )}
                        {session.meta.contactName && <span>Contatto: {session.meta.contactName}</span>}
                        {session.meta.opportunityName && <span>Opportunità: {session.meta.opportunityName}</span>}
                      </div>
                    </div>

                    {session.status === "processing" ? (
                      <Zap className="hidden h-4 w-4 shrink-0 animate-pulse text-primary sm:block" />
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
