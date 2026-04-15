/**
 * CruscottoHub — Hub dashboard stile GHL
 * Flusso: hub → [overlay full-page] fonte → library / clona → [dialog] nome → crea
 */

import { useState, useMemo, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useDashboards,
  useDashboardTemplates,
  useCloneTemplateToCompany,
  useSaveDashboard,
  useDeleteDashboard,
  useCompanyMembers,
  useUpdateDashboardScope,
  useSetDashboardUserAccess,
  useUnsetDashboardUserAccess,
} from "@/lib/dashboardBuilder/hooks";
import type {
  AppRole,
  DashboardListItem,
  DashboardTemplate,
} from "@/lib/dashboardBuilder/types";
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
  Plus,
  Trash2,
  Pencil,
  AlertTriangle,
  Loader2,
  LayoutGrid,
  ExternalLink,
  ArrowLeft,
  Copy,
  Layers,
  Search,
  Star,
  X,
  BarChart2,
  TrendingUp,
  PieChart,
  Activity,
  Phone,
  UserCheck,
  Lightbulb,
  CalendarCheck,
  HardHat,
  Sparkles,
  Settings2,
  Lock,
  Globe,
  Check,
  ShieldCheck,
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

// ─── Palette gradient card ─────────────────────────────────────────────────
const CARD_STYLES = [
  { bg: "from-blue-400 to-blue-600",    icon: BarChart2  },
  { bg: "from-violet-500 to-purple-700",icon: TrendingUp },
  { bg: "from-emerald-400 to-teal-600", icon: Activity   },
  { bg: "from-orange-400 to-rose-500",  icon: PieChart   },
  { bg: "from-pink-400 to-rose-500",    icon: BarChart2  },
  { bg: "from-teal-400 to-cyan-600",    icon: TrendingUp },
  { bg: "from-indigo-400 to-indigo-700",icon: Activity   },
  { bg: "from-amber-400 to-orange-500", icon: PieChart   },
];

const TPL_STYLES = [
  { bg: "from-orange-400 via-red-400 to-rose-500",    icon: Phone       },
  { bg: "from-emerald-400 via-teal-400 to-green-600", icon: UserCheck   },
  { bg: "from-amber-400 via-yellow-400 to-orange-500",icon: Lightbulb   },
  { bg: "from-violet-500 via-purple-500 to-indigo-600",icon: CalendarCheck },
  { bg: "from-blue-400 via-blue-500 to-indigo-500",   icon: BarChart2   },
  { bg: "from-pink-400 via-rose-400 to-red-500",      icon: TrendingUp  },
];

function getCardStyle(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return CARD_STYLES[h % CARD_STYLES.length];
}

function getTplStyle(idx: number) {
  return TPL_STYLES[idx % TPL_STYLES.length];
}

// ─── Illustrazioni SVG ────────────────────────────────────────────────────────
function IlluBlank() {
  return (
    <svg viewBox="0 0 120 90" className="w-28 h-auto opacity-80" fill="none">
      <rect x="8" y="8" width="104" height="74" rx="6" fill="#e2e8f0"/>
      <rect x="16" y="16" width="38" height="28" rx="3" fill="#94a3b8"/>
      <rect x="62" y="16" width="42" height="12" rx="3" fill="#cbd5e1"/>
      <rect x="62" y="32" width="28" height="12" rx="3" fill="#e2e8f0"/>
      <rect x="16" y="52" width="88" height="10" rx="3" fill="#cbd5e1"/>
      <rect x="16" y="66" width="60" height="8" rx="3" fill="#e2e8f0"/>
      <circle cx="24" cy="20" r="6" fill="#64748b"/>
      <rect x="32" y="17" width="14" height="3" rx="1.5" fill="#64748b"/>
      <rect x="32" y="22" width="10" height="3" rx="1.5" fill="#94a3b8"/>
    </svg>
  );
}

function IlluTemplate() {
  return (
    <svg viewBox="0 0 120 90" className="w-28 h-auto opacity-80" fill="none">
      <rect x="8" y="14" width="68" height="62" rx="5" fill="#e2e8f0"/>
      <rect x="14" y="20" width="30" height="20" rx="3" fill="#94a3b8"/>
      <rect x="48" y="20" width="22" height="9" rx="2" fill="#cbd5e1"/>
      <rect x="48" y="31" width="16" height="9" rx="2" fill="#dde4ef"/>
      <rect x="14" y="44" width="56" height="7" rx="2" fill="#cbd5e1"/>
      <rect x="14" y="54" width="40" height="7" rx="2" fill="#e2e8f0"/>
      <circle cx="86" cy="56" r="22" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="2"/>
      <circle cx="86" cy="56" r="14" fill="#f8fafc" stroke="#94a3b8" strokeWidth="1.5"/>
      <line x1="95" y1="65" x2="107" y2="77" stroke="#64748b" strokeWidth="3" strokeLinecap="round"/>
      <circle cx="86" cy="56" r="5" fill="#94a3b8"/>
    </svg>
  );
}

function IlluClone() {
  return (
    <svg viewBox="0 0 120 90" className="w-28 h-auto opacity-80" fill="none">
      <rect x="6" y="18" width="62" height="54" rx="5" fill="#dde4ef"/>
      <rect x="12" y="24" width="24" height="16" rx="2" fill="#94a3b8"/>
      <rect x="40" y="24" width="22" height="7" rx="2" fill="#cbd5e1"/>
      <rect x="40" y="34" width="16" height="7" rx="2" fill="#dde4ef"/>
      <rect x="12" y="44" width="50" height="6" rx="2" fill="#cbd5e1"/>
      <rect x="12" y="53" width="36" height="6" rx="2" fill="#dde4ef"/>
      <rect x="52" y="12" width="62" height="54" rx="5" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="1.5"/>
      <rect x="58" y="18" width="24" height="16" rx="2" fill="#94a3b8" opacity=".7"/>
      <rect x="86" y="18" width="22" height="7" rx="2" fill="#e2e8f0"/>
      <rect x="86" y="28" width="16" height="7" rx="2" fill="#f1f5f9"/>
      <rect x="58" y="38" width="50" height="6" rx="2" fill="#e2e8f0"/>
      <rect x="58" y="47" width="36" height="6" rx="2" fill="#f1f5f9"/>
      <path d="M46 42 L56 42" stroke="#64748b" strokeWidth="2" strokeLinecap="round"/>
      <path d="M53 39 L56 42 L53 45" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ─── Full-page creation overlay ───────────────────────────────────────────────
type CreateSource = "blank" | "template" | "clone";
type CreateStep  = "source" | "template-pick" | "clone-pick" | "name";

function CreationOverlay({
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
  const [step, setStep]             = useState<CreateStep>("source");
  const [source, setSource]         = useState<CreateSource>("blank");
  const [pickedTpl, setPickedTpl]   = useState<DashboardTemplate | null>(null);
  const [pickedClone, setPickedClone] = useState<DashboardListItem | null>(null);
  const [nameOpen, setNameOpen]     = useState(false);

  const saveDash = useSaveDashboard();
  const cloneTpl = useCloneTemplateToCompany();
  const isPending = saveDash.isPending || cloneTpl.isPending;

  const reset = () => {
    setStep("source");
    setSource("blank");
    setPickedTpl(null);
    setPickedClone(null);
    setNameOpen(false);
  };

  const handleClose = () => { reset(); onClose(); };

  const defaultName =
    pickedTpl?.name ?? (pickedClone ? `${pickedClone.name} (copia)` : "");

  const handleConfirm = (name: string, isPrivate: boolean) => {
    const scope: "personal" | "company" = isPrivate ? "personal" : "company";

    if (source === "blank" || (source === "clone" && !pickedTpl)) {
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
    } else if (pickedTpl) {
      cloneTpl.mutate(
        { templateId: pickedTpl.id, scope, name },
        {
          onSuccess: (newId) => {
            toast.success(`Dashboard "${name}" creata`);
            handleClose();
            navigate(`/azienda/dashboards/${newId}/modifica`);
          },
          onError: (e) => toast.error(String(e)),
        },
      );
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Full-page overlay */}
      <div className="fixed inset-0 z-50 bg-white flex flex-col">
        {/* Top bar */}
        <div className="flex items-center h-12 px-6 border-b shrink-0">
          <button
            onClick={step === "source" ? handleClose : () => setStep("source")}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Indietro
          </button>
          <p className="absolute left-1/2 -translate-x-1/2 text-sm font-semibold text-foreground pointer-events-none">
            Nuova dashboard
          </p>
          <button onClick={handleClose} className="ml-auto p-1.5 rounded-md hover:bg-muted transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* ── Step: Fonte ─────────────────────────────────────────── */}
        {step === "source" && (
          <div className="flex-1 overflow-auto bg-[#f8f9fb]">
            <div className="max-w-3xl mx-auto px-6 py-10">
              <div className="mb-8">
                <h2 className="text-base font-semibold text-foreground">Fonte della dashboard</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Seleziona una dashboard vuota per iniziare da zero o scegli da un modello.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-5">
                {[
                  {
                    id: "blank" as const,
                    title: "Crea una dashboard vuota",
                    desc: "Inizia da zero con una lavagna pulita",
                    illus: <IlluBlank />,
                  },
                  {
                    id: "template" as const,
                    title: "Dalla Libreria di modelli",
                    desc: "Usa un modello già pronto dalla libreria o uno dei tuoi",
                    illus: <IlluTemplate />,
                  },
                  {
                    id: "clone" as const,
                    title: "Clona dashboard esistente",
                    desc: "Crea un clone della tua dashboard attuale",
                    illus: <IlluClone />,
                  },
                ].map((src) => (
                  <div
                    key={src.id}
                    className="bg-white rounded-2xl border border-border flex flex-col overflow-hidden hover:border-primary hover:shadow-md transition-all duration-200 group"
                  >
                    <div className="flex-1 flex flex-col items-center justify-center px-6 pt-8 pb-4 gap-5">
                      <div className="flex items-center justify-center h-28">
                        {src.illus}
                      </div>
                      <div className="text-center">
                        <p className="font-semibold text-sm leading-snug">{src.title}</p>
                        <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                          {src.desc}
                        </p>
                      </div>
                    </div>
                    <div className="px-6 pb-6">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full group-hover:bg-primary group-hover:text-white group-hover:border-primary transition-colors"
                        onClick={() => {
                          setSource(src.id);
                          if (src.id === "template") setStep("template-pick");
                          else if (src.id === "clone") setStep("clone-pick");
                          else setNameOpen(true);
                        }}
                      >
                        Seleziona
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Step: Template library ──────────────────────────────── */}
        {step === "template-pick" && (
          <TemplateLibraryContent
            onSelect={(tpl) => { setPickedTpl(tpl); setNameOpen(true); }}
          />
        )}

        {/* ── Step: Clone pick ────────────────────────────────────── */}
        {step === "clone-pick" && (
          <ClonePickContent
            dashboards={dashboards}
            onSelect={(d) => { setPickedClone(d); setNameOpen(true); }}
          />
        )}
      </div>

      {/* ── Name dialog (sopra l'overlay) ──────────────────────────── */}
      <NameDialog
        open={nameOpen}
        defaultName={defaultName}
        isAdmin={isAdmin}
        isPending={isPending}
        onClose={() => setNameOpen(false)}
        onConfirm={handleConfirm}
      />
    </>
  );
}

// ─── Dashboard standard (pre-costruite) ──────────────────────────────────────
const STANDARD_DASHBOARDS = [
  {
    id: "std-aziendale",
    title: "Cruscotto Aziendale",
    description: "KPI strategici, cash flow, marketing e operazioni. La dashboard completa per il management.",
    url: "/azienda/cruscotto/aziendale",
    bg: "from-blue-500 via-blue-600 to-indigo-700",
    icon: LayoutGrid,
  },
  {
    id: "std-gestione",
    title: "Dashboard Gestione",
    description: "Ordini, cantieri, magazzino e scadenze operative. Il pannello operativo quotidiano.",
    url: "/azienda",
    bg: "from-orange-400 via-amber-500 to-orange-600",
    icon: HardHat,
  },
  {
    id: "std-marketing",
    title: "Dashboard Marketing",
    description: "Pipeline, lead, opportunità e performance commerciale. Per il team vendite.",
    url: "/azienda/marketing",
    bg: "from-emerald-400 via-teal-500 to-green-600",
    icon: TrendingUp,
  },
];

// ─── Standard dashboard card (pre-costruita, navigate diretta) ───────────────
function StandardDashboardCard({ dash }: { dash: (typeof STANDARD_DASHBOARDS)[number] }) {
  const navigate = useNavigate();
  const [permOpen, setPermOpen] = useState(false);
  const Icon = dash.icon;
  return (
    <>
      <div className="group rounded-xl border bg-white overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 flex flex-col">
        {/* Thumbnail */}
        <div className={cn("h-32 bg-gradient-to-br relative overflow-hidden", dash.bg)}>
          <div className="absolute inset-0">
            <div className="absolute top-3 right-5 h-14 w-14 rounded-full bg-white/15 blur-md" />
            <div className="absolute -bottom-2 -left-2 h-16 w-16 rounded-full bg-white/10 blur-md" />
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <Icon className="h-10 w-10 text-white/90 drop-shadow-md" />
          </div>

          {/* Gear button top-right */}
          <div className="absolute top-2 right-2 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setPermOpen(true); }}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-black/30 text-white/80 hover:bg-black/50 hover:text-white transition-colors"
              title="Permessi dashboard"
            >
              <Settings2 className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Hover overlay */}
          <button
            type="button"
            onClick={() => navigate(dash.url)}
            className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
          >
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-foreground text-xs font-medium shadow-sm pointer-events-none">
              <ExternalLink className="h-3.5 w-3.5" />
              Apri
            </span>
          </button>
        </div>
        {/* Info */}
        <button
          type="button"
          onClick={() => navigate(dash.url)}
          className="p-3 flex flex-col gap-2 flex-1 text-left"
        >
          <p className="font-semibold text-sm leading-snug truncate">{dash.title}</p>
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{dash.description}</p>
          <div className="mt-auto pt-1 flex justify-end">
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0.5 gap-1 text-primary border-primary/30 bg-primary/5"
            >
              <Sparkles className="h-2.5 w-2.5" />
              Standard
            </Badge>
          </div>
        </button>
      </div>

      <StandardPermissionsDialog
        dash={dash}
        open={permOpen}
        onClose={() => setPermOpen(false)}
      />
    </>
  );
}

// ─── Template library content ─────────────────────────────────────────────────
const SIDEBAR_ITEMS = [
  { label: "Tutti i modelli", key: "all",      icon: Layers   },
  { label: "Standard",        key: "standard", icon: Sparkles },
  { label: "I miei modelli",  key: "mine",     icon: Star     },
];

function TemplateLibraryContent({
  onSelect,
}: {
  onSelect: (t: DashboardTemplate) => void;
}) {
  const navigate = useNavigate();
  const { data: templates = [], isLoading } = useDashboardTemplates();
  const [search, setSearch]       = useState("");
  const [catFilter, setCatFilter] = useState<string>("all");

  const categories = useMemo(() => {
    const cats = new Set(templates.map((t) => t.category).filter(Boolean) as string[]);
    return Array.from(cats);
  }, [templates]);

  // Filtra standard
  const showStandard = catFilter === "all" || catFilter === "standard";
  const filteredStd  = showStandard
    ? STANDARD_DASHBOARDS.filter(
        (s) => !search || s.title.toLowerCase().includes(search.toLowerCase()),
      )
    : [];

  // Filtra DB templates
  const filtered = useMemo(() => {
    if (catFilter === "standard") return [];
    return templates.filter((t) => {
      const matchS = !search || t.name.toLowerCase().includes(search.toLowerCase());
      const matchC = catFilter === "all" || catFilter === "mine" || t.category === catFilter;
      return matchS && matchC;
    });
  }, [templates, search, catFilter]);

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Sidebar */}
      <div className="w-60 border-r bg-white shrink-0 flex flex-col">
        <div className="px-4 py-3 border-b">
          <p className="text-sm font-semibold">Libreria di modelli</p>
        </div>
        <ScrollArea className="flex-1">
          <div className="py-2 px-2 space-y-0.5">
            {SIDEBAR_ITEMS.map(({ label, key, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setCatFilter(key)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left transition-colors",
                  catFilter === key
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </button>
            ))}

            <Separator className="my-2" />

            <p className="text-[11px] font-semibold text-muted-foreground px-3 py-1 uppercase tracking-widest">
              Sfoglia categorie
            </p>

            {categories.map((cat) => {
              const count = templates.filter((t) => t.category === cat).length;
              return (
                <button
                  key={cat}
                  onClick={() => setCatFilter(cat)}
                  className={cn(
                    "w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors",
                    catFilter === cat
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  <span className="capitalize">{cat}</span>
                  <span className="text-xs tabular-nums opacity-60">{count}</span>
                </button>
              );
            })}

            <Separator className="my-2" />
            <p className="text-[11px] font-semibold text-muted-foreground px-3 py-1 uppercase tracking-widest">
              Etichette
            </p>
            <p className="text-xs text-muted-foreground px-3 pb-2">Nessuna etichetta</p>
          </div>
        </ScrollArea>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden bg-[#f8f9fb]">
        {/* Toolbar */}
        <div className="flex items-center gap-4 px-5 py-3 border-b bg-white shrink-0">
          <p className="font-semibold text-sm">Dashboards</p>
          <div className="relative ml-auto w-56">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Cerca per categoria..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm bg-muted/40 border-0 focus-visible:ring-1"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-5 space-y-8">

            {/* ── Sezione Standard ──────────────────────────────────── */}
            {filteredStd.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                    Standard
                  </p>
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    <Sparkles className="h-2.5 w-2.5" />
                    Incluse
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {filteredStd.map((s) => {
                    const Icon = s.icon;
                    return (
                      <button
                        key={s.id}
                        onClick={() => navigate(s.url)}
                        className="group rounded-xl overflow-hidden border-2 border-transparent hover:border-primary hover:shadow-xl transition-all duration-200 text-left bg-white"
                      >
                        <div className={cn(
                          "h-44 bg-gradient-to-br relative overflow-hidden flex items-center justify-center",
                          s.bg,
                        )}>
                          <div className="absolute inset-0">
                            <div className="absolute top-3 right-5 h-14 w-14 rounded-full bg-white/15 blur-md" />
                            <div className="absolute -bottom-2 -left-2 h-16 w-16 rounded-full bg-white/10 blur-md" />
                          </div>
                          <Icon className="h-12 w-12 text-white drop-shadow-lg relative z-10" />
                          <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/35 to-transparent">
                            <p className="text-white font-bold text-sm leading-tight drop-shadow">
                              {s.title}
                            </p>
                          </div>
                        </div>
                        <div className="p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium leading-snug truncate">{s.title}</p>
                            <Badge variant="outline" className="text-[10px] shrink-0 text-primary border-primary/30 bg-primary/5">
                              Standard
                            </Badge>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                            {s.description}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Template dal DB ───────────────────────────────────── */}
            {catFilter !== "standard" && (
              isLoading ? (
                <div className="grid grid-cols-4 gap-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-60 rounded-xl bg-muted/50 animate-pulse" />
                  ))}
                </div>
              ) : filtered.length > 0 ? (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">
                    Dalla libreria
                  </p>
                  <div className="grid grid-cols-4 gap-4">
                    {filtered.map((tpl, idx) => {
                      const style = getTplStyle(idx);
                      const Icon  = style.icon;
                      const roleLabels = (tpl.target_roles ?? [])
                        .map((r) => ALL_ROLES.find((x) => x.role === r)?.label ?? r)
                        .join(", ");
                      return (
                        <button
                          key={tpl.id}
                          onClick={() => onSelect(tpl)}
                          className="group rounded-xl overflow-hidden border-2 border-transparent hover:border-primary hover:shadow-xl transition-all duration-200 text-left bg-white"
                        >
                          <div className={cn(
                            "h-44 bg-gradient-to-br relative overflow-hidden flex items-center justify-center",
                            style.bg,
                          )}>
                            <div className="absolute inset-0">
                              <div className="absolute top-4 right-6 h-16 w-16 rounded-full bg-white/15 blur-sm" />
                              <div className="absolute bottom-4 left-4 h-12 w-12 rounded-full bg-white/10 blur-sm" />
                            </div>
                            <Icon className="h-12 w-12 text-white drop-shadow-lg relative z-10" />
                            <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/30 to-transparent">
                              <p className="text-white font-bold text-sm leading-tight drop-shadow">
                                {tpl.name}
                              </p>
                            </div>
                          </div>
                          <div className="p-3">
                            <p className="text-sm font-medium leading-snug truncate">{tpl.name}</p>
                            {roleLabels && (
                              <p className="text-[11px] text-muted-foreground mt-0.5">{roleLabels}</p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : filteredStd.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
                  <Layers className="h-9 w-9 opacity-30" />
                  <p className="text-sm">Nessun template trovato</p>
                </div>
              ) : null
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

// ─── Clone pick content ───────────────────────────────────────────────────────
function ClonePickContent({
  dashboards,
  onSelect,
}: {
  dashboards: DashboardListItem[];
  onSelect: (d: DashboardListItem) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = dashboards.filter((d) =>
    d.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-[#f8f9fb]">
      <div className="p-5 max-w-2xl mx-auto w-full">
        <div className="mb-5">
          <h2 className="text-base font-semibold">Scegli la dashboard da clonare</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Seleziona una dashboard esistente come punto di partenza.
          </p>
        </div>
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca dashboard..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-10"
            autoFocus
          />
        </div>
        <ScrollArea className="h-96">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">Nessuna dashboard trovata</p>
          ) : (
            <div className="space-y-2">
              {filtered.map((d) => {
                const style = getCardStyle(d.id);
                const Icon  = style.icon;
                return (
                  <button
                    key={d.id}
                    onClick={() => onSelect(d)}
                    className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-white border hover:border-primary hover:shadow-sm transition-all group text-left"
                  >
                    <div className={cn(
                      "h-10 w-10 rounded-lg bg-gradient-to-br flex items-center justify-center shrink-0",
                      style.bg,
                    )}>
                      <Icon className="h-5 w-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{d.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {d.scope === "personal" ? "Privata" : "Aziendale"}
                      </p>
                    </div>
                    <Copy className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}

// ─── Name dialog (piccolo, sovrapposto) ───────────────────────────────────────
function NameDialog({
  open,
  defaultName,
  isAdmin,
  isPending,
  onClose,
  onConfirm,
}: {
  open: boolean;
  defaultName?: string;
  isAdmin: boolean;
  isPending: boolean;
  onClose: () => void;
  onConfirm: (name: string, isPrivate: boolean) => void;
}) {
  const [name, setName]         = useState(defaultName ?? "");
  const [isPrivate, setPrivate] = useState(true);

  // Sync defaultName when it changes (useEffect — useMemo non deve avere side-effect)
  useEffect(() => { setName(defaultName ?? ""); }, [defaultName]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md z-[60]">
        <DialogHeader className="items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 mb-1">
            <Plus className="h-6 w-6 text-green-600" />
          </div>
          <DialogTitle className="text-lg">Nuova dashboard</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-1">
          <div className="space-y-1.5">
            <Label htmlFor="d-name" className="text-sm">Nome della dashboard</Label>
            <Input
              id="d-name"
              placeholder="(ad es.) Panoramica delle vendite"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) onConfirm(name.trim(), isPrivate); }}
              autoFocus
              className="h-11"
            />
          </div>

          {isAdmin && (
            <>
              <Separator />
              <div className="rounded-xl bg-muted/40 p-4 flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium leading-none">Dashboard privato</p>
                  <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                    {isPrivate
                      ? "Configura questa dashboard in modo che solo tu possa vederla. Non sarà visibile agli altri membri del team."
                      : "Visibile e assegnabile a tutto il team aziendale."}
                  </p>
                </div>
                <Switch
                  checked={isPrivate}
                  onCheckedChange={setPrivate}
                  className="shrink-0 mt-0.5"
                />
              </div>
            </>
          )}
        </div>

        <div className="flex gap-3 mt-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>
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
      </DialogContent>
    </Dialog>
  );
}

// ─── Helpers per il role label ────────────────────────────────────────────────
const ROLE_META: Record<AppRole, { label: string; color: string }> = {
  super_admin:   { label: "Super Admin",  color: "bg-gray-100 text-gray-700 border-gray-200" },
  company_admin: { label: "Admin",        color: "bg-violet-100 text-violet-700 border-violet-200" },
  company_staff: { label: "Staff",        color: "bg-blue-100 text-blue-700 border-blue-200" },
  salesperson:   { label: "Commerciale",  color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  call_center:   { label: "Call Center",  color: "bg-amber-100 text-amber-700 border-amber-200" },
  employee:      { label: "Dipendente",   color: "bg-orange-100 text-orange-700 border-orange-200" },
};

// ─── Dialog permessi dashboard ────────────────────────────────────────────────
function DashboardPermissionsDialog({
  dashboard,
  open,
  onClose,
}: {
  dashboard: DashboardListItem;
  open: boolean;
  onClose: () => void;
}) {
  const { data: allMembers = [], isLoading: membersLoading, isError: membersError } = useCompanyMembers();
  const updateScope  = useUpdateDashboardScope();
  const grantAccess  = useSetDashboardUserAccess();
  const revokeAccess = useUnsetDashboardUserAccess();

  // ID utente corrente — per escluderlo dalla lista (è già il proprietario)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);
  const members = useMemo(
    () => allMembers.filter((m) => m.user_id !== currentUserId),
    [allMembers, currentUserId],
  );

  // Scope ottimistico: sincronizzato con dashboard.scope
  const [localScope, setLocalScope] = useState<"personal" | "company">(
    dashboard.scope === "company" ? "company" : "personal",
  );
  useEffect(() => {
    setLocalScope(dashboard.scope === "company" ? "company" : "personal");
  }, [dashboard.scope, open]);

  // Accesso utenti individuali — caricato dalla tabella tramite RQ
  const { data: accessRows = [], refetch: refetchAccess } = useQuery({
    queryKey: ["dashboard-user-access", dashboard.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dashboard_user_access" as never)
        .select("user_id")
        .eq("dashboard_id", dashboard.id);
      if (error) throw error;
      return (data as Array<{ user_id: string }>) ?? [];
    },
    enabled: open,
    staleTime: 30 * 1000,
  });
  const accessSet = useMemo(
    () => new Set(accessRows.map((r) => r.user_id)),
    [accessRows],
  );

  const handleScopeClick = (scope: "personal" | "company") => {
    if (scope === localScope || updateScope.isPending) return;
    setLocalScope(scope);
    updateScope.mutate(
      { dashboardId: dashboard.id, scope },
      {
        onError: (e) => {
          setLocalScope(scope === "company" ? "personal" : "company"); // revert
          toast.error(String(e));
        },
      },
    );
  };

  const toggleUserAccess = (userId: string, hasAccess: boolean) => {
    if (hasAccess) {
      revokeAccess.mutate(
        { dashboardId: dashboard.id, userId },
        {
          onSuccess: () => refetchAccess(),
          onError: (e) => toast.error(String(e)),
        },
      );
    } else {
      grantAccess.mutate(
        { dashboardId: dashboard.id, userId },
        {
          onSuccess: () => refetchAccess(),
          onError: (e) => toast.error(String(e)),
        },
      );
    }
  };

  const style = getCardStyle(dashboard.id);
  const CardIcon = style.icon;
  const isUserPending = grantAccess.isPending || revokeAccess.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <div className="flex items-center gap-3 mb-1">
            <div className={cn(
              "flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br shrink-0",
              style.bg,
            )}>
              <CardIcon className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base leading-snug truncate">{dashboard.name}</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Impostazioni accesso</p>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-5 pr-1">

          {/* ── Visibilità (cliccabile) ──────────────────────────── */}
          <div className="rounded-xl border overflow-hidden">
            <div className="px-4 py-2.5 bg-muted/30 border-b flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Visibilità
              </p>
              {updateScope.isPending && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              )}
            </div>
            <div className="divide-y">
              {([
                { scope: "personal" as const, label: "Privata",    desc: "Solo tu puoi vederla",               icon: Lock,  color: "text-slate-600" },
                { scope: "company"  as const, label: "Aziendale",  desc: "Visibile a tutto il team",            icon: Globe, color: "text-blue-600"  },
              ] as const).map(({ scope, label, desc, icon: ScopeIcon, color }) => {
                const active = localScope === scope;
                return (
                  <button
                    key={scope}
                    type="button"
                    onClick={() => handleScopeClick(scope)}
                    disabled={updateScope.isPending}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors",
                      active
                        ? "bg-primary/5"
                        : "hover:bg-muted/40 opacity-60 hover:opacity-100",
                      "disabled:cursor-not-allowed",
                    )}
                  >
                    <ScopeIcon className={cn("h-4 w-4 shrink-0", color)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{label}</p>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                    {active ? (
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary shrink-0">
                        <Check className="h-3 w-3 text-white" />
                      </div>
                    ) : (
                      <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/25 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Accesso utenti (solo se Aziendale) ──────────────── */}
          {localScope === "personal" && (
            <div className="rounded-xl border border-dashed bg-muted/20 px-4 py-4 flex items-center gap-3">
              <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                La dashboard è <span className="font-medium text-foreground">privata</span>.
                Imposta la visibilità su <span className="font-medium text-foreground">Aziendale</span> per
                gestire l'accesso dei membri del team.
              </p>
            </div>
          )}

          {localScope === "company" && (
          <div className="rounded-xl border overflow-hidden">
            <div className="px-4 py-2.5 bg-muted/30 border-b flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Accesso utenti
              </p>
              {membersLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              ) : (
                <p className="text-[10px] text-muted-foreground">
                  {accessSet.size > 0
                    ? `${accessSet.size} uten${accessSet.size === 1 ? "te" : "ti"} con accesso`
                    : "Nessun accesso aggiuntivo"}
                </p>
              )}
            </div>

            {membersLoading ? (
              <div className="p-4 space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-10 rounded-lg bg-muted/50 animate-pulse" />
                ))}
              </div>
            ) : membersError ? (
              <div className="px-4 py-5 text-center space-y-2">
                <p className="text-xs text-destructive font-medium">
                  Impossibile caricare i membri
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Verifica di avere i permessi necessari.
                </p>
              </div>
            ) : members.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                Nessun altro membro nell'azienda
              </div>
            ) : (
              <div className="divide-y max-h-64 overflow-auto">
                {members.map((member) => {
                  const hasAccess = accessSet.has(member.user_id);
                  const roleMeta  = member.role ? ROLE_META[member.role] : null;
                  return (
                    <button
                      key={member.user_id}
                      type="button"
                      onClick={() => toggleUserAccess(member.user_id, hasAccess)}
                      disabled={grantAccess.isPending || revokeAccess.isPending}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                        hasAccess
                          ? "bg-primary/5 hover:bg-primary/10"
                          : "hover:bg-muted/40",
                        "disabled:opacity-60 disabled:cursor-not-allowed",
                      )}
                    >
                      {/* Avatar iniziali */}
                      <div className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold shrink-0 uppercase transition-colors",
                        hasAccess
                          ? "bg-primary text-white"
                          : "bg-muted text-muted-foreground",
                      )}>
                        {member.first_name[0]}{member.last_name[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate leading-tight">
                          {member.first_name} {member.last_name}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">{member.email}</p>
                      </div>
                      {roleMeta && (
                        <span className={cn(
                          "rounded-full border px-1.5 py-0.5 text-[10px] font-semibold shrink-0",
                          roleMeta.color,
                        )}>
                          {roleMeta.label}
                        </span>
                      )}
                      {(grantAccess.isPending || revokeAccess.isPending) ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
                      ) : hasAccess ? (
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary shrink-0">
                          <Check className="h-3 w-3 text-white" />
                        </div>
                      ) : (
                        <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/25 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          )} {/* fine localScope === "company" */}

        </div>

        <div className="flex justify-end pt-2 shrink-0 border-t mt-2">
          <Button variant="outline" size="sm" onClick={onClose}>Chiudi</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Dialog permessi dashboard standard (read-only visualmente, info team) ───
function StandardPermissionsDialog({
  dash,
  open,
  onClose,
}: {
  dash: (typeof STANDARD_DASHBOARDS)[number];
  open: boolean;
  onClose: () => void;
}) {
  const { data: members = [], isLoading } = useCompanyMembers();
  const Icon = dash.icon;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <div className="flex items-center gap-3 mb-1">
            <div className={cn(
              "flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br shrink-0",
              dash.bg,
            )}>
              <Icon className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base leading-snug truncate">{dash.title}</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Dashboard predefinita</p>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-4 pr-1">
          {/* Visibilità fissa */}
          <div className="rounded-xl border overflow-hidden">
            <div className="px-4 py-2.5 bg-muted/30 border-b">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Visibilità</p>
            </div>
            <div className="flex items-center gap-3 px-4 py-3 bg-primary/5">
              <Globe className="h-4 w-4 text-blue-600 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium">Aziendale</p>
                <p className="text-xs text-muted-foreground">Accessibile a tutto il team — non modificabile</p>
              </div>
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary shrink-0">
                <Check className="h-3 w-3 text-white" />
              </div>
            </div>
          </div>

          {/* Elenco membri del team */}
          <div className="rounded-xl border overflow-hidden">
            <div className="px-4 py-2.5 bg-muted/30 border-b flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Membri del team
              </p>
              {!isLoading && (
                <p className="text-[10px] text-muted-foreground">{members.length} uten{members.length === 1 ? "te" : "ti"}</p>
              )}
            </div>
            {isLoading ? (
              <div className="p-4 space-y-2">
                {[1,2,3].map((i) => (
                  <div key={i} className="h-10 rounded-lg bg-muted/50 animate-pulse" />
                ))}
              </div>
            ) : members.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                Nessun membro trovato
              </div>
            ) : (
              <div className="divide-y max-h-64 overflow-auto">
                {members.map((member) => {
                  const roleMeta = member.role ? ROLE_META[member.role] : null;
                  return (
                    <div key={member.user_id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground shrink-0 uppercase">
                        {member.first_name[0]}{member.last_name[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate leading-tight">
                          {member.first_name} {member.last_name}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">{member.email}</p>
                      </div>
                      {roleMeta && (
                        <span className={cn(
                          "rounded-full border px-1.5 py-0.5 text-[10px] font-semibold shrink-0",
                          roleMeta.color,
                        )}>
                          {roleMeta.label}
                        </span>
                      )}
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 shrink-0">
                        <Check className="h-3 w-3 text-primary" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end pt-2 shrink-0 border-t mt-2">
          <Button variant="outline" size="sm" onClick={onClose}>Chiudi</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Dialog conferma eliminazione ────────────────────────────────────────────
function DeleteConfirmDialog({
  dashboard,
  open,
  onClose,
}: {
  dashboard: DashboardListItem | null;
  open: boolean;
  onClose: () => void;
}) {
  const deleteDash = useDeleteDashboard();

  if (!dashboard) return null;

  const handleDelete = () => {
    deleteDash.mutate(dashboard.id, {
      onSuccess: () => {
        toast.success(`Dashboard "${dashboard.name}" eliminata`);
        onClose();
      },
      onError: (e) => toast.error(String(e)),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !deleteDash.isPending) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10 shrink-0">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <DialogTitle className="text-base leading-snug">Elimina dashboard</DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Stai per eliminare definitivamente{" "}
            <span className="font-semibold text-foreground">"{dashboard.name}"</span>.
            Questa azione è irreversibile e non può essere annullata.
          </p>
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-xs text-destructive leading-snug font-medium">
              Tutti i widget, le configurazioni e la cronologia delle versioni
              verranno eliminati definitivamente.
            </p>
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <Button
            variant="outline"
            className="flex-1"
            onClick={onClose}
            disabled={deleteDash.isPending}
          >
            Annulla
          </Button>
          <Button
            variant="destructive"
            className="flex-1 gap-1.5"
            onClick={handleDelete}
            disabled={deleteDash.isPending}
          >
            {deleteDash.isPending
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Trash2 className="h-4 w-4" />}
            Elimina definitivamente
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Dashboard card (griglia principale) ─────────────────────────────────────
function DashboardCard({
  dashboard,
  isAdmin,
}: {
  dashboard: DashboardListItem;
  isAdmin: boolean;
}) {
  const [permOpen, setPermOpen]     = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const style = getCardStyle(dashboard.id);
  const Icon  = style.icon;

  return (
    <>
      <div className="group rounded-xl border bg-white overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 flex flex-col">
        {/* Thumbnail */}
        <div className={cn("h-32 bg-gradient-to-br relative overflow-hidden", style.bg)}>
          <div className="absolute inset-0">
            <div className="absolute top-3 right-5 h-14 w-14 rounded-full bg-white/15 blur-md" />
            <div className="absolute -bottom-2 -left-2 h-16 w-16 rounded-full bg-white/10 blur-md" />
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <Icon className="h-10 w-10 text-white/90 drop-shadow-md" />
          </div>

          {/* Pulsanti top-right: permessi (admin) + elimina (owner) */}
          <div className="absolute top-2 right-2 z-20 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {isAdmin && (
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); setPermOpen(true); }}
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-black/30 text-white/80 hover:bg-black/50 hover:text-white transition-colors"
                title="Permessi dashboard"
              >
                <Settings2 className="h-3.5 w-3.5" />
              </button>
            )}
            {dashboard.is_owner && (
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); setDeleteOpen(true); }}
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-black/30 text-white/80 hover:bg-red-500 hover:text-white transition-colors"
                title="Elimina dashboard"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Azioni overlay */}
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <Link to={`/azienda/dashboards/${dashboard.id}`}>
              <Button size="sm" className="h-8 gap-1.5 bg-white text-foreground hover:bg-white/90 shadow-sm">
                <ExternalLink className="h-3.5 w-3.5" />
                Apri
              </Button>
            </Link>
            {dashboard.can_edit && (
              <Link to={`/azienda/dashboards/${dashboard.id}/modifica`}>
                <Button size="sm" className="h-8 gap-1.5 bg-white text-foreground hover:bg-white/90 shadow-sm">
                  <Pencil className="h-3.5 w-3.5" />
                  Modifica
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="p-3 flex flex-col gap-2 flex-1">
          <p className="font-semibold text-sm leading-snug truncate">{dashboard.name}</p>
          {dashboard.description && (
            <p className="text-xs text-muted-foreground line-clamp-1 leading-relaxed">
              {dashboard.description}
            </p>
          )}
          <div className="flex items-center justify-end mt-auto pt-1">
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] px-1.5 py-0.5 gap-1 cursor-default",
                dashboard.scope === "personal"
                  ? "border-slate-200 text-slate-500"
                  : "border-blue-200 text-blue-600 bg-blue-50",
              )}
            >
              {dashboard.scope === "personal"
                ? <><Lock className="h-2.5 w-2.5" />Privata</>
                : <><Globe className="h-2.5 w-2.5" />Aziendale</>}
            </Badge>
          </div>
        </div>
      </div>

      {/* Dialog permessi */}
      <DashboardPermissionsDialog
        dashboard={dashboard}
        open={permOpen}
        onClose={() => setPermOpen(false)}
      />

      {/* Dialog conferma eliminazione */}
      <DeleteConfirmDialog
        dashboard={dashboard}
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
      />
    </>
  );
}

// ─── Add card ─────────────────────────────────────────────────────────────────
function AddCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-xl border-2 border-dashed border-muted-foreground/20 flex flex-col items-center justify-center gap-2.5 min-h-[200px] text-muted-foreground/40 transition-all hover:border-primary/50 hover:text-primary hover:bg-primary/5 group"
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed border-current transition-transform group-hover:scale-110 group-hover:border-primary">
        <Plus className="h-5 w-5" />
      </div>
      <span className="text-xs font-medium group-hover:text-primary">Aggiungi dashboard</span>
    </button>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function CruscottoHub() {
  const permissions             = usePermissions();
  const [createOpen, setCreate] = useState(false);

  const { data: dashboards = [], isLoading: dashLoading } = useDashboards();

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
              ? "Crea la tua prima dashboard personalizzata"
              : `${dashboards.length} dashboard ${dashboards.length === 1 ? "personalizzata" : "personalizzate"}`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" className="gap-1.5" onClick={() => setCreate(true)}>
            <Plus className="h-4 w-4" />
            Aggiungi dashboard
          </Button>
        </div>
      </div>

      {/* ── Dashboard predefinite (sempre visibili) ─────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
          Dashboard predefinite
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {STANDARD_DASHBOARDS.map((d) => (
            <StandardDashboardCard key={d.id} dash={d} />
          ))}
        </div>
      </section>

      {/* ── Le mie dashboard ────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
          Le mie dashboard
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {myDashboards.map((d) => (
            <DashboardCard
              key={d.id}
              dashboard={d}
              isAdmin={permissions.isAdmin}
            />
          ))}
          <AddCard onClick={() => setCreate(true)} />
        </div>
      </section>

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
                isAdmin={permissions.isAdmin}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Overlay creazione ───────────────────────────────────────────────── */}
      <CreationOverlay
        open={createOpen}
        onClose={() => setCreate(false)}
        dashboards={dashboards}
        isAdmin={permissions.isAdmin}
      />
    </div>
  );
}
