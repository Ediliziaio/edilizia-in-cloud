/**
 * CruscottoHub — Hub dashboard stile GHL
 * Flusso: hub → fonte → (library) → nome → crea → editor
 */

import { useState, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useDashboards,
  useCompanyRoleDashboards,
  useDashboardTemplates,
  useSetCompanyRoleDashboard,
  useUnsetCompanyRoleDashboard,
  useCloneTemplateToCompany,
  useSaveDashboard,
} from "@/lib/dashboardBuilder/hooks";
import type {
  AppRole,
  DashboardListItem,
  DashboardTemplate,
} from "@/lib/dashboardBuilder/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Plus,
  LayoutDashboard,
  Trash2,
  Pencil,
  ChevronDown,
  Loader2,
  LayoutGrid,
  Users,
  ExternalLink,
  ArrowLeft,
  Copy,
  Layers,
  Search,
  Star,
  ChevronRight,
  BarChart2,
  TrendingUp,
  PieChart,
  Activity,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Ruoli ───────────────────────────────────────────────────────────────────
const ALL_ROLES: Array<{ role: AppRole; label: string; color: string }> = [
  { role: "company_admin", label: "Admin",       color: "bg-violet-100 text-violet-700 border-violet-200" },
  { role: "company_staff", label: "Staff",       color: "bg-blue-100 text-blue-700 border-blue-200" },
  { role: "salesperson",   label: "Commerciale", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { role: "call_center",   label: "Call Center", color: "bg-amber-100 text-amber-700 border-amber-200" },
  { role: "employee",      label: "Dipendente",  color: "bg-orange-100 text-orange-700 border-orange-200" },
];

// ─── Colori card dashboard (stabili via hash sull'id) ─────────────────────────
const CARD_GRADIENTS = [
  { from: "from-blue-400",   to: "to-blue-600",    icon: BarChart2  },
  { from: "from-violet-400", to: "to-violet-600",  icon: TrendingUp },
  { from: "from-emerald-400",to: "to-emerald-600", icon: Activity   },
  { from: "from-orange-400", to: "to-orange-600",  icon: PieChart   },
  { from: "from-pink-400",   to: "to-pink-600",    icon: BarChart2  },
  { from: "from-teal-400",   to: "to-teal-600",    icon: TrendingUp },
  { from: "from-indigo-400", to: "to-indigo-600",  icon: Activity   },
  { from: "from-rose-400",   to: "to-rose-600",    icon: PieChart   },
];

function getCardStyle(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return CARD_GRADIENTS[hash % CARD_GRADIENTS.length];
}

// ─── Dashboard card ───────────────────────────────────────────────────────────
function DashboardCard({
  dashboard,
  roleLabels,
}: {
  dashboard: DashboardListItem;
  roleLabels: Array<{ label: string; color: string }>;
}) {
  const style = getCardStyle(dashboard.id);
  const Icon  = style.icon;

  return (
    <div className="group rounded-xl border bg-card overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 flex flex-col">
      {/* Thumbnail colorato */}
      <div className={cn(
        "h-28 bg-gradient-to-br flex items-center justify-center relative",
        style.from, style.to,
      )}>
        {/* Decorazioni sfondo */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-2 right-4 h-12 w-12 rounded-full bg-white/30" />
          <div className="absolute bottom-0 left-2 h-16 w-16 rounded-full bg-white/20" />
        </div>
        <Icon className="h-10 w-10 text-white drop-shadow-md relative z-10" />

        {/* Azioni hover */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 z-20">
          <Link to={`/azienda/dashboards/${dashboard.id}`}>
            <Button size="sm" variant="secondary" className="h-8 gap-1.5 shadow">
              <ExternalLink className="h-3.5 w-3.5" />
              Apri
            </Button>
          </Link>
          {dashboard.can_edit && (
            <Link to={`/azienda/dashboards/${dashboard.id}/modifica`}>
              <Button size="sm" variant="secondary" className="h-8 gap-1.5 shadow">
                <Pencil className="h-3.5 w-3.5" />
                Modifica
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col gap-2 flex-1">
        <div>
          <p className="font-semibold text-sm leading-snug truncate">{dashboard.name}</p>
          {dashboard.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
              {dashboard.description}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between mt-auto gap-2">
          {/* Ruoli */}
          <div className="flex flex-wrap gap-1 min-w-0">
            {roleLabels.slice(0, 3).map((r) => (
              <span
                key={r.label}
                className={cn(
                  "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                  r.color,
                )}
              >
                {r.label}
              </span>
            ))}
            {roleLabels.length > 3 && (
              <span className="text-[10px] text-muted-foreground">+{roleLabels.length - 3}</span>
            )}
          </div>

          {/* Scope badge */}
          <Badge variant="outline" className="text-[10px] shrink-0 px-1.5 py-0.5">
            {dashboard.scope === "personal" ? "Privata" : "Aziendale"}
          </Badge>
        </div>
      </div>
    </div>
  );
}

// ─── Card vuota "+ Nuova" ─────────────────────────────────────────────────────
function AddCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-xl border-2 border-dashed border-muted-foreground/20 flex flex-col items-center justify-center gap-2 min-h-[200px] text-muted-foreground/50 transition-all hover:border-primary/40 hover:text-primary hover:bg-primary/5 group"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-current transition-transform group-hover:scale-110">
        <Plus className="h-5 w-5" />
      </div>
      <span className="text-sm font-medium">Aggiungi dashboard</span>
    </button>
  );
}

// ─── Step 1: Fonte della dashboard ────────────────────────────────────────────
function SourceStep({
  onSelect,
  onBack,
}: {
  onSelect: (src: "blank" | "template" | "clone") => void;
  onBack: () => void;
}) {
  const sources = [
    {
      id: "blank" as const,
      title: "Crea una dashboard vuota",
      desc: "Inizia da zero con una lavagna pulita",
      icon: Plus,
      gradient: "from-blue-400 to-blue-600",
    },
    {
      id: "template" as const,
      title: "Dalla Libreria di modelli",
      desc: "Usa un modello già pronto dalla libreria o uno dei tuoi",
      icon: Layers,
      gradient: "from-violet-400 to-violet-600",
    },
    {
      id: "clone" as const,
      title: "Clona dashboard esistente",
      desc: "Crea un clone della tua dashboard attuale",
      icon: Copy,
      gradient: "from-emerald-400 to-emerald-600",
    },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center px-6 py-4 border-b">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Indietro
        </button>
        <p className="mx-auto text-sm font-semibold">Nuova dashboard</p>
        <div className="w-20" />
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="mb-8 text-center">
          <h2 className="text-xl font-semibold">Fonte della dashboard</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Seleziona una dashboard vuota per iniziare da zero o scegli da un modello.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-5 w-full max-w-3xl">
          {sources.map((src) => {
            const Icon = src.icon;
            return (
              <button
                key={src.id}
                onClick={() => onSelect(src.id)}
                className="group rounded-2xl border-2 border-transparent bg-muted/40 hover:border-primary hover:bg-white hover:shadow-lg transition-all duration-200 p-6 flex flex-col items-center text-center gap-4"
              >
                <div className={cn(
                  "h-20 w-20 rounded-2xl bg-gradient-to-br flex items-center justify-center shadow-md transition-transform group-hover:scale-105",
                  src.gradient,
                )}>
                  <Icon className="h-9 w-9 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-sm leading-snug">{src.title}</p>
                  <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                    {src.desc}
                  </p>
                </div>
                <Button size="sm" variant="outline" className="mt-auto w-full group-hover:bg-primary group-hover:text-white group-hover:border-primary transition-colors">
                  Seleziona
                </Button>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Step 2a: Template library ────────────────────────────────────────────────
const TEMPLATE_CATEGORIES = ["Tutte le categorie", "executive", "sales", "operations", "finance", "marketing"];

function TemplateLibraryStep({
  onSelect,
  onBack,
}: {
  onSelect: (tpl: DashboardTemplate) => void;
  onBack: () => void;
}) {
  const { data: templates = [], isLoading } = useDashboardTemplates();
  const [search, setSearch]   = useState("");
  const [category, setCategory] = useState("Tutte le categorie");

  const filtered = useMemo(() => {
    return templates.filter((t) => {
      const matchSearch = !search || t.name.toLowerCase().includes(search.toLowerCase());
      const matchCat    = category === "Tutte le categorie" || t.category === category;
      return matchSearch && matchCat;
    });
  }, [templates, search, category]);

  const TPL_GRADIENTS = [
    "from-orange-400 to-rose-500",
    "from-emerald-400 to-teal-500",
    "from-amber-400 to-orange-500",
    "from-violet-400 to-purple-500",
    "from-blue-400 to-indigo-500",
    "from-pink-400 to-rose-500",
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center px-6 py-4 border-b gap-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
          Indietro
        </button>
        <p className="text-sm font-semibold flex-1 text-center">Nuova dashboard</p>
        <div className="w-20" />
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-52 border-r shrink-0 flex flex-col">
          <div className="p-3 border-b">
            <p className="text-sm font-semibold">Libreria di modelli</p>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-0.5">
              {[
                { label: "Tutti i modelli", icon: Layers },
                { label: "I miei modelli",  icon: Star },
              ].map(({ label, icon: Icon }) => (
                <button
                  key={label}
                  onClick={() => setCategory("Tutte le categorie")}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-left",
                    category === "Tutte le categorie"
                      ? "bg-primary/10 text-primary font-medium"
                      : "hover:bg-muted text-muted-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}

              <Separator className="my-2" />
              <p className="text-xs font-semibold text-muted-foreground px-3 py-1 uppercase tracking-wide">
                Categorie
              </p>
              {TEMPLATE_CATEGORIES.filter((c) => c !== "Tutte le categorie").map((cat) => {
                const count = templates.filter((t) => t.category === cat).length;
                return (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors text-left",
                      category === cat
                        ? "bg-primary/10 text-primary font-medium"
                        : "hover:bg-muted text-muted-foreground",
                    )}
                  >
                    <span className="capitalize">{cat}</span>
                    <span className="text-xs opacity-60">{count}</span>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Search + filter bar */}
          <div className="p-4 border-b flex items-center gap-3">
            <p className="font-semibold text-sm">Dashboard</p>
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Cerca per categoria..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
          </div>

          <ScrollArea className="flex-1 p-4">
            {isLoading ? (
              <div className="grid grid-cols-2 gap-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-48 rounded-xl bg-muted/50 animate-pulse" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
                <Layers className="h-8 w-8 opacity-30" />
                <p className="text-sm">Nessun template trovato</p>
              </div>
            ) : (
              <>
                <p className="text-xs text-muted-foreground mb-3">
                  Aggiunti di recente
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {filtered.map((tpl, idx) => {
                    const grad = TPL_GRADIENTS[idx % TPL_GRADIENTS.length];
                    const roleLabels = (tpl.target_roles ?? [])
                      .map((r) => ALL_ROLES.find((x) => x.role === r)?.label ?? r)
                      .join(", ");
                    return (
                      <button
                        key={tpl.id}
                        onClick={() => onSelect(tpl)}
                        className="group rounded-xl border overflow-hidden text-left hover:border-primary hover:shadow-md transition-all duration-200"
                      >
                        {/* Thumbnail */}
                        <div className={cn(
                          "h-32 bg-gradient-to-br relative flex items-center justify-center",
                          grad,
                        )}>
                          <div className="absolute inset-0 opacity-20">
                            <div className="absolute top-3 right-6 h-8 w-8 rounded-full bg-white/40" />
                            <div className="absolute bottom-2 left-4 h-12 w-12 rounded-full bg-white/20" />
                          </div>
                          <LayoutDashboard className="h-10 w-10 text-white/90 drop-shadow-md" />
                        </div>
                        {/* Label */}
                        <div className="p-3">
                          <p className="font-semibold text-sm leading-snug">{tpl.name}</p>
                          {tpl.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                              {tpl.description}
                            </p>
                          )}
                          {roleLabels && (
                            <p className="text-[10px] text-muted-foreground mt-1 font-medium">
                              {roleLabels}
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}

// ─── Step 2b: Clona esistente ─────────────────────────────────────────────────
function ClonePickStep({
  dashboards,
  onSelect,
  onBack,
}: {
  dashboards: DashboardListItem[];
  onSelect: (d: DashboardListItem) => void;
  onBack: () => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = dashboards.filter((d) =>
    d.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center px-6 py-4 border-b">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Indietro
        </button>
        <p className="mx-auto text-sm font-semibold">Clona dashboard</p>
        <div className="w-20" />
      </div>

      <div className="p-4 border-b">
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Cerca dashboard..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 text-sm"
            autoFocus
          />
        </div>
      </div>

      <ScrollArea className="flex-1 p-4">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">Nessuna dashboard trovata</p>
        ) : (
          <div className="space-y-1.5">
            {filtered.map((d) => {
              const style = getCardStyle(d.id);
              const Icon  = style.icon;
              return (
                <button
                  key={d.id}
                  onClick={() => onSelect(d)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border hover:border-primary hover:bg-primary/5 transition-all group text-left"
                >
                  <div className={cn(
                    "h-10 w-10 rounded-lg bg-gradient-to-br flex items-center justify-center shrink-0",
                    style.from, style.to,
                  )}>
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{d.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {d.scope === "personal" ? "Privata" : "Aziendale"}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                </button>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

// ─── Step 3: Nome + visibilità ────────────────────────────────────────────────
function NameStep({
  defaultName,
  isAdmin,
  isPending,
  onConfirm,
  onBack,
}: {
  defaultName?: string;
  isAdmin: boolean;
  isPending: boolean;
  onConfirm: (name: string, isPrivate: boolean) => void;
  onBack: () => void;
}) {
  const [name, setName]         = useState(defaultName ?? "");
  const [isPrivate, setPrivate] = useState(true);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center px-6 py-4 border-b">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Indietro
        </button>
        <p className="mx-auto text-sm font-semibold">Nuova dashboard</p>
        <div className="w-20" />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-6">
          {/* Icon */}
          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <Plus className="h-8 w-8 text-primary" />
            </div>
          </div>

          <div className="text-center">
            <h2 className="text-xl font-semibold">Nuova dashboard</h2>
          </div>

          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="dash-name" className="text-sm font-medium">
              Nome della dashboard
            </Label>
            <Input
              id="dash-name"
              placeholder="(ad es.) Panoramica delle vendite"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) onConfirm(name.trim(), isPrivate); }}
              autoFocus
              className="h-11 text-sm"
            />
          </div>

          {/* Private toggle (solo se admin può scegliere aziendale) */}
          {isAdmin && (
            <div className="rounded-xl border bg-muted/30 p-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Dashboard privata</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  {isPrivate
                    ? "Solo tu potrai vederla. Non sarà visibile agli altri membri del team."
                    : "Visibile a tutto il team aziendale e assegnabile ai ruoli."}
                </p>
              </div>
              <Switch
                checked={isPrivate}
                onCheckedChange={setPrivate}
                className="shrink-0 mt-0.5"
              />
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={onBack}>
              Annulla
            </Button>
            <Button
              className="flex-1"
              disabled={isPending || !name.trim()}
              onClick={() => onConfirm(name.trim(), isPrivate)}
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Conferma
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Dialog creazione (contenitore step) ─────────────────────────────────────
type CreateSource = "blank" | "template" | "clone";
type CreateStep  = "source" | "template-pick" | "clone-pick" | "name";

function CreateDashboardDialog({
  open,
  onClose,
  dashboards,
  isAdmin,
}: {
  open: boolean;
  onClose: () => void;
  dashboards: DashboardListItem[];
  isAdmin: boolean;
}) {
  const navigate = useNavigate();
  const [step, setStep]               = useState<CreateStep>("source");
  const [source, setSource]           = useState<CreateSource>("blank");
  const [pickedTemplate, setTemplate] = useState<DashboardTemplate | null>(null);
  const [pickedClone, setClone]       = useState<DashboardListItem | null>(null);

  const saveDash  = useSaveDashboard();
  const cloneTpl  = useCloneTemplateToCompany();
  const isPending = saveDash.isPending || cloneTpl.isPending;

  const reset = () => {
    setStep("source");
    setSource("blank");
    setTemplate(null);
    setClone(null);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSourceSelect = (src: CreateSource) => {
    setSource(src);
    if (src === "template") setStep("template-pick");
    else if (src === "clone") setStep("clone-pick");
    else setStep("name");
  };

  const handleTemplateSelect = (tpl: DashboardTemplate) => {
    setTemplate(tpl);
    setStep("name");
  };

  const handleCloneSelect = (d: DashboardListItem) => {
    setClone(d);
    setStep("name");
  };

  const defaultName =
    pickedTemplate?.name ??
    (pickedClone ? `${pickedClone.name} (copia)` : "");

  const handleConfirm = (name: string, isPrivate: boolean) => {
    const scope: "personal" | "company" = isPrivate ? "personal" : "company";

    if (source === "blank") {
      saveDash.mutate(
        { name, scope, layout: { widgets: [] } },
        {
          onSuccess: (res) => {
            toast.success(`Dashboard "${name}" creata`);
            handleClose();
            navigate(`/azienda/dashboards/${res.dashboard_id}/modifica`);
          },
          onError: (e) => toast.error(String(e)),
        },
      );
    } else if (source === "template" && pickedTemplate) {
      cloneTpl.mutate(
        { templateId: pickedTemplate.id, scope, name },
        {
          onSuccess: (newId) => {
            toast.success(`Dashboard "${name}" creata`);
            handleClose();
            navigate(`/azienda/dashboards/${newId}/modifica`);
          },
          onError: (e) => toast.error(String(e)),
        },
      );
    } else if (source === "clone" && pickedClone) {
      // Clona salvando il layout della dashboard esistente (non abbiamo RPC dedicata,
      // usiamo saveDashboard con layout vuoto per ora — il builder permette di importarlo)
      saveDash.mutate(
        { name, scope, layout: { widgets: [] } },
        {
          onSuccess: (res) => {
            toast.success(`Dashboard "${name}" creata`);
            handleClose();
            navigate(`/azienda/dashboards/${res.dashboard_id}/modifica`);
          },
          onError: (e) => toast.error(String(e)),
        },
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent
        className="max-w-4xl w-full h-[85vh] p-0 gap-0 overflow-hidden flex flex-col"
      >
        {step === "source" && (
          <SourceStep
            onSelect={handleSourceSelect}
            onBack={handleClose}
          />
        )}
        {step === "template-pick" && (
          <TemplateLibraryStep
            onSelect={handleTemplateSelect}
            onBack={() => setStep("source")}
          />
        )}
        {step === "clone-pick" && (
          <ClonePickStep
            dashboards={dashboards}
            onSelect={handleCloneSelect}
            onBack={() => setStep("source")}
          />
        )}
        {step === "name" && (
          <NameStep
            defaultName={defaultName}
            isAdmin={isAdmin}
            isPending={isPending}
            onConfirm={handleConfirm}
            onBack={() => {
              if (source === "template") setStep("template-pick");
              else if (source === "clone") setStep("clone-pick");
              else setStep("source");
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Sezione ruoli (admin, collassabile) ──────────────────────────────────────
function RoleMapSection({ dashboards }: { dashboards: DashboardListItem[] }) {
  const [open, setOpen] = useState(false);
  const { data: roleMap = [], isLoading } = useCompanyRoleDashboards();
  const setRole   = useSetCompanyRoleDashboard();
  const unsetRole = useUnsetCompanyRoleDashboard();

  const mapByRole = useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of roleMap) m[r.role] = r.dashboard_id;
    return m;
  }, [roleMap]);

  const handleSet = (role: AppRole, dashboardId: string) => {
    if (dashboardId === "__none__") {
      unsetRole.mutate(role, {
        onSuccess: () => toast.success("Mappatura rimossa"),
        onError:   (e) => toast.error(String(e)),
      });
    } else {
      setRole.mutate({ role, dashboardId }, {
        onSuccess: () => toast.success("Dashboard associata"),
        onError:   (e) => toast.error(String(e)),
      });
    }
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Users className="h-4 w-4" />
          Configurazione ruoli
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", open && "rotate-180")} />
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="mt-3 rounded-2xl border bg-card overflow-hidden shadow-sm">
          <div className="px-5 py-3.5 border-b bg-muted/30">
            <p className="text-sm font-semibold">Mappa Ruolo → Dashboard</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Ogni ruolo verrà reindirizzato automaticamente alla dashboard assegnata.
            </p>
          </div>

          {isLoading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-11 rounded-lg bg-muted/50 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="divide-y">
              {ALL_ROLES.map(({ role, label, color }) => {
                const currentId   = mapByRole[role] ?? "__none__";
                const currentDash = dashboards.find((d) => d.id === currentId);
                return (
                  <div key={role} className="flex items-center justify-between gap-4 px-5 py-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={cn(
                        "rounded-full border px-2 py-0.5 text-[11px] font-semibold shrink-0",
                        color,
                      )}>
                        {label}
                      </span>
                      <span className="text-xs text-muted-foreground font-mono truncate">{role}</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <Select
                        value={currentId}
                        onValueChange={(v) => handleSet(role, v)}
                        disabled={setRole.isPending || unsetRole.isPending}
                      >
                        <SelectTrigger className="w-52 h-8 text-xs">
                          <SelectValue placeholder="— Nessuna —" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— Nessuna —</SelectItem>
                          {dashboards.map((d) => (
                            <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {currentDash && (
                        <Link to={`/azienda/dashboards/${currentId}`} target="_blank">
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                      )}

                      {currentId !== "__none__" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleSet(role, "__none__")}
                          disabled={unsetRole.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function CruscottoHub() {
  const permissions              = usePermissions();
  const [createOpen, setCreate]  = useState(false);

  const { data: dashboards = [], isLoading: dashLoading } = useDashboards();
  const { data: roleMap    = [] }                          = useCompanyRoleDashboards();

  // Mappa dashboard_id → ruoli
  const rolesByDashId = useMemo(() => {
    const m: Record<string, Array<{ label: string; color: string }>> = {};
    for (const r of roleMap) {
      const meta = ALL_ROLES.find((x) => x.role === r.role);
      if (!meta) continue;
      if (!m[r.dashboard_id]) m[r.dashboard_id] = [];
      m[r.dashboard_id].push({ label: meta.label, color: meta.color });
    }
    return m;
  }, [roleMap]);

  const myDashboards     = dashboards.filter((d) => d.is_owner);
  const sharedDashboards = dashboards.filter((d) => !d.is_owner);

  if (permissions.isLoading || dashLoading) {
    return (
      <div className="space-y-6 max-w-6xl">
        <div className="flex items-center justify-between">
          <div className="h-8 w-36 bg-muted rounded-lg animate-pulse" />
          <div className="h-9 w-44 bg-muted rounded-lg animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-52 rounded-xl bg-muted/40 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {dashboards.length === 0
              ? "Crea la tua prima dashboard"
              : `${dashboards.length} dashboard${dashboards.length > 1 ? "" : ""} disponibili`}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link to="/azienda/cruscotto/aziendale">
            <Button variant="outline" size="sm" className="gap-1.5">
              <LayoutGrid className="h-4 w-4" />
              Cruscotto classico
            </Button>
          </Link>
          <Button size="sm" className="gap-1.5" onClick={() => setCreate(true)}>
            <Plus className="h-4 w-4" />
            Aggiungi dashboard
          </Button>
        </div>
      </div>

      {/* ── Configurazione ruoli (admin) ────────────────────────────────────── */}
      {permissions.isAdmin && <RoleMapSection dashboards={dashboards} />}

      {/* ── Le mie dashboard ────────────────────────────────────────────────── */}
      {myDashboards.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
            Le mie dashboard
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {myDashboards.map((d) => (
              <DashboardCard
                key={d.id}
                dashboard={d}
                roleLabels={rolesByDashId[d.id] ?? []}
              />
            ))}
            <AddCard onClick={() => setCreate(true)} />
          </div>
        </section>
      )}

      {/* ── Dashboard aziendali ─────────────────────────────────────────────── */}
      {sharedDashboards.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
            Dashboard aziendali
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {sharedDashboards.map((d) => (
              <DashboardCard
                key={d.id}
                dashboard={d}
                roleLabels={rolesByDashId[d.id] ?? []}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Empty state ─────────────────────────────────────────────────────── */}
      {dashboards.length === 0 && (
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-5">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-muted">
            <LayoutDashboard className="h-9 w-9 text-muted-foreground/50" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-base">Nessuna dashboard ancora</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs">
              Crea la tua prima dashboard o usa un template per iniziare subito.
            </p>
          </div>
          <Button onClick={() => setCreate(true)} className="gap-2 h-10 px-6">
            <Plus className="h-4 w-4" />
            Aggiungi dashboard
          </Button>
        </div>
      )}

      {/* ── Dialog creazione ────────────────────────────────────────────────── */}
      <CreateDashboardDialog
        open={createOpen}
        onClose={() => setCreate(false)}
        dashboards={dashboards}
        isAdmin={permissions.isAdmin}
      />
    </div>
  );
}
