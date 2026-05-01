import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Building2,
  Eraser,
  Grid2X2,
  Image,
  MapPin,
  MousePointer2,
  Pencil,
  Plus,
  Ruler,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useWarehouseSections, type WarehouseSection } from "@/hooks/useWarehouseSections";
import { cn } from "@/lib/utils";

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4",
  "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280", "#78716c",
];

type ZoneLayout = {
  x: number;
  y: number;
  w: number;
  h: number;
  areaMq: number;
};

type ZoneLayouts = Record<string, ZoneLayout>;

type PlanMeta = {
  name: string;
  widthM: number;
  lengthM: number;
};

type DraftRect = {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
};

type WarehouseSectionsManagerProps = {
  context?: "stock" | "manager";
  variant?: "inline" | "dialog";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  warehouseId?: string | null;
  warehouseName?: string | null;
};

const GRID_COLS = 12;
const GRID_ROWS = 8;
const DEFAULT_PLAN_META: PlanMeta = {
  name: "Planimetria magazzino",
  widthM: 24,
  lengthM: 16,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function defaultLayout(index: number): ZoneLayout {
  const w = 3;
  const h = 2;
  return {
    x: (index * w) % GRID_COLS,
    y: Math.floor((index * w) / GRID_COLS) * h,
    w,
    h,
    areaMq: 0,
  };
}

function normalizeLayout(layout: ZoneLayout): ZoneLayout {
  const w = clamp(Number(layout.w) || 2, 1, GRID_COLS);
  const h = clamp(Number(layout.h) || 1, 1, GRID_ROWS);
  return {
    x: clamp(Number(layout.x) || 0, 0, GRID_COLS - w),
    y: clamp(Number(layout.y) || 0, 0, GRID_ROWS - h),
    w,
    h,
    areaMq: Math.max(0, Number(layout.areaMq) || 0),
  };
}

export function WarehouseSectionsManager({
  context = "stock",
  variant = "inline",
  open = false,
  onOpenChange,
  warehouseId,
  warehouseName,
}: WarehouseSectionsManagerProps) {
  const { effectiveCompany } = useAuth();
  const { sections, createSection, updateSection, deleteSection, isPending } = useWarehouseSections();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<WarehouseSection | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[4]);
  const [layouts, setLayouts] = useState<ZoneLayouts>({});
  const [planMeta, setPlanMeta] = useState<PlanMeta>(DEFAULT_PLAN_META);
  const [planImage, setPlanImage] = useState<string | null>(null);
  const [drawMode, setDrawMode] = useState(false);
  const [draftRect, setDraftRect] = useState<DraftRect | null>(null);
  const [pendingLayout, setPendingLayout] = useState<ZoneLayout | null>(null);
  const [pendingZoneName, setPendingZoneName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const storageScope = warehouseId || "company";
  const storageKey = effectiveCompany?.id
    ? `warehouse-zone-layouts:${effectiveCompany.id}:${storageScope}`
    : null;
  const metaStorageKey = effectiveCompany?.id
    ? `warehouse-zone-plan:${effectiveCompany.id}:${storageScope}`
    : null;
  const imageStorageKey = effectiveCompany?.id
    ? `warehouse-zone-plan-image:${effectiveCompany.id}:${storageScope}`
    : null;

  useEffect(() => {
    if (!storageKey) return;
    try {
      const stored = window.localStorage.getItem(storageKey);
      setLayouts(stored ? JSON.parse(stored) as ZoneLayouts : {});
    } catch {
      setLayouts({});
    }
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey) return;
    window.localStorage.setItem(storageKey, JSON.stringify(layouts));
  }, [layouts, storageKey]);

  useEffect(() => {
    if (!metaStorageKey) return;
    try {
      const stored = window.localStorage.getItem(metaStorageKey);
      if (!stored) {
        setPlanMeta(DEFAULT_PLAN_META);
        return;
      }
      const parsed = JSON.parse(stored) as Partial<PlanMeta>;
      setPlanMeta({
        name: parsed.name?.trim() || DEFAULT_PLAN_META.name,
        widthM: clamp(Number(parsed.widthM) || DEFAULT_PLAN_META.widthM, 1, 500),
        lengthM: clamp(Number(parsed.lengthM) || DEFAULT_PLAN_META.lengthM, 1, 500),
      });
    } catch {
      setPlanMeta(DEFAULT_PLAN_META);
    }
  }, [metaStorageKey]);

  useEffect(() => {
    if (!metaStorageKey) return;
    window.localStorage.setItem(metaStorageKey, JSON.stringify(planMeta));
  }, [metaStorageKey, planMeta]);

  useEffect(() => {
    if (!imageStorageKey) return;
    try {
      setPlanImage(window.localStorage.getItem(imageStorageKey));
    } catch {
      setPlanImage(null);
    }
  }, [imageStorageKey]);

  useEffect(() => {
    if (!imageStorageKey) return;
    if (planImage) {
      window.localStorage.setItem(imageStorageKey, planImage);
    } else {
      window.localStorage.removeItem(imageStorageKey);
    }
  }, [imageStorageKey, planImage]);

  useEffect(() => {
    if (drawMode) return;
    if (selectedZoneId && sections.some((section) => section.id === selectedZoneId)) return;
    setSelectedZoneId(sections[0]?.id ?? null);
  }, [drawMode, sections, selectedZoneId]);

  useEffect(() => {
    if (!pendingZoneName || !pendingLayout) return;
    const created = sections.find((section) => section.name.trim() === pendingZoneName);
    if (!created) return;
    updateZoneLayout(created.id, pendingLayout);
    setSelectedZoneId(created.id);
    setPendingZoneName(null);
    setPendingLayout(null);
  }, [pendingLayout, pendingZoneName, sections]);

  const normalizedLayouts = useMemo(() => {
    const next: ZoneLayouts = {};
    sections.forEach((section, index) => {
      next[section.id] = normalizeLayout(layouts[section.id] ?? defaultLayout(index));
    });
    return next;
  }, [layouts, sections]);

  const totalMq = useMemo(
    () => Object.values(normalizedLayouts).reduce((sum, layout) => sum + layout.areaMq, 0),
    [normalizedLayouts],
  );

  const selectedLayout = selectedZoneId ? normalizedLayouts[selectedZoneId] : null;
  const planMq = planMeta.widthM * planMeta.lengthM;
  const coverage = planMq > 0 ? Math.min(100, Math.round((totalMq / planMq) * 100)) : 0;
  const presetZones = [
    { name: "Baia carico", color: "#3b82f6", description: "Arrivi, controllo DDT e prima verifica" },
    { name: "Corsia A", color: "#eab308", description: "Materiali a rapido accesso" },
    { name: "Scorte minime", color: "#22c55e", description: "Consumabili e materiali ricorrenti" },
    { name: "Quarantena", color: "#ef4444", description: "Materiale da verificare o danneggiato" },
  ];

  const updateZoneLayout = (sectionId: string, patch: Partial<ZoneLayout>) => {
    setLayouts((current) => {
      const sectionIndex = sections.findIndex((section) => section.id === sectionId);
      const base = normalizeLayout(current[sectionId] ?? defaultLayout(Math.max(sectionIndex, 0)));
      return {
        ...current,
        [sectionId]: normalizeLayout({ ...base, ...patch }),
      };
    });
  };

  const openNew = () => {
    setEditing(null);
    setName("");
    setDescription("");
    setColor(PRESET_COLORS[4]);
    setDialogOpen(true);
  };

  const openNewFromLayout = (layout: ZoneLayout) => {
    setEditing(null);
    setName("");
    setDescription("");
    setColor(PRESET_COLORS[sections.length % PRESET_COLORS.length]);
    setPendingLayout(layout);
    setDialogOpen(true);
  };

  const createPresetZone = (preset: { name: string; color: string; description: string }) => {
    createSection({
      name: preset.name,
      description: preset.description,
      color: preset.color,
    });
  };

  const openEdit = (section: WarehouseSection) => {
    setEditing(section);
    setName(section.name);
    setDescription(section.description || "");
    setColor(section.color);
    setSelectedZoneId(section.id);
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!name.trim()) return;
    if (editing) {
      updateSection({ id: editing.id, name: name.trim(), description: description.trim(), color });
    } else {
      if (pendingLayout) setPendingZoneName(name.trim());
      createSection({ name: name.trim(), description: description.trim(), color });
    }
    setDialogOpen(false);
  };

  const getCellFromPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const cellW = rect.width / GRID_COLS;
    const cellH = rect.height / GRID_ROWS;
    return {
      x: clamp(Math.floor((event.clientX - rect.left) / cellW), 0, GRID_COLS - 1),
      y: clamp(Math.floor((event.clientY - rect.top) / cellH), 0, GRID_ROWS - 1),
    };
  };

  const layoutFromDraft = (draft: DraftRect): ZoneLayout => {
    const minX = Math.min(draft.startX, draft.currentX);
    const minY = Math.min(draft.startY, draft.currentY);
    const maxX = Math.max(draft.startX, draft.currentX);
    const maxY = Math.max(draft.startY, draft.currentY);
    const cellMq = planMq / (GRID_COLS * GRID_ROWS);
    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    return normalizeLayout({
      x: minX,
      y: minY,
      w,
      h,
      areaMq: Math.round(w * h * cellMq),
    });
  };

  const handlePlanClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (drawMode) return;
    if (!selectedZoneId || !selectedLayout) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const cellW = rect.width / GRID_COLS;
    const cellH = rect.height / GRID_ROWS;
    const x = Math.floor((event.clientX - rect.left) / cellW);
    const y = Math.floor((event.clientY - rect.top) / cellH);
    updateZoneLayout(selectedZoneId, {
      x: clamp(x, 0, GRID_COLS - selectedLayout.w),
      y: clamp(y, 0, GRID_ROWS - selectedLayout.h),
    });
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drawMode) return;
    const cell = getCellFromPointer(event);
    setDraftRect({ startX: cell.x, startY: cell.y, currentX: cell.x, currentY: cell.y });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drawMode || !draftRect) return;
    const cell = getCellFromPointer(event);
    setDraftRect((current) => current ? { ...current, currentX: cell.x, currentY: cell.y } : current);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drawMode || !draftRect) return;
    const finalLayout = layoutFromDraft(draftRect);
    setDraftRect(null);
    setDrawMode(false);
    if (selectedZoneId) {
      updateZoneLayout(selectedZoneId, finalLayout);
      return;
    }
    openNewFromLayout(finalLayout);
  };

  const handlePlanImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => setPlanImage(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const draftLayout = draftRect ? layoutFromDraft(draftRect) : null;

  const managerCard = (
    <Card className={variant === "dialog" ? "border-0 shadow-none" : undefined}>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Zone in magazzino</h3>
              <Badge variant="secondary" className="h-5">
                {sections.length} zone
              </Badge>
              <Badge variant="outline" className="h-5 gap-1">
                <Ruler className="h-3 w-3" aria-hidden="true" />
                {totalMq.toLocaleString("it-IT")} mq
              </Badge>
              <Badge variant="outline" className="h-5">
                {coverage}% copertura
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {context === "manager"
                ? `Definisci la planimetria operativa${warehouseName ? ` di ${warehouseName}` : ""}: carica una piantina e disegna aree come mobili, attrezzature, scorte o quarantena.`
                : "Apri la planimetria solo quando serve: zone, metri quadri e posizioni restano disponibili per inventario, carico e scarico."}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={openNew} className="w-full gap-2 sm:w-auto">
            <Plus className="h-3.5 w-3.5" />
            Nuova zona
          </Button>
        </div>

        <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 md:grid-cols-[1.3fr_1fr_1fr_auto] md:items-end">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Nome planimetria</Label>
            <Input
              value={planMeta.name}
              onChange={(event) => setPlanMeta((current) => ({ ...current, name: event.target.value }))}
              placeholder="Es. Magazzino principale"
              className="h-9"
            />
          </div>
          <NumberField
            label="Larghezza metri"
            value={planMeta.widthM}
            min={1}
            max={500}
            onChange={(value) => setPlanMeta((current) => ({ ...current, widthM: value }))}
          />
          <NumberField
            label="Lunghezza metri"
            value={planMeta.lengthM}
            min={1}
            max={500}
            onChange={(value) => setPlanMeta((current) => ({ ...current, lengthM: value }))}
          />
          <div className="rounded-md bg-background px-3 py-2 text-xs">
            <span className="block text-muted-foreground">Superficie stimata</span>
            <span className="text-sm font-semibold">{planMq.toLocaleString("it-IT")} mq</span>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border bg-background p-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Base planimetria
            </p>
            <p className="text-xs text-muted-foreground">
              Carica una piantina JPG/PNG, poi usa "Disegna zona" per tracciare l'area direttamente sopra il layout.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePlanImageUpload}
            />
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-3.5 w-3.5" />
              Carica piantina
            </Button>
            {planImage && (
              <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => setPlanImage(null)}>
                <Eraser className="h-3.5 w-3.5" />
                Rimuovi
              </Button>
            )}
            <Button
              type="button"
              variant={drawMode ? "default" : "outline"}
              size="sm"
              className="gap-2"
              onClick={() => {
                setSelectedZoneId(null);
                setDrawMode((current) => !current);
              }}
            >
              <MousePointer2 className="h-3.5 w-3.5" />
              {drawMode ? "Disegno attivo" : "Disegna zona"}
            </Button>
          </div>
        </div>

        {sections.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <Grid2X2 className="mx-auto h-8 w-8 text-muted-foreground/60" aria-hidden="true" />
            <p className="mt-2 text-sm font-medium">Nessuna zona definita</p>
            <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
              Crea zone come scaffali, corsie, baie di carico o deposito esterno. Poi potrai disporle sulla piantina.
            </p>
            <Button className="mt-4 gap-2" onClick={openNew}>
              <Plus className="h-4 w-4" />
              Crea prima zona
            </Button>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {presetZones.map((preset) => (
                <Button
                  key={preset.name}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => createPresetZone(preset)}
                  className="gap-2"
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: preset.color }} />
                  {preset.name}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {planMeta.name || "Planimetria"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {drawMode
                      ? "Trascina sulla piantina per disegnare una nuova zona."
                      : "Clicca una zona per selezionarla, poi clicca sulla griglia per spostarla."}
                  </p>
                </div>
                <Badge variant="outline" className="hidden shrink-0 gap-1 sm:inline-flex">
                  {planImage ? <Image className="h-3 w-3" /> : <Building2 className="h-3 w-3" />}
                  {planMeta.widthM}m x {planMeta.lengthM}m
                </Badge>
              </div>
              <div
                className={cn(
                  "relative min-h-[320px] overflow-hidden rounded-lg border bg-muted/20",
                  drawMode && "cursor-crosshair ring-1 ring-primary/40",
                )}
                onClick={handlePlanClick}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                style={{
                  backgroundImage: planImage
                    ? `linear-gradient(to right, hsl(var(--border)) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--border)) 1px, transparent 1px), url(${planImage})`
                    : "linear-gradient(to right, hsl(var(--border)) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--border)) 1px, transparent 1px)",
                  backgroundSize: planImage
                    ? `${100 / GRID_COLS}% ${100 / GRID_ROWS}%, ${100 / GRID_COLS}% ${100 / GRID_ROWS}%, cover`
                    : `${100 / GRID_COLS}% ${100 / GRID_ROWS}%`,
                  backgroundPosition: "left top, left top, center",
                  backgroundRepeat: "repeat, repeat, no-repeat",
                }}
                role="button"
                tabIndex={0}
                aria-label="Piantina zone magazzino"
              >
                {planImage && <div className="absolute inset-0 bg-background/35" aria-hidden="true" />}
                {sections.map((section, index) => {
                  const layout = normalizedLayouts[section.id] ?? defaultLayout(index);
                  const selected = selectedZoneId === section.id;
                  return (
                    <button
                      key={section.id}
                      type="button"
                      className={cn(
                        "absolute overflow-hidden rounded-md border bg-background/95 p-2 text-left shadow-sm transition-all hover:shadow-md",
                        selected && "ring-2 ring-primary ring-offset-2",
                      )}
                      style={{
                        left: `${(layout.x / GRID_COLS) * 100}%`,
                        top: `${(layout.y / GRID_ROWS) * 100}%`,
                        width: `${(layout.w / GRID_COLS) * 100}%`,
                        height: `${(layout.h / GRID_ROWS) * 100}%`,
                        borderColor: section.color,
                        borderLeftWidth: 5,
                      }}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedZoneId(section.id);
                      }}
                    >
                      <span className="block truncate text-xs font-semibold">{section.name}</span>
                      <span className="mt-1 block text-[11px] text-muted-foreground">
                        {layout.areaMq > 0 ? `${layout.areaMq} mq` : "mq da impostare"}
                      </span>
                      <span className="mt-1 hidden truncate text-[10px] text-muted-foreground md:block">
                        {layout.w} x {layout.h} celle
                      </span>
                    </button>
                  );
                })}
                {draftLayout && (
                  <div
                    className="pointer-events-none absolute rounded-md border-2 border-dashed border-primary bg-primary/10"
                    style={{
                      left: `${(draftLayout.x / GRID_COLS) * 100}%`,
                      top: `${(draftLayout.y / GRID_ROWS) * 100}%`,
                      width: `${(draftLayout.w / GRID_COLS) * 100}%`,
                      height: `${(draftLayout.h / GRID_ROWS) * 100}%`,
                    }}
                  />
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {presetZones.map((preset) => (
                  <Button
                    key={preset.name}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => createPresetZone(preset)}
                    className="h-8 gap-2 text-xs"
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: preset.color }} />
                    {preset.name}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Dettaglio zona
                </p>
                <p className="text-xs text-muted-foreground">
                  Regola posizione, ingombro e superficie.
                </p>
              </div>

              {selectedZoneId && selectedLayout ? (
                <ZoneEditor
                  section={sections.find((section) => section.id === selectedZoneId) ?? sections[0]}
                  layout={selectedLayout}
                  onChange={(patch) => updateZoneLayout(selectedZoneId, patch)}
                  onEdit={() => {
                    const section = sections.find((item) => item.id === selectedZoneId);
                    if (section) openEdit(section);
                  }}
                  onDelete={() => setDeleteId(selectedZoneId)}
                />
              ) : null}

              <div className="grid gap-2">
                {sections.map((section, index) => {
                  const layout = normalizedLayouts[section.id] ?? defaultLayout(index);
                  return (
                    <button
                      key={section.id}
                      type="button"
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-md border p-3 text-left transition-colors hover:bg-muted/50",
                        selectedZoneId === section.id && "border-primary bg-primary/5",
                      )}
                      onClick={() => setSelectedZoneId(section.id)}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: section.color }} />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{section.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {section.description || "Nessuna nota"}
                          </span>
                        </span>
                      </span>
                      <span className="shrink-0 text-xs font-medium text-muted-foreground">
                        {layout.areaMq > 0 ? `${layout.areaMq} mq` : "mq -"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{editing ? "Modifica zona" : "Nuova zona"}</DialogTitle>
              <DialogDescription>
                Dai un nome operativo alla zona: corsia, scaffale, baia di carico, deposito esterno.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Es. Corsia A" />
              </div>
              <div className="space-y-2">
                <Label>Descrizione</Label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Es. materiali pronti per uscita" />
              </div>
              <div className="space-y-2">
                <Label>Colore</Label>
                <div className="flex gap-2 flex-wrap">
                  {PRESET_COLORS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className={cn(
                        "h-7 w-7 rounded-full border-2 transition-all",
                        color === preset ? "scale-110 border-foreground" : "border-transparent",
                      )}
                      style={{ backgroundColor: preset }}
                      onClick={() => setColor(preset)}
                      aria-label={`Colore ${preset}`}
                    />
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Annulla</Button>
              <Button onClick={handleSave} disabled={!name.trim() || isPending}>
                {editing ? "Salva" : "Crea"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminare questa zona?</AlertDialogTitle>
              <AlertDialogDescription>
                La zona verrà rimossa. Gli articoli assegnati perderanno l'associazione alla zona, ma resteranno in inventario.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annulla</AlertDialogCancel>
              <AlertDialogAction onClick={() => { if (deleteId) deleteSection(deleteId); setDeleteId(null); }}>
                Elimina
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );

  if (variant === "dialog") {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto p-0">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>Planimetria e zone magazzino</DialogTitle>
            <DialogDescription>
              {warehouseName
                ? `Gestisci la piantina e le zone operative di ${warehouseName}.`
                : "Gestisci piantina, metri quadri e zone operative del magazzino selezionato."}
            </DialogDescription>
          </DialogHeader>
          {managerCard}
        </DialogContent>
      </Dialog>
    );
  }

  return managerCard;
}

function ZoneEditor({
  section,
  layout,
  onChange,
  onEdit,
  onDelete,
}: {
  section: WarehouseSection;
  layout: ZoneLayout;
  onChange: (patch: Partial<ZoneLayout>) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: section.color }} />
            <p className="truncate text-sm font-semibold">{section.name}</p>
          </div>
          {section.description && (
            <p className="mt-1 truncate text-xs text-muted-foreground">{section.description}</p>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit} aria-label="Modifica nome zona">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={onDelete} aria-label="Elimina zona">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <NumberField label="Mq" value={layout.areaMq} min={0} onChange={(value) => onChange({ areaMq: value })} />
        <NumberField label="Larghezza griglia" value={layout.w} min={1} max={GRID_COLS} onChange={(value) => onChange({ w: value })} />
        <NumberField label="X" value={layout.x} min={0} max={GRID_COLS - layout.w} onChange={(value) => onChange({ x: value })} />
        <NumberField label="Y" value={layout.y} min={0} max={GRID_ROWS - layout.h} onChange={(value) => onChange({ y: value })} />
        <NumberField label="Altezza griglia" value={layout.h} min={1} max={GRID_ROWS} onChange={(value) => onChange({ h: value })} />
        <div className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
          <ArrowUpRight className="mb-1 h-3.5 w-3.5" aria-hidden="true" />
          Usa X/Y per rifinire dopo il click sulla piantina.
        </div>
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}
