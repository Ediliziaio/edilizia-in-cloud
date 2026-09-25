import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { UpgradeScopriWall } from "@/components/subscription/UpgradeScopriBanner";
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
import { loadRenderGalleryMeta, resolveRenderGalleryMeta, type RenderGalleryMeta } from "@/lib/render/renderGalleryMeta";
import { formatRenderDate, isRenderStale, normalizeRenderStatus } from "@/lib/render/renderStatus";
import {
  AlertTriangle,
  Bath,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock,
  DoorOpen,
  GalleryHorizontalEnd,
  Grid3X3,
  Hammer,
  Home,
  Image,
  Link2,
  PanelLeftClose,
  Search,
  ShieldCheck,
  Sofa,
  Sun,
  TreePine,
  UserRound,
  Waves,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";

type CategoryGroup = "all" | "interni" | "involucro" | "outdoor" | "aperture" | "multi";

interface RenderCategory {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  color: string;
  path: string;
  active: boolean;
  badge: string;
  group: Exclude<CategoryGroup, "all">;
  groupLabel: string;
  tags: string[];
}

interface RecentRender {
  id: string;
  status: string;
  result_url: string | null;
  created_at: string;
  render_type: string;
  created_by: string | null;
  contact_id: string | null;
  opportunity_id: string | null;
  meta: RenderGalleryMeta;
}

const categories: RenderCategory[] = [
  {
    id: "infissi",
    title: "Infissi",
    description: "Sostituisci finestre e porte mantenendo facciata e vano reali",
    icon: DoorOpen,
    color: "bg-blue-50 text-blue-600",
    path: "/azienda/render/infissi",
    active: true,
    badge: "Attivo",
    group: "aperture",
    groupLabel: "Aperture",
    tags: ["finestre", "serramenti", "vetro", "cassonetto"],
  },
  {
    id: "bagno",
    title: "Bagno",
    description: "Rinnova piastrelle, sanitari, vasca, doccia, mobile e rubinetti",
    icon: Bath,
    color: "bg-cyan-50 text-cyan-600",
    path: "/azienda/render/bagno",
    active: true,
    badge: "Attivo",
    group: "interni",
    groupLabel: "Interni",
    tags: ["sanitari", "rivestimenti", "doccia", "vasca"],
  },
  {
    id: "stanza",
    title: "Stanza / Interni",
    description: "Restyling ambienti: pareti, arredo, luci, tende e cucina",
    icon: Sofa,
    color: "bg-purple-50 text-purple-600",
    path: "/azienda/render/stanza",
    active: true,
    badge: "Attivo",
    group: "interni",
    groupLabel: "Interni",
    tags: ["soggiorno", "cucina", "arredo", "illuminazione"],
  },
  {
    id: "pavimento",
    title: "Pavimento",
    description: "Cambia pavimento, posa e battiscopa preservando la stanza",
    icon: Grid3X3,
    color: "bg-amber-50 text-amber-600",
    path: "/azienda/render/pavimento",
    active: true,
    badge: "Attivo",
    group: "interni",
    groupLabel: "Interni",
    tags: ["gres", "parquet", "resina", "moquette"],
  },
  {
    id: "facciata",
    title: "Facciata",
    description: "Cappotto, colore, rivestimenti e dettagli sull'edificio reale",
    icon: Building2,
    color: "bg-orange-50 text-orange-600",
    path: "/azienda/render/facciata",
    active: true,
    badge: "Attivo",
    group: "involucro",
    groupLabel: "Involucro",
    tags: ["cappotto", "intonaco", "rivestimento", "balconi"],
  },
  {
    id: "persiane",
    title: "Persiane",
    description: "Aggiungi, sostituisci o rimuovi persiane, scuri e veneziane",
    icon: PanelLeftClose,
    color: "bg-green-50 text-green-600",
    path: "/azienda/render/persiane",
    active: true,
    badge: "Attivo",
    group: "aperture",
    groupLabel: "Aperture",
    tags: ["oscuranti", "scuri", "veneziane", "colore"],
  },
  {
    id: "tetto",
    title: "Tetto",
    description: "Nuova copertura, gronde, lucernari e fotovoltaico",
    icon: Home,
    color: "bg-red-50 text-red-600",
    path: "/azienda/render/tetto",
    active: true,
    badge: "Attivo",
    group: "involucro",
    groupLabel: "Involucro",
    tags: ["copertura", "lattonerie", "fotovoltaico", "lucernari"],
  },
  {
    id: "pergole",
    title: "Pergole",
    description: "Pergole addossate, bioclimatiche, ZIP, telo o vetro",
    icon: Sun,
    color: "bg-emerald-50 text-emerald-600",
    path: "/azienda/render/pergole",
    active: true,
    badge: "Attivo",
    group: "outdoor",
    groupLabel: "Outdoor",
    tags: ["bioclimatica", "lamelle", "screen zip", "patio"],
  },
  {
    id: "piscine",
    title: "Piscine",
    description: "Piscine, sfioro, infinity, coping, deck e acqua realistica",
    icon: Waves,
    color: "bg-teal-50 text-teal-600",
    path: "/azienda/render/piscine",
    active: true,
    badge: "Attivo",
    group: "outdoor",
    groupLabel: "Outdoor",
    tags: ["sfioro", "skimmer", "coping", "giardino"],
  },
  {
    id: "ristrutturazioni",
    title: "Ristrutturazioni",
    description: "Orchestra più sistemi nello stesso render senza conflitti",
    icon: Hammer,
    color: "bg-indigo-50 text-indigo-600",
    path: "/azienda/render/ristrutturazioni",
    active: true,
    badge: "Motore",
    group: "multi",
    groupLabel: "Multi-sistema",
    tags: ["bagno", "facciata", "pavimento", "coordinato"],
  },
  {
    id: "pavimenti-esterni",
    title: "Pavimenti esterni",
    description: "Patio, vialetti, coping piscina, gradini e drenaggio",
    icon: Grid3X3,
    color: "bg-lime-50 text-lime-700",
    path: "/azienda/render/pavimenti-esterni",
    active: true,
    badge: "Motore",
    group: "outdoor",
    groupLabel: "Outdoor",
    tags: ["gres outdoor", "deck", "carrabile", "coping"],
  },
  {
    id: "giardini",
    title: "Giardini",
    description: "Prato, aiuole, siepi, alberi, percorsi e luci outdoor",
    icon: TreePine,
    color: "bg-green-50 text-green-700",
    path: "/azienda/render/giardini",
    active: true,
    badge: "Motore",
    group: "outdoor",
    groupLabel: "Outdoor",
    tags: ["prato", "aiuole", "siepi", "camminamenti"],
  },
  {
    id: "porte-blindate",
    title: "Porte blindate",
    description: "Nuova porta d'ingresso con telaio, soglia e ferramenta reali",
    icon: ShieldCheck,
    color: "bg-slate-100 text-slate-700",
    path: "/azienda/render/porte-blindate",
    active: true,
    badge: "Motore",
    group: "aperture",
    groupLabel: "Aperture",
    tags: ["blindata", "rasomuro", "fiancoluce", "maniglia"],
  },
  {
    id: "porte-interne",
    title: "Porte interne",
    description: "Battente, scorrevole, rasomuro, vetrata e tutta altezza",
    icon: DoorOpen,
    color: "bg-violet-50 text-violet-600",
    path: "/azienda/render/porte-interne",
    active: true,
    badge: "Motore",
    group: "aperture",
    groupLabel: "Aperture",
    tags: ["scorrevole", "rasomuro", "vetrata", "doppia anta"],
  },
];

const groupLabels: Record<CategoryGroup, string> = {
  all: "Tutte",
  interni: "Interni",
  involucro: "Involucro",
  outdoor: "Outdoor",
  aperture: "Aperture",
  multi: "Multi-sistema",
};

const statusLabel: Record<string, string> = {
  completed: "Completato",
  processing: "In corso",
  pending: "In coda",
  failed: "Errore",
};

const typeLabel = Object.fromEntries(categories.map((cat) => [cat.id, cat.title])) as Record<string, string>;
const typePath = Object.fromEntries(categories.map((cat) => [cat.id, cat.path])) as Record<string, string>;

function formatType(value: string) {
  return typeLabel[value] ?? value.replace(/_/g, " ");
}

export default function RenderCategoryHub() {
  const navigate = useNavigate();
  const permessi = usePermissions();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const { isScopriPlan } = useSubscriptionLimits();
  const [categorySearch, setCategorySearch] = useState("");
  const [groupFilter, setGroupFilter] = useState<CategoryGroup>("all");
  const [recentTypeFilter, setRecentTypeFilter] = useState("all");
  const [recentStatusFilter, setRecentStatusFilter] = useState("all");
  const [crmFilter, setCrmFilter] = useState("all");

  const { data: recentRenders = [], isLoading, error: recentError, refetch: refetchRecent } = useQuery({
    queryKey: ["render-unified-recent", companyId],
    queryFn: async () => {
      if (!companyId) return [] as RecentRender[];
      const { data, error } = await supabase
        .from("company_renders_recent" as never)
        .select("id,status,result_url,created_at,render_type,created_by,contact_id,opportunity_id" as never)
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(48);
      if (error) throw error;

      const rows = (data ?? []) as unknown as Omit<RecentRender, "meta">[];
      const maps = await loadRenderGalleryMeta(rows);
      return rows.map((row) => ({
        ...row,
        meta: resolveRenderGalleryMeta(row, maps),
      }));
    },
    enabled: !!companyId,
    retry: 1,
  });

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of recentRenders) counts[item.render_type] = (counts[item.render_type] ?? 0) + 1;
    return counts;
  }, [recentRenders]);

  const filteredCategories = categories.filter((cat) => {
    const search = categorySearch.trim().toLowerCase();
    const matchesGroup = groupFilter === "all" || cat.group === groupFilter;
    const matchesSearch = !search || [
      cat.title,
      cat.description,
      cat.groupLabel,
      ...cat.tags,
    ].join(" ").toLowerCase().includes(search);
    return matchesGroup && matchesSearch;
  });

  const filteredRecent = recentRenders.filter((item) => {
    const linked = Boolean(item.contact_id || item.opportunity_id);
    const status = normalizeRenderStatus(item.status);
    return (
      (recentTypeFilter === "all" || item.render_type === recentTypeFilter) &&
      (recentStatusFilter === "all" || status === recentStatusFilter) &&
      (crmFilter === "all" || (crmFilter === "linked" ? linked : !linked))
    );
  });

  const stats = useMemo(() => {
    const completed = recentRenders.filter((item) => normalizeRenderStatus(item.status) === "completed").length;
    const processing = recentRenders.filter((item) => {
      const status = normalizeRenderStatus(item.status);
      return status === "processing" || status === "pending";
    }).length;
    const linked = recentRenders.filter((item) => item.contact_id || item.opportunity_id).length;
    const stale = recentRenders.filter((item) => isRenderStale(item.status, item.created_at)).length;
    return { completed, processing, linked, stale };
  }, [recentRenders]);

  const handleCategoryClick = (cat: RenderCategory) => {
    if (cat.active) {
      navigate(cat.path);
    } else {
      toast("Questa funzionalità sarà disponibile a breve.");
    }
  };

  if (isScopriPlan) return <UpgradeScopriWall type="render_ai" inline />;

  return (
    // Telefono: titolo e crediti su una riga, moduli a tessere 2 per riga,
    // ultimi render a griglia 2×; niente catalogo (impostazione), spiegazioni e
    // filtro CRM.
    <div className="space-y-8 max-md:space-y-3">
      {/* Da 768 come sul telefono: titolo a sinistra, crediti e «Catalogo
          render» in riga a destra. Via il riquadro sfumato, l'icona, la
          scritta «Render AI» sopra il titolo e la frase sotto; titolo a 24px
          (era 30, più grande di ogni altra pagina). */}
      <div>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between max-md:flex-row max-md:items-center max-md:justify-between max-md:gap-2">
          <div className="flex items-start gap-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-950 max-md:text-lg">Centro render</h1>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-stretch gap-2 md:flex-row md:items-center">
            <RenderCreditsWidget />
            {/* Il catalogo foto dei prodotti: prima stava tra le impostazioni dei preventivi. */}
            {(permessi.isAdmin || permessi.canViewSettingsCustomization) && (
              <Button asChild variant="outline" size="sm" className="max-md:hidden">
                <Link to="/azienda/impostazioni/catalogo-render">
                  <Image className="mr-1.5 h-4 w-4" />
                  Catalogo render
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Statistiche render: vetrina → nascoste su mobile (impilavano 4 card =
          4 schermate prima dei moduli operativi). L'alert "da verificare" sotto
          è azionabile e resta. Niente effetto «sollevati al passaggio del
          mouse»: le card non si cliccano. */}
      <div className="hidden md:grid gap-3 md:grid-cols-4">
        <Card className="border-slate-200 bg-gradient-to-br from-white to-slate-50/80 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <GalleryHorizontalEnd className="h-5 w-5 text-orange-500" />
            <div>
              <p className="text-2xl font-bold">{recentRenders.length}</p>
              <p className="text-xs text-muted-foreground">render recenti</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-gradient-to-br from-white to-slate-50/80 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <div>
              <p className="text-2xl font-bold">{stats.completed}</p>
              <p className="text-xs text-muted-foreground">completati</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-gradient-to-br from-white to-slate-50/80 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="h-5 w-5 text-amber-600" />
            <div>
              <p className="text-2xl font-bold">{stats.processing}</p>
              <p className="text-xs text-muted-foreground">in lavorazione</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-gradient-to-br from-white to-slate-50/80 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <Link2 className="h-5 w-5 text-blue-600" />
            <div>
              <p className="text-2xl font-bold">{stats.linked}</p>
              <p className="text-xs text-muted-foreground">collegati a CRM</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {stats.stale > 0 && (
        <Card className="border-orange-200 bg-orange-50/75">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between max-md:flex-row max-md:items-center max-md:gap-2 max-md:px-3 max-md:py-2">
            <div className="flex items-start gap-3 max-md:min-w-0 max-md:gap-2">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-orange-700 max-md:h-4 max-md:w-4" />
              <div className="max-md:min-w-0">
                <p className="text-sm font-semibold text-orange-950 max-md:text-[13px]">Ci sono render da verificare</p>
                <p className="text-sm text-orange-800 max-md:hidden">
                  {stats.stale} render risultano in coda o elaborazione da oltre 30 minuti. Controlla il modulo relativo prima di rigenerare per evitare doppie operazioni.
                </p>
                <p className="hidden text-[11px] text-orange-800 max-md:block">{stats.stale} in coda da oltre 30 minuti</p>
              </div>
            </div>
            <Button variant="outline" size="sm" className="border-orange-200 bg-white/80 max-md:h-8 max-md:shrink-0 max-md:px-2.5 max-md:text-xs" onClick={() => setRecentStatusFilter("processing")}>
              <span className="max-md:hidden">Filtra in lavorazione</span>
              <span className="hidden max-md:inline">Mostrali</span>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Via il banner «Controllo costi e generazioni» (c'era solo da 768): era
          una frase promozionale e «N in corso · N da verificare» ripeteva i
          numeri qui sopra e l'avviso arancione. */}

      <section className="space-y-4 max-md:space-y-2">
        {/* Da 768 titolo e ricerca in una riga, senza la frase e senza la card
            attorno alla ricerca; il menu categoria sparisce da 640 perché lì ci
            sono già le pillole qui sotto (erano entrambi visibili). */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between max-md:gap-2">
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider max-md:text-[13px] max-md:normal-case max-md:tracking-normal max-md:text-foreground">
              Moduli render
            </h2>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row md:w-[360px] max-md:flex-row">
            <div className="relative flex-1 max-md:min-w-0">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={categorySearch}
                onChange={(event) => setCategorySearch(event.target.value)}
                placeholder="Cerca modulo, materiale, ambiente..."
                className="pl-9"
              />
            </div>
            <Select value={groupFilter} onValueChange={(value) => setGroupFilter(value as CategoryGroup)}>
              <SelectTrigger className="sm:hidden max-md:w-[130px] max-md:shrink-0">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(groupLabels) as CategoryGroup[]).map((group) => (
                  <SelectItem key={group} value={group}>
                    {groupLabels[group]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Chip categoria: duplicano il Select qui sopra → solo desktop */}
        <div className="hidden sm:flex flex-wrap gap-2">
          {(Object.keys(groupLabels) as CategoryGroup[]).map((group) => (
            <Button
              key={group}
              variant={groupFilter === group ? "default" : "outline"}
              size="sm"
              onClick={() => setGroupFilter(group)}
            >
              {/* Senza l'imbuto ripetuto su ogni pillola e il gradiente arancione:
                  la pillola scelta è già piena. */}
              {groupLabels[group]}
            </Button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 max-md:grid-cols-2 max-md:gap-2">
          {filteredCategories.map((cat) => {
            const Icon = cat.icon;
            const count = categoryCounts[cat.id] ?? 0;
            return (
              <Card
                key={cat.id}
                className={`border-slate-200 transition-all duration-200 ${
                  cat.active ? "cursor-pointer hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-md" : "cursor-not-allowed opacity-60"
                }`}
                onClick={() => handleCategoryClick(cat)}
              >
                <CardContent className="p-5 space-y-4 max-md:flex max-md:items-center max-md:gap-2 max-md:space-y-0 max-md:p-2.5">
                  <div className="flex items-start justify-between gap-3 max-md:shrink-0">
                    <div className={`w-12 h-12 rounded-xl ${cat.color} flex items-center justify-center max-md:h-8 max-md:w-8 max-md:rounded-lg`}>
                      <Icon className="h-6 w-6 max-md:h-4 max-md:w-4" />
                    </div>
                    <div className="flex flex-col items-end gap-1 max-md:hidden">
                      <Badge className={cat.badge === "Attivo"
                        ? "bg-green-100 text-green-700 hover:bg-green-100"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-100"
                      }>
                        {cat.badge}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">{count} recenti</span>
                    </div>
                  </div>
                  <div className="max-md:min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-lg max-md:truncate max-md:text-[13px] max-md:leading-tight">{cat.title}</h3>
                      <Badge variant="outline" className="text-[10px] max-md:hidden">{cat.groupLabel}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed max-md:hidden">{cat.description}</p>
                    <p className="hidden text-[11px] leading-tight text-muted-foreground max-md:block">
                      {cat.active ? `${count} recenti` : cat.badge}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-md:hidden">
                    {cat.tags.slice(0, 4).map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-[10px] capitalize">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="space-y-4 max-md:space-y-2">
        {/* Come per i moduli: da 768 titolo e filtri in una riga, senza la
            frase e senza la card attorno ai tre menu. */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between max-md:gap-2">
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider max-md:text-[13px] max-md:normal-case max-md:tracking-normal max-md:text-foreground">
              Ultimi render
            </h2>
          </div>
          <div className="grid gap-2 sm:grid-cols-3 md:w-[480px] max-md:grid-cols-2">
            <Select value={recentTypeFilter} onValueChange={setRecentTypeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Tipo render" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i render</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={recentStatusFilter} onValueChange={setRecentStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Stato" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti gli stati</SelectItem>
                <SelectItem value="completed">Completati</SelectItem>
                <SelectItem value="processing">In elaborazione</SelectItem>
                <SelectItem value="pending">In coda</SelectItem>
                <SelectItem value="failed">Con errore</SelectItem>
              </SelectContent>
            </Select>
            <Select value={crmFilter} onValueChange={setCrmFilter}>
              <SelectTrigger className="max-md:hidden">
                <SelectValue placeholder="CRM" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti</SelectItem>
                <SelectItem value="linked">Collegati CRM</SelectItem>
                <SelectItem value="unlinked">Non collegati</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((item) => (
              <Skeleton key={item} className="aspect-video rounded-xl" />
            ))}
          </div>
        ) : recentError ? (
          <Card>
            <CardContent className="py-12 flex flex-col items-center gap-3 text-center" role="alert">
              <Image className="h-10 w-10 text-destructive/40" aria-hidden="true" />
              <div>
                <p className="font-medium">Impossibile caricare i render recenti</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Si è verificato un errore durante il recupero. Riprova fra qualche istante.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => refetchRecent()}>
                Riprova
              </Button>
            </CardContent>
          </Card>
        ) : recentRenders.length === 0 ? (
          <Card>
            <CardContent className="py-14 flex flex-col items-center gap-3 text-center max-md:py-4">
              <Image className="h-12 w-12 text-muted-foreground/30 max-md:hidden" />
              <div>
                <p className="font-medium max-md:text-[13px]">Ancora nessun render</p>
                <p className="text-sm text-muted-foreground mt-1 max-md:hidden">Scegli un modulo sopra per generare il primo render AI.</p>
              </div>
            </CardContent>
          </Card>
        ) : filteredRecent.length === 0 ? (
          <Card>
            <CardContent className="py-12 flex flex-col items-center gap-3 text-center">
              <Search className="h-10 w-10 text-muted-foreground/30" />
              <div>
                <p className="font-medium">Nessun render con questi filtri</p>
                <p className="text-sm text-muted-foreground mt-1">Riduci i filtri o cambia modulo.</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          // Tre per riga da 1024 (erano due: sedici render, otto righe).
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 max-md:grid-cols-2 max-md:gap-2">
            {filteredRecent.slice(0, 16).map((item) => {
              const typeColor = categories.find((cat) => cat.id === item.render_type)?.color ?? "bg-muted text-foreground";
              const status = normalizeRenderStatus(item.status);
              return (
                <Card
                  key={`${item.render_type}-${item.id}`}
                  className="overflow-hidden cursor-pointer hover:border-primary/40 hover:shadow-md transition-all"
                  onClick={() => navigate(`${typePath[item.render_type] ?? "/azienda/render"}/gallery/${item.id}`)}
                >
                  <div className="aspect-video bg-muted overflow-hidden">
                    {item.result_url ? (
                      <img
                        src={item.result_url}
                        alt={`Render ${formatType(item.render_type)}`}
                        className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center">
                        <Image className="h-8 w-8 text-muted-foreground/30" />
                      </div>
                    )}
                  </div>
                  <CardContent className="p-3 space-y-2 max-md:space-y-1 max-md:p-2">
                    <div className="flex items-center justify-between gap-2 max-md:gap-1">
                      <Badge variant="secondary" className={`${typeColor} text-[10px] border-0 max-md:min-w-0 max-md:truncate max-md:px-1.5`}>
                        {formatType(item.render_type)}
                      </Badge>
                      {/* Telefono: «Completato» è il caso normale, si mostra solo uno stato diverso. */}
                      <Badge
                        variant={status === "failed" ? "destructive" : "outline"}
                        className={`text-[10px] ${status === "completed" ? "max-md:hidden" : "max-md:shrink-0 max-md:px-1.5"}`}
                      >
                        {statusLabel[status] ?? status}
                      </Badge>
                    </div>
                    <div className="space-y-1 text-xs text-muted-foreground max-md:text-[11px]">
                      <p className="flex items-center gap-1.5 truncate">
                        <CalendarDays className="h-3.5 w-3.5 shrink-0 max-md:hidden" />
                        {formatRenderDate(item.created_at)}
                      </p>
                      {item.meta.createdByName && (
                        <p className="flex items-center gap-1.5 truncate max-md:hidden">
                          <UserRound className="h-3.5 w-3.5 shrink-0" />
                          {item.meta.createdByName}
                        </p>
                      )}
                      {(item.meta.contactName || item.meta.opportunityName) && (
                        <p className="flex items-center gap-1.5 truncate text-foreground">
                          <Link2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                          {item.meta.contactName ?? item.meta.opportunityName}
                        </p>
                      )}
                    </div>
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
