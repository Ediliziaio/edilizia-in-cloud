import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  CheckCircle2,
  GalleryHorizontalEnd,
  Image,
  Link2,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import {
  loadRenderGalleryMeta,
  resolveRenderGalleryMeta,
  type RenderGalleryMeta,
} from "@/lib/render/renderGalleryMeta";

type InfissiGalleryRow = {
  id: string;
  title: string | null;
  original_url: string | null;
  render_url: string | null;
  tags: string[] | null;
  config_summary: Record<string, string> | null;
  created_at: string;
  session_id: string | null;
  created_by: string | null;
  contact_id: string | null;
  opportunity_id: string | null;
  meta: RenderGalleryMeta;
};

const compactStrings = (items: Array<string | null | undefined>) =>
  items.map((item) => item?.trim()).filter((item): item is string => Boolean(item));

function getDisplayTitle(item: InfissiGalleryRow) {
  return item.title || item.config_summary?.materiale || "Render infissi";
}

function getSummaryBadges(item: InfissiGalleryRow) {
  return compactStrings([
    item.config_summary?.materiale,
    item.config_summary?.colore,
    item.config_summary?.tipo,
    ...(item.tags ?? []),
  ]).slice(0, 4);
}

export default function RenderGallery() {
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const [search, setSearch] = useState("");
  const [creatorFilter, setCreatorFilter] = useState("all");
  const [contactFilter, setContactFilter] = useState("all");
  const [opportunityFilter, setOpportunityFilter] = useState("all");
  const [linkFilter, setLinkFilter] = useState("all");

  const { data: gallery = [], isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["render-gallery", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("render_gallery")
        .select("id, title, original_url, render_url, tags, config_summary, created_at, session_id")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as Array<Omit<InfissiGalleryRow, "created_by" | "contact_id" | "opportunity_id" | "meta">>;
      const sessionIds = rows.map((row) => row.session_id).filter(Boolean) as string[];
      const { data: sessions, error: sessionError } = sessionIds.length
        ? await supabase
            .from("render_sessions")
            .select("id, created_by, contact_id, opportunity_id")
            .in("id", sessionIds)
        : { data: [], error: null };
      if (sessionError) throw sessionError;

      const sessionById = new Map((sessions ?? []).map((session) => [session.id, session]));
      const metaSources = rows.map((row) => {
        const session = row.session_id ? sessionById.get(row.session_id) : null;
        return {
          created_by: session?.created_by ?? null,
          contact_id: session?.contact_id ?? null,
          opportunity_id: session?.opportunity_id ?? null,
        };
      });
      const metaMaps = await loadRenderGalleryMeta(metaSources);
      return rows.map((row, index) => {
        const source = metaSources[index];
        return {
          ...row,
          created_by: source.created_by,
          contact_id: source.contact_id,
          opportunity_id: source.opportunity_id,
          meta: resolveRenderGalleryMeta(source, metaMaps),
        };
      }) as InfissiGalleryRow[];
    },
    enabled: !!companyId,
  });

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return gallery.filter((item) => {
      const linked = Boolean(item.contact_id || item.opportunity_id);
      const haystack = [
        item.title,
        item.tags?.join(" "),
        item.config_summary ? Object.values(item.config_summary).join(" ") : null,
        item.meta.createdByName,
        item.meta.contactName,
        item.meta.opportunityName,
        format(new Date(item.created_at), "d MMMM yyyy", { locale: it }),
      ].filter(Boolean).join(" ").toLowerCase();

      return (!needle || haystack.includes(needle)) &&
        (creatorFilter === "all" || item.created_by === creatorFilter) &&
        (contactFilter === "all" || item.contact_id === contactFilter) &&
        (opportunityFilter === "all" || item.opportunity_id === opportunityFilter) &&
        (linkFilter === "all" || (linkFilter === "linked" ? linked : !linked));
    });
  }, [contactFilter, creatorFilter, gallery, linkFilter, opportunityFilter, search]);

  const creatorOptions = useMemo(
    () => [...new Map(gallery
      .filter((item) => item.created_by && item.meta.createdByName)
      .map((item) => [item.created_by!, item.meta.createdByName!])).entries()],
    [gallery],
  );
  const contactOptions = useMemo(
    () => [...new Map(gallery
      .filter((item) => item.contact_id && item.meta.contactName)
      .map((item) => [item.contact_id!, item.meta.contactName!])).entries()],
    [gallery],
  );
  const opportunityOptions = useMemo(
    () => [...new Map(gallery
      .filter((item) => item.opportunity_id && item.meta.opportunityName)
      .map((item) => [item.opportunity_id!, item.meta.opportunityName!])).entries()],
    [gallery],
  );

  const stats = useMemo(() => ({
    total: gallery.length,
    visible: filtered.length,
    linked: gallery.filter((item) => item.contact_id || item.opportunity_id).length,
    contacts: new Set(gallery.map((item) => item.contact_id).filter(Boolean)).size,
  }), [filtered.length, gallery]);

  const hasFilters = Boolean(search.trim()) ||
    creatorFilter !== "all" ||
    contactFilter !== "all" ||
    opportunityFilter !== "all" ||
    linkFilter !== "all";

  const resetFilters = () => {
    setSearch("");
    setCreatorFilter("all");
    setContactFilter("all");
    setOpportunityFilter("all");
    setLinkFilter("all");
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-[linear-gradient(135deg,#f8fbff_0%,#eef6ff_52%,#ffffff_100%)] p-5 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/azienda/render/infissi")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <Badge variant="outline" className="mb-2 bg-white/70">
                <GalleryHorizontalEnd className="mr-1 h-3.5 w-3.5 text-primary" />
                Galleria infissi
              </Badge>
              <h1 className="text-2xl font-bold leading-tight text-slate-950 sm:text-3xl">
                Render salvati, ordinati per vendita e CRM.
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Cerca rapidamente per cliente, opportunità, autore, materiale o data. Ogni card mostra subito
                chi ha generato il render e dove è collegato.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="gap-2 bg-white/80" onClick={() => navigate("/azienda/render/infissi")}>
              Panoramica
            </Button>
            <Button className="gap-2" onClick={() => navigate("/azienda/render/infissi/new")}>
              <Plus className="h-4 w-4" />
              Nuovo render
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          {[
            { label: "Totali", value: stats.total, icon: GalleryHorizontalEnd },
            { label: "Visibili", value: stats.visible, icon: Search },
            { label: "Collegati CRM", value: stats.linked, icon: Link2 },
            { label: "Contatti", value: stats.contacts, icon: UserRound },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-xl border bg-white/85 p-3 shadow-sm">
              <Icon className="mb-2 h-4 w-4 text-primary" />
              <p className="text-2xl font-bold leading-none">{value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {gallery.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold">Filtri galleria</p>
              </div>
              {hasFilters && (
                <Button variant="ghost" size="sm" className="gap-2" onClick={resetFilters}>
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset
                </Button>
              )}
            </div>
            <div className="grid gap-2 lg:grid-cols-[minmax(260px,1fr)_170px_190px_190px_170px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Cerca render, materiale, autore, contatto..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={creatorFilter} onValueChange={setCreatorFilter}>
                <SelectTrigger><SelectValue placeholder="Creato da" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti gli autori</SelectItem>
                  {creatorOptions.map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={contactFilter} onValueChange={setContactFilter}>
                <SelectTrigger><SelectValue placeholder="Contatto" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti i contatti</SelectItem>
                  {contactOptions.map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={opportunityFilter} onValueChange={setOpportunityFilter}>
                <SelectTrigger><SelectValue placeholder="Opportunità" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutte opportunità</SelectItem>
                  {opportunityOptions.map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={linkFilter} onValueChange={setLinkFilter}>
                <SelectTrigger><SelectValue placeholder="CRM" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti CRM</SelectItem>
                  <SelectItem value="linked">Collegati</SelectItem>
                  <SelectItem value="unlinked">Non collegati</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="aspect-[4/3] rounded-2xl" />)}
        </div>
      ) : error ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-4 text-center" role="alert" aria-live="assertive">
            <AlertTriangle className="h-12 w-12 text-destructive/70" aria-hidden="true" />
            <div>
              <p className="font-medium">Impossibile caricare la galleria</p>
              <p className="text-sm text-muted-foreground mt-1">
                Problema temporaneo. Riprova tra qualche secondo.
              </p>
            </div>
            <Button variant="outline" onClick={() => refetch()} disabled={isRefetching}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefetching ? "animate-spin" : ""}`} aria-hidden="true" />
              Riprova
            </Button>
          </CardContent>
        </Card>
      ) : gallery.length === 0 ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-4 text-center">
            <Image className="h-14 w-14 text-muted-foreground/30" />
            <div>
              <p className="font-medium">Galleria vuota</p>
              <p className="text-sm text-muted-foreground mt-1">
                I render completati appariranno qui
              </p>
            </div>
            <Button onClick={() => navigate("/azienda/render/infissi/new")}>
              <Plus className="h-4 w-4 mr-2" />
              Crea primo render
            </Button>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center">
            <SlidersHorizontal className="mx-auto h-12 w-12 text-muted-foreground/35" />
            <p className="mt-3 font-medium">Nessun render con questi filtri</p>
            <p className="mt-1 text-sm text-muted-foreground">Prova a rimuovere qualche filtro o cerca un altro cliente.</p>
            <Button variant="outline" className="mt-4 gap-2" onClick={resetFilters}>
              <RotateCcw className="h-4 w-4" />
              Mostra tutto
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map(item => {
            const destination = item.session_id ? `/azienda/render/infissi/gallery/${item.session_id}` : null;
            const badges = getSummaryBadges(item);
            return (
              <Card
                key={item.id}
                className="group overflow-hidden transition-all hover:border-primary/40 hover:shadow-md"
              >
                <button
                  type="button"
                  className="block w-full text-left"
                  disabled={!destination}
                  onClick={() => destination && navigate(destination)}
                >
                  <div className="relative aspect-[16/10] bg-muted">
                    {item.render_url ? (
                      <img
                        src={item.render_url}
                        alt={item.title ?? "Render"}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Image className="h-8 w-8 text-muted-foreground/40" />
                      </div>
                    )}
                    {item.original_url && (
                      <div className="absolute left-3 top-3 rounded-full bg-black/65 px-2 py-1 text-[10px] font-medium text-white">
                        Prima / dopo disponibile
                      </div>
                    )}
                    <div className="absolute right-3 top-3 rounded-full bg-white/90 px-2 py-1 text-[10px] font-semibold text-slate-800 shadow-sm">
                      Infissi
                    </div>
                  </div>

                  <div className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="truncate text-sm font-semibold">{getDisplayTitle(item)}</h2>
                        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="h-3.5 w-3.5" />
                          {format(new Date(item.created_at), "d MMM yyyy, HH:mm", { locale: it })}
                        </p>
                      </div>
                      <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </div>

                    {badges.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {badges.map((tag) => (
                          <Badge key={tag} variant="outline" className="text-[10px] capitalize">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}

                    <div className="grid gap-2 rounded-xl border bg-muted/20 p-3 text-xs">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Creato da</span>
                        <span className="truncate font-medium">{item.meta.createdByName ?? "Non disponibile"}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Contatto</span>
                        <span className="truncate font-medium">{item.meta.contactName ?? "Non collegato"}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Opportunità</span>
                        <span className="truncate font-medium">{item.meta.opportunityName ?? "Non collegata"}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      {item.contact_id || item.opportunity_id ? (
                        <Badge variant="secondary" className="gap-1 text-[10px]">
                          <CheckCircle2 className="h-3 w-3" />
                          Collegato CRM
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1 text-[10px] text-muted-foreground">
                          <Link2 className="h-3 w-3" />
                          Da collegare
                        </Badge>
                      )}
                      <span className="text-xs font-medium text-primary">Apri dettaglio</span>
                    </div>
                  </div>
                </button>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
