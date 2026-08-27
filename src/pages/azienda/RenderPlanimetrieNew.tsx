import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ChangeEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BrickWall,
  CheckCircle2,
  ClipboardCheck,
  CircleDashed,
  Cuboid,
  DoorOpen,
  Download,
  DraftingCompass,
  FileCheck2,
  FileImage,
  GalleryHorizontalEnd,
  Grid3X3,
  History,
  Layers3,
  Link2,
  Loader2,
  Maximize2,
  MessageSquare,
  MousePointer2,
  PanelTopOpen,
  Palette,
  PencilRuler,
  Redo2,
  Ruler,
  Save,
  ShieldCheck,
  Sofa,
  Sparkles,
  Square,
  Undo2,
  Upload,
  Wand2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { FloorPlanDollhouse3D } from "@/components/render/FloorPlanDollhouse3D";
import { RenderCreditsWidget } from "@/components/render/RenderCreditsWidget";
import {
  buildFloorPlanPhotoReviewQuestions,
  buildFloorPlanCrmPayload,
  buildFloorPlanDrawingContext,
  buildFloorPlanExportManifest,
  buildFloorPlanGenerationBrief,
  buildFloorPlanRenderPackage,
  calculateFloorPlanMetrics,
  calibrateFloorPlanScale,
  calibrateFloorPlanScaleFromPoints,
  createFloorPlanRevision,
  createFloorPlanVariant,
  createInitialFloorPlanFromSketch,
  addFloorPlanOpening,
  addFloorPlanFurniture,
  addFloorPlanAnnotation,
  removeFloorPlanAnnotation,
  buildFloorPlanWorkStudio,
  estimateFloorPlanQuoteItems,
  exportFloorPlanToDxf,
  exportFloorPlanToSvg,
  floorPlanCommercialRenderStyles,
  floorPlanFurnitureCatalog,
  floorPlanEditorTools,
  floorPlanLayers,
  measureFloorPlanDistance,
  moveFloorPlanFurniture,
  moveFloorPlanRoom,
  rotateFloorPlanFurniture,
  runFloorPlanQualityChecks,
  updateFloorPlanRoom,
  type FloorPlanAiSuggestion,
  type FloorPlanAnalysis,
  type FloorPlanCommercialRenderStyle,
  type FloorPlanDrawingContext,
  type FloorPlanFurnitureCategory,
  type FloorPlanLayerId,
  type FloorPlanOpening,
  type FloorPlanPoint,
  type FloorPlanQualityIssue,
  type FloorPlanQuoteItem,
  type FloorPlanReviewQuestion,
  type FloorPlanRenderCameraPresetId,
  type FloorPlanScanLayer,
  type FloorPlanScanLayerId,
  type FloorPlanStyle,
  type FloorPlanToolId,
  type FloorPlanWorkPhase,
  type FloorPlanDoorStyle,
  type FloorPlanWindowStyle,
  type FloorPlanAnnotation,
  type FloorPlanAnnotationType,
} from "@/lib/render/floorPlanAi";
import {
  validateAbitabilita,
  abitabilitaSuggestion,
  type AbitabilitaIssue,
} from "@/lib/render/abitabilitaValidation";
import {
  exportSvgAsPng,
  exportFloorPlanAsPdf,
} from "@/lib/render/exportFloorPlanRaster";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

const styleOptions: Array<{ value: FloorPlanStyle; label: string; className: string }> = [
  { value: "modern", label: "Modern", className: "bg-slate-900" },
  { value: "scandi", label: "Scandi", className: "bg-sky-200" },
  { value: "boho", label: "Boho", className: "bg-amber-500" },
  { value: "contemporary", label: "Contemporary", className: "bg-stone-500" },
  { value: "rustic", label: "Rustic", className: "bg-lime-700" },
];

const toolIcons: Record<FloorPlanToolId, LucideIcon> = {
  select: MousePointer2,
  wall: BrickWall,
  room: Square,
  door: DoorOpen,
  window: PanelTopOpen,
  measure: Ruler,
  furniture: Sofa,
  comment: MessageSquare,
};

const roomFill: Record<string, string> = {
  living: "#f8d48a",
  hall: "#dbeafe",
  "bedroom-main": "#c7d2fe",
  "bedroom-kids": "#bbf7d0",
  bath: "#a7f3d0",
  utility: "#e7e5e4",
};

const furnitureFill: Record<FloorPlanFurnitureCategory, string> = {
  living: "#fb923c",
  kitchen: "#38bdf8",
  bedroom: "#a78bfa",
  bathroom: "#2dd4bf",
  office: "#f472b6",
  storage: "#94a3b8",
};

const draftStorageKey = "render-planimetrie-ai-draft";
const defaultLayerVisibility = Object.fromEntries(
  floorPlanLayers.map((layer) => [layer.id, layer.defaultVisible]),
) as Record<FloorPlanLayerId, boolean>;
const defaultSourceLayerVisibility: Record<FloorPlanScanLayerId, boolean> = {
  original: true,
  enhanced: true,
  detected: true,
  cad: true,
};

type WorkflowStatus = "complete" | "current" | "locked";
type AccentTone = "orange" | "cyan" | "emerald" | "slate";
type CalibrationDraft = { from?: FloorPlanPoint; to?: FloorPlanPoint };
type CadDragTarget = { type: "room" | "furniture"; id: string; lastPoint: FloorPlanPoint };

interface WorkflowStep {
  id: string;
  label: string;
  value: string;
  icon: LucideIcon;
  status: WorkflowStatus;
}

export default function RenderPlanimetrieNew() {
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Ref al container del canvas SVG planimetria — usato per export PNG/PDF
  // (querySelector('svg') trova l'SVG renderizzato da FloorPlanCanvas).
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const [plan, setPlan] = useState<FloorPlanAnalysis>(() => loadPlanDraft());
  const [activeTool, setActiveTool] = useState<FloorPlanToolId>("select");
  const [selectedRoomId, setSelectedRoomId] = useState("living");
  const [style, setStyle] = useState<FloorPlanStyle>("modern");
  const [commercialRenderStyle, setCommercialRenderStyle] = useState<FloorPlanCommercialRenderStyle>("warm_modern");
  const [renderCameraPreset, setRenderCameraPreset] = useState<FloorPlanRenderCameraPresetId>("dollhouse");
  const [zoom, setZoom] = useState(100);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [show3d, setShow3d] = useState(true);
  const [visibleLayers, setVisibleLayers] = useState<Record<FloorPlanLayerId, boolean>>(defaultLayerVisibility);
  const [sourceLayerVisibility, setSourceLayerVisibility] = useState<Record<FloorPlanScanLayerId, boolean>>(defaultSourceLayerVisibility);
  const [sourcePreviewUrl, setSourcePreviewUrl] = useState<string | undefined>(undefined);
  const [analysisState, setAnalysisState] = useState<"ready" | "analyzing" | "reviewed">("ready");
  const [revisionNote, setRevisionNote] = useState("Verificare una quota reale sul lato soggiorno prima dell'export CAD definitivo.");
  const [calibrationUnits, setCalibrationUnits] = useState("16");
  const [calibrationMeters, setCalibrationMeters] = useState("4");
  const [calibrationDraft, setCalibrationDraft] = useState<CalibrationDraft>({});
  const [selectedFurnitureId, setSelectedFurnitureId] = useState<string | undefined>(undefined);
  const [cursorPoint, setCursorPoint] = useState<FloorPlanPoint | null>(null);
  const [dragTarget, setDragTarget] = useState<CadDragTarget | null>(null);
  const [undoStack, setUndoStack] = useState<FloorPlanAnalysis[]>([]);
  const [redoStack, setRedoStack] = useState<FloorPlanAnalysis[]>([]);
  // F4: stato durante mutation sincrone (calibrazione, export) per
  // bloccare double-click su bottoni. Default false → nessun cambio UX.
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [exportingType, setExportingType] = useState<"svg" | "dxf" | "json" | null>(null);
  // F5: dirty flag — true quando user ha modifiche non explicitly "salvate"
  // (in questo editor non c'è un "Salva" backend, ma il flag protegge
  // dalla chiusura accidentale del tab/back browser su lavoro in corso).
  const [isDirty, setIsDirty] = useState(false);

  const metrics = useMemo(() => calculateFloorPlanMetrics(plan), [plan]);
  const brief = useMemo(() => buildFloorPlanGenerationBrief(plan), [plan]);
  const qualityIssues = useMemo(() => runFloorPlanQualityChecks(plan), [plan]);
  // G1: validazione norme DM Sanità 5/7/1975 abitabilità
  const abitabilitaIssues = useMemo(() => validateAbitabilita(plan), [plan]);
  const quoteItems = useMemo(() => estimateFloorPlanQuoteItems(plan), [plan]);
  const workStudio = useMemo(() => buildFloorPlanWorkStudio(plan, { contactId: "demo-contact", opportunityId: "demo-opportunity" }), [plan]);
  const photoReviewQuestions = useMemo(() => buildFloorPlanPhotoReviewQuestions(plan), [plan]);
  const renderPackage = useMemo(() => buildFloorPlanRenderPackage(plan, {
    style: commercialRenderStyle,
    selectedRoomId: selectedRoomId,
  }), [commercialRenderStyle, plan, selectedRoomId]);
  const exportManifest = useMemo(() => buildFloorPlanExportManifest(plan), [plan]);
  const crmPayload = useMemo(() => buildFloorPlanCrmPayload(plan, { contactId: "demo-contact", opportunityId: "demo-opportunity" }), [plan]);
  const quoteTotal = workStudio.quote.total;
  const isScaleConfirmed = plan.source.scaleStatus === "confirmed";
  const blockingIssueCount = qualityIssues.filter((issue) => issue.severity === "blocking").length;
  const warningIssueCount = qualityIssues.filter((issue) => issue.severity === "warning").length;
  const canExportDxf = exportManifest.outputs.some((output) => output.type === "dxf" && output.ready);
  const workflowSteps: WorkflowStep[] = [
    {
      id: "source",
      label: "Sorgente",
      value: plan.source.fileName,
      icon: FileImage,
      status: "complete",
    },
    {
      id: "scale",
      label: "Scala",
      value: isScaleConfirmed ? "Confermata" : "Da confermare",
      icon: Ruler,
      status: isScaleConfirmed ? "complete" : "current",
    },
    {
      id: "qa",
      label: "QA",
      value: blockingIssueCount > 0 ? `${blockingIssueCount} blocchi` : warningIssueCount > 0 ? `${warningIssueCount} avvisi` : "Pulito",
      icon: ShieldCheck,
      status: blockingIssueCount > 0 ? "locked" : isScaleConfirmed ? "complete" : "current",
    },
    {
      id: "output",
      label: "Output",
      value: exportManifest.ready ? "Pronto" : "In revisione",
      icon: FileCheck2,
      status: exportManifest.ready ? "complete" : "locked",
    },
  ];
  const primaryAction = getPrimaryAction({
    isScaleConfirmed,
    exportReady: exportManifest.ready,
    revisionCount: plan.revisions.length,
    blockingIssueCount,
  });
  const PrimaryActionIcon = primaryAction.icon;
  const selectedRoom = plan.rooms.find((room) => room.id === selectedRoomId) ?? plan.rooms[0];
  const selectedFurniture = plan.furniture.find((item) => item.id === selectedFurnitureId);
  const selectedRoomScene = renderPackage.roomScenes.find((scene) => scene.roomId === selectedRoom?.id) ?? renderPackage.roomScenes[0];
  const calibrationPointCount = calibrationDraft.to ? 2 : calibrationDraft.from ? 1 : 0;
  const drawingContext = useMemo(() => buildFloorPlanDrawingContext(plan, {
    activeTool,
    selectedRoomId: selectedRoom?.id,
    selectedFurnitureId: selectedFurniture?.id,
    snapEnabled,
    zoom,
    pointer: cursorPoint,
    calibrationPointCount,
  }), [activeTool, calibrationPointCount, cursorPoint, plan, selectedFurniture?.id, selectedRoom?.id, snapEnabled, zoom]);
  const roomFurnitureCatalog = useMemo(() => {
    if (!selectedRoom) return floorPlanFurnitureCatalog.slice(0, 4);
    const roomText = `${selectedRoom.name} ${selectedRoom.usage}`.toLowerCase();
    const matching = floorPlanFurnitureCatalog.filter((item) => item.roomUsageKeywords.some((keyword) => roomText.includes(keyword)));
    return (matching.length > 0 ? matching : floorPlanFurnitureCatalog).slice(0, 5);
  }, [selectedRoom]);
  const progress = analysisState === "analyzing" ? 58 : analysisState === "reviewed" ? 96 : 72;

  useEffect(() => {
    const scanLayers = plan.source.scan?.layers;
    if (!scanLayers?.length) return;
    setSourceLayerVisibility((current) => Object.fromEntries(
      scanLayers.map((layer) => [layer.id, current[layer.id] ?? layer.visibleByDefault]),
    ) as Record<FloorPlanScanLayerId, boolean>);
  }, [plan.source.scan?.layers]);

  useEffect(() => () => {
    if (sourcePreviewUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(sourcePreviewUrl);
    }
  }, [sourcePreviewUrl]);

  useEffect(() => {
    try {
      window.localStorage.setItem(draftStorageKey, JSON.stringify(plan));
    } catch {
      // Best-effort draft: il browser puo bloccare localStorage in alcuni contesti.
    }
  }, [plan]);

  // F5: warning su unload se ci sono modifiche non confermate.
  // Il browser mostra il proprio dialog nativo "Vuoi lasciare la pagina?"
  // (testo custom è ignorato dai browser moderni per ragioni di sicurezza).
  useEffect(() => {
    if (!isDirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = ""; // Chrome requires returnValue set
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (target?.closest("input, textarea, [contenteditable='true']")) return;

      const matchingTool = floorPlanEditorTools.find((tool) => tool.shortcut.toLowerCase() === event.key.toLowerCase());
      if (matchingTool) {
        event.preventDefault();
        setActiveTool(matchingTool.id);
      }

      if (event.key === "Escape") {
        setSelectedFurnitureId(undefined);
        setDragTarget(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const commitPlanChange = (updater: (current: FloorPlanAnalysis) => FloorPlanAnalysis) => {
    setPlan((current) => {
      setUndoStack((stack) => [...stack.slice(-24), current]);
      setRedoStack([]);
      return updater(current);
    });
    setIsDirty(true);
  };

  const handleUndo = () => {
    setUndoStack((stack) => {
      const previous = stack.at(-1);
      if (!previous) {
        toast.info("Nessuna modifica da annullare.");
        return stack;
      }

      setRedoStack((redo) => [plan, ...redo].slice(0, 25));
      setPlan(previous);
      setDragTarget(null);
      return stack.slice(0, -1);
    });
  };

  const handleRedo = () => {
    setRedoStack((stack) => {
      const next = stack[0];
      if (!next) {
        toast.info("Nessuna modifica da ripristinare.");
        return stack;
      }

      setUndoStack((undo) => [...undo.slice(-24), plan]);
      setPlan(next);
      setDragTarget(null);
      return stack.slice(1);
    });
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // F1: validazione size + formato. Reject early con toast chiaro,
    // evita crash su file enormi (foto DSLR 100MB+) o tipi non supportati.
    const MAX_FILE_SIZE_MB = 30;
    const ALLOWED_TYPES = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "application/pdf",
    ];
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      toast.error("File troppo grande", {
        description: `Limite: ${MAX_FILE_SIZE_MB}MB. Comprimi l'immagine o usa un PDF.`,
      });
      event.target.value = ""; // permette di riselezionare stesso file dopo
      return;
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error("Formato non supportato", {
        description: "Formati ammessi: JPG, PNG, WebP, GIF, PDF.",
      });
      event.target.value = "";
      return;
    }

    setAnalysisState("analyzing");
    const sourceType = file.type === "application/pdf" ? "pdf" : file.type.startsWith("image/") ? "photo" : "floor_plan";

    // F3: try/catch — se inspectImageFile fallisce (rete down su blob? memoria?)
    // mostra toast chiaro invece di lasciare lo stato in "analyzing" infinito.
    try {
      const imageMeta = file.type.startsWith("image/") ? await inspectImageFile(file) : {};
      setSourcePreviewUrl(imageMeta.previewUrl);
      // F2: setTimeout 650ms mantenuto come UX "AI processing feedback" (intenzionale),
      // ma adesso imageMeta è garantito completo grazie al timeout interno di inspectImageFile.
      window.setTimeout(() => {
        const nextPlan = createInitialFloorPlanFromSketch({
          fileName: file.name,
          sourceType,
          mimeType: file.type,
          sizeBytes: file.size,
          width: imageMeta.width,
          height: imageMeta.height,
        });
        setPlan(nextPlan);
        setStyle(nextPlan.style);
        setSelectedRoomId(nextPlan.rooms[0]?.id ?? "living");
        setSelectedFurnitureId(undefined);
        setSourceLayerVisibility(getDefaultSourceLayerVisibility(nextPlan.source.scan?.layers));
        setAnalysisState("reviewed");
        setIsDirty(true);
        toast.success("Foto ottimizzata", {
          description: "Ricalco CAD e revisione guidata pronti.",
        });
      }, 650);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Errore inatteso";
      toast.error("Caricamento fallito", {
        description: `${message}. Riprova o seleziona un altro file.`,
      });
      setAnalysisState("idle");
      event.target.value = "";
    }
  };

  const handleStyleChange = (nextStyle: FloorPlanStyle) => {
    setStyle(nextStyle);
    commitPlanChange((current) => createFloorPlanVariant(current, nextStyle));
  };

  const handleCalibrateScale = () => {
    if (isCalibrating) return; // F4: race protection contro double-click
    const measuredUnits = Number(calibrationUnits.replace(",", "."));
    const knownLengthMeters = Number(calibrationMeters.replace(",", "."));
    if (!Number.isFinite(measuredUnits) || measuredUnits <= 0 || !Number.isFinite(knownLengthMeters) || knownLengthMeters <= 0) {
      toast.error("Inserisci una quota valida per calibrare la scala.");
      return;
    }

    setIsCalibrating(true);
    try {
      commitPlanChange((current) => calibrationDraft.from && calibrationDraft.to
        ? calibrateFloorPlanScaleFromPoints(current, {
            from: calibrationDraft.from,
            to: calibrationDraft.to,
            knownLengthMeters,
            label: "quota canvas",
          })
        : calibrateFloorPlanScale(current, {
            measuredUnits,
            knownLengthMeters,
            label: "quota manuale",
          }));
      setCalibrationDraft({});
      toast.success("Scala confermata: metriche, computo ed export tecnico aggiornati.");
    } finally {
      setIsCalibrating(false);
    }
  };

  const handleCreateRevision = () => {
    commitPlanChange((current) => createFloorPlanRevision(current, {
      note: revisionNote,
      authorName: "Demo Azienda",
    }));
    toast.success("Revisione salvata nella bozza planimetria.");
  };

  const handleExport = async (type: "svg" | "dxf" | "json" | "png" | "pdf") => {
    if (exportingType) return; // F4: race protection contro double-click rapido
    setExportingType(type);
    try {
      if (type === "png" || type === "pdf") {
        // Raster export: trova SVG dentro canvasContainerRef
        const svgEl = canvasContainerRef.current?.querySelector("svg") as SVGSVGElement | null;
        if (!svgEl) {
          throw new Error("Canvas non disponibile. Carica prima una planimetria.");
        }
        if (type === "png") {
          await exportSvgAsPng(svgEl, plan.id, { scale: 2 });
          toast.success("PNG pronto", {
            description: `Esportato ad alta risoluzione (2x). File: ${plan.id}.png`,
          });
        } else {
          const companyName = effectiveCompany?.name ?? "Edilizia in Cloud";
          await exportFloorPlanAsPdf(svgEl, plan, companyName);
          toast.success("PDF pronto", {
            description: `Tavola A4 landscape con titoletto. File: ${plan.id}.pdf`,
          });
        }
      } else {
        const fileName = `${plan.id}.${type}`;
        if (type === "svg") {
          downloadTextFile(fileName, exportFloorPlanToSvg(plan), "image/svg+xml");
        } else if (type === "dxf") {
          downloadTextFile(fileName, exportFloorPlanToDxf(plan), "application/dxf");
        } else {
          downloadTextFile(fileName, JSON.stringify(plan, null, 2), "application/json");
        }
        toast.success(`Export ${type.toUpperCase()} pronto`, {
          description: `File scaricato: ${fileName}`,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Errore inatteso";
      toast.error(`Export ${type.toUpperCase()} fallito`, { description: message });
    } finally {
      // Piccolo delay per evitare click rapidi consecutivi (UX: no spam download)
      setTimeout(() => setExportingType(null), 400);
    }
  };

  const toggleLayer = (layerId: FloorPlanLayerId) => {
    setVisibleLayers((current) => ({ ...current, [layerId]: !current[layerId] }));
  };

  const toggleSourceLayer = (layerId: FloorPlanScanLayerId) => {
    setSourceLayerVisibility((current) => ({ ...current, [layerId]: !current[layerId] }));
  };

  const handleCanvasMeasurePoint = (point: FloorPlanPoint) => {
    if (activeTool !== "measure") return;

    const nextPoint = snapEnabled ? { x: Math.round(point.x), y: Math.round(point.y) } : point;
    setCalibrationDraft((current) => {
      if (!current.from || current.to) {
        toast.info("Punto A impostato. Clicca il secondo punto della quota reale.");
        return { from: nextPoint };
      }

      const measuredUnits = measureFloorPlanDistance(current.from, nextPoint);
      setCalibrationUnits(String(measuredUnits));
      toast.success(`Quota rilevata: ${measuredUnits} unita CAD. Inserisci i metri reali e conferma.`);
      return { ...current, to: nextPoint };
    });
  };

  const handleRoomPatch = (patch: Parameters<typeof updateFloorPlanRoom>[2]) => {
    if (!selectedRoom?.id) return;
    setPlan((current) => updateFloorPlanRoom(current, selectedRoom.id, patch));
  };

  const handleQuickOpening = (
    type: FloorPlanOpening["type"],
    style?: FloorPlanDoorStyle | FloorPlanWindowStyle,
  ) => {
    // G2: width adattata allo stile reale (porte doppie/scorrevoli più larghe)
    const widthByStyle: Record<string, number> = {
      single: type === "door" ? 7 : 10,
      double: type === "door" ? 14 : 18,
      sliding: type === "door" ? 9 : 12,
      bifold: 9,
      armored: 8,
      fixed: 8,
      skylight: 8,
      panoramic: 22,
    };
    const w = widthByStyle[style ?? "single"] ?? (type === "door" ? 7 : 12);
    commitPlanChange((current) => addFloorPlanOpening(current, {
      type,
      wallId: type === "door" ? "w-hall-bedrooms" : "w-ext-n",
      x: type === "door" ? 66 : 45,
      y: type === "door" ? 33 : 8,
      width: w,
      swing: type === "door" ? (style === "sliding" ? "sliding" : "left") : undefined,
      doorStyle: type === "door" ? (style as FloorPlanDoorStyle | undefined) ?? "single" : undefined,
      windowStyle: type === "window" ? (style as FloorPlanWindowStyle | undefined) ?? "single" : undefined,
    }));
    const styleLabel = style ? ` (${style})` : "";
    toast.success(
      type === "door"
        ? `Porta${styleLabel} aggiunta alla bozza CAD.`
        : `Finestra${styleLabel} aggiunta alla bozza CAD.`,
    );
  };

  // G3: helper annotazioni preset (utente li aggiunge da pannello dedicato).
  const handleAddAnnotation = (type: FloorPlanAnnotationType) => {
    const presets: Record<FloorPlanAnnotationType, Omit<FloorPlanAnnotation, "id">> = {
      text: { type: "text", x: 50, y: 50, text: "Nota libera", fontSize: 14, color: "#0f172a" },
      arrow: { type: "arrow", x: 30, y: 30, toX: 50, toY: 30, color: "#0f172a" },
      north: { type: "north", x: 90, y: 8, rotation: 0, color: "#0f172a" },
      scale_bar: { type: "scale_bar", x: 50, y: 92, meters: 1, color: "#0f172a" },
    };
    commitPlanChange((current) => addFloorPlanAnnotation(current, presets[type]));
    const labels: Record<FloorPlanAnnotationType, string> = {
      text: "Testo",
      arrow: "Freccia",
      north: "Simbolo Nord",
      scale_bar: "Scala grafica",
    };
    toast.success(`${labels[type]} aggiunta al disegno.`);
  };

  const handleRemoveAnnotation = (annotationId: string) => {
    commitPlanChange((current) => removeFloorPlanAnnotation(current, annotationId));
  };

  const handleAddFurniture = (catalogItemId: string) => {
    if (!selectedRoom?.id) {
      toast.error("Seleziona prima una stanza.");
      return;
    }

    const catalogItem = floorPlanFurnitureCatalog.find((item) => item.id === catalogItemId);
    const nextFurnitureId = `${catalogItemId}-${plan.furniture.length + 1}`;
    commitPlanChange((current) => addFloorPlanFurniture(current, {
      catalogItemId,
      roomId: selectedRoom.id,
    }));
    setSelectedFurnitureId(nextFurnitureId);
    setActiveTool("furniture");
    toast.success(`${catalogItem?.label ?? "Arredo"} aggiunto a ${selectedRoom.name}.`);
  };

  const handleApplyAiFurniture = () => {
    const nextItem = roomFurnitureCatalog[0] ?? floorPlanFurnitureCatalog[0];
    if (!nextItem) return;
    handleAddFurniture(nextItem.id);
  };

  const handleSelectRoom = (roomId: string) => {
    setSelectedRoomId(roomId);
    setSelectedFurnitureId(undefined);
  };

  const handleSelectFurniture = (furnitureId: string) => {
    const furniture = plan.furniture.find((item) => item.id === furnitureId);
    setSelectedFurnitureId(furnitureId);
    if (furniture?.roomId) setSelectedRoomId(furniture.roomId);
  };

  const handleBeginCadDrag = (target: Omit<CadDragTarget, "lastPoint">, point: FloorPlanPoint) => {
    if (activeTool === "measure") return;
    const nextPoint = snapEnabled ? { x: Math.round(point.x), y: Math.round(point.y) } : point;
    if (target.type === "room") handleSelectRoom(target.id);
    if (target.type === "furniture") handleSelectFurniture(target.id);
    setUndoStack((stack) => [...stack.slice(-24), plan]);
    setRedoStack([]);
    setDragTarget({ ...target, lastPoint: nextPoint });
  };

  const handleCadDragMove = (point: FloorPlanPoint) => {
    if (!dragTarget) return;
    const nextPoint = snapEnabled ? { x: Math.round(point.x), y: Math.round(point.y) } : point;
    const delta = {
      x: nextPoint.x - dragTarget.lastPoint.x,
      y: nextPoint.y - dragTarget.lastPoint.y,
    };
    if (Math.abs(delta.x) < 0.01 && Math.abs(delta.y) < 0.01) return;

    setPlan((current) => dragTarget.type === "furniture"
      ? moveFloorPlanFurniture(current, { furnitureId: dragTarget.id, delta, snap: false })
      : moveFloorPlanRoom(current, { roomId: dragTarget.id, delta, snap: false, moveContents: true }));
    setDragTarget((current) => current ? { ...current, lastPoint: nextPoint } : current);
  };

  const handleEndCadDrag = () => {
    setDragTarget(null);
  };

  const handleNudgeSelection = (delta: FloorPlanPoint) => {
    if (selectedFurniture) {
      commitPlanChange((current) => moveFloorPlanFurniture(current, {
        furnitureId: selectedFurniture.id,
        delta,
        snap: true,
      }));
      return;
    }

    if (selectedRoom?.id) {
      commitPlanChange((current) => moveFloorPlanRoom(current, {
        roomId: selectedRoom.id,
        delta,
        snap: true,
        moveContents: true,
      }));
    }
  };

  const handleRotateSelection = () => {
    if (!selectedFurniture) {
      toast.info("Seleziona un arredo per ruotarlo.");
      return;
    }

    commitPlanChange((current) => rotateFloorPlanFurniture(current, {
      furnitureId: selectedFurniture.id,
      degrees: selectedFurniture.rotation + 15,
      snapDegrees: 15,
    }));
  };

  const handleQuickAction = (label: string) => {
    toast.success(`${label}: bozza aggiornata.`);
  };

  const handlePrimaryAction = () => {
    if (primaryAction.id === "scale") {
      handleCalibrateScale();
    } else if (primaryAction.id === "qa") {
      toast.info("Apri QA tecnico: correggi i blocchi prima dell'export definitivo.");
    } else if (primaryAction.id === "revision") {
      handleCreateRevision();
    } else {
      handleQuickAction("Output cliente");
    }
  };

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_390px] lg:p-5">
          <div>
            <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Button variant="ghost" size="sm" className="gap-2 px-0 hover:bg-transparent" onClick={() => navigate("/azienda/render/planimetrie")}>
                <ArrowLeft className="h-4 w-4" />
                Planimetrie AI
              </Button>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-orange-300 shadow-sm">
                <DraftingCompass className="h-7 w-7" />
              </div>
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700">
                    Sketch → CAD → 3D
                  </Badge>
                  <Badge variant="outline" className="border-cyan-200 bg-cyan-50 text-cyan-700">
                    Autosalvato
                  </Badge>
                </div>
                <h1 className="text-2xl font-bold text-slate-950 sm:text-3xl">Studio planimetrie AI</h1>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                  Un flusso unico per trasformare uno schizzo o una planimetria in CAD editabile, vista 3D, computo e output cliente.
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-4">
              <SummaryMetric label="Confidenza" value={`${Math.round(plan.source.confidence * 100)}%`} tone="orange" />
              <SummaryMetric label="Superficie" value={`${metrics.totalAreaMq} mq`} tone="cyan" />
              <SummaryMetric label="Stima" value={formatCurrency(quoteTotal)} tone="emerald" />
              <SummaryMetric label="QA" value={blockingIssueCount > 0 ? `${blockingIssueCount} blocchi` : warningIssueCount > 0 ? `${warningIssueCount} avvisi` : "OK"} tone={blockingIssueCount > 0 ? "orange" : "emerald"} />
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-950">Azione consigliata</p>
                <p className="text-xs text-slate-500">{primaryAction.description}</p>
              </div>
              <PrimaryActionIcon className="h-5 w-5 shrink-0 text-orange-600" />
            </div>
            <Button className="w-full justify-between gap-2 bg-slate-950 hover:bg-slate-800" onClick={handlePrimaryAction}>
              {primaryAction.label}
              <ArrowRight className="h-4 w-4" />
            </Button>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <RenderCreditsWidget />
              <Button variant="outline" size="sm" className="gap-2" onClick={() => handleQuickAction("Salvataggio")}>
                <Save className="h-4 w-4" />
                Salva
              </Button>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => handleQuickAction("Render AI")}>
                <Sparkles className="h-4 w-4" />
                Genera
              </Button>
            </div>
          </div>
        </div>
        <WorkflowRail steps={workflowSteps} />
      </div>

      <section className="grid gap-4 xl:grid-cols-[330px_minmax(0,1fr)]">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Upload className="h-4 w-4 text-orange-600" />
              Sorgente progetto
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Carica una nuova planimetria"
              className="group relative flex min-h-[172px] w-full flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 px-4 text-center transition hover:border-orange-300 hover:bg-orange-50/60"
            >
              <span className="absolute right-3 top-3 rounded-full border border-orange-200 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-orange-700">
                AI ready
              </span>
              {sourcePreviewUrl ? (
                <span className="mb-3 block h-24 w-36 overflow-hidden rounded-xl border border-white bg-white shadow-sm">
                  <img loading="lazy" src={sourcePreviewUrl} alt="" className="h-full w-full object-cover opacity-90 grayscale transition group-hover:scale-105" />
                </span>
              ) : (
                <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm transition group-hover:text-orange-600">
                  <FileImage className="h-6 w-6" />
                </span>
              )}
              <span className="text-sm font-semibold text-slate-900">{plan.source.fileName}</span>
              <span className="mt-1 text-xs leading-5 text-slate-500">PDF, JPG, PNG, foto da telefono o scansione</span>
              <span className="mt-3 rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white transition group-hover:bg-orange-600">
                Cambia sorgente
              </span>
            </button>
            <Input ref={fileInputRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleFileChange} />

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-600">Qualità ricostruzione</span>
                <span className="font-semibold text-slate-900">{Math.round(plan.source.confidence * 100)}%</span>
              </div>
              <Progress value={progress} className="h-2" indicatorClassName="bg-gradient-to-r from-orange-500 to-emerald-500" />
              <div className="flex items-center gap-2 text-xs text-slate-500">
                {analysisState === "analyzing" ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Analisi geometria in corso
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    Muri, stanze e aperture rilevati
                  </>
                )}
              </div>
            </div>

            {plan.source.scan && (
              <div className="space-y-3 rounded-xl border border-orange-200 bg-orange-50/70 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">Scanner AI foto</p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">{plan.source.scan.summary}</p>
                  </div>
                  <Badge className="bg-slate-950 text-white hover:bg-slate-950">{plan.source.scan.score}%</Badge>
                </div>

                {plan.source.scan.dimensions && (
                  <p className="text-xs text-slate-500">
                    {plan.source.scan.dimensions.width} x {plan.source.scan.dimensions.height}px · {plan.source.scan.dimensions.megapixels} MP
                  </p>
                )}

                <div className="grid gap-2">
                  {plan.source.scan.corrections.slice(0, 4).map((correction) => (
                    <div key={correction.id} className="flex items-start gap-2 rounded-lg bg-white/80 p-2">
                      {correction.applied ? (
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                      ) : (
                        <CircleDashed className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                      )}
                      <div>
                        <p className="text-xs font-semibold text-slate-900">{correction.label}</p>
                        <p className="text-[11px] leading-4 text-slate-500">{correction.description}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {plan.source.scan.layers.map((layer) => (
                    <button
                      key={layer.id}
                      type="button"
                      onClick={() => toggleSourceLayer(layer.id)}
                      aria-pressed={sourceLayerVisibility[layer.id]}
                      className={cn(
                        "rounded-lg border px-2 py-2 text-left text-xs transition",
                        sourceLayerVisibility[layer.id]
                          ? "border-orange-300 bg-white text-slate-900 shadow-sm"
                          : "border-orange-100 bg-orange-100/60 text-slate-500",
                      )}
                    >
                      <span className="block font-semibold">{layer.label}</span>
                      <span className="mt-0.5 block text-[10px] leading-4 opacity-75">
                        {sourceLayerVisibility[layer.id] ? `visibile · ${Math.round(layer.opacity * 100)}%` : "nascosto"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-950">Revisione guidata AI</p>
                  <p className="text-xs text-slate-500">Domande da chiudere prima di preventivo e CAD definitivo.</p>
                </div>
                <Badge variant="outline">{photoReviewQuestions.length}</Badge>
              </div>
              <div className="space-y-2">
                {photoReviewQuestions.slice(0, 4).map((question) => (
                  <ReviewQuestionRow key={question.id} question={question} />
                ))}
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-2">
              <MetricTile label="mq" value={`${metrics.totalAreaMq}`} tone="cyan" />
              <MetricTile label="ambienti" value={`${metrics.roomCount}`} tone="orange" />
              <MetricTile label="m muri" value={`${metrics.wallLinearMeters}`} tone="slate" />
              <MetricTile label="aperture" value={`${metrics.openingCount}`} tone="emerald" />
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-950">Calibrazione scala</p>
                  <p className="text-xs text-slate-500">
                    {plan.source.scaleStatus === "confirmed" ? "Scala confermata" : "Scala stimata"}
                  </p>
                </div>
                <Badge variant={plan.source.scaleStatus === "confirmed" ? "secondary" : "outline"}>
                  {plan.source.scaleStatus === "confirmed" ? "OK" : "Da confermare"}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="calibration-units" className="text-xs text-slate-500">Unita CAD</Label>
                  <Input
                    id="calibration-units"
                    inputMode="decimal"
                    value={calibrationUnits}
                    onChange={(event) => setCalibrationUnits(event.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="calibration-meters" className="text-xs text-slate-500">Metri reali</Label>
                  <Input
                    id="calibration-meters"
                    inputMode="decimal"
                    value={calibrationMeters}
                    onChange={(event) => setCalibrationMeters(event.target.value)}
                  />
                </div>
              </div>
              <Button variant="outline" className="mt-3 w-full gap-2" onClick={handleCalibrateScale}>
                <Ruler className="h-4 w-4" />
                Conferma scala
              </Button>
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs leading-5 text-slate-600">
                <p className="font-semibold text-slate-900">Quota dal disegno</p>
                <p>
                  {activeTool === "measure"
                    ? calibrationDraft.from && calibrationDraft.to
                      ? `Quota pronta: ${calibrationUnits} unita CAD.`
                      : calibrationDraft.from
                        ? "Punto A preso: clicca il punto B."
                        : "Clicca due punti sulla planimetria."
                    : "Seleziona lo strumento Quote per prendere la misura dal canvas."}
                </p>
              </div>
            </div>

            <div className={cn(
              "rounded-xl border p-3",
              qualityIssues.some((issue) => issue.severity === "blocking")
                ? "border-orange-200 bg-orange-50"
                : "border-emerald-200 bg-emerald-50",
            )}>
              <div className="flex items-start gap-2">
                {qualityIssues.some((issue) => issue.severity === "blocking") ? (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-700" />
                ) : (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                )}
                <p className="text-xs leading-5 text-slate-700">
                  {qualityIssues[0]?.description ?? "Nessun blocco tecnico rilevato."}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-950 shadow-sm">
          <div className="flex flex-col gap-3 border-b border-white/10 bg-slate-900/90 p-3 text-white lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-orange-500 text-white hover:bg-orange-500">CAD 2D</Badge>
              <span className="text-sm font-medium">{plan.title}</span>
              <span className="text-xs text-slate-400">{plan.source.scale}</span>
              <EditorSignal icon={Ruler} label="Scala" value={isScaleConfirmed ? "OK" : "stimata"} active={isScaleConfirmed} />
              <EditorSignal icon={ClipboardCheck} label="QA" value={blockingIssueCount > 0 ? `${blockingIssueCount}` : "OK"} active={blockingIssueCount === 0} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button aria-label="Riduci zoom" variant="secondary" size="icon" className="h-8 w-8" onClick={() => setZoom((value) => Math.max(70, value - 10))}>
                <ZoomOut className="h-4 w-4" />
              </Button>
              <div className="w-28">
                <Slider value={[zoom]} min={70} max={145} step={5} onValueChange={(value) => setZoom(value[0] ?? 100)} />
              </div>
              <span className="min-w-10 text-center text-xs font-semibold text-slate-300">{zoom}%</span>
              <Button aria-label="Aumenta zoom" variant="secondary" size="icon" className="h-8 w-8" onClick={() => setZoom((value) => Math.min(145, value + 10))}>
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button aria-label="Reimposta zoom" variant="secondary" size="icon" className="h-8 w-8" onClick={() => setZoom(100)}>
                <Maximize2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="grid min-h-[610px] lg:grid-cols-[76px_minmax(0,1fr)_330px]">
            <TooltipProvider delayDuration={250}>
              <aside className="flex gap-2 overflow-x-auto border-b border-white/10 bg-slate-900 p-3 lg:flex-col lg:border-b-0 lg:border-r">
                {floorPlanEditorTools.map((tool) => {
                  const Icon = toolIcons[tool.id];
                  const isActive = activeTool === tool.id;
                  return (
                    <Tooltip key={tool.id}>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          size="icon"
                          variant={isActive ? "default" : "secondary"}
                          className={cn("h-11 w-11 shrink-0", isActive && "bg-orange-500 text-white hover:bg-orange-600")}
                          onClick={() => setActiveTool(tool.id)}
                          aria-label={tool.label}
                          aria-pressed={isActive}
                        >
                          <Icon className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-[260px]">
                        <div className="space-y-1">
                          <p className="text-xs font-semibold">{tool.label} · {tool.shortcut}</p>
                          <p className="text-xs text-muted-foreground">{tool.description}</p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </aside>
            </TooltipProvider>

            <main className="flex min-h-[610px] flex-col overflow-hidden bg-slate-950">
              <div className="border-b border-white/10 bg-slate-950/95 p-3">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                  <div className="flex min-w-0 gap-2 overflow-x-auto pb-1 xl:pb-0">
                    {floorPlanEditorTools.map((tool) => {
                      const Icon = toolIcons[tool.id];
                      const isActive = activeTool === tool.id;
                      return (
                        <button
                          key={`ribbon-${tool.id}`}
                          type="button"
                          onClick={() => setActiveTool(tool.id)}
                          className={cn(
                            "flex min-w-[128px] items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs transition",
                            isActive
                              ? "border-orange-300/70 bg-orange-500 text-white shadow-lg shadow-orange-950/25"
                              : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-cyan-300/40 hover:bg-cyan-300/10 hover:text-white",
                          )}
                          aria-pressed={isActive}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="min-w-0">
                            <span className="block truncate font-semibold">{tool.label}</span>
                            <span className="block text-[10px] opacity-75">{tool.shortcut}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 xl:min-w-[420px]">
                    <CadStatusPill label="Scala" value={drawingContext.canvasStatus.scale} />
                    <CadStatusPill label="Snap" value={drawingContext.canvasStatus.snap} />
                    <CadStatusPill label="Zoom" value={drawingContext.canvasStatus.zoom} />
                    <CadStatusPill label="Griglia" value={drawingContext.canvasStatus.grid} />
                  </div>
                </div>
              </div>

              {/* F6: overflow-x-auto + touch-pan-x abilita pan tablet/mobile
                  quando il canvas overflowsa il viewport. min-w-[640px] tiene
                  il canvas leggibile anche su schermi stretti. */}
              <div
                className="relative flex flex-1 items-center justify-center overflow-auto bg-[radial-gradient(circle_at_1px_1px,rgba(148,163,184,0.24)_1px,transparent_0)] p-4 [background-size:22px_22px] sm:p-6"
                style={{ touchAction: "pan-x pan-y pinch-zoom" }}
              >
                <CanvasRulers />
                <DrawingAssistantPanel context={drawingContext} />
                <div
                  ref={canvasContainerRef}
                  className="w-full min-w-[640px] max-w-[940px] origin-center rounded-2xl border border-cyan-400/20 bg-slate-950/80 p-4 shadow-2xl shadow-black/30 transition-transform"
                  style={{ transform: `scale(${zoom / 100})` }}
                >
                  <FloorPlanCanvas
                    plan={plan}
                    selectedRoomId={selectedRoom?.id}
                    selectedFurnitureId={selectedFurniture?.id}
                    sourcePreviewUrl={sourcePreviewUrl}
                    sourceScanLayers={plan.source.scan?.layers ?? []}
                    sourceLayerVisibility={sourceLayerVisibility}
                    activeTool={activeTool}
                    visibleLayers={visibleLayers}
                    calibrationDraft={calibrationDraft}
                    onSelectRoom={handleSelectRoom}
                    onSelectFurniture={handleSelectFurniture}
                    onMeasurePoint={handleCanvasMeasurePoint}
                    onBeginDrag={handleBeginCadDrag}
                    onDragMove={handleCadDragMove}
                    onEndDrag={handleEndCadDrag}
                    onPointerPoint={setCursorPoint}
                  />
                </div>
              </div>

              <div className="grid gap-2 border-t border-white/10 bg-slate-950/95 px-3 py-2 text-[11px] text-slate-300 sm:grid-cols-5">
                <CadStatusPill label="Tool" value={drawingContext.tool.label} dense />
                <CadStatusPill label="Selezione" value={drawingContext.canvasStatus.selection} dense />
                <CadStatusPill label="Coordinate" value={drawingContext.canvasStatus.coordinates} dense />
                <CadStatusPill label="Azione" value={drawingContext.nextActionLabel} dense />
                <CadStatusPill label="Stato" value={drawingContext.status.replace("_", " ")} dense />
              </div>
            </main>

            <aside className="space-y-4 border-t border-white/10 bg-slate-900/95 p-4 text-white lg:border-l lg:border-t-0">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wider text-slate-400">Strumento</p>
                  <p className="font-semibold">{drawingContext.headline}</p>
                  <p className="mt-1 max-w-[220px] text-xs leading-4 text-slate-400">{drawingContext.instruction}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="snap-grid" className="text-xs text-slate-300">Snap</Label>
                  <Switch id="snap-grid" checked={snapEnabled} onCheckedChange={setSnapEnabled} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {drawingContext.microSteps.map((step, index) => (
                  <div key={step} className="rounded-lg border border-white/10 bg-white/5 px-2 py-2">
                    <p className="text-[10px] font-semibold text-orange-200">0{index + 1}</p>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-300">{step}</p>
                  </div>
                ))}
              </div>

              <Separator className="bg-white/10" />

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Layers3 className="h-4 w-4 text-orange-300" />
                  <p className="text-sm font-semibold">Layer progetto</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {floorPlanLayers.map((layer) => (
                    <button
                      key={layer.id}
                      type="button"
                      onClick={() => toggleLayer(layer.id)}
                      aria-pressed={visibleLayers[layer.id]}
                      className={cn(
                        "rounded-lg border px-2 py-2 text-left text-xs transition",
                        visibleLayers[layer.id]
                          ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-50"
                          : "border-white/10 bg-white/5 text-slate-400",
                      )}
                    >
                      <span className="block font-semibold">{layer.label}</span>
                      <span className="mt-0.5 block text-[10px] leading-4 opacity-80">{visibleLayers[layer.id] ? "visibile" : "nascosto"}</span>
                    </button>
                  ))}
                </div>
              </div>

              <Separator className="bg-white/10" />

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Grid3X3 className="h-4 w-4 text-cyan-300" />
                  <p className="text-sm font-semibold">Ambiente selezionato</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="space-y-2">
                    <div className="space-y-1">
                      <Label htmlFor="selected-room-name" className="text-xs text-slate-400">Nome ambiente</Label>
                      <Input
                        id="selected-room-name"
                        value={selectedRoom?.name ?? ""}
                        onChange={(event) => handleRoomPatch({ name: event.target.value })}
                        className="h-8 border-white/10 bg-white/10 text-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="selected-room-usage" className="text-xs text-slate-400">Uso</Label>
                      <Input
                        id="selected-room-usage"
                        value={selectedRoom?.usage ?? ""}
                        onChange={(event) => handleRoomPatch({ usage: event.target.value })}
                        className="h-8 border-white/10 bg-white/10 text-white"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label htmlFor="selected-room-area" className="text-xs text-slate-400">mq</Label>
                        <Input
                          id="selected-room-area"
                          inputMode="decimal"
                          value={selectedRoom?.areaMq ?? ""}
                          onChange={(event) => handleRoomPatch({ areaMq: Number(event.target.value.replace(",", ".")) })}
                          className="h-8 border-white/10 bg-white/10 text-white"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="selected-room-confidence" className="text-xs text-slate-400">Conf.</Label>
                        <Input
                          id="selected-room-confidence"
                          inputMode="decimal"
                          value={Math.round((selectedRoom?.confidence ?? 0) * 100)}
                          onChange={(event) => handleRoomPatch({ confidence: Number(event.target.value.replace(",", ".")) / 100 })}
                          className="h-8 border-white/10 bg-white/10 text-white"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="selected-room-finish" className="text-xs text-slate-400">Finitura</Label>
                      <Input
                        id="selected-room-finish"
                        value={selectedRoom?.finish ?? ""}
                        onChange={(event) => handleRoomPatch({ finish: event.target.value })}
                        className="h-8 border-white/10 bg-white/10 text-white"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Movimento CAD</p>
                    <p className="text-xs text-slate-400">
                      {selectedFurniture
                        ? `${selectedFurniture.label} · x ${selectedFurniture.x}, y ${selectedFurniture.y}`
                        : selectedRoom
                          ? `${selectedRoom.name} · stanza + arredi`
                          : "Seleziona un oggetto"}
                    </p>
                  </div>
                  <Badge variant="outline" className="border-white/10 bg-white/10 text-slate-100">
                    {selectedFurniture ? "Arredo" : "Stanza"}
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <span />
                  <Button variant="secondary" size="sm" onClick={() => handleNudgeSelection({ x: 0, y: -1 })}>Su</Button>
                  <span />
                  <Button variant="secondary" size="sm" onClick={() => handleNudgeSelection({ x: -1, y: 0 })}>Sin</Button>
                  <Button variant="secondary" size="sm" onClick={handleRotateSelection} disabled={!selectedFurniture}>Ruota</Button>
                  <Button variant="secondary" size="sm" onClick={() => handleNudgeSelection({ x: 1, y: 0 })}>Des</Button>
                  <span />
                  <Button variant="secondary" size="sm" onClick={() => handleNudgeSelection({ x: 0, y: 1 })}>Giu</Button>
                  <span />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <DoorOpen className="h-4 w-4 text-orange-300" />
                  <p className="text-sm font-semibold">Correzioni rapide</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button id="floor-plan-quick-door" variant="secondary" className="gap-2" aria-label="Aggiungi porta singola" onClick={() => handleQuickOpening("door", "single")}>
                    <DoorOpen className="h-4 w-4" />
                    Porta
                  </Button>
                  <Button id="floor-plan-quick-window" variant="secondary" className="gap-2" aria-label="Aggiungi finestra singola" onClick={() => handleQuickOpening("window", "single")}>
                    <PanelTopOpen className="h-4 w-4" />
                    Finestra
                  </Button>
                </div>
                {/* G2: catalog porte/finestre esteso per preventivi serramenti.
                    Stili distinti per width predefinita e label in toast. */}
                <p className="text-[10px] uppercase tracking-wider text-white/40">Varianti porte</p>
                <div className="grid grid-cols-2 gap-1.5">
                  <Button variant="ghost" size="sm" className="h-7 justify-start gap-1.5 text-[11px] text-white/80 hover:text-white" onClick={() => handleQuickOpening("door", "double")}>
                    + Doppia
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 justify-start gap-1.5 text-[11px] text-white/80 hover:text-white" onClick={() => handleQuickOpening("door", "sliding")}>
                    + Scorrevole
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 justify-start gap-1.5 text-[11px] text-white/80 hover:text-white" onClick={() => handleQuickOpening("door", "bifold")}>
                    + A libro
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 justify-start gap-1.5 text-[11px] text-white/80 hover:text-white" onClick={() => handleQuickOpening("door", "armored")}>
                    + Blindata
                  </Button>
                </div>
                <p className="text-[10px] uppercase tracking-wider text-white/40">Varianti finestre</p>
                <div className="grid grid-cols-2 gap-1.5">
                  <Button variant="ghost" size="sm" className="h-7 justify-start gap-1.5 text-[11px] text-white/80 hover:text-white" onClick={() => handleQuickOpening("window", "double")}>
                    + Doppia anta
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 justify-start gap-1.5 text-[11px] text-white/80 hover:text-white" onClick={() => handleQuickOpening("window", "fixed")}>
                    + Fissa
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 justify-start gap-1.5 text-[11px] text-white/80 hover:text-white" onClick={() => handleQuickOpening("window", "panoramic")}>
                    + Panoramica
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 justify-start gap-1.5 text-[11px] text-white/80 hover:text-white" onClick={() => handleQuickOpening("window", "skylight")}>
                    + Lucernario
                  </Button>
                </div>
              </div>

              {/* G3: Annotazioni libere sul disegno. Bottoni preset spawnano
                  elementi default in posizioni standard, l'utente li sposta. */}
              <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-amber-300" />
                  <p className="text-sm font-semibold">Annotazioni</p>
                  {(plan.annotations?.length ?? 0) > 0 && (
                    <Badge variant="outline" className="ml-auto border-white/20 bg-white/10 text-[10px] text-white">
                      {plan.annotations?.length ?? 0}
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <Button variant="ghost" size="sm" className="h-8 justify-start gap-1.5 text-[11px] text-white/80 hover:text-white" onClick={() => handleAddAnnotation("text")}>
                    + Testo
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 justify-start gap-1.5 text-[11px] text-white/80 hover:text-white" onClick={() => handleAddAnnotation("arrow")}>
                    + Freccia
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 justify-start gap-1.5 text-[11px] text-white/80 hover:text-white" onClick={() => handleAddAnnotation("north")}>
                    + Nord
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 justify-start gap-1.5 text-[11px] text-white/80 hover:text-white" onClick={() => handleAddAnnotation("scale_bar")}>
                    + Scala
                  </Button>
                </div>
                {(plan.annotations?.length ?? 0) > 0 && (
                  <div className="space-y-1 border-t border-white/10 pt-2">
                    {(plan.annotations ?? []).slice(0, 6).map((ann) => (
                      <div key={ann.id} className="flex items-center justify-between gap-2 text-[11px] text-white/70">
                        <span className="truncate">
                          {ann.type === "text" ? `T: "${(ann.text ?? "").slice(0, 18)}"` :
                           ann.type === "arrow" ? "→ Freccia" :
                           ann.type === "north" ? "↑ Nord" :
                           `▭ Scala ${ann.meters ?? 1}m`}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0 text-white/40 hover:text-red-400"
                          onClick={() => handleRemoveAnnotation(ann.id)}
                          aria-label="Rimuovi annotazione"
                        >
                          ×
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Sofa className="h-4 w-4 text-cyan-300" />
                    <p className="text-sm font-semibold">Libreria arredi</p>
                  </div>
                  <Badge variant="outline" className="border-cyan-300/30 bg-cyan-300/10 text-cyan-100">
                    {roomFurnitureCatalog.length}
                  </Badge>
                </div>
                <div className="space-y-2">
                  {roomFurnitureCatalog.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleAddFurniture(item.id)}
                      className="flex w-full items-center justify-between gap-3 rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2 text-left transition hover:border-cyan-300/50 hover:bg-cyan-300/10"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-semibold text-white">{item.label}</span>
                        <span className="block truncate text-[10px] leading-4 text-slate-400">{item.description}</span>
                      </span>
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: furnitureFill[item.category] }}
                      />
                    </button>
                  ))}
                </div>
                <Button variant="secondary" className="w-full gap-2" onClick={handleApplyAiFurniture}>
                  <Sparkles className="h-4 w-4" />
                  Applica arredo AI
                </Button>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Palette className="h-4 w-4 text-orange-300" />
                  <p className="text-sm font-semibold">Varianti stile</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {styleOptions.map((option) => (
                    <Button
                      key={option.value}
                      type="button"
                      variant={style === option.value ? "default" : "secondary"}
                      className={cn("justify-start gap-2", style === option.value && "bg-orange-500 hover:bg-orange-600")}
                      onClick={() => handleStyleChange(option.value)}
                    >
                      <span className={cn("h-3 w-3 rounded-full", option.className)} />
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-3 rounded-xl border border-orange-300/20 bg-orange-300/10 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Render cliente</p>
                    <p className="text-xs text-slate-400">Materiali, arredi e camera per effetto dollhouse.</p>
                  </div>
                  <Badge className="bg-orange-500 text-white hover:bg-orange-500">{renderPackage.wowScore}% wow</Badge>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {floorPlanCommercialRenderStyles.map((option) => (
                    <Button
                      key={option.id}
                      type="button"
                      size="sm"
                      variant={commercialRenderStyle === option.id ? "default" : "secondary"}
                      className={cn("justify-start text-xs", commercialRenderStyle === option.id && "bg-orange-500 text-white hover:bg-orange-600")}
                      onClick={() => setCommercialRenderStyle(option.id)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {renderPackage.cameraPresets.map((preset) => (
                    <Button
                      key={preset.id}
                      type="button"
                      size="sm"
                      variant={renderCameraPreset === preset.id ? "default" : "secondary"}
                      className={cn("justify-start text-xs", renderCameraPreset === preset.id && "bg-cyan-500 text-white hover:bg-cyan-600")}
                      onClick={() => setRenderCameraPreset(preset.id)}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="revision-note" className="text-xs uppercase tracking-wider text-slate-400">Nota revisione</Label>
                <Textarea
                  id="revision-note"
                  value={revisionNote}
                  onChange={(event) => setRevisionNote(event.target.value)}
                  className="min-h-[88px] border-white/10 bg-white/5 text-white placeholder:text-slate-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" className="gap-2" onClick={handleUndo} disabled={undoStack.length === 0}>
                  <Undo2 className="h-4 w-4" />
                  Undo
                </Button>
                <Button variant="secondary" className="gap-2" onClick={handleRedo} disabled={redoStack.length === 0}>
                  <Redo2 className="h-4 w-4" />
                  Redo
                </Button>
                <Button variant="secondary" className="gap-2" disabled={!canExportDxf} onClick={() => handleExport("dxf")}>
                  <Download className="h-4 w-4" />
                  DXF
                </Button>
                <Button className="gap-2 bg-orange-500 hover:bg-orange-600" onClick={() => setShow3d((value) => !value)}>
                  <Cuboid className="h-4 w-4" />
                  3D
                </Button>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        {show3d && (
          <Card className="overflow-hidden border-slate-200 shadow-sm">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Cuboid className="h-4 w-4 text-orange-600" />
                  Dollhouse 3D commerciale
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Materiali, arredi e camera {renderPackage.cameraPresets.find((preset) => preset.id === renderCameraPreset)?.label.toLowerCase()}.
                </p>
              </div>
              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">WebGL · {renderPackage.wowScore}%</Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <FloorPlanDollhouse3D
                plan={plan}
                renderStyle={commercialRenderStyle}
                selectedRoomId={selectedRoom?.id}
                cameraPreset={renderCameraPreset}
                className="h-[420px] w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
              />
              {selectedRoomScene && (
                <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
                  <div className="rounded-xl border bg-white p-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-orange-600">Stanza selezionata</p>
                    <p className="mt-1 text-sm font-semibold text-slate-950">{selectedRoomScene.roomName}</p>
                    <p className="mt-2 text-xs leading-5 text-slate-600">
                      {selectedRoomScene.materials.floorLabel} · {selectedRoomScene.materials.wallLabel}
                    </p>
                  </div>
                  <div className="rounded-xl border bg-white p-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-cyan-600">Arredi AI</p>
                    <p className="mt-1 text-sm leading-5 text-slate-700">{selectedRoomScene.furnitureLabels.slice(0, 4).join(", ")}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wand2 className="h-4 w-4 text-orange-600" />
              Brief generazione
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border bg-slate-50 p-3 text-sm leading-6 text-slate-700">
              {brief}
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <OutputPill icon={PencilRuler} title="CAD editabile" text="muri, quote, stanze" />
              <OutputPill icon={Cuboid} title="3D" text="dollhouse navigabile" />
              <OutputPill icon={GalleryHorizontalEnd} title="Render" text="stili e materiali" />
            </div>
            <div className="space-y-2 rounded-xl border bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-950">Pacchetto cliente</p>
                <Badge variant="outline">{renderPackage.clientOutputs.filter((output) => output.ready).length}/{renderPackage.clientOutputs.length}</Badge>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {renderPackage.clientOutputs.map((output) => (
                  <div key={output.id} className={cn(
                    "rounded-lg border px-3 py-2",
                    output.ready ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50",
                  )}>
                    <p className="text-xs font-semibold text-slate-900">{output.label}</p>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-600">{output.description}</p>
                  </div>
                ))}
              </div>
            </div>
            {selectedRoomScene && (
              <div className="rounded-xl border bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Prompt stanza</p>
                <p className="mt-1 text-xs leading-5 text-slate-700">{selectedRoomScene.prompt}</p>
              </div>
            )}
            <Button className="w-full gap-2 bg-slate-950 hover:bg-slate-800" onClick={() => handleQuickAction("Pipeline planimetria")}>
              <Sparkles className="h-4 w-4" />
              Prepara output cliente
            </Button>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-orange-600" />
                AI progettista
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Suggerimenti pratici su arredo, QA, preventivo e passaggio a commessa.</p>
            </div>
            <Button size="sm" className="gap-2 bg-orange-500 hover:bg-orange-600" onClick={handleApplyAiFurniture}>
              <Sofa className="h-4 w-4" />
              Arreda
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {workStudio.aiSuggestions.map((suggestion) => (
              <AiSuggestionRow key={suggestion.id} suggestion={suggestion} />
            ))}
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardCheck className="h-4 w-4 text-orange-600" />
              Studio lavoro e preventivazione
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Trasforma la planimetria in task, documenti, preventivo CRM e gestione lavoro.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <MetricTile label="preventivo" value={formatCurrency(workStudio.quote.total)} tone="emerald" />
              <MetricTile label="margine stim." value={formatCurrency(workStudio.quote.marginEstimate)} tone="orange" />
              <MetricTile label="confidenza" value={`${Math.round(workStudio.quote.confidence * 100)}%`} tone="cyan" />
            </div>
            <div className="grid gap-2 lg:grid-cols-5">
              {workStudio.phases.map((phase) => (
                <WorkPhasePill key={phase.id} phase={phase} />
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {workStudio.documentLinks.map((link) => (
                <Badge key={link} variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                  {link}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-4">
        <Card className="border-slate-200 shadow-sm xl:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardCheck className="h-4 w-4 text-orange-600" />
              QA tecnico
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {qualityIssues.map((issue) => (
              <QualityIssueRow key={issue.code} issue={issue} />
            ))}
          </CardContent>
        </Card>

        {/* G1: Card validazione norme DM Sanità 5/7/1975 abitabilità.
            Mostra warning per stanze sotto-soglia (es. soggiorno <14mq).
            Card si auto-nasconde se non ci sono issue (no clutter). */}
        {abitabilitaIssues.length > 0 && (
          <Card className="border-amber-200 bg-amber-50/30 shadow-sm xl:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4 text-amber-600" />
                Norme abitabilità
                <Badge variant="secondary" className="ml-1 bg-amber-100 text-amber-800">
                  {abitabilitaIssues.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {abitabilitaIssues.slice(0, 5).map((issue, idx) => (
                <AbitabilitaIssueRow key={`${issue.code}-${idx}`} issue={issue} />
              ))}
              {abitabilitaIssues.length > 5 && (
                <p className="text-xs text-amber-700">
                  +{abitabilitaIssues.length - 5} altre segnalazioni — verifica con tecnico abilitato.
                </p>
              )}
              <p className="border-t border-amber-200 pt-2 text-[10px] italic text-amber-700">
                Riferimento DM Sanità 5/7/1975. Alcuni Comuni applicano regolamenti più restrittivi.
              </p>
            </CardContent>
          </Card>
        )}

        <Card className="border-slate-200 shadow-sm xl:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PencilRuler className="h-4 w-4 text-orange-600" />
              Computo e margine
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-xl border bg-slate-50 p-3">
              <p className="text-2xl font-bold text-slate-950">{formatCurrency(quoteTotal)}</p>
              <p className="text-xs uppercase tracking-wider text-slate-500">
                margine stimato {formatCurrency(workStudio.quote.marginEstimate)}
              </p>
            </div>
            <div className="space-y-2">
              {quoteItems.map((item) => (
                <QuoteItemRow key={item.id} item={item} />
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm xl:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4 text-orange-600" />
              Versioni
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-xl border bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-950">{plan.revisions.length} revisioni salvate</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {plan.revisions.at(-1)?.summary ?? "Crea una prima revisione dopo scala e QA."}
              </p>
            </div>
            <Button variant="outline" className="w-full gap-2" onClick={handleCreateRevision}>
              <Save className="h-4 w-4" />
              Salva revisione
            </Button>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm xl:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Link2 className="h-4 w-4 text-orange-600" />
              Export e CRM
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* G4: aggiunto PNG (2x retina). #3-light: aggiunto PDF A4 con
                titoletto azienda. SVG/DXF/JSON invariati. Tutti disabilitati
                quando exportingType è settato (F4 race protection). */}
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => handleExport("svg")}
                disabled={exportingType !== null}
              >
                {exportingType === "svg" && <Loader2 className="h-3 w-3 animate-spin" />}
                SVG
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                disabled={!canExportDxf || exportingType !== null}
                onClick={() => handleExport("dxf")}
              >
                {exportingType === "dxf" && <Loader2 className="h-3 w-3 animate-spin" />}
                DXF
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => handleExport("json")}
                disabled={exportingType !== null}
              >
                {exportingType === "json" && <Loader2 className="h-3 w-3 animate-spin" />}
                JSON
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => handleExport("png")}
                disabled={exportingType !== null}
                title="Immagine PNG ad alta risoluzione (2x retina)"
              >
                {exportingType === "png" && <Loader2 className="h-3 w-3 animate-spin" />}
                PNG
              </Button>
              <Button
                variant="default"
                className="col-span-2 gap-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:opacity-90"
                onClick={() => handleExport("pdf")}
                disabled={exportingType !== null}
                title="Tavola PDF A4 landscape pronta da inviare al cliente"
              >
                {exportingType === "pdf" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generazione tavola...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    Tavola PDF cliente
                  </>
                )}
              </Button>
            </div>
            <div className="rounded-xl border bg-slate-50 p-3 text-xs leading-5 text-slate-600">
              <p className="font-semibold text-slate-950">{exportManifest.ready ? "Output tecnico pronto" : "Output tecnico da completare"}</p>
              <p>{crmPayload.summary}</p>
              <p className="mt-1">CRM: contatto + opportunita + preventivo.</p>
              <p className="mt-1 font-medium text-slate-800">{workStudio.crm.nextStep}</p>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function getPrimaryAction({
  isScaleConfirmed,
  exportReady,
  revisionCount,
  blockingIssueCount,
}: {
  isScaleConfirmed: boolean;
  exportReady: boolean;
  revisionCount: number;
  blockingIssueCount: number;
}) {
  if (!isScaleConfirmed) {
    return {
      id: "scale",
      label: "Conferma scala",
      description: "Prima di CAD e preventivo serve una quota reale.",
      icon: Ruler,
    };
  }

  if (blockingIssueCount > 0) {
    return {
      id: "qa",
      label: "Apri QA tecnico",
      description: "Ci sono blocchi da correggere prima dell'output.",
      icon: AlertTriangle,
    };
  }

  if (revisionCount === 0) {
    return {
      id: "revision",
      label: "Salva prima revisione",
      description: "Blocca una versione pulita prima di inviarla.",
      icon: History,
    };
  }

  return {
    id: "output",
    label: exportReady ? "Prepara output cliente" : "Completa output",
    description: "CAD, 3D, computo e CRM sono allineati.",
    icon: Sparkles,
  };
}

function WorkflowRail({ steps }: { steps: WorkflowStep[] }) {
  return (
    <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 lg:px-5">
      <div className="grid gap-2 md:grid-cols-4">
        {steps.map((step) => (
          <WorkflowStepItem key={step.id} step={step} />
        ))}
      </div>
    </div>
  );
}

function WorkflowStepItem({ step }: { step: WorkflowStep }) {
  const Icon = step.icon;
  const statusClass: Record<WorkflowStatus, string> = {
    complete: "border-emerald-200 bg-emerald-50 text-emerald-800",
    current: "border-orange-200 bg-orange-50 text-orange-800",
    locked: "border-slate-200 bg-white text-slate-500",
  };
  const StatusIcon = step.status === "complete" ? BadgeCheck : step.status === "current" ? CircleDashed : AlertTriangle;

  return (
    <div className={cn("flex min-w-0 items-center gap-3 rounded-2xl border px-3 py-2", statusClass[step.status])}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/80">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{step.label}</p>
        <p className="truncate text-xs opacity-80">{step.value}</p>
      </div>
      <StatusIcon className="h-4 w-4 shrink-0" />
    </div>
  );
}

function SummaryMetric({ label, value, tone }: { label: string; value: string; tone: AccentTone }) {
  const classes = metricToneClasses[tone];
  return (
    <div className={cn("rounded-2xl border px-3 py-2", classes.surface)}>
      <p className={cn("truncate text-lg font-bold", classes.text)}>{value}</p>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
    </div>
  );
}

function EditorSignal({ icon: Icon, label, value, active }: { icon: LucideIcon; label: string; value: string; active: boolean }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs",
      active ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100" : "border-orange-400/30 bg-orange-400/10 text-orange-100",
    )}>
      <Icon className="h-3.5 w-3.5" />
      {label}: {value}
    </span>
  );
}

const metricToneClasses: Record<AccentTone, { surface: string; accent: string; text: string }> = {
  orange: {
    surface: "border-orange-200 bg-orange-50",
    accent: "bg-orange-500",
    text: "text-orange-950",
  },
  cyan: {
    surface: "border-cyan-200 bg-cyan-50",
    accent: "bg-cyan-500",
    text: "text-cyan-950",
  },
  emerald: {
    surface: "border-emerald-200 bg-emerald-50",
    accent: "bg-emerald-500",
    text: "text-emerald-950",
  },
  slate: {
    surface: "border-slate-200 bg-slate-50",
    accent: "bg-slate-500",
    text: "text-slate-950",
  },
};

function MetricTile({ label, value, tone = "slate" }: { label: string; value: string; tone?: AccentTone }) {
  const classes = metricToneClasses[tone];
  return (
    <div className={cn("rounded-xl border bg-white p-3", classes.surface)}>
      <span className={cn("mb-2 block h-1 w-8 rounded-full", classes.accent)} />
      <p className={cn("text-lg font-bold", classes.text)}>{value}</p>
      <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
    </div>
  );
}

function OutputPill({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <div className="rounded-xl border bg-white p-3">
      <Icon className="mb-2 h-4 w-4 text-orange-600" />
      <p className="text-sm font-semibold text-slate-950">{title}</p>
      <p className="text-xs text-slate-500">{text}</p>
    </div>
  );
}

function QualityIssueRow({ issue }: { issue: FloorPlanQualityIssue }) {
  const styles: Record<FloorPlanQualityIssue["severity"], string> = {
    blocking: "border-orange-200 bg-orange-50 text-orange-900",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    info: "border-emerald-200 bg-emerald-50 text-emerald-900",
  };
  return (
    <div className={cn("rounded-xl border p-3", styles[issue.severity])}>
      <p className="text-sm font-semibold">{issue.title}</p>
      <p className="mt-1 text-xs leading-5 opacity-85">{issue.description}</p>
      <p className="mt-2 text-xs font-medium">{issue.action}</p>
    </div>
  );
}

// G1: row di una violazione norme abitabilità (DM 5/7/1975).
// Differenzia visivamente blocking (rosso) vs warning (giallo) vs info (blu).
function AbitabilitaIssueRow({ issue }: { issue: AbitabilitaIssue }) {
  const styles: Record<AbitabilitaIssue["severity"], string> = {
    blocking: "border-red-200 bg-red-50 text-red-900",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    info: "border-sky-200 bg-sky-50 text-sky-900",
  };
  return (
    <div className={cn("rounded-lg border p-2", styles[issue.severity])}>
      <p className="text-xs font-semibold">
        {issue.roomName ?? "Stanza"}
        <span className="ml-1 font-normal opacity-70">
          ({issue.actual.toFixed(1)}/{issue.required} {issue.unit})
        </span>
      </p>
      <p className="mt-1 text-[11px] leading-4 opacity-85">{issue.message}</p>
      <p className="mt-1 text-[10px] italic opacity-70">{abitabilitaSuggestion(issue)}</p>
    </div>
  );
}

function ReviewQuestionRow({ question }: { question: FloorPlanReviewQuestion }) {
  const styles: Record<FloorPlanReviewQuestion["severity"], string> = {
    blocking: "border-orange-200 bg-orange-50 text-orange-950",
    warning: "border-amber-200 bg-amber-50 text-amber-950",
    info: "border-slate-200 bg-slate-50 text-slate-800",
  };

  return (
    <div className={cn("rounded-lg border p-2", styles[question.severity])}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold">{question.title}</p>
          <p className="mt-1 text-[11px] leading-4 opacity-85">{question.question}</p>
        </div>
        <Badge variant="outline" className="shrink-0 bg-white/60 text-[10px]">
          {question.target}
        </Badge>
      </div>
      <p className="mt-2 text-[11px] font-medium opacity-80">{question.defaultAnswer}</p>
    </div>
  );
}

function AiSuggestionRow({ suggestion }: { suggestion: FloorPlanAiSuggestion }) {
  const priorityStyles: Record<FloorPlanAiSuggestion["priority"], string> = {
    high: "border-orange-200 bg-orange-50 text-orange-950",
    medium: "border-cyan-200 bg-cyan-50 text-cyan-950",
    low: "border-slate-200 bg-slate-50 text-slate-800",
  };

  return (
    <div className={cn("rounded-xl border p-3", priorityStyles[suggestion.priority])}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{suggestion.title}</p>
          <p className="mt-1 text-xs leading-5 opacity-85">{suggestion.description}</p>
        </div>
        <Badge variant="outline" className="shrink-0 bg-white/70">
          {suggestion.priority}
        </Badge>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium opacity-80">{suggestion.impact}</span>
        <Button size="sm" variant="secondary" className="h-8 gap-2">
          <Sparkles className="h-3.5 w-3.5" />
          {suggestion.actionLabel}
        </Button>
      </div>
    </div>
  );
}

function WorkPhasePill({ phase }: { phase: FloorPlanWorkPhase }) {
  return (
    <div className="rounded-xl border bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-orange-600">{phase.estimatedDays} gg</p>
      <p className="mt-1 text-sm font-semibold text-slate-950">{phase.label}</p>
      <p className="text-xs capitalize text-slate-500">{phase.owner.replace("_", " ")}</p>
      <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600">{phase.tasks[0]}</p>
    </div>
  );
}

function CadStatusPill({ label, value, dense = false }: { label: string; value: string; dense?: boolean }) {
  return (
    <div className={cn(
      "min-w-0 rounded-lg border border-white/10 bg-white/[0.04] text-slate-200",
      dense ? "px-2 py-1.5" : "px-3 py-2",
    )}>
      <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={cn("truncate font-semibold", dense ? "text-[11px]" : "text-xs")}>{value}</p>
    </div>
  );
}

function DrawingAssistantPanel({ context }: { context: FloorPlanDrawingContext }) {
  const classes = metricToneClasses[context.accent as AccentTone];
  return (
    <div className="pointer-events-none absolute right-4 top-4 z-20 hidden max-w-[340px] rounded-2xl border border-white/10 bg-slate-950/90 p-4 text-white shadow-2xl shadow-black/30 backdrop-blur md:block">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Assistente disegno</p>
          <p className="mt-1 text-sm font-semibold">{context.headline}</p>
        </div>
        <Badge className={cn("shrink-0 text-white hover:text-white", classes.accent)}>
          {context.tool.shortcut}
        </Badge>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-300">{context.instruction}</p>
      <div className="mt-3 grid gap-1">
        {context.microSteps.map((step, index) => (
          <div key={step} className="flex items-center gap-2 rounded-lg bg-white/[0.04] px-2 py-1.5 text-xs text-slate-200">
            <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white", classes.accent)}>
              {index + 1}
            </span>
            <span className="truncate">{step}</span>
          </div>
        ))}
      </div>
      {context.warnings.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {context.warnings.slice(0, 2).map((warning) => (
            <div key={warning} className="flex items-start gap-2 rounded-lg border border-orange-300/20 bg-orange-300/10 px-2 py-1.5 text-[11px] leading-4 text-orange-100">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{warning}</span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/10 pt-3 text-xs">
        <span className="truncate text-slate-400">{context.selectedLabel}</span>
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1 font-semibold text-white", classes.accent)}>
          {context.nextActionLabel}
          <ArrowRight className="h-3 w-3" />
        </span>
      </div>
    </div>
  );
}

function CanvasRulers() {
  const marks = [0, 20, 40, 60, 80, 100];
  return (
    <>
      <div className="pointer-events-none absolute left-20 right-6 top-2 z-10 hidden h-7 items-end justify-between border-b border-cyan-300/20 text-[10px] text-cyan-100/70 md:flex">
        {marks.map((mark) => (
          <span key={`x-${mark}`} className="relative pb-1">
            <span className="absolute bottom-0 left-1/2 h-2 w-px -translate-x-1/2 bg-cyan-300/30" />
            {mark}
          </span>
        ))}
      </div>
      <div className="pointer-events-none absolute bottom-16 left-2 top-14 z-10 hidden w-10 flex-col justify-between border-r border-cyan-300/20 pr-1 text-right text-[10px] text-cyan-100/70 md:flex">
        {marks.map((mark) => (
          <span key={`y-${mark}`} className="relative pr-1">
            <span className="absolute right-0 top-1/2 h-px w-2 -translate-y-1/2 bg-cyan-300/30" />
            {mark}
          </span>
        ))}
      </div>
    </>
  );
}

function QuoteItemRow({ item }: { item: FloorPlanQuoteItem }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2 text-sm">
      <div className="min-w-0">
        <p className="truncate font-medium text-slate-950">{item.label}</p>
        <p className="text-xs text-slate-500">
          {item.quantity} {item.unit} · conf. {Math.round(item.confidence * 100)}%
        </p>
      </div>
      <span className="shrink-0 font-semibold text-slate-900">{formatCurrency(item.total)}</span>
    </div>
  );
}

function FloorPlanCanvas({
  plan,
  selectedRoomId,
  selectedFurnitureId,
  sourcePreviewUrl,
  sourceScanLayers,
  sourceLayerVisibility,
  activeTool,
  visibleLayers,
  calibrationDraft,
  onSelectRoom,
  onSelectFurniture,
  onMeasurePoint,
  onBeginDrag,
  onDragMove,
  onEndDrag,
  onPointerPoint,
}: {
  plan: FloorPlanAnalysis;
  selectedRoomId: string | undefined;
  selectedFurnitureId: string | undefined;
  sourcePreviewUrl: string | undefined;
  sourceScanLayers: FloorPlanScanLayer[];
  sourceLayerVisibility: Record<FloorPlanScanLayerId, boolean>;
  activeTool: FloorPlanToolId;
  visibleLayers: Record<FloorPlanLayerId, boolean>;
  calibrationDraft: CalibrationDraft;
  onSelectRoom: (roomId: string) => void;
  onSelectFurniture: (furnitureId: string) => void;
  onMeasurePoint: (point: FloorPlanPoint) => void;
  onBeginDrag: (target: Omit<CadDragTarget, "lastPoint">, point: FloorPlanPoint) => void;
  onDragMove: (point: FloorPlanPoint) => void;
  onEndDrag: () => void;
  onPointerPoint: (point: FloorPlanPoint | null) => void;
}) {
  const handleSvgClick = (event: ReactMouseEvent<SVGSVGElement>) => {
    if (activeTool !== "measure") return;

    const svgPoint = getSvgPointFromEvent(event, event.currentTarget);
    if (svgPoint) {
      onPointerPoint(svgPoint);
      onMeasurePoint(svgPoint);
    }
  };

  const handleRoomPointerDown = (event: ReactPointerEvent<SVGGElement>, roomId: string) => {
    if (activeTool === "measure" || event.button !== 0) return;
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    const point = getSvgPointFromEvent(event, svg);
    if (!point) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    onBeginDrag({ type: "room", id: roomId }, point);
  };

  const handleFurniturePointerDown = (event: ReactPointerEvent<SVGGElement>, furnitureId: string) => {
    if (activeTool === "measure" || event.button !== 0) return;
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    const point = getSvgPointFromEvent(event, svg);
    if (!point) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    onBeginDrag({ type: "furniture", id: furnitureId }, point);
  };

  const handleSvgPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const point = getSvgPointFromEvent(event, event.currentTarget);
    if (point) {
      onPointerPoint(point);
      onDragMove(point);
    }
  };

  const handleSvgPointerLeave = () => {
    onPointerPoint(null);
    onEndDrag();
  };

  return (
    <svg
      viewBox="0 0 100 76"
      role="img"
      aria-label="Editor planimetria 2D"
      className={cn(
        "h-auto w-full touch-none select-none",
        activeTool === "measure" ? "cursor-crosshair" : "cursor-default",
      )}
      onClick={handleSvgClick}
      onPointerMove={handleSvgPointerMove}
      onPointerUp={onEndDrag}
      onPointerLeave={handleSvgPointerLeave}
    >
      <defs>
        <pattern id="minorGrid" width="2" height="2" patternUnits="userSpaceOnUse">
          <path d="M 2 0 L 0 0 0 2" fill="none" stroke="#1e3a5f" strokeWidth="0.08" />
        </pattern>
        <pattern id="majorGrid" width="10" height="10" patternUnits="userSpaceOnUse">
          <rect width="10" height="10" fill="url(#minorGrid)" />
          <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#2563eb" strokeWidth="0.12" opacity="0.55" />
        </pattern>
        <filter id="roomGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="0" stdDeviation="1.2" floodColor="#22d3ee" floodOpacity="0.5" />
        </filter>
        <filter id="sourceEnhance">
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncR type="linear" slope="1.35" intercept="-0.08" />
            <feFuncG type="linear" slope="1.35" intercept="-0.08" />
            <feFuncB type="linear" slope="1.35" intercept="-0.08" />
          </feComponentTransfer>
        </filter>
      </defs>
      <rect x="0" y="0" width="100" height="76" fill="#06111f" />
      {sourcePreviewUrl && sourceLayerVisibility.original && (
        <image
          href={sourcePreviewUrl}
          x="0"
          y="0"
          width="100"
          height="76"
          preserveAspectRatio="xMidYMid slice"
          opacity={sourceScanLayers.find((layer) => layer.id === "original")?.opacity ?? 0.22}
        />
      )}
      {sourceLayerVisibility.enhanced && (
        <g opacity={sourceScanLayers.find((layer) => layer.id === "enhanced")?.opacity ?? 0.18}>
          {sourcePreviewUrl ? (
            <image
              href={sourcePreviewUrl}
              x="0"
              y="0"
              width="100"
              height="76"
              preserveAspectRatio="xMidYMid slice"
              filter="url(#sourceEnhance)"
            />
          ) : (
            <rect x="0" y="0" width="100" height="76" fill="#f8fafc" />
          )}
          <path d="M 6 8 H 94 V 70 H 6 Z" fill="none" stroke="#0f172a" strokeWidth="0.55" strokeDasharray="1.2 0.8" />
          <path d="M 12 15 H 88 M 12 30 H 88 M 12 45 H 88 M 12 60 H 88" stroke="#0f172a" strokeWidth="0.18" />
        </g>
      )}
      <rect x="3" y="3" width="94" height="70" fill="url(#majorGrid)" opacity="0.85" />

      {sourceLayerVisibility.detected && (
        <g opacity={sourceScanLayers.find((layer) => layer.id === "detected")?.opacity ?? 0.72}>
          {plan.rooms.map((room) => (
            <rect
              key={`detected-${room.id}`}
              x={room.x - 0.5}
              y={room.y - 0.5}
              width={room.width + 1}
              height={room.height + 1}
              rx="0.8"
              fill="none"
              stroke={room.confidence < 0.9 ? "#f97316" : "#22d3ee"}
              strokeWidth="0.35"
              strokeDasharray={room.confidence < 0.9 ? "1.4 0.9" : "0.5 1"}
            />
          ))}
        </g>
      )}

      {sourceLayerVisibility.cad && (
        <>
      {visibleLayers.rooms && plan.rooms.map((room) => {
        const selected = selectedRoomId === room.id;
        const label = getRoomDisplayLabel(room.name, room.width);
        const fontSize = room.width <= 15 ? 1.85 : 2.2;
        const areaFontSize = room.width <= 15 ? 1.65 : 1.9;
        return (
          <g
            key={room.id}
            onClick={() => activeTool !== "measure" && onSelectRoom(room.id)}
            onPointerDown={(event) => handleRoomPointerDown(event, room.id)}
            className="cursor-move"
          >
            <rect
              x={room.x}
              y={room.y}
              width={room.width}
              height={room.height}
              rx="0.6"
              fill={roomFill[room.id] ?? "#cbd5e1"}
              opacity={selected ? 0.92 : 0.68}
              filter={selected ? "url(#roomGlow)" : undefined}
            />
            <text x={room.x + 2} y={room.y + 5} fill="#0f172a" fontSize={fontSize} fontWeight="700">
              {label}
            </text>
            <text x={room.x + 2} y={room.y + 8.5} fill="#334155" fontSize={areaFontSize}>
              {room.areaMq} mq
            </text>
          </g>
        );
      })}

      {visibleLayers.walls && plan.walls.map((wall) => (
        <line
          key={wall.id}
          x1={wall.from.x}
          y1={wall.from.y}
          x2={wall.to.x}
          y2={wall.to.y}
          stroke={wall.type === "external" ? "#f8fafc" : "#cbd5e1"}
          strokeWidth={wall.type === "external" ? 1.4 : 0.8}
          strokeLinecap="square"
        />
      ))}

      {visibleLayers.openings && plan.openings.map((opening) => (
        <OpeningMarker key={opening.id} opening={opening} />
      ))}

      {/* G3: render annotazioni libere (testo, freccia, nord, scala).
          Layer "notes" controlla la visibilità (toggle dalla sidebar layers). */}
      {visibleLayers.notes && (plan.annotations ?? []).map((annotation) => (
        <AnnotationMarker
          key={annotation.id}
          annotation={annotation}
          metersPerUnit={plan.source.metersPerUnit}
        />
      ))}

      {visibleLayers.furniture && plan.furniture.map((item) => (
        <g
          key={item.id}
          transform={`rotate(${item.rotation} ${item.x + item.width / 2} ${item.y + item.height / 2})`}
          onClick={(event) => {
            event.stopPropagation();
            onSelectFurniture(item.id);
          }}
          onPointerDown={(event) => handleFurniturePointerDown(event, item.id)}
          className="cursor-move"
        >
          <rect
            x={item.x}
            y={item.y}
            width={item.width}
            height={item.height}
            rx="0.7"
            fill={furnitureFill[item.category ?? "living"]}
            opacity={selectedFurnitureId === item.id ? "0.95" : "0.78"}
            stroke={selectedFurnitureId === item.id ? "#f97316" : "#f8fafc"}
            strokeWidth={selectedFurnitureId === item.id ? "0.65" : "0.25"}
          />
          <text x={item.x + 1} y={item.y + Math.min(item.height - 1, 3.2)} fill="#e2e8f0" fontSize="1.55">
            {item.label}
          </text>
        </g>
      ))}

      {visibleLayers.dimensions && (
        <g transform="translate(5 70)">
          <line x1="0" y1="0" x2="16" y2="0" stroke="#f97316" strokeWidth="0.8" />
          <text x="0" y="-1.5" fill="#f8fafc" fontSize="1.8">4 m</text>
        </g>
      )}
      {visibleLayers.notes && (
        <g transform="translate(5 5)">
          <rect x="0" y="0" width="31" height="5" rx="1" fill="#f97316" opacity="0.92" />
          <text x="1.4" y="3.4" fill="#fff7ed" fontSize="1.8">scala e scarichi da verificare</text>
        </g>
      )}
        </>
      )}
      {calibrationDraft.from && (
        <g>
          {calibrationDraft.to && (
            <>
              <line
                x1={calibrationDraft.from.x}
                y1={calibrationDraft.from.y}
                x2={calibrationDraft.to.x}
                y2={calibrationDraft.to.y}
                stroke="#f97316"
                strokeWidth="0.9"
                strokeDasharray="1.4 1"
              />
              <text
                x={(calibrationDraft.from.x + calibrationDraft.to.x) / 2 + 1}
                y={(calibrationDraft.from.y + calibrationDraft.to.y) / 2 - 1}
                fill="#fed7aa"
                fontSize="1.8"
                fontWeight="700"
              >
                quota reale
              </text>
            </>
          )}
          <circle cx={calibrationDraft.from.x} cy={calibrationDraft.from.y} r="1.2" fill="#f97316" stroke="#fff7ed" strokeWidth="0.35" />
          {calibrationDraft.to && <circle cx={calibrationDraft.to.x} cy={calibrationDraft.to.y} r="1.2" fill="#f97316" stroke="#fff7ed" strokeWidth="0.35" />}
        </g>
      )}
      <text x="74" y="72" fill="#94a3b8" fontSize="2">
        Tool: {floorPlanEditorTools.find((tool) => tool.id === activeTool)?.label ?? activeTool}
      </text>
    </svg>
  );
}

function getSvgPointFromEvent(
  event: ReactMouseEvent<SVGSVGElement> | ReactPointerEvent<SVGSVGElement> | ReactPointerEvent<SVGGElement>,
  svg: SVGSVGElement,
): FloorPlanPoint | null {
  const matrix = svg.getScreenCTM();
  if (!matrix) return null;

  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const svgPoint = point.matrixTransform(matrix.inverse());
  return { x: Number(svgPoint.x.toFixed(2)), y: Number(svgPoint.y.toFixed(2)) };
}

function getRoomDisplayLabel(name: string, width: number) {
  if (width > 18) return name;
  if (name === "Disimpegno") return "Disimp.";
  if (name === "Lavanderia") return "Lav.";
  if (name.length > 8) return `${name.slice(0, 7)}.`;
  return name;
}

// G2: render visivo per ogni stile porta/finestra. Coerente con stile CAD
// architettonico standard (archi battenti, doppia anta = 2 archi opposti,
// scorrevole = doppia freccia, panoramica = retino, blindata = bordo spesso).
function OpeningMarker({ opening }: { opening: FloorPlanOpening }) {
  const halfW = opening.width / 2;
  const xL = opening.x - halfW;
  const xR = opening.x + halfW;
  const y = opening.y;

  // ── FINESTRE ──────────────────────────────────────────────────
  if (opening.type === "window") {
    const style = opening.windowStyle ?? "single";

    if (style === "double") {
      // Doppia anta: rettangolo + linea verticale di divisione al centro
      return (
        <g>
          <rect x={xL} y={y - 0.8} width={opening.width} height="1.6" fill="#38bdf8" stroke="#e0f2fe" strokeWidth="0.25" />
          <line x1={opening.x} y1={y - 0.8} x2={opening.x} y2={y + 0.8} stroke="#e0f2fe" strokeWidth="0.3" />
        </g>
      );
    }
    if (style === "fixed") {
      // Fissa: rettangolo + X interna (no apertura)
      return (
        <g>
          <rect x={xL} y={y - 0.8} width={opening.width} height="1.6" fill="#38bdf8" stroke="#e0f2fe" strokeWidth="0.25" />
          <line x1={xL} y1={y - 0.8} x2={xR} y2={y + 0.8} stroke="#0c4a6e" strokeWidth="0.2" opacity="0.7" />
          <line x1={xL} y1={y + 0.8} x2={xR} y2={y - 0.8} stroke="#0c4a6e" strokeWidth="0.2" opacity="0.7" />
        </g>
      );
    }
    if (style === "skylight") {
      // Lucernario: rombo (vista pianta indica copertura)
      return (
        <g>
          <path d={`M ${xL} ${y} L ${opening.x} ${y - 1} L ${xR} ${y} L ${opening.x} ${y + 1} Z`} fill="#7dd3fc" stroke="#0c4a6e" strokeWidth="0.25" />
          <line x1={xL} y1={y} x2={xR} y2={y} stroke="#0c4a6e" strokeWidth="0.15" opacity="0.6" />
        </g>
      );
    }
    if (style === "panoramic") {
      // Panoramica: rettangolo più alto + retino interno
      return (
        <g>
          <rect x={xL} y={y - 1.1} width={opening.width} height="2.2" fill="#bae6fd" stroke="#e0f2fe" strokeWidth="0.3" />
          <line x1={xL + opening.width * 0.33} y1={y - 1.1} x2={xL + opening.width * 0.33} y2={y + 1.1} stroke="#0c4a6e" strokeWidth="0.2" />
          <line x1={xL + opening.width * 0.66} y1={y - 1.1} x2={xL + opening.width * 0.66} y2={y + 1.1} stroke="#0c4a6e" strokeWidth="0.2" />
        </g>
      );
    }
    // single (default)
    return (
      <g>
        <rect x={xL} y={y - 0.8} width={opening.width} height="1.6" fill="#38bdf8" stroke="#e0f2fe" strokeWidth="0.25" />
      </g>
    );
  }

  // ── PORTE ────────────────────────────────────────────────────
  const style = opening.doorStyle ?? "single";

  if (style === "double") {
    // Doppia anta: 2 archi opposti dal centro
    return (
      <g>
        <line x1={xL} y1={y} x2={xR} y2={y} stroke="#fb923c" strokeWidth="1.1" />
        <path d={`M ${xL} ${y} A ${halfW} ${halfW} 0 0 1 ${opening.x} ${y - halfW}`} fill="none" stroke="#fdba74" strokeWidth="0.4" />
        <path d={`M ${xR} ${y} A ${halfW} ${halfW} 0 0 0 ${opening.x} ${y - halfW}`} fill="none" stroke="#fdba74" strokeWidth="0.4" />
      </g>
    );
  }
  if (style === "sliding") {
    // Scorrevole: rettangolo sottile + 2 frecce orizzontali ↔
    return (
      <g>
        <rect x={xL} y={y - 0.4} width={opening.width} height="0.8" fill="#fed7aa" stroke="#fb923c" strokeWidth="0.2" />
        <path d={`M ${xL + 0.6} ${y - 0.15} L ${xL + 0.1} ${y} L ${xL + 0.6} ${y + 0.15}`} fill="none" stroke="#9a3412" strokeWidth="0.18" />
        <path d={`M ${xR - 0.6} ${y - 0.15} L ${xR - 0.1} ${y} L ${xR - 0.6} ${y + 0.15}`} fill="none" stroke="#9a3412" strokeWidth="0.18" />
      </g>
    );
  }
  if (style === "bifold") {
    // A libro: 2 segmenti spezzati ad angolo
    return (
      <g>
        <line x1={xL} y1={y} x2={xR} y2={y} stroke="#fb923c" strokeWidth="0.8" />
        <path d={`M ${xL} ${y} L ${opening.x - halfW * 0.3} ${y - halfW * 0.6} L ${opening.x} ${y - halfW * 0.2} L ${opening.x + halfW * 0.3} ${y - halfW * 0.6} L ${xR} ${y}`} fill="none" stroke="#fdba74" strokeWidth="0.4" />
      </g>
    );
  }
  if (style === "armored") {
    // Blindata: linea spessa + simbolo lucchetto piccolo
    return (
      <g>
        <line x1={xL} y1={y} x2={xR} y2={y} stroke="#dc2626" strokeWidth="1.8" />
        <path d={`M ${xL} ${y} A ${opening.width} ${opening.width} 0 0 1 ${xR} ${y - halfW}`} fill="none" stroke="#fdba74" strokeWidth="0.45" opacity="0.85" />
        <circle cx={opening.x} cy={y - 0.3} r="0.3" fill="#dc2626" />
      </g>
    );
  }
  // single (default): linea + arco apertura
  return (
    <g>
      <line x1={xL} y1={y} x2={xR} y2={y} stroke="#fb923c" strokeWidth="1.1" />
      <path
        d={`M ${xL} ${y} A ${opening.width} ${opening.width} 0 0 1 ${xR} ${y - halfW}`}
        fill="none"
        stroke="#fdba74"
        strokeWidth="0.45"
        opacity="0.85"
      />
    </g>
  );
}

// G3: render visivo delle annotazioni (testo / freccia / nord / scala grafica).
// Tutte cliccabili sul canvas in iter futura — per ora solo render statico.
function AnnotationMarker({ annotation, metersPerUnit }: { annotation: FloorPlanAnnotation; metersPerUnit: number }) {
  const color = annotation.color ?? "#f8fafc";
  if (annotation.type === "text") {
    const fontSize = (annotation.fontSize ?? 14) / 8; // scala per SVG viewBox 100x76
    return (
      <text
        x={annotation.x}
        y={annotation.y}
        fontSize={fontSize}
        fill={color}
        stroke="#020617"
        strokeWidth="0.15"
        paintOrder="stroke"
        transform={annotation.rotation ? `rotate(${annotation.rotation} ${annotation.x} ${annotation.y})` : undefined}
        className="select-none font-semibold"
      >
        {annotation.text ?? ""}
      </text>
    );
  }
  if (annotation.type === "arrow") {
    const toX = annotation.toX ?? annotation.x + 10;
    const toY = annotation.toY ?? annotation.y;
    return (
      <g>
        <defs>
          <marker id={`arrow-head-${annotation.id}`} markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto">
            <polygon points="0 0, 4 2, 0 4" fill={color} />
          </marker>
        </defs>
        <line
          x1={annotation.x}
          y1={annotation.y}
          x2={toX}
          y2={toY}
          stroke={color}
          strokeWidth="0.4"
          markerEnd={`url(#arrow-head-${annotation.id})`}
        />
      </g>
    );
  }
  if (annotation.type === "north") {
    // Simbolo Nord: cerchio con freccia ↑ + lettera N
    return (
      <g transform={`translate(${annotation.x} ${annotation.y}) rotate(${annotation.rotation ?? 0})`}>
        <circle cx="0" cy="0" r="3" fill="rgba(15,23,42,0.85)" stroke={color} strokeWidth="0.25" />
        <path d="M 0 -2.2 L -1 1.5 L 0 0.5 L 1 1.5 Z" fill={color} />
        <text x="0" y="-3.6" fontSize="1.6" fill={color} textAnchor="middle" className="font-bold select-none">N</text>
      </g>
    );
  }
  // scale_bar
  const meters = annotation.meters ?? 1;
  const lengthUnits = meters / metersPerUnit; // in unità CAD
  const ticks = 5;
  return (
    <g transform={`translate(${annotation.x} ${annotation.y})`}>
      {/* barra principale + tick */}
      <rect x="0" y="0" width={lengthUnits} height="0.5" fill={color} stroke="#020617" strokeWidth="0.1" />
      {Array.from({ length: ticks + 1 }).map((_, i) => {
        const tickX = (i * lengthUnits) / ticks;
        return <line key={i} x1={tickX} y1="-0.4" x2={tickX} y2="0.9" stroke="#020617" strokeWidth="0.12" />;
      })}
      <text x={lengthUnits / 2} y="-1" fontSize="1.4" fill={color} stroke="#020617" strokeWidth="0.1" paintOrder="stroke" textAnchor="middle" className="font-semibold select-none">
        {meters}m
      </text>
    </g>
  );
}

function loadPlanDraft() {
  try {
    const raw = window.localStorage.getItem(draftStorageKey);
    if (!raw) return createInitialFloorPlanFromSketch();
    const parsed = JSON.parse(raw) as FloorPlanAnalysis;
    if (!parsed?.rooms?.length || !parsed?.walls?.length) return createInitialFloorPlanFromSketch();
    return {
      ...createInitialFloorPlanFromSketch(),
      ...parsed,
      source: {
        ...createInitialFloorPlanFromSketch().source,
        ...parsed.source,
      },
      revisions: parsed.revisions ?? [],
      warnings: parsed.warnings ?? [],
    };
  } catch {
    return createInitialFloorPlanFromSketch();
  }
}

function getDefaultSourceLayerVisibility(layers: FloorPlanScanLayer[] | undefined) {
  if (!layers?.length) return defaultSourceLayerVisibility;
  return Object.fromEntries(
    layers.map((layer) => [layer.id, layer.visibleByDefault]),
  ) as Record<FloorPlanScanLayerId, boolean>;
}

function inspectImageFile(file: File): Promise<{ width?: number; height?: number; previewUrl?: string }> {
  const previewUrl = URL.createObjectURL(file);
  return new Promise((resolve) => {
    const image = new Image();
    // F2: safety timeout 15s. Se il browser non triggera né onload né onerror
    // (es. file corrotto, decoder stuck, rete 2G), risolviamo comunque con il
    // solo previewUrl per evitare UI freeze indefinito.
    const timeoutId = window.setTimeout(() => {
      resolve({ previewUrl });
    }, 15_000);

    image.onload = () => {
      window.clearTimeout(timeoutId);
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
        previewUrl,
      });
    };
    image.onerror = () => {
      window.clearTimeout(timeoutId);
      resolve({ previewUrl });
    };
    image.src = previewUrl;
  });
}

function downloadTextFile(fileName: string, contents: string, mimeType: string) {
  const blob = new Blob([contents], { type: `${mimeType};charset=utf-8` });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0, useGrouping: "always" }).format(value);
}
