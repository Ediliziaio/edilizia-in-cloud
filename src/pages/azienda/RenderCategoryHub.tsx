import { useRenderHistory } from "@/lib/render/renderHistory";
import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { UpgradeScopriWall } from "@/components/subscription/UpgradeScopriBanner";
import { RenderCreditsWidget } from "@/components/render/RenderCreditsWidget";
import { RecentRendersPanel } from "@/components/render/RecentRendersPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { percorsiPlanimetrie } from "@/lib/planimetrie/render/percorsi";
import { ArrowUpRight, Bath, Building2, DoorOpen, Grid3X3, Hammer, Home, Image, LayoutPanelTop, PanelLeftClose, Plus, Search, ShieldCheck, Sofa, Sun, TreePine, Waves, type LucideIcon } from "lucide-react";

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
    description: "Coordina più interventi nello stesso render",
    icon: Hammer,
    color: "bg-indigo-50 text-indigo-600",
    path: "/azienda/render/ristrutturazioni",
    active: true,
    badge: "Attivo",
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
    badge: "Attivo",
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
    badge: "Attivo",
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
    badge: "Attivo",
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
    badge: "Attivo",
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

export default function RenderCategoryHub() {
  const permessi = usePermissions();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const { isScopriPlan } = useSubscriptionLimits();
  const categorySearchRef = useRef<HTMLInputElement>(null);
  const [modulePicker, setModulePicker] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const [groupFilter, setGroupFilter] = useState<CategoryGroup>("all");

  const history = useRenderHistory(companyId, undefined, !isScopriPlan);
  const recentRenders = history.items;
  const recentStatsAvailable = Boolean(companyId) && !history.isLoading && !history.isError;

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of recentRenders) counts[item.render_type] = (counts[item.render_type] ?? 0) + 1;
    return counts;
  }, [recentRenders]);
  const filteredCategories = categories.filter((category) =>
    (groupFilter === "all" || category.group === groupFilter) &&
    [category.title, category.description, category.groupLabel, ...category.tags].join(" ").toLowerCase().includes(categorySearch.trim().toLowerCase()));
  const openModulePicker = () => {
    setCategorySearch("");
    setGroupFilter("all");
    setModulePicker(true);
  };

  if (isScopriPlan) return <UpgradeScopriWall type="render_ai" inline />;

  return <div className="space-y-5 sm:space-y-7">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-bold tracking-tight">Render AI</h1><p className="mt-1 hidden text-sm text-muted-foreground sm:block">Crea nuove viste e ritrova i risultati, stanza per stanza.</p></div>
      <div className="flex flex-wrap items-center gap-1 sm:gap-2">
        <RenderCreditsWidget />
        {(permessi.isAdmin || permessi.canViewSettingsCustomization) && <Button asChild variant="ghost" size="sm" className="h-9 w-9 p-0 sm:w-auto sm:px-3"><Link to="/azienda/impostazioni/catalogo-render" aria-label="Catalogo render" title="Catalogo render"><Image className="h-4 w-4 sm:mr-1.5" /><span className="hidden sm:inline">Catalogo render</span></Link></Button>}
        <Button asChild variant="outline" size="sm" className="h-9 w-9 p-0 sm:w-auto sm:px-3"><Link to={percorsiPlanimetrie.elenco} aria-label="Planimetrie e progetti" title="Planimetrie e progetti"><LayoutPanelTop className="h-4 w-4 sm:mr-1.5" /><span className="hidden sm:inline">Planimetrie e progetti</span></Link></Button>
        <Button size="sm" className="px-2.5 text-xs sm:px-3 sm:text-sm" onClick={openModulePicker}><Plus className="mr-1.5 h-4 w-4" />Nuovo render</Button>
      </div>
    </header>
    <RecentRendersPanel key={companyId} items={recentRenders} modules={categories} isLoading={history.isLoading} isFetching={history.isFetching} error={history.isError && !history.items.length ? history.error : null} onRefresh={() => { void history.refetch(); }} companyId={companyId} total={history.total} hasMore={history.hasNextPage} loadingMore={history.isFetchingNextPage} moreError={history.isFetchNextPageError} scanning={history.scanAll} onLoadMore={() => { void history.fetchNextPage(); }} onExpandHistory={history.expandHistory} onNewRender={openModulePicker} />
    <Dialog open={modulePicker} onOpenChange={setModulePicker}>
      <DialogContent className="max-h-[85dvh] max-w-4xl overflow-y-auto">
        <DialogHeader><DialogTitle>Che cosa vuoi trasformare?</DialogTitle><DialogDescription>Scegli un ambiente o un intervento per iniziare il render.</DialogDescription></DialogHeader>
        <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" /><Input ref={categorySearchRef} aria-label="Cerca modulo render" value={categorySearch} onChange={(event) => setCategorySearch(event.target.value)} placeholder="Cerca bagno, cucina, infissi, giardino…" className="pl-9" /></div>
        <div role="group" aria-label="Categorie dei moduli" className="flex flex-wrap gap-1.5">
          {(Object.keys(groupLabels) as CategoryGroup[]).map((group) => <Button key={group} size="sm" variant={groupFilter === group ? "secondary" : "ghost"} aria-pressed={groupFilter === group} onClick={() => setGroupFilter(group)}>{groupLabels[group]}</Button>)}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredCategories.map((category) => {
            const Icon = category.icon;
            return <Link key={category.id} to={category.path} aria-label={category.title} aria-disabled={!category.active} onClick={() => setModulePicker(false)} className="group flex items-start gap-3 rounded-xl border p-4 transition-colors hover:border-primary/40 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${category.color}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>
              <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2 text-sm font-semibold">{category.title}<ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-primary" /></span><span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{category.description}</span><span className="mt-2 block text-[11px] text-muted-foreground">{recentStatsAvailable ? categoryCounts[category.id] ?? 0 : "—"} render recenti</span></span>
            </Link>;
          })}
        </div>
        {!filteredCategories.length && <div className="py-8 text-center"><p role="status" className="text-sm text-muted-foreground">Nessun modulo trovato.</p><Button size="sm" variant="ghost" onClick={() => { setCategorySearch(""); setGroupFilter("all"); categorySearchRef.current?.focus(); }}>Mostra tutti i moduli</Button></div>}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-xs text-muted-foreground"><span>Vuoi partire dal disegno di una casa?</span><Button variant="link" size="sm" asChild><Link to={percorsiPlanimetrie.elenco} onClick={() => setModulePicker(false)}>Apri Planimetrie e progetti<ArrowUpRight className="ml-1 h-3.5 w-3.5" /></Link></Button></div>
      </DialogContent>
    </Dialog>
  </div>;
}
