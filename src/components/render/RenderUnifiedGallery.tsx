import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import type { LucideIcon } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

export interface UnifiedRenderGalleryItem {
  id: string;
  title: string;
  date: string;
  detailPath: string | null;
  imageUrl: string | null;
  originalUrl?: string | null;
  tags?: string[];
  searchableText?: string;
  createdById?: string | null;
  createdByName?: string | null;
  contactId?: string | null;
  contactName?: string | null;
  opportunityId?: string | null;
  opportunityName?: string | null;
  imageFit?: "cover" | "contain";
}

interface RenderUnifiedGalleryProps {
  moduleName: string;
  badgeLabel: string;
  title: string;
  description: string;
  backPath: string;
  newPath: string;
  items: UnifiedRenderGalleryItem[];
  isLoading: boolean;
  error?: unknown;
  isRefetching?: boolean;
  onRetry?: () => void | Promise<unknown>;
  emptyTitle: string;
  emptyDescription: string;
  searchPlaceholder?: string;
  emptyIcon?: LucideIcon;
  accentClassName?: string;
}

const getDateValue = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatGalleryDate = (value: string, pattern = "d MMM yyyy, HH:mm") => {
  const date = getDateValue(value);
  return date ? format(date, pattern, { locale: it }) : "Data non disponibile";
};

const normalizeInputDate = (value: string, endOfDay = false) => {
  if (!value) return null;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const uniqueOptions = (items: UnifiedRenderGalleryItem[], idKey: "createdById" | "contactId" | "opportunityId", labelKey: "createdByName" | "contactName" | "opportunityName") =>
  [...new Map(
    items
      .filter((item) => item[idKey] && item[labelKey])
      .map((item) => [item[idKey] as string, item[labelKey] as string]),
  ).entries()];

export function RenderUnifiedGallery({
  moduleName,
  badgeLabel,
  title,
  description,
  backPath,
  newPath,
  items,
  isLoading,
  error,
  isRefetching,
  onRetry,
  emptyTitle,
  emptyDescription,
  searchPlaceholder = "Cerca render, autore, contatto, opportunita...",
  emptyIcon: EmptyIcon = Image,
  accentClassName = "text-primary",
}: RenderUnifiedGalleryProps) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [creatorFilter, setCreatorFilter] = useState("all");
  const [contactFilter, setContactFilter] = useState("all");
  const [opportunityFilter, setOpportunityFilter] = useState("all");
  const [linkFilter, setLinkFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const from = normalizeInputDate(dateFrom);
    const to = normalizeInputDate(dateTo, true);

    return items.filter((item) => {
      const linked = Boolean(item.contactId || item.opportunityId);
      const itemDate = getDateValue(item.date);
      const dateMatches = (!from || (itemDate && itemDate >= from)) && (!to || (itemDate && itemDate <= to));
      const haystack = [
        item.title,
        item.tags?.join(" "),
        item.searchableText,
        item.createdByName,
        item.contactName,
        item.opportunityName,
        formatGalleryDate(item.date, "d MMMM yyyy"),
      ].filter(Boolean).join(" ").toLowerCase();

      return (!needle || haystack.includes(needle)) &&
        dateMatches &&
        (creatorFilter === "all" || item.createdById === creatorFilter) &&
        (contactFilter === "all" || item.contactId === contactFilter) &&
        (opportunityFilter === "all" || item.opportunityId === opportunityFilter) &&
        (linkFilter === "all" || (linkFilter === "linked" ? linked : !linked));
    });
  }, [contactFilter, creatorFilter, dateFrom, dateTo, items, linkFilter, opportunityFilter, search]);

  const creatorOptions = useMemo(() => uniqueOptions(items, "createdById", "createdByName"), [items]);
  const contactOptions = useMemo(() => uniqueOptions(items, "contactId", "contactName"), [items]);
  const opportunityOptions = useMemo(() => uniqueOptions(items, "opportunityId", "opportunityName"), [items]);

  const stats = useMemo(() => ({
    total: items.length,
    visible: filtered.length,
    linked: items.filter((item) => item.contactId || item.opportunityId).length,
    contacts: new Set(items.map((item) => item.contactId).filter(Boolean)).size,
  }), [filtered.length, items]);

  const hasFilters = Boolean(search.trim()) ||
    creatorFilter !== "all" ||
    contactFilter !== "all" ||
    opportunityFilter !== "all" ||
    linkFilter !== "all" ||
    Boolean(dateFrom) ||
    Boolean(dateTo);

  const resetFilters = () => {
    setSearch("");
    setCreatorFilter("all");
    setContactFilter("all");
    setOpportunityFilter("all");
    setLinkFilter("all");
    setDateFrom("");
    setDateTo("");
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-[linear-gradient(135deg,#f8fbff_0%,#eef6ff_52%,#ffffff_100%)] p-5 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(backPath)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <Badge variant="outline" className="mb-2 bg-white/75">
                <GalleryHorizontalEnd className={`mr-1 h-3.5 w-3.5 ${accentClassName}`} />
                {badgeLabel}
              </Badge>
              <h1 className="text-2xl font-bold leading-tight text-slate-950 sm:text-3xl">{title}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{description}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="gap-2 bg-white/80" onClick={() => navigate(backPath)}>
              Panoramica
            </Button>
            <Button className="gap-2" onClick={() => navigate(newPath)}>
              <Plus className="h-4 w-4" />
              Nuovo render
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Totali", value: stats.total, icon: GalleryHorizontalEnd },
            { label: "Visibili", value: stats.visible, icon: Search },
            { label: "Collegati CRM", value: stats.linked, icon: Link2 },
            { label: "Contatti", value: stats.contacts, icon: UserRound },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-xl border bg-white/85 p-3 shadow-sm">
              <Icon className={`mb-2 h-4 w-4 ${accentClassName}`} />
              <p className="text-2xl font-bold leading-none">{value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {items.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className={`h-4 w-4 ${accentClassName}`} />
                <p className="text-sm font-semibold">Filtri galleria</p>
              </div>
              {hasFilters && (
                <Button variant="ghost" size="sm" className="gap-2" onClick={resetFilters}>
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset
                </Button>
              )}
            </div>
            <div className="grid gap-2 xl:grid-cols-[minmax(260px,1fr)_160px_180px_180px_155px_145px_145px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={searchPlaceholder}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
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
                <SelectTrigger><SelectValue placeholder="Opportunita" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutte opportunita</SelectItem>
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
              <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} aria-label="Data da" />
              <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} aria-label="Data a" />
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((item) => <Skeleton key={item} className="aspect-[4/3] rounded-2xl" />)}
        </div>
      ) : error ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center" role="alert" aria-live="assertive">
            <AlertTriangle className="h-12 w-12 text-destructive/70" aria-hidden="true" />
            <div>
              <p className="font-medium">Impossibile caricare la galleria</p>
              <p className="mt-1 text-sm text-muted-foreground">Problema temporaneo. Riprova tra qualche secondo.</p>
            </div>
            {onRetry && (
              <Button variant="outline" onClick={() => void onRetry()} disabled={isRefetching}>
                <RefreshCw className={`mr-2 h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} aria-hidden="true" />
                Riprova
              </Button>
            )}
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
            <EmptyIcon className="h-14 w-14 text-muted-foreground/30" />
            <div>
              <p className="font-medium">{emptyTitle}</p>
              <p className="mt-1 text-sm text-muted-foreground">{emptyDescription}</p>
            </div>
            <Button onClick={() => navigate(newPath)}>
              <Plus className="mr-2 h-4 w-4" />
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
          {filtered.map((item) => {
            const linked = Boolean(item.contactId || item.opportunityId);
            return (
              <Card key={item.id} className="group overflow-hidden transition-all hover:border-primary/40 hover:shadow-md">
                <button
                  type="button"
                  className="block w-full text-left"
                  disabled={!item.detailPath}
                  onClick={() => item.detailPath && navigate(item.detailPath)}
                >
                  <div className="relative aspect-[16/10] bg-muted">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.title}
                        className={`h-full w-full transition-transform duration-300 group-hover:scale-[1.03] ${item.imageFit === "contain" ? "object-contain p-2" : "object-cover"}`}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Image className="h-8 w-8 text-muted-foreground/40" />
                      </div>
                    )}
                    {item.originalUrl && (
                      <div className="absolute left-3 top-3 rounded-full bg-black/65 px-2 py-1 text-[10px] font-medium text-white">
                        Prima / dopo disponibile
                      </div>
                    )}
                    <div className="absolute right-3 top-3 rounded-full bg-white/90 px-2 py-1 text-[10px] font-semibold text-slate-800 shadow-sm">
                      {moduleName}
                    </div>
                  </div>

                  <div className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="truncate text-sm font-semibold">{item.title}</h2>
                        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="h-3.5 w-3.5" />
                          {formatGalleryDate(item.date)}
                        </p>
                      </div>
                      <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </div>

                    {item.tags && item.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {item.tags.slice(0, 4).map((tag) => (
                          <Badge key={tag} variant="outline" className="text-[10px] capitalize">
                            {tag.replace(/_/g, " ")}
                          </Badge>
                        ))}
                      </div>
                    )}

                    <div className="grid gap-2 rounded-xl border bg-muted/20 p-3 text-xs">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Creato da</span>
                        <span className="truncate font-medium">{item.createdByName ?? "Non disponibile"}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Contatto</span>
                        <span className="truncate font-medium">{item.contactName ?? "Non collegato"}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Opportunita</span>
                        <span className="truncate font-medium">{item.opportunityName ?? "Non collegata"}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      {linked ? (
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
