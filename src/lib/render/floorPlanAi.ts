export const FLOOR_PLAN_RENDER_MODULE = {
  id: "planimetrie",
  label: "Planimetrie AI",
  path: "/azienda/render/planimetrie",
  newPath: "/azienda/render/planimetrie/new",
} as const;

export type FloorPlanSourceType = "hand_sketch" | "floor_plan" | "photo" | "pdf" | "blank";
export type FloorPlanStyle = "modern" | "scandi" | "boho" | "contemporary" | "rustic";
export type FloorPlanOutputMode = "2d_cad" | "3d_dollhouse" | "render_ai" | "cad_export";
export type FloorPlanOpeningType = "door" | "window";
export type FloorPlanToolId = "select" | "wall" | "room" | "door" | "window" | "measure" | "furniture" | "comment";
export type FloorPlanLayerId = "rooms" | "walls" | "openings" | "dimensions" | "furniture" | "notes";
export type FloorPlanQualitySeverity = "blocking" | "warning" | "info";
export type FloorPlanFurnitureCategory = "living" | "kitchen" | "bedroom" | "bathroom" | "office" | "storage";
export type FloorPlanAiSuggestionType = "qa" | "furniture" | "quote" | "workflow";
export type FloorPlanAiSuggestionPriority = "high" | "medium" | "low";
export type FloorPlanScanLayerId = "original" | "enhanced" | "detected" | "cad";
export type FloorPlanScanCorrectionId =
  | "auto_crop"
  | "perspective_fix"
  | "shadow_cleanup"
  | "contrast_boost"
  | "line_vectorization"
  | "text_ocr";
export type FloorPlanReviewQuestionTarget = "scale" | "walls" | "openings" | "rooms" | "furniture";
export type FloorPlanCommercialRenderStyle =
  | "warm_modern"
  | "luxury"
  | "minimal"
  | "nordic"
  | "industrial"
  | "family"
  | "short_rent";
export type FloorPlanRenderCameraPresetId = "top_3d" | "dollhouse" | "room_focus" | "client_before_after";

const DEFAULT_METERS_PER_UNIT = 0.18;
const FLOOR_PLAN_BOUNDS = {
  minX: 1,
  minY: 1,
  maxX: 99,
  maxY: 75,
} as const;

export interface FloorPlanPoint {
  x: number;
  y: number;
}

export interface FloorPlanRoom {
  id: string;
  name: string;
  usage: string;
  x: number;
  y: number;
  width: number;
  height: number;
  areaMq: number;
  finish: string;
  confidence: number;
}

export interface FloorPlanWall {
  id: string;
  from: FloorPlanPoint;
  to: FloorPlanPoint;
  thicknessCm: number;
  type: "external" | "internal";
}

// Tipologie estese porte (preventivi serramenti, computo metrico)
export type FloorPlanDoorStyle =
  | "single"      // singola anta battente
  | "double"      // doppia anta battente
  | "sliding"     // scorrevole interna
  | "bifold"      // a libro / soffietto
  | "armored";    // blindata
// Tipologie estese finestre
export type FloorPlanWindowStyle =
  | "single"      // anta singola
  | "double"      // doppia anta
  | "fixed"       // fissa (non apribile)
  | "skylight"    // lucernario
  | "panoramic";  // panoramica (>2m)

export interface FloorPlanOpening {
  id: string;
  type: FloorPlanOpeningType;
  wallId: string;
  x: number;
  y: number;
  width: number;
  swing?: "left" | "right" | "sliding";
  // Stile esteso (opzionale, retrocompat): se assente si assume "single".
  doorStyle?: FloorPlanDoorStyle;
  windowStyle?: FloorPlanWindowStyle;
}

export interface FloorPlanFurniture {
  id: string;
  roomId: string;
  catalogItemId?: string;
  category?: FloorPlanFurnitureCategory;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  unitPrice?: number;
}

// G3: annotazioni libere sulla planimetria (testo, freccia, simbolo nord, scala grafica).
// Opzionali in FloorPlanAnalysis per retrocompat con plan salvati senza queste info.
export type FloorPlanAnnotationType = "text" | "arrow" | "north" | "scale_bar";

export interface FloorPlanAnnotation {
  id: string;
  type: FloorPlanAnnotationType;
  x: number;            // CAD coords
  y: number;
  rotation?: number;    // gradi (default 0)
  text?: string;        // contenuto se type="text" o etichetta arrow
  fontSize?: number;    // pt (default 14)
  color?: string;       // hex (default #f8fafc)
  // Per arrow: punto di destinazione (relativo o assoluto)
  toX?: number;
  toY?: number;
  // Per scale_bar: lunghezza in metri reali da rappresentare
  meters?: number;
}

export interface FloorPlanAnalysis {
  id: string;
  title: string;
  style: FloorPlanStyle;
  source: {
    fileName: string;
    sourceType: FloorPlanSourceType;
    confidence: number;
    scale: string;
    scaleStatus: "estimated" | "confirmed";
    metersPerUnit: number;
    scan?: FloorPlanSourceScan;
  };
  calibration?: {
    label: string;
    measuredUnits: number;
    knownLengthMeters: number;
    calibratedAt: string;
  };
  rooms: FloorPlanRoom[];
  walls: FloorPlanWall[];
  openings: FloorPlanOpening[];
  furniture: FloorPlanFurniture[];
  outputModes: FloorPlanOutputMode[];
  warnings: string[];
  revisions: FloorPlanRevision[];
  annotations?: FloorPlanAnnotation[];  // G3: opzionale, default vuoto
}

export interface FloorPlanSourceScanInput {
  fileName: string;
  sourceType: FloorPlanSourceType;
  mimeType?: string;
  sizeBytes?: number;
  width?: number;
  height?: number;
}

export interface FloorPlanScanIssue {
  code: string;
  title: string;
  description: string;
  severity: FloorPlanQualitySeverity;
  action: string;
}

export interface FloorPlanScanCorrection {
  id: FloorPlanScanCorrectionId;
  label: string;
  description: string;
  applied: boolean;
}

export interface FloorPlanScanLayer {
  id: FloorPlanScanLayerId;
  label: string;
  description: string;
  opacity: number;
  visibleByDefault: boolean;
}

export interface FloorPlanReviewQuestion {
  id: string;
  target: FloorPlanReviewQuestionTarget;
  title: string;
  question: string;
  severity: FloorPlanQualitySeverity;
  defaultAnswer: string;
}

export interface FloorPlanSourceScan {
  mode: "scanner_ai";
  score: number;
  summary: string;
  dimensions?: {
    width: number;
    height: number;
    megapixels: number;
  };
  issues: FloorPlanScanIssue[];
  corrections: FloorPlanScanCorrection[];
  layers: FloorPlanScanLayer[];
}

export interface FloorPlanMetrics {
  totalAreaMq: number;
  roomCount: number;
  wallLinearMeters: number;
  openingCount: number;
  confidenceAvg: number;
  estimatedRevisionMinutes: number;
}

export interface FloorPlanEditorTool {
  id: FloorPlanToolId;
  label: string;
  shortcut: string;
  description: string;
}

export type FloorPlanDrawingContextStatus = "ready" | "needs_selection" | "needs_scale" | "blocked";
export type FloorPlanDrawingContextAccent = "orange" | "cyan" | "emerald" | "slate";

export interface FloorPlanDrawingContextInput {
  activeTool: FloorPlanToolId;
  selectedRoomId?: string;
  selectedFurnitureId?: string;
  snapEnabled: boolean;
  zoom: number;
  pointer?: FloorPlanPoint | null;
  calibrationPointCount?: number;
}

export interface FloorPlanDrawingContext {
  tool: FloorPlanEditorTool;
  status: FloorPlanDrawingContextStatus;
  accent: FloorPlanDrawingContextAccent;
  headline: string;
  instruction: string;
  microSteps: string[];
  nextActionLabel: string;
  selectedLabel: string;
  canvasStatus: {
    scale: string;
    snap: string;
    zoom: string;
    coordinates: string;
    selection: string;
    grid: string;
  };
  warnings: string[];
}

export interface FloorPlanLayer {
  id: FloorPlanLayerId;
  label: string;
  description: string;
  defaultVisible: boolean;
}

export interface FloorPlanQualityIssue {
  code: string;
  title: string;
  description: string;
  severity: FloorPlanQualitySeverity;
  action: string;
}

export interface FloorPlanFurnitureCatalogItem {
  id: string;
  label: string;
  category: FloorPlanFurnitureCategory;
  width: number;
  height: number;
  defaultRotation: number;
  unitPrice: number;
  roomUsageKeywords: string[];
  description: string;
}

export interface FloorPlanAiSuggestion {
  id: string;
  type: FloorPlanAiSuggestionType;
  priority: FloorPlanAiSuggestionPriority;
  title: string;
  description: string;
  actionLabel: string;
  impact: string;
}

export interface FloorPlanQuoteItem {
  id: string;
  category: "finiture" | "opere_murarie" | "serramenti" | "progettazione" | "arredo" | "impianti";
  label: string;
  unit: "mq" | "m" | "pz" | "cad";
  quantity: number;
  unitPrice: number;
  total: number;
  confidence: number;
}

export interface FloorPlanRevision {
  id: string;
  version: string;
  note: string;
  authorName: string;
  createdAt: string;
  summary: string;
}

export interface FloorPlanExportManifest {
  planId: string;
  ready: boolean;
  outputs: Array<{
    type: "svg" | "dxf" | "pdf" | "json";
    label: string;
    ready: boolean;
    blocker?: string;
  }>;
}

export interface FloorPlanWorkPhase {
  id: "rilievo" | "progettazione" | "preventivo" | "approvazione" | "cantiere";
  label: string;
  owner: "tecnico" | "venditore" | "cliente" | "project_manager";
  estimatedDays: number;
  tasks: string[];
}

export interface FloorPlanWorkStudio {
  planId: string;
  crm: {
    contactId: string | null;
    opportunityId: string | null;
    nextStep: string;
  };
  quote: {
    total: number;
    marginEstimate: number;
    confidence: number;
    items: FloorPlanQuoteItem[];
  };
  phases: FloorPlanWorkPhase[];
  documentLinks: string[];
  aiSuggestions: FloorPlanAiSuggestion[];
}

export interface FloorPlanRenderMaterial {
  roomId: string;
  roomName: string;
  floorLabel: string;
  wallLabel: string;
  accentLabel: string;
  floorColor: string;
  wallColor: string;
}

export interface FloorPlanRenderCameraPreset {
  id: FloorPlanRenderCameraPresetId;
  label: string;
  description: string;
}

export interface FloorPlanClientRenderOutput {
  id: "original-clean" | "cad-plan" | "dollhouse-3d" | "room-renders" | "client-board" | "quote-linked";
  label: string;
  description: string;
  ready: boolean;
}

export interface FloorPlanRoomRenderScene {
  roomId: string;
  roomName: string;
  style: FloorPlanCommercialRenderStyle;
  materials: FloorPlanRenderMaterial;
  furnitureLabels: string[];
  cameraLabel: string;
  prompt: string;
}

export interface FloorPlanRenderPackage {
  planId: string;
  style: FloorPlanCommercialRenderStyle;
  selectedRoomId: string;
  wowScore: number;
  materials: FloorPlanRenderMaterial[];
  cameraPresets: FloorPlanRenderCameraPreset[];
  roomScenes: FloorPlanRoomRenderScene[];
  clientOutputs: FloorPlanClientRenderOutput[];
}

export const floorPlanEditorTools: FloorPlanEditorTool[] = [
  {
    id: "select",
    label: "Seleziona",
    shortcut: "V",
    description: "Muovi stanze, muri, aperture e arredi senza modificare la scala.",
  },
  {
    id: "wall",
    label: "Muro",
    shortcut: "W",
    description: "Disegna o rettifica muri esterni e tramezzi con snap attivo.",
  },
  {
    id: "room",
    label: "Stanza",
    shortcut: "R",
    description: "Crea ambienti chiusi con nome, destinazione e superficie.",
  },
  {
    id: "door",
    label: "Porta",
    shortcut: "D",
    description: "Inserisci porte battenti o scorrevoli collegate al muro corretto.",
  },
  {
    id: "window",
    label: "Finestra",
    shortcut: "F",
    description: "Marca finestre, luci e aperture per render e preventivi.",
  },
  {
    id: "measure",
    label: "Quote",
    shortcut: "M",
    description: "Misura distanze, superfici e perimetri pronti per computo e PDF.",
  },
  {
    id: "furniture",
    label: "Arredo",
    shortcut: "A",
    description: "Posiziona arredi principali per staging, circolazione e 3D.",
  },
  {
    id: "comment",
    label: "Nota",
    shortcut: "N",
    description: "Aggiungi note tecniche e revisioni per cliente e cantiere.",
  },
];

export function buildFloorPlanDrawingContext(
  plan: FloorPlanAnalysis,
  input: FloorPlanDrawingContextInput,
): FloorPlanDrawingContext {
  const tool = floorPlanEditorTools.find((candidate) => candidate.id === input.activeTool) ?? floorPlanEditorTools[0];
  const selectedRoom = plan.rooms.find((room) => room.id === input.selectedRoomId) ?? plan.rooms[0];
  const selectedFurniture = input.selectedFurnitureId
    ? plan.furniture.find((item) => item.id === input.selectedFurnitureId)
    : undefined;
  const selectionLabel = selectedFurniture?.label ?? selectedRoom?.name ?? "Nessuna selezione";
  const scaleMissing = plan.source.scaleStatus !== "confirmed";
  const warnings = [
    ...(scaleMissing ? ["scala stimata: conferma una quota reale prima di esportare o preventivare."] : []),
    ...(plan.warnings.slice(0, 2)),
  ];

  const baseContext: FloorPlanDrawingContext = {
    tool,
    status: "ready",
    accent: "slate",
    headline: tool.label,
    instruction: tool.description,
    microSteps: [],
    nextActionLabel: "Continua",
    selectedLabel: selectionLabel,
    canvasStatus: {
      scale: plan.source.scale,
      snap: input.snapEnabled ? "Snap ON" : "Snap OFF",
      zoom: `${Math.round(input.zoom)}%`,
      coordinates: input.pointer ? `X ${roundTo(input.pointer.x, 1)} · Y ${roundTo(input.pointer.y, 1)}` : "X -- · Y --",
      selection: selectionLabel,
      grid: input.snapEnabled ? "Griglia 1 unita" : "Griglia libera",
    },
    warnings,
  };

  if (tool.id === "select") {
    return {
      ...baseContext,
      accent: "cyan",
      headline: selectedFurniture ? "Modifica arredo selezionato" : "Seleziona e muovi elementi CAD",
      instruction: selectedFurniture
        ? "Trascina l'arredo, usa le frecce per micro-spostamenti o Ruota per allinearlo alla stanza."
        : "Clicca una stanza o un arredo. Trascina per muovere, usa Undo se vuoi tornare indietro.",
      microSteps: ["Clicca un elemento", "Trascina o usa i controlli", "Verifica collisioni e quote"],
      nextActionLabel: selectedFurniture ? "Ruota arredo" : "Seleziona elemento",
    };
  }

  if (tool.id === "wall") {
    return {
      ...baseContext,
      accent: "orange",
      headline: "Disegna o rettifica muri",
      instruction: "Crea muri esterni e tramezzi con snap attivo, poi chiudi le stanze prima del render.",
      microSteps: ["Clicca il punto iniziale", "Trascina fino al punto finale", "Allinea allo spessore muro"],
      nextActionLabel: "Disegna muro",
    };
  }

  if (tool.id === "room") {
    return {
      ...baseContext,
      accent: "emerald",
      headline: "Chiudi una stanza editabile",
      instruction: "Disegna il perimetro o seleziona un'area chiusa per assegnare nome, uso e superficie.",
      microSteps: ["Definisci perimetro", "Assegna nome ambiente", "Controlla mq e destinazione"],
      nextActionLabel: "Crea stanza",
    };
  }

  if (tool.id === "door" || tool.id === "window") {
    return {
      ...baseContext,
      accent: tool.id === "door" ? "orange" : "cyan",
      headline: tool.id === "door" ? "Inserisci porta sul muro" : "Inserisci finestra o luce",
      instruction: tool.id === "door"
        ? "Clicca il muro corretto, scegli verso di apertura e verifica che non collida con arredi."
        : "Clicca il lato esterno, imposta larghezza e collega la finestra al render e al preventivo.",
      microSteps: ["Clicca muro", "Imposta larghezza", "Verifica apertura"],
      nextActionLabel: tool.id === "door" ? "Aggiungi porta" : "Aggiungi finestra",
    };
  }

  if (tool.id === "measure") {
    const pointCount = Math.min(input.calibrationPointCount ?? 0, 2);
    const nextActionLabel = pointCount === 0 ? "Clicca primo punto" : pointCount === 1 ? "Clicca secondo punto" : "Conferma scala";
    return {
      ...baseContext,
      status: scaleMissing ? "needs_scale" : "ready",
      accent: "orange",
      headline: scaleMissing ? "Calibra una quota reale" : "Misura e verifica quote",
      instruction: pointCount === 1
        ? "Clicca il secondo punto della quota reale, poi inserisci i metri misurati in cantiere."
        : "Clicca due punti noti sulla planimetria per fissare la scala prima di CAD, computo e render.",
      microSteps: ["Clicca punto A", "Clicca punto B", "Inserisci metri reali"],
      nextActionLabel,
    };
  }

  if (tool.id === "furniture") {
    return {
      ...baseContext,
      status: selectedRoom ? "ready" : "needs_selection",
      accent: "cyan",
      headline: selectedRoom ? `Arreda ${selectedRoom.name}` : "Seleziona una stanza da arredare",
      instruction: selectedRoom
        ? "Scegli un arredo dalla libreria o lascia che l'AI inserisca elementi coerenti con uso e dimensioni."
        : "Prima seleziona una stanza: gli arredi verranno filtrati in base al tipo di ambiente.",
      microSteps: ["Seleziona stanza", "Aggiungi arredo", "Trascina e ruota"],
      nextActionLabel: "Aggiungi arredo",
    };
  }

  return {
    ...baseContext,
    accent: "slate",
    headline: "Aggiungi nota tecnica",
    instruction: "Clicca un punto critico e lascia una nota per revisione, cliente o computo.",
    microSteps: ["Clicca punto", "Scrivi nota", "Collega a revisione"],
    nextActionLabel: "Aggiungi nota",
  };
}

export const floorPlanLayers: FloorPlanLayer[] = [
  {
    id: "rooms",
    label: "Stanze",
    description: "Superfici, nomi ambienti e destinazioni d'uso.",
    defaultVisible: true,
  },
  {
    id: "walls",
    label: "Muri",
    description: "Muri esterni, tramezzi e spessori tecnici.",
    defaultVisible: true,
  },
  {
    id: "openings",
    label: "Aperture",
    description: "Porte, finestre, scorrevoli e luci.",
    defaultVisible: true,
  },
  {
    id: "dimensions",
    label: "Quote",
    description: "Scala, quote principali e riferimenti metrici.",
    defaultVisible: true,
  },
  {
    id: "furniture",
    label: "Arredi",
    description: "Arredi principali utili a staging e verifica passaggi.",
    defaultVisible: true,
  },
  {
    id: "notes",
    label: "Note",
    description: "Avvisi, revisioni e punti da verificare in sopralluogo.",
    defaultVisible: true,
  },
];

export const floorPlanFurnitureCatalog: FloorPlanFurnitureCatalogItem[] = [
  {
    id: "modular-sofa",
    label: "Divano modulare",
    category: "living",
    width: 18,
    height: 7,
    defaultRotation: 0,
    unitPrice: 1850,
    roomUsageKeywords: ["soggiorno", "zona giorno", "open-space"],
    description: "Elemento living principale per verificare distanze TV, passaggi e proporzioni della zona giorno.",
  },
  {
    id: "dining-table-6",
    label: "Tavolo 6 posti",
    category: "living",
    width: 11,
    height: 8,
    defaultRotation: 0,
    unitPrice: 920,
    roomUsageKeywords: ["soggiorno", "pranzo", "zona giorno"],
    description: "Tavolo dimensionato per controllo ingombri e circolazione intorno alla cucina.",
  },
  {
    id: "island-kitchen",
    label: "Isola cucina",
    category: "kitchen",
    width: 12,
    height: 6,
    defaultRotation: 0,
    unitPrice: 3100,
    roomUsageKeywords: ["cucina", "open-space", "zona giorno"],
    description: "Blocco cucina centrale utile per varianti open-space e preventivazione arredo.",
  },
  {
    id: "queen-bed",
    label: "Letto matrimoniale",
    category: "bedroom",
    width: 13,
    height: 10,
    defaultRotation: 0,
    unitPrice: 1450,
    roomUsageKeywords: ["camera", "matrimoniale"],
    description: "Letto scala reale per verificare passaggi laterali, armadi e comodini.",
  },
  {
    id: "wardrobe-4m",
    label: "Armadio 4 ante",
    category: "storage",
    width: 15,
    height: 4,
    defaultRotation: 0,
    unitPrice: 1680,
    roomUsageKeywords: ["camera", "disimpegno", "guardaroba"],
    description: "Armadiatura standard per stimare contenimento e interferenze con porte.",
  },
  {
    id: "home-office-desk",
    label: "Scrivania home office",
    category: "office",
    width: 9,
    height: 5,
    defaultRotation: 0,
    unitPrice: 640,
    roomUsageKeywords: ["studio", "camera", "ufficio"],
    description: "Postazione lavoro per trasformare camere secondarie in studio o smart working.",
  },
  {
    id: "bathroom-vanity",
    label: "Mobile lavabo",
    category: "bathroom",
    width: 7,
    height: 4,
    defaultRotation: 0,
    unitPrice: 780,
    roomUsageKeywords: ["bagno"],
    description: "Mobile lavabo per computo bagno e controllo aperture/sanitari.",
  },
];

const baseRooms: FloorPlanRoom[] = [
  {
    id: "living",
    name: "Soggiorno cucina",
    usage: "zona giorno open-space",
    x: 9,
    y: 9,
    width: 43,
    height: 39,
    areaMq: 32.8,
    finish: "gres chiaro continuo",
    confidence: 0.94,
  },
  {
    id: "hall",
    name: "Disimpegno",
    usage: "connessione camere e bagno",
    x: 52,
    y: 28,
    width: 14,
    height: 20,
    areaMq: 7.6,
    finish: "gres chiaro continuo",
    confidence: 0.88,
  },
  {
    id: "bedroom-main",
    name: "Camera matrimoniale",
    usage: "camera principale",
    x: 66,
    y: 9,
    width: 25,
    height: 30,
    areaMq: 17.9,
    finish: "parquet rovere naturale",
    confidence: 0.91,
  },
  {
    id: "bedroom-kids",
    name: "Camera / studio",
    usage: "camera secondaria o studio",
    x: 66,
    y: 39,
    width: 25,
    height: 27,
    areaMq: 14.7,
    finish: "parquet rovere naturale",
    confidence: 0.89,
  },
  {
    id: "bath",
    name: "Bagno",
    usage: "bagno finestrato",
    x: 52,
    y: 48,
    width: 14,
    height: 18,
    areaMq: 6.4,
    finish: "gres effetto pietra",
    confidence: 0.86,
  },
  {
    id: "utility",
    name: "Lavanderia",
    usage: "locale tecnico",
    x: 9,
    y: 48,
    width: 22,
    height: 18,
    areaMq: 8.2,
    finish: "gres tecnico antiscivolo",
    confidence: 0.82,
  },
];

const baseWalls: FloorPlanWall[] = [
  { id: "w-ext-n", from: { x: 8, y: 8 }, to: { x: 92, y: 8 }, thicknessCm: 30, type: "external" },
  { id: "w-ext-e", from: { x: 92, y: 8 }, to: { x: 92, y: 67 }, thicknessCm: 30, type: "external" },
  { id: "w-ext-s", from: { x: 92, y: 67 }, to: { x: 8, y: 67 }, thicknessCm: 30, type: "external" },
  { id: "w-ext-w", from: { x: 8, y: 67 }, to: { x: 8, y: 8 }, thicknessCm: 30, type: "external" },
  { id: "w-living-hall", from: { x: 52, y: 8 }, to: { x: 52, y: 49 }, thicknessCm: 12, type: "internal" },
  { id: "w-hall-bedrooms", from: { x: 66, y: 8 }, to: { x: 66, y: 67 }, thicknessCm: 12, type: "internal" },
  { id: "w-bedrooms", from: { x: 66, y: 39 }, to: { x: 92, y: 39 }, thicknessCm: 12, type: "internal" },
  { id: "w-hall-bath", from: { x: 52, y: 48 }, to: { x: 66, y: 48 }, thicknessCm: 12, type: "internal" },
  { id: "w-utility", from: { x: 31, y: 48 }, to: { x: 31, y: 67 }, thicknessCm: 12, type: "internal" },
  { id: "w-living-utility", from: { x: 8, y: 48 }, to: { x: 52, y: 48 }, thicknessCm: 12, type: "internal" },
  { id: "w-hall-low", from: { x: 52, y: 67 }, to: { x: 52, y: 48 }, thicknessCm: 12, type: "internal" },
  { id: "w-bath-low", from: { x: 66, y: 67 }, to: { x: 66, y: 48 }, thicknessCm: 12, type: "internal" },
];

const baseOpenings: FloorPlanOpening[] = [
  { id: "door-entry", type: "door", wallId: "w-ext-s", x: 20, y: 67, width: 7, swing: "left" },
  { id: "door-hall", type: "door", wallId: "w-living-hall", x: 52, y: 35, width: 7, swing: "right" },
  { id: "door-bed-main", type: "door", wallId: "w-hall-bedrooms", x: 66, y: 24, width: 7, swing: "right" },
  { id: "door-bed-kids", type: "door", wallId: "w-hall-bedrooms", x: 66, y: 52, width: 7, swing: "left" },
  { id: "door-bath", type: "door", wallId: "w-hall-bath", x: 58, y: 48, width: 6, swing: "sliding" },
  { id: "win-living", type: "window", wallId: "w-ext-w", x: 8, y: 20, width: 16 },
  { id: "win-living-2", type: "window", wallId: "w-ext-n", x: 24, y: 8, width: 18 },
  { id: "win-main", type: "window", wallId: "w-ext-n", x: 73, y: 8, width: 13 },
  { id: "win-kids", type: "window", wallId: "w-ext-e", x: 92, y: 48, width: 12 },
  { id: "win-bath", type: "window", wallId: "w-ext-s", x: 58, y: 67, width: 8 },
];

const baseFurniture: FloorPlanFurniture[] = [
  { id: "sofa", roomId: "living", catalogItemId: "modular-sofa", category: "living", label: "Divano", x: 14, y: 16, width: 17, height: 7, rotation: 0, unitPrice: 1850 },
  { id: "table", roomId: "living", catalogItemId: "dining-table-6", category: "living", label: "Tavolo", x: 35, y: 31, width: 10, height: 8, rotation: 0, unitPrice: 920 },
  { id: "kitchen", roomId: "living", category: "kitchen", label: "Cucina lineare", x: 11, y: 40, width: 27, height: 5, rotation: 0, unitPrice: 4200 },
  { id: "bed-main", roomId: "bedroom-main", catalogItemId: "queen-bed", category: "bedroom", label: "Letto", x: 72, y: 17, width: 13, height: 10, rotation: 0, unitPrice: 1450 },
  { id: "desk", roomId: "bedroom-kids", catalogItemId: "home-office-desk", category: "office", label: "Scrivania", x: 75, y: 55, width: 9, height: 4, rotation: 0, unitPrice: 640 },
  { id: "bath-fixtures", roomId: "bath", category: "bathroom", label: "Sanitari", x: 54, y: 54, width: 10, height: 8, rotation: 0, unitPrice: 1600 },
];

const finishByStyle: Record<FloorPlanStyle, Record<string, string>> = {
  modern: {
    living: "microcemento caldo",
    hall: "microcemento caldo",
    "bedroom-main": "rovere naturale",
    "bedroom-kids": "rovere naturale",
    bath: "gres pietra chiara",
    utility: "gres tecnico grigio",
  },
  scandi: {
    living: "rovere sbiancato",
    hall: "rovere sbiancato",
    "bedroom-main": "rovere miele chiaro",
    "bedroom-kids": "rovere miele chiaro",
    bath: "gres bianco satinato",
    utility: "resina grigio perla",
  },
  boho: {
    living: "cotto chiaro opaco",
    hall: "cotto chiaro opaco",
    "bedroom-main": "parquet naturale vissuto",
    "bedroom-kids": "parquet naturale vissuto",
    bath: "zellige sabbia",
    utility: "gres sabbia tecnico",
  },
  contemporary: {
    living: "gres grande formato taupe",
    hall: "gres grande formato taupe",
    "bedroom-main": "parquet noce chiaro",
    "bedroom-kids": "parquet noce chiaro",
    bath: "gres marmo caldo",
    utility: "gres taupe antiscivolo",
  },
  rustic: {
    living: "pietra naturale levigata",
    hall: "pietra naturale levigata",
    "bedroom-main": "rovere nodato",
    "bedroom-kids": "rovere nodato",
    bath: "travertino opaco",
    utility: "cotto tecnico",
  },
};

const renderStyleMaterialPresets: Record<FloorPlanCommercialRenderStyle, {
  label: string;
  floor: string;
  wetFloor: string;
  wall: string;
  accent: string;
  floorColor: string;
  wetFloorColor: string;
  wallColor: string;
}> = {
  warm_modern: {
    label: "Moderno caldo",
    floor: "parquet rovere naturale",
    wetFloor: "gres effetto pietra chiara",
    wall: "bianco caldo opaco",
    accent: "legno, tessuti sabbia e dettagli neri",
    floorColor: "#d6b88a",
    wetFloorColor: "#c9c2b4",
    wallColor: "#f7f1e8",
  },
  luxury: {
    label: "Luxury",
    floor: "rovere spina italiana premium",
    wetFloor: "marmo chiaro grande formato",
    wall: "avorio satinato con dettagli ottone",
    accent: "marmo, vetro fumé e metallo champagne",
    floorColor: "#caa66f",
    wetFloorColor: "#e7e3dc",
    wallColor: "#fbf7ef",
  },
  minimal: {
    label: "Minimal",
    floor: "resina chiara continua",
    wetFloor: "gres cemento chiaro",
    wall: "bianco puro opaco",
    accent: "volumi puliti, arredi sospesi e nero soft",
    floorColor: "#d8d8d2",
    wetFloorColor: "#c9c9c3",
    wallColor: "#f8fafc",
  },
  nordic: {
    label: "Nordico",
    floor: "rovere sbiancato",
    wetFloor: "gres azzurro polvere",
    wall: "bianco latte",
    accent: "tessili naturali, verde salvia e legno chiaro",
    floorColor: "#e4d2a6",
    wetFloorColor: "#b9ced2",
    wallColor: "#faf7ef",
  },
  industrial: {
    label: "Industrial",
    floor: "cemento levigato",
    wetFloor: "gres antracite tecnico",
    wall: "grigio caldo con dettagli ferro",
    accent: "metallo nero, pelle cognac e illuminazione a binario",
    floorColor: "#9ca3af",
    wetFloorColor: "#6b7280",
    wallColor: "#e5e0d8",
  },
  family: {
    label: "Casa famiglia",
    floor: "gres effetto legno resistente",
    wetFloor: "gres antiscivolo chiaro",
    wall: "bianco caldo lavabile",
    accent: "arredi robusti, contenimento e colori morbidi",
    floorColor: "#d4aa72",
    wetFloorColor: "#d7d3c8",
    wallColor: "#fff7ed",
  },
  short_rent: {
    label: "Affitto breve",
    floor: "SPC effetto rovere facile manutenzione",
    wetFloor: "gres chiaro antibatterico",
    wall: "bianco luminoso con pareti accent",
    accent: "arredo compatto, luci sceniche e dettagli fotografabili",
    floorColor: "#d8b986",
    wetFloorColor: "#d9d7cf",
    wallColor: "#f8fafc",
  },
};

const renderCameraPresets: FloorPlanRenderCameraPreset[] = [
  {
    id: "top_3d",
    label: "Top 3D",
    description: "Vista dall'alto pulita per capire distribuzione, superfici e arredi.",
  },
  {
    id: "dollhouse",
    label: "Dollhouse inclinata",
    description: "Vista commerciale con pareti alte, ombre morbide, materiali e profondita.",
  },
  {
    id: "room_focus",
    label: "Stanza selezionata",
    description: "Camera ravvicinata per vendere atmosfera, arredi e finiture della stanza.",
  },
  {
    id: "client_before_after",
    label: "Prima/dopo cliente",
    description: "Confronto tra sorgente, CAD pulito e render finale da inserire nel PDF.",
  },
];

export const floorPlanCommercialRenderStyles: Array<{ id: FloorPlanCommercialRenderStyle; label: string }> = [
  { id: "warm_modern", label: renderStyleMaterialPresets.warm_modern.label },
  { id: "luxury", label: renderStyleMaterialPresets.luxury.label },
  { id: "minimal", label: renderStyleMaterialPresets.minimal.label },
  { id: "nordic", label: renderStyleMaterialPresets.nordic.label },
  { id: "industrial", label: renderStyleMaterialPresets.industrial.label },
  { id: "family", label: renderStyleMaterialPresets.family.label },
  { id: "short_rent", label: renderStyleMaterialPresets.short_rent.label },
];

export function buildFloorPlanSourceScan(input: FloorPlanSourceScanInput): FloorPlanSourceScan {
  const isImage = input.sourceType === "photo" || input.sourceType === "hand_sketch" || input.mimeType?.startsWith("image/");
  const megapixels = input.width && input.height ? roundTo((input.width * input.height) / 1_000_000, 2) : undefined;
  const issues: FloorPlanScanIssue[] = [];

  if (isImage && (megapixels === undefined || megapixels < 1.8 || Math.min(input.width ?? 0, input.height ?? 0) < 1200)) {
    issues.push({
      code: "low_resolution_photo",
      title: "Foto poco definita",
      description: "La foto potrebbe non contenere abbastanza dettaglio per leggere quote, testi e spessori muro in modo affidabile.",
      severity: "warning",
      action: "Carica una foto piu vicina, usa modalita scanner o conferma manualmente muri e quote.",
    });
  }

  if (input.sourceType === "photo" || input.sourceType === "hand_sketch") {
    issues.push({
      code: "perspective_review",
      title: "Prospettiva da raddrizzare",
      description: "Le foto da telefono possono deformare pareti e quote se il foglio non e perfettamente frontale.",
      severity: "warning",
      action: "Usa il layer Pulito AI e conferma almeno una quota reale.",
    });
  }

  if ((input.sizeBytes ?? 0) > 12_000_000) {
    issues.push({
      code: "heavy_source_file",
      title: "File pesante",
      description: "Il file e molto grande: conviene produrre una copia pulita per lavorare piu velocemente sul CAD.",
      severity: "info",
      action: "Mantieni l'originale archiviato e usa il layer ottimizzato per il ricalco.",
    });
  }

  issues.push({
    code: "scale_missing",
    title: "Scala da confermare",
    description: "La ricostruzione resta una bozza finche non viene agganciata a una misura reale.",
    severity: "blocking",
    action: "Clicca due punti noti sulla tavola e inserisci la misura reale.",
  });

  const score = clamp(94 - issues.reduce((sum, issue) => sum + (issue.severity === "blocking" ? 12 : issue.severity === "warning" ? 7 : 3), 0), 35, 96);
  const corrections: FloorPlanScanCorrection[] = [
    {
      id: "auto_crop",
      label: "Ritaglio foglio",
      description: "Individua bordi del foglio o della tavola e rimuove tavolo, pavimento e sfondi inutili.",
      applied: isImage,
    },
    {
      id: "perspective_fix",
      label: "Raddrizzamento prospettico",
      description: "Corregge foto inclinate per far tornare pareti e quote su una base ortogonale.",
      applied: input.sourceType === "photo" || input.sourceType === "hand_sketch",
    },
    {
      id: "shadow_cleanup",
      label: "Pulizia ombre",
      description: "Riduce ombre, riflessi e grigi non tecnici prima del ricalco CAD.",
      applied: isImage,
    },
    {
      id: "contrast_boost",
      label: "Contrasto linee",
      description: "Aumenta contrasto di muri, quote e testi mantenendo separato l'originale.",
      applied: true,
    },
    {
      id: "line_vectorization",
      label: "Vettorializzazione muri",
      description: "Trasforma linee principali in muri, aperture e stanze modificabili.",
      applied: true,
    },
    {
      id: "text_ocr",
      label: "OCR quote e nomi",
      description: "Legge testi, nomi ambiente e misure scritte per proporre la revisione guidata.",
      applied: input.sourceType !== "blank",
    },
  ];

  return {
    mode: "scanner_ai",
    score,
    summary: score >= 85
      ? "Sorgente leggibile: ricalco CAD pronto, scala ancora da confermare."
      : "Sorgente migliorabile: usa i layer puliti e conferma gli elementi critici prima del preventivo.",
    dimensions: input.width && input.height && megapixels !== undefined
      ? { width: input.width, height: input.height, megapixels }
      : undefined,
    issues,
    corrections,
    layers: [
      {
        id: "original",
        label: "Originale",
        description: "Foto o PDF caricato senza modifiche, utile come prova e confronto.",
        opacity: 0.28,
        visibleByDefault: true,
      },
      {
        id: "enhanced",
        label: "Pulito AI",
        description: "Versione raddrizzata, contrastata e pronta per il ricalco tecnico.",
        opacity: 0.18,
        visibleByDefault: true,
      },
      {
        id: "detected",
        label: "Rilevamento",
        description: "Overlay di muri, aperture e zone che l'AI vuole far controllare.",
        opacity: 0.72,
        visibleByDefault: true,
      },
      {
        id: "cad",
        label: "CAD",
        description: "Disegno editabile con stanze, muri, quote, arredi e output tecnico.",
        opacity: 1,
        visibleByDefault: true,
      },
    ],
  };
}

export function buildFloorPlanPhotoReviewQuestions(plan: FloorPlanAnalysis): FloorPlanReviewQuestion[] {
  const lowConfidenceRooms = plan.rooms.filter((room) => room.confidence < 0.9);
  const scanWarnings = plan.source.scan?.issues.filter((issue) => issue.severity !== "info") ?? [];
  const questions: FloorPlanReviewQuestion[] = [
    {
      id: "confirm-scale",
      target: "scale",
      title: "Scala reale",
      question: "Confermi una quota reale sul disegno prima di usare computo e preventivo?",
      severity: plan.source.scaleStatus === "confirmed" ? "info" : "blocking",
      defaultAnswer: plan.source.scaleStatus === "confirmed" ? "Scala confermata" : "Da confermare con due punti noti",
    },
    {
      id: "confirm-openings",
      target: "openings",
      title: "Porte e finestre",
      question: `Controlli le ${plan.openings.length} aperture rilevate e distingui porte, finestre e scorrevoli?`,
      severity: "warning",
      defaultAnswer: "Verifica su layer Rilevamento",
    },
    {
      id: "confirm-room-labels",
      target: "rooms",
      title: "Nomi ambienti",
      question: lowConfidenceRooms.length > 0
        ? `Correggi destinazione e nome di ${lowConfidenceRooms.map((room) => room.name).join(", ")}?`
        : "Confermi nomi e destinazioni delle stanze rilevate?",
      severity: lowConfidenceRooms.length > 0 ? "warning" : "info",
      defaultAnswer: lowConfidenceRooms.length > 0 ? "Da revisionare" : "Pronto",
    },
  ];

  if (plan.furniture.length > 0) {
    questions.push({
      id: "confirm-furniture",
      target: "furniture",
      title: "Arredi rilevati",
      question: "Vuoi mantenere gli arredi come vincoli di layout o usarli solo per render e proposta cliente?",
      severity: "info",
      defaultAnswer: "Mantieni nel layer Arredi",
    });
  }

  if (scanWarnings.length > 0) {
    questions.push({
      id: "confirm-walls-from-photo",
      target: "walls",
      title: "Muri da foto",
      question: "Confermi che i muri vettorializzati seguono il disegno pulito e non ombre o bordi del foglio?",
      severity: "warning",
      defaultAnswer: "Confronta Originale, Pulito AI e CAD",
    });
  }

  return questions;
}

export function buildFloorPlanRenderPackage(
  plan: FloorPlanAnalysis,
  input?: { style?: FloorPlanCommercialRenderStyle; selectedRoomId?: string },
): FloorPlanRenderPackage {
  const style = input?.style ?? "warm_modern";
  const selectedRoomId = input?.selectedRoomId ?? plan.rooms[0]?.id ?? "living";
  const materials = plan.rooms.map((room) => buildRoomRenderMaterial(room, style));
  const roomScenes = plan.rooms.map((room) => buildFloorPlanRoomRenderScene(plan, { roomId: room.id, style }));
  const readyForClient = plan.source.scaleStatus === "confirmed" || plan.source.confidence >= 0.86;
  const wowScore = clamp(
    64
      + Math.min(plan.furniture.length * 4, 14)
      + Math.min(plan.openings.length * 2, 10)
      + (plan.source.scan ? 7 : 0)
      + (style === "luxury" ? 6 : 4),
    55,
    96,
  );

  return {
    planId: plan.id,
    style,
    selectedRoomId,
    wowScore: Math.round(wowScore),
    materials,
    cameraPresets: renderCameraPresets.map((preset) => ({ ...preset })),
    roomScenes,
    clientOutputs: [
      {
        id: "original-clean",
        label: "Originale + Pulito AI",
        description: "Mostra al cliente da dove e partita la ricostruzione e come e stata pulita.",
        ready: Boolean(plan.source.scan),
      },
      {
        id: "cad-plan",
        label: "CAD tecnico",
        description: "Planimetria 2D editabile con stanze, muri, quote e aperture.",
        ready: true,
      },
      {
        id: "dollhouse-3d",
        label: "Dollhouse 3D arredata",
        description: "Vista dall'alto con pareti, materiali, arredi e luci commerciali.",
        ready: plan.rooms.length > 0,
      },
      {
        id: "room-renders",
        label: "Render stanze",
        description: "Scene dedicate per soggiorno, camere e bagni con prompt AI pronti.",
        ready: roomScenes.length > 0,
      },
      {
        id: "client-board",
        label: "Tavola cliente",
        description: "Sequenza visuale originale, CAD, 3D, materiali e note.",
        ready: readyForClient,
      },
      {
        id: "quote-linked",
        label: "Preventivo collegato",
        description: "Computo e proposta economica collegati a superfici, aperture e arredi.",
        ready: estimateFloorPlanQuoteItems(plan).length > 0,
      },
    ],
  };
}

export function buildFloorPlanRoomRenderScene(
  plan: FloorPlanAnalysis,
  input: { roomId: string; style?: FloorPlanCommercialRenderStyle },
): FloorPlanRoomRenderScene {
  const style = input.style ?? "warm_modern";
  const room = plan.rooms.find((candidate) => candidate.id === input.roomId) ?? plan.rooms[0];
  const fallbackRoom = room ?? {
    id: "room",
    name: "Ambiente",
    usage: "ambiente",
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    areaMq: 10,
    finish: "",
    confidence: 0.8,
  };
  const materials = buildRoomRenderMaterial(fallbackRoom, style);
  const furnitureLabels = buildRoomFurnitureLabels(fallbackRoom);
  const prompt = [
    `Render fotorealistico in vista dollhouse della stanza ${fallbackRoom.name}.`,
    `Stile ${renderStyleMaterialPresets[style].label}.`,
    `Pavimento ${materials.floorLabel}, pareti ${materials.wallLabel}, accenti ${materials.accentLabel}.`,
    `Inserisci ${furnitureLabels.join(", ")}.`,
    "Camera grandangolare controllata, pareti tagliate a mezza altezza, luce naturale morbida, ombre realistiche, output cliente premium.",
  ].join(" ");

  return {
    roomId: fallbackRoom.id,
    roomName: fallbackRoom.name,
    style,
    materials,
    furnitureLabels,
    cameraLabel: fallbackRoom.areaMq > 18 ? "Dollhouse grandangolare" : "Stanza ravvicinata",
    prompt,
  };
}

export function createInitialFloorPlanFromSketch(input?: {
  fileName?: string;
  sourceType?: FloorPlanSourceType;
  mimeType?: string;
  sizeBytes?: number;
  width?: number;
  height?: number;
}): FloorPlanAnalysis {
  const sourceType = input?.sourceType ?? "hand_sketch";
  const fileName = input?.fileName ?? "schizzo-planimetria.jpg";
  const scan = buildFloorPlanSourceScan({
    fileName,
    sourceType,
    mimeType: input?.mimeType,
    sizeBytes: input?.sizeBytes,
    width: input?.width,
    height: input?.height,
  });

  return {
    id: `floor-plan-${sourceType ?? "demo"}-001`,
    title: "Appartamento rilevato da schizzo",
    style: "modern",
    source: {
      fileName,
      sourceType,
      confidence: 0.89,
      scale: "1:100 stimata, da confermare con una quota reale",
      scaleStatus: "estimated",
      metersPerUnit: DEFAULT_METERS_PER_UNIT,
      scan,
    },
    rooms: baseRooms.map((room) => ({ ...room })),
    walls: baseWalls.map((wall) => ({ ...wall, from: { ...wall.from }, to: { ...wall.to } })),
    openings: baseOpenings.map((opening) => ({ ...opening })),
    furniture: baseFurniture.map((item) => ({ ...item })),
    outputModes: ["2d_cad", "3d_dollhouse", "render_ai", "cad_export"],
    warnings: [
      "Scala stimata: inserisci almeno una quota reale prima di esportare CAD definitivo.",
      "Bagno e lavanderia richiedono verifica scarichi in sopralluogo.",
    ],
    revisions: [],
  };
}

export function calculateFloorPlanMetrics(plan: FloorPlanAnalysis): FloorPlanMetrics {
  const scaleRatio = getScaleRatio(plan);
  const totalAreaMq = roundTo(plan.rooms.reduce((sum, room) => sum + room.areaMq * scaleRatio * scaleRatio, 0), 1);
  const wallLinearMeters = roundTo(
    plan.walls.reduce((sum, wall) => {
      const dx = wall.to.x - wall.from.x;
      const dy = wall.to.y - wall.from.y;
      return sum + Math.sqrt(dx * dx + dy * dy) * plan.source.metersPerUnit;
    }, 0),
    1,
  );
  const confidenceAvg = roundTo(
    plan.rooms.reduce((sum, room) => sum + room.confidence, 0) / Math.max(plan.rooms.length, 1),
    2,
  );

  return {
    totalAreaMq,
    roomCount: plan.rooms.length,
    wallLinearMeters,
    openingCount: plan.openings.length,
    confidenceAvg,
    estimatedRevisionMinutes: Math.max(18, Math.round((1 - confidenceAvg) * 180)),
  };
}

export function createFloorPlanVariant(plan: FloorPlanAnalysis, style: FloorPlanStyle): FloorPlanAnalysis {
  const finishes = finishByStyle[style];
  return {
    ...plan,
    id: `${plan.id}-${style}`,
    title: `${plan.title} - ${style}`,
    style,
    rooms: plan.rooms.map((room) => ({
      ...room,
      finish: finishes[room.id] ?? room.finish,
    })),
    walls: plan.walls.map((wall) => ({ ...wall, from: { ...wall.from }, to: { ...wall.to } })),
    openings: plan.openings.map((opening) => ({ ...opening })),
    furniture: plan.furniture.map((item) => ({ ...item })),
    revisions: plan.revisions.map((revision) => ({ ...revision })),
  };
}

export function buildFloorPlanGenerationBrief(plan: FloorPlanAnalysis): string {
  const metrics = calculateFloorPlanMetrics(plan);
  const scanCorrections = plan.source.scan?.corrections
    .filter((correction) => correction.applied)
    .map((correction) => correction.label.toLowerCase())
    .join(", ");
  return [
    `Input: ${plan.source.sourceType === "hand_sketch" ? "schizzo" : plan.source.sourceType} ${plan.source.fileName}.`,
    scanCorrections ? `Pre-elabora la sorgente con ${scanCorrections}.` : "",
    `Restituisci una planimetria 2D CAD editabile con ${metrics.roomCount} ambienti, ${metrics.totalAreaMq} mq e ${metrics.wallLinearMeters} metri lineari di muri.`,
    "Mantieni scala, muri, aperture e quote separati da finiture e arredi.",
    "Genera anche una vista 3D navigabile tipo dollhouse e varianti render AI per stile.",
    "Segnala quote incerte, stanze non chiuse, collisioni porte/arredi e punti da verificare in sopralluogo.",
  ].filter(Boolean).join(" ");
}

export function calibrateFloorPlanScale(
  plan: FloorPlanAnalysis,
  input: { measuredUnits: number; knownLengthMeters: number; label: string },
): FloorPlanAnalysis {
  const measuredUnits = Math.max(input.measuredUnits, 0.01);
  const knownLengthMeters = Math.max(input.knownLengthMeters, 0.01);
  const metersPerUnit = roundTo(knownLengthMeters / measuredUnits, 4);

  return {
    ...clonePlan(plan),
    source: {
      ...plan.source,
      metersPerUnit,
      scaleStatus: "confirmed",
      scale: `${input.label}: ${knownLengthMeters} m su ${measuredUnits} unita CAD`,
    },
    calibration: {
      label: input.label,
      measuredUnits,
      knownLengthMeters,
      calibratedAt: new Date().toISOString(),
    },
    warnings: plan.warnings.filter((warning) => !warning.toLowerCase().includes("scala stimata")),
  };
}

export function measureFloorPlanDistance(from: FloorPlanPoint, to: FloorPlanPoint): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return roundTo(Math.sqrt(dx * dx + dy * dy), 3);
}

export function calibrateFloorPlanScaleFromPoints(
  plan: FloorPlanAnalysis,
  input: { from: FloorPlanPoint; to: FloorPlanPoint; knownLengthMeters: number; label: string },
): FloorPlanAnalysis {
  return calibrateFloorPlanScale(plan, {
    measuredUnits: measureFloorPlanDistance(input.from, input.to),
    knownLengthMeters: input.knownLengthMeters,
    label: input.label,
  });
}

export function updateFloorPlanRoom(
  plan: FloorPlanAnalysis,
  roomId: string,
  patch: Partial<Pick<FloorPlanRoom, "name" | "usage" | "areaMq" | "finish" | "confidence">>,
): FloorPlanAnalysis {
  return {
    ...clonePlan(plan),
    rooms: plan.rooms.map((room) => room.id === roomId
      ? {
          ...room,
          ...patch,
          name: patch.name?.trim() || room.name,
          usage: patch.usage?.trim() || room.usage,
          finish: patch.finish?.trim() || room.finish,
          areaMq: patch.areaMq !== undefined && Number.isFinite(patch.areaMq) ? Math.max(roundTo(patch.areaMq, 1), 0.1) : room.areaMq,
          confidence: patch.confidence !== undefined && Number.isFinite(patch.confidence) ? Math.max(0, Math.min(1, roundTo(patch.confidence, 2))) : room.confidence,
        }
      : { ...room }),
  };
}

export function addFloorPlanOpening(
  plan: FloorPlanAnalysis,
  input: Pick<FloorPlanOpening, "type" | "wallId" | "x" | "y" | "width" | "swing" | "doorStyle" | "windowStyle">,
): FloorPlanAnalysis {
  const nextOpening: FloorPlanOpening = {
    id: `${input.type}-${plan.openings.length + 1}`,
    type: input.type,
    wallId: input.wallId,
    x: roundTo(input.x, 2),
    y: roundTo(input.y, 2),
    width: Math.max(roundTo(input.width, 2), 0.5),
    swing: input.swing,
    // Stili opzionali — passati direttamente se forniti
    doorStyle: input.doorStyle,
    windowStyle: input.windowStyle,
  };

  return {
    ...clonePlan(plan),
    openings: [...plan.openings.map((opening) => ({ ...opening })), nextOpening],
  };
}

// G3: gestione annotazioni (testo / freccia / simbolo nord / scala grafica).
export function addFloorPlanAnnotation(
  plan: FloorPlanAnalysis,
  input: Omit<FloorPlanAnnotation, "id">,
): FloorPlanAnalysis {
  const list = plan.annotations ?? [];
  const nextAnnotation: FloorPlanAnnotation = {
    id: `ann-${input.type}-${list.length + 1}-${Date.now().toString(36).slice(-4)}`,
    ...input,
  };
  return {
    ...clonePlan(plan),
    annotations: [...list, nextAnnotation],
  };
}

export function removeFloorPlanAnnotation(
  plan: FloorPlanAnalysis,
  annotationId: string,
): FloorPlanAnalysis {
  return {
    ...clonePlan(plan),
    annotations: (plan.annotations ?? []).filter((a) => a.id !== annotationId),
  };
}

export function updateFloorPlanAnnotation(
  plan: FloorPlanAnalysis,
  annotationId: string,
  patch: Partial<Omit<FloorPlanAnnotation, "id">>,
): FloorPlanAnalysis {
  return {
    ...clonePlan(plan),
    annotations: (plan.annotations ?? []).map((a) =>
      a.id === annotationId ? { ...a, ...patch } : a,
    ),
  };
}

export function addFloorPlanFurniture(
  plan: FloorPlanAnalysis,
  input: { catalogItemId: string; roomId: string; x?: number; y?: number; rotation?: number },
): FloorPlanAnalysis {
  const item = floorPlanFurnitureCatalog.find((catalogItem) => catalogItem.id === input.catalogItemId);
  const room = plan.rooms.find((candidate) => candidate.id === input.roomId) ?? plan.rooms[0];
  if (!item || !room) return clonePlan(plan);

  const padding = 1.5;
  const fallbackX = room.x + Math.max(padding, (room.width - item.width) / 2);
  const fallbackY = room.y + Math.max(padding, (room.height - item.height) / 2);
  const maxX = room.x + room.width - item.width - padding;
  const maxY = room.y + room.height - item.height - padding;
  const nextFurniture: FloorPlanFurniture = {
    id: `${item.id}-${plan.furniture.length + 1}`,
    roomId: room.id,
    catalogItemId: item.id,
    category: item.category,
    label: item.label,
    x: roundTo(clamp(input.x ?? fallbackX, room.x + padding, Math.max(room.x + padding, maxX)), 2),
    y: roundTo(clamp(input.y ?? fallbackY, room.y + padding, Math.max(room.y + padding, maxY)), 2),
    width: item.width,
    height: item.height,
    rotation: input.rotation ?? item.defaultRotation,
    unitPrice: item.unitPrice,
  };

  return {
    ...clonePlan(plan),
    furniture: [...plan.furniture.map((furniture) => ({ ...furniture })), nextFurniture],
  };
}

export function moveFloorPlanFurniture(
  plan: FloorPlanAnalysis,
  input: { furnitureId: string; delta: FloorPlanPoint; snap?: boolean },
): FloorPlanAnalysis {
  const item = plan.furniture.find((furniture) => furniture.id === input.furnitureId);
  if (!item) return clonePlan(plan);

  const room = plan.rooms.find((candidate) => candidate.id === item.roomId);
  const rawX = item.x + input.delta.x;
  const rawY = item.y + input.delta.y;
  const nextX = input.snap ? Math.round(rawX) : rawX;
  const nextY = input.snap ? Math.round(rawY) : rawY;
  const minX = room ? room.x : FLOOR_PLAN_BOUNDS.minX;
  const minY = room ? room.y : FLOOR_PLAN_BOUNDS.minY;
  const maxX = room ? room.x + room.width - item.width : FLOOR_PLAN_BOUNDS.maxX - item.width;
  const maxY = room ? room.y + room.height - item.height : FLOOR_PLAN_BOUNDS.maxY - item.height;

  return {
    ...clonePlan(plan),
    furniture: plan.furniture.map((furniture) => furniture.id === input.furnitureId
      ? {
          ...furniture,
          x: roundTo(clamp(nextX, minX, Math.max(minX, maxX)), 2),
          y: roundTo(clamp(nextY, minY, Math.max(minY, maxY)), 2),
        }
      : { ...furniture }),
  };
}

export function rotateFloorPlanFurniture(
  plan: FloorPlanAnalysis,
  input: { furnitureId: string; degrees: number; snapDegrees?: number },
): FloorPlanAnalysis {
  const item = plan.furniture.find((furniture) => furniture.id === input.furnitureId);
  if (!item) return clonePlan(plan);

  const snapDegrees = input.snapDegrees && input.snapDegrees > 0 ? input.snapDegrees : 1;
  const normalized = ((input.degrees % 360) + 360) % 360;
  const rotation = Math.round(normalized / snapDegrees) * snapDegrees;

  return {
    ...clonePlan(plan),
    furniture: plan.furniture.map((furniture) => furniture.id === input.furnitureId
      ? { ...furniture, rotation: rotation % 360 }
      : { ...furniture }),
  };
}

export function moveFloorPlanRoom(
  plan: FloorPlanAnalysis,
  input: { roomId: string; delta: FloorPlanPoint; snap?: boolean; moveContents?: boolean },
): FloorPlanAnalysis {
  const room = plan.rooms.find((candidate) => candidate.id === input.roomId);
  if (!room) return clonePlan(plan);

  const rawDx = input.snap ? Math.round(input.delta.x) : input.delta.x;
  const rawDy = input.snap ? Math.round(input.delta.y) : input.delta.y;
  const nextX = clamp(room.x + rawDx, FLOOR_PLAN_BOUNDS.minX, FLOOR_PLAN_BOUNDS.maxX - room.width);
  const nextY = clamp(room.y + rawDy, FLOOR_PLAN_BOUNDS.minY, FLOOR_PLAN_BOUNDS.maxY - room.height);
  const appliedDelta = {
    x: roundTo(nextX - room.x, 2),
    y: roundTo(nextY - room.y, 2),
  };

  return {
    ...clonePlan(plan),
    rooms: plan.rooms.map((candidate) => candidate.id === input.roomId
      ? { ...candidate, x: roundTo(nextX, 2), y: roundTo(nextY, 2) }
      : { ...candidate }),
    furniture: plan.furniture.map((item) => input.moveContents && item.roomId === input.roomId
      ? {
          ...item,
          x: roundTo(item.x + appliedDelta.x, 2),
          y: roundTo(item.y + appliedDelta.y, 2),
        }
      : { ...item }),
  };
}

export function runFloorPlanQualityChecks(plan: FloorPlanAnalysis): FloorPlanQualityIssue[] {
  const issues: FloorPlanQualityIssue[] = [];

  if (plan.source.scaleStatus !== "confirmed") {
    issues.push({
      code: "scale_not_confirmed",
      title: "Scala da confermare",
      description: "La scala e stimata: conferma una quota reale prima di esportare CAD, computo o preventivo definitivo.",
      severity: "blocking",
      action: "Clicca due punti noti e inserisci la misura reale.",
    });
  }

  if (plan.source.scan && plan.source.scan.issues.some((issue) => issue.severity !== "info")) {
    issues.push({
      code: "photo_scan_review",
      title: "Foto da revisionare",
      description: `${plan.source.scan.issues.filter((issue) => issue.severity !== "info").length} controlli scanner richiedono conferma prima di usare il CAD come base definitiva.`,
      severity: "warning",
      action: "Confronta Originale, Pulito AI e CAD e chiudi le domande di revisione.",
    });
  }

  const lowConfidenceRooms = plan.rooms.filter((room) => room.confidence < 0.85);
  if (lowConfidenceRooms.length > 0) {
    issues.push({
      code: "low_confidence_rooms",
      title: "Ambienti da verificare",
      description: `${lowConfidenceRooms.map((room) => room.name).join(", ")} hanno confidenza sotto l'85%.`,
      severity: "warning",
      action: "Apri il layer stanze e correggi contorni o nomi ambiente.",
    });
  }

  const wallIds = new Set(plan.walls.map((wall) => wall.id));
  const orphanOpenings = plan.openings.filter((opening) => !wallIds.has(opening.wallId));
  if (orphanOpenings.length > 0) {
    issues.push({
      code: "orphan_openings",
      title: "Aperture non agganciate",
      description: `${orphanOpenings.length} aperture non risultano collegate a un muro valido.`,
      severity: "blocking",
      action: "Aggancia porte e finestre al muro corretto prima dell'export.",
    });
  }

  const openingsOffWall = plan.openings.filter((opening) => {
    const wall = plan.walls.find((item) => item.id === opening.wallId);
    return wall ? !openingFitsWall(opening, wall) : false;
  });
  if (openingsOffWall.length > 0) {
    issues.push({
      code: "openings_off_wall",
      title: "Aperture fuori muro",
      description: `${openingsOffWall.length} aperture hanno coordinate non compatibili con il muro agganciato.`,
      severity: "blocking",
      action: "Sposta l'apertura sul segmento corretto o cambia muro di riferimento.",
    });
  }

  const overlappingPairs = findOverlappingRoomPairs(plan.rooms);
  if (overlappingPairs.length > 0) {
    issues.push({
      code: "overlapping_rooms",
      title: "Ambienti sovrapposti",
      description: `${overlappingPairs.length} coppie di ambienti si sovrappongono e falsano superfici e computo.`,
      severity: "blocking",
      action: "Correggi i contorni stanza prima di generare CAD e preventivo.",
    });
  }

  if (plan.openings.filter((opening) => opening.type === "door").length === 0) {
    issues.push({
      code: "missing_doors",
      title: "Porte assenti",
      description: "Non sono state rilevate porte: il layout potrebbe non essere navigabile.",
      severity: "warning",
      action: "Aggiungi almeno gli accessi principali.",
    });
  }

  issues.push({
    code: "crm_ready",
    title: "Collegamento CRM disponibile",
    description: "La planimetria puo essere collegata a contatto, opportunita, sopralluogo e preventivo.",
    severity: "info",
    action: "Salva una revisione e associa il documento al cliente.",
  });

  return issues;
}

export function buildFloorPlanAiSuggestions(plan: FloorPlanAnalysis): FloorPlanAiSuggestion[] {
  const issues = runFloorPlanQualityChecks(plan);
  const roomsWithoutFurniture = plan.rooms.filter((room) => !plan.furniture.some((item) => item.roomId === room.id));
  const suggestions: FloorPlanAiSuggestion[] = [];

  if (issues.some((issue) => issue.severity === "blocking")) {
    suggestions.push({
      id: "qa-blockers",
      type: "qa",
      priority: "high",
      title: "Sistema i blocchi tecnici prima del cliente",
      description: "Scala, aperture o sovrapposizioni possono falsare CAD, computo e preventivo.",
      actionLabel: "Correggi QA tecnico",
      impact: "Evita preventivi sbagliati e DXF non affidabili.",
    });
  }

  suggestions.push({
    id: "furniture-layout",
    type: "furniture",
    priority: roomsWithoutFurniture.length > 0 ? "high" : "medium",
    title: "Completa layout arredo e circolazione",
    description: roomsWithoutFurniture.length > 0
      ? `${roomsWithoutFurniture.map((room) => room.name).join(", ")} non hanno ancora arredi: puoi testare ingombri, passaggi e varianti.`
      : "Gli arredi principali sono presenti: puoi generare varianti stile e controllo passaggi.",
    actionLabel: "Aggiungi arredo consigliato",
    impact: "Rende più chiari render, sopralluogo e vendita consulenziale.",
  });

  suggestions.push({
    id: "quote-from-plan",
    type: "quote",
    priority: plan.source.scaleStatus === "confirmed" ? "medium" : "high",
    title: "Allinea computo e preventivo alla planimetria",
    description: "Superfici, muri, aperture e arredi possono alimentare un preventivo precompilato con margine stimato.",
    actionLabel: "Aggiorna preventivo da planimetria",
    impact: "Riduce tempi di preventivazione e migliora controllo margine.",
  });

  suggestions.push({
    id: "work-studio",
    type: "workflow",
    priority: "medium",
    title: "Crea uno studio operativo collegato alla commessa",
    description: "Collega planimetria, computo, documenti, sopralluogo, CRM e task di progettazione.",
    actionLabel: "Crea fasi lavoro",
    impact: "Trasforma il disegno in flusso commerciale e tecnico tracciabile.",
  });

  return suggestions;
}

export function estimateFloorPlanQuoteItems(plan: FloorPlanAnalysis): FloorPlanQuoteItem[] {
  const metrics = calculateFloorPlanMetrics(plan);
  const doorCount = plan.openings.filter((opening) => opening.type === "door").length;
  const windowCount = plan.openings.filter((opening) => opening.type === "window").length;
  const furnitureTotal = plan.furniture.reduce((sum, item) => sum + (item.unitPrice ?? estimateFurniturePrice(item)), 0);
  const internalWallMeters = roundTo(
    plan.walls
      .filter((wall) => wall.type === "internal")
      .reduce((sum, wall) => {
        const dx = wall.to.x - wall.from.x;
        const dy = wall.to.y - wall.from.y;
        return sum + Math.sqrt(dx * dx + dy * dy) * plan.source.metersPerUnit;
      }, 0),
    1,
  );

  return [
    quoteItem("flooring", "finiture", "Pavimenti e posa base", "mq", metrics.totalAreaMq, 62, 0.86),
    quoteItem("skirting", "finiture", "Battiscopa perimetrale", "m", metrics.wallLinearMeters * 0.62, 13, 0.78),
    quoteItem("partitions", "opere_murarie", "Tramezzi e rettifiche murarie", "m", internalWallMeters, 95, 0.72),
    quoteItem("doors", "serramenti", "Porte interne stimate", "pz", doorCount, 420, 0.81),
    quoteItem("windows", "serramenti", "Finestre rilevate", "pz", windowCount, 560, 0.79),
    quoteItem("electrical-layout", "impianti", "Predisposizione punti luce/prese da layout", "mq", metrics.totalAreaMq, 18, 0.62),
    quoteItem("furniture-layout", "arredo", "Arredo stimato da layout planimetria", "cad", 1, Math.max(furnitureTotal, 1), 0.68),
    quoteItem("technical-design", "progettazione", "Rilievo, revisione CAD e tavola cliente", "cad", 1, 280, 0.92),
  ];
}

export function buildFloorPlanWorkStudio(
  plan: FloorPlanAnalysis,
  input: { contactId?: string; opportunityId?: string } = {},
): FloorPlanWorkStudio {
  const quoteItems = estimateFloorPlanQuoteItems(plan);
  const total = roundTo(quoteItems.reduce((sum, item) => sum + item.total, 0), 2);
  const confidence = roundTo(quoteItems.reduce((sum, item) => sum + item.confidence, 0) / Math.max(quoteItems.length, 1), 2);

  return {
    planId: plan.id,
    crm: {
      contactId: input.contactId ?? null,
      opportunityId: input.opportunityId ?? null,
      nextStep: plan.source.scaleStatus === "confirmed" ? "Inviare studio planimetria e preventivo preliminare" : "Confermare quota reale prima del preventivo definitivo",
    },
    quote: {
      total,
      marginEstimate: roundTo(total * 0.28, 2),
      confidence,
      items: quoteItems,
    },
    phases: [
      {
        id: "rilievo",
        label: "Rilievo e verifica quote",
        owner: "tecnico",
        estimatedDays: 1,
        tasks: ["Confermare scala", "Verificare scarichi e aperture", "Caricare foto sopralluogo"],
      },
      {
        id: "progettazione",
        label: "Layout, arredo e 3D",
        owner: "tecnico",
        estimatedDays: 2,
        tasks: ["Validare ambienti", "Applicare arredo consigliato", "Generare render e tavola cliente"],
      },
      {
        id: "preventivo",
        label: "Computo e preventivo CRM",
        owner: "venditore",
        estimatedDays: 1,
        tasks: ["Controllare listino prodotti", "Aggiornare margine", "Inviare proposta al cliente"],
      },
      {
        id: "approvazione",
        label: "Approvazione cliente",
        owner: "cliente",
        estimatedDays: 3,
        tasks: ["Raccogliere feedback", "Congelare revisione", "Preparare firma e acconto"],
      },
      {
        id: "cantiere",
        label: "Esecuzione e ordini",
        owner: "project_manager",
        estimatedDays: 12,
        tasks: ["Creare task cantiere", "Pianificare forniture", "Aggiornare documenti e avanzamento"],
      },
    ],
    documentLinks: ["planimetria-json", "tavola-pdf", "computo", "preventivo-crm", "render-3d"],
    aiSuggestions: buildFloorPlanAiSuggestions(plan),
  };
}

export function buildFloorPlanExportManifest(plan: FloorPlanAnalysis): FloorPlanExportManifest {
  const blockingIssue = runFloorPlanQualityChecks(plan).find((issue) => issue.severity === "blocking");
  const hasBlocking = Boolean(blockingIssue);
  const scaleBlocker = plan.source.scaleStatus !== "confirmed" ? "Conferma una quota reale per export tecnico definitivo." : undefined;
  const technicalBlocker = scaleBlocker ?? blockingIssue?.title;

  return {
    planId: plan.id,
    ready: !hasBlocking,
    outputs: [
      { type: "svg", label: "SVG modificabile", ready: true },
      { type: "json", label: "JSON dati planimetria", ready: true },
      { type: "dxf", label: "DXF base CAD", ready: !technicalBlocker, blocker: technicalBlocker },
      { type: "pdf", label: "PDF cliente", ready: !technicalBlocker, blocker: technicalBlocker },
    ],
  };
}

export function createFloorPlanRevision(
  plan: FloorPlanAnalysis,
  input: { note: string; authorName: string },
): FloorPlanAnalysis {
  const metrics = calculateFloorPlanMetrics(plan);
  const nextVersion = `v${plan.revisions.length + 1}`;
  const revision: FloorPlanRevision = {
    id: `${plan.id}-${nextVersion}`,
    version: nextVersion,
    note: input.note.trim() || "Revisione planimetria",
    authorName: input.authorName.trim() || "Operatore",
    createdAt: new Date().toISOString(),
    summary: `${metrics.roomCount} ambienti, ${metrics.totalAreaMq} mq, ${metrics.openingCount} aperture`,
  };

  return {
    ...clonePlan(plan),
    revisions: [...plan.revisions.map((item) => ({ ...item })), revision],
  };
}

export function buildFloorPlanCrmPayload(
  plan: FloorPlanAnalysis,
  input: { contactId?: string; opportunityId?: string },
) {
  const metrics = calculateFloorPlanMetrics(plan);
  return {
    render_type: FLOOR_PLAN_RENDER_MODULE.id,
    plan_id: plan.id,
    contact_id: input.contactId ?? null,
    opportunity_id: input.opportunityId ?? null,
    source_file: plan.source.fileName,
    scale_status: plan.source.scaleStatus,
    summary: `${metrics.roomCount} ambienti, ${metrics.totalAreaMq} mq, ${metrics.wallLinearMeters} m muri, ${metrics.openingCount} aperture`,
    revisions: plan.revisions.length,
  };
}

export function exportFloorPlanToSvg(plan: FloorPlanAnalysis): string {
  const width = 1000;
  const height = 760;
  const scale = 10;
  const roomRects = plan.rooms.map((room) => (
    `<rect x="${room.x * scale}" y="${room.y * scale}" width="${room.width * scale}" height="${room.height * scale}" fill="#f8d48a" stroke="#0f172a" stroke-width="3"/>` +
    `<text x="${(room.x + 2) * scale}" y="${(room.y + 6) * scale}" font-size="18" font-family="Arial" fill="#0f172a">${escapeXml(room.name)}</text>`
  ));
  const wallLines = plan.walls.map((wall) => (
    `<line x1="${wall.from.x * scale}" y1="${wall.from.y * scale}" x2="${wall.to.x * scale}" y2="${wall.to.y * scale}" stroke="#111827" stroke-width="${wall.type === "external" ? 10 : 6}"/>`
  ));
  const openingMarks = plan.openings.map((opening) => (
    `<circle cx="${opening.x * scale}" cy="${opening.y * scale}" r="${opening.type === "door" ? 14 : 10}" fill="${opening.type === "door" ? "#fb923c" : "#38bdf8"}"/>`
  ));

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
    `<rect width="${width}" height="${height}" fill="#f8fafc"/>`,
    `<text x="30" y="40" font-size="24" font-family="Arial" font-weight="700">${escapeXml(plan.title)}</text>`,
    ...roomRects,
    ...wallLines,
    ...openingMarks,
    "</svg>",
  ].join("");
}

export function exportFloorPlanToDxf(plan: FloorPlanAnalysis): string {
  const lines = [
    "0",
    "SECTION",
    "2",
    "ENTITIES",
  ];

  for (const wall of plan.walls) {
    lines.push(
      "0",
      "LINE",
      "8",
      wall.type === "external" ? "WALLS_EXTERNAL" : "WALLS_INTERNAL",
      "10",
      String(roundTo(wall.from.x * plan.source.metersPerUnit, 3)),
      "20",
      String(roundTo(wall.from.y * plan.source.metersPerUnit, 3)),
      "30",
      "0",
      "11",
      String(roundTo(wall.to.x * plan.source.metersPerUnit, 3)),
      "21",
      String(roundTo(wall.to.y * plan.source.metersPerUnit, 3)),
      "31",
      "0",
    );
  }

  for (const room of plan.rooms) {
    lines.push(
      "0",
      "TEXT",
      "8",
      "ROOM_LABELS",
      "10",
      String(roundTo((room.x + 1) * plan.source.metersPerUnit, 3)),
      "20",
      String(roundTo((room.y + 3) * plan.source.metersPerUnit, 3)),
      "40",
      "0.25",
      "1",
      room.name,
    );
  }

  lines.push("0", "ENDSEC", "0", "EOF");
  return lines.join("\n");
}

function quoteItem(
  id: string,
  category: FloorPlanQuoteItem["category"],
  label: string,
  unit: FloorPlanQuoteItem["unit"],
  quantity: number,
  unitPrice: number,
  confidence: number,
): FloorPlanQuoteItem {
  const roundedQuantity = roundTo(quantity, unit === "cad" || unit === "pz" ? 0 : 1);
  return {
    id,
    category,
    label,
    unit,
    quantity: roundedQuantity,
    unitPrice,
    total: roundTo(roundedQuantity * unitPrice, 2),
    confidence,
  };
}

function estimateFurniturePrice(item: FloorPlanFurniture) {
  const catalogItem = item.catalogItemId ? floorPlanFurnitureCatalog.find((candidate) => candidate.id === item.catalogItemId) : undefined;
  if (catalogItem) return catalogItem.unitPrice;
  if (item.category === "kitchen") return 4200;
  if (item.category === "bathroom") return 1300;
  return Math.max(450, roundTo(item.width * item.height * 18, 2));
}

function buildRoomRenderMaterial(room: FloorPlanRoom, style: FloorPlanCommercialRenderStyle): FloorPlanRenderMaterial {
  const preset = renderStyleMaterialPresets[style];
  const roomText = `${room.name} ${room.usage}`.toLowerCase();
  const wetRoom = roomText.includes("bagno") || roomText.includes("lavanderia") || roomText.includes("tecnico");
  return {
    roomId: room.id,
    roomName: room.name,
    floorLabel: wetRoom ? preset.wetFloor : preset.floor,
    wallLabel: wetRoom && style === "luxury" ? "marmo chiaro a parete con nicchie illuminate" : preset.wall,
    accentLabel: preset.accent,
    floorColor: wetRoom ? preset.wetFloorColor : preset.floorColor,
    wallColor: preset.wallColor,
  };
}

function buildRoomFurnitureLabels(room: FloorPlanRoom): string[] {
  const roomText = `${room.name} ${room.usage}`.toLowerCase();
  if (roomText.includes("bagno")) return ["Mobile bagno", "Doccia walk-in", "Sanitari sospesi", "Specchio retroilluminato"];
  if (roomText.includes("lavanderia") || roomText.includes("tecnico")) return ["Colonna lavatrice asciugatrice", "Mobile contenitore", "Lavatoio tecnico"];
  if (roomText.includes("camera") || roomText.includes("matrimoniale")) return ["Letto tessile", "Comodini", "Armadio a tutta altezza", "Tappeto morbido"];
  if (roomText.includes("studio") || roomText.includes("ufficio")) return ["Scrivania", "Libreria bassa", "Sedia ergonomica", "Lampada da lavoro"];
  if (roomText.includes("disimpegno") || roomText.includes("ingresso")) return ["Consolle slim", "Armadio guardaroba", "Specchio verticale"];
  return ["Divano modulare", "Tavolo pranzo", "Cucina lineare", "Isola snack", "Piante decorative"];
}

function clonePlan(plan: FloorPlanAnalysis): FloorPlanAnalysis {
  return {
    ...plan,
    source: {
      ...plan.source,
      scan: plan.source.scan
        ? {
            ...plan.source.scan,
            dimensions: plan.source.scan.dimensions ? { ...plan.source.scan.dimensions } : undefined,
            issues: plan.source.scan.issues.map((issue) => ({ ...issue })),
            corrections: plan.source.scan.corrections.map((correction) => ({ ...correction })),
            layers: plan.source.scan.layers.map((layer) => ({ ...layer })),
          }
        : undefined,
    },
    calibration: plan.calibration ? { ...plan.calibration } : undefined,
    rooms: plan.rooms.map((room) => ({ ...room })),
    walls: plan.walls.map((wall) => ({ ...wall, from: { ...wall.from }, to: { ...wall.to } })),
    openings: plan.openings.map((opening) => ({ ...opening })),
    furniture: plan.furniture.map((item) => ({ ...item })),
    warnings: [...plan.warnings],
    revisions: plan.revisions.map((revision) => ({ ...revision })),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getScaleRatio(plan: FloorPlanAnalysis) {
  return plan.source.metersPerUnit / DEFAULT_METERS_PER_UNIT;
}

function openingFitsWall(opening: FloorPlanOpening, wall: FloorPlanWall) {
  const distance = pointToSegmentDistance({ x: opening.x, y: opening.y }, wall.from, wall.to);
  if (distance > 0.85) return false;

  const minX = Math.min(wall.from.x, wall.to.x) - opening.width / 2;
  const maxX = Math.max(wall.from.x, wall.to.x) + opening.width / 2;
  const minY = Math.min(wall.from.y, wall.to.y) - opening.width / 2;
  const maxY = Math.max(wall.from.y, wall.to.y) + opening.width / 2;

  return opening.x >= minX && opening.x <= maxX && opening.y >= minY && opening.y <= maxY;
}

function pointToSegmentDistance(point: FloorPlanPoint, from: FloorPlanPoint, to: FloorPlanPoint) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return measureFloorPlanDistance(point, from);

  const t = Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / (dx * dx + dy * dy)));
  return measureFloorPlanDistance(point, { x: from.x + t * dx, y: from.y + t * dy });
}

function findOverlappingRoomPairs(rooms: FloorPlanRoom[]) {
  const pairs: Array<[FloorPlanRoom, FloorPlanRoom]> = [];
  for (let index = 0; index < rooms.length; index += 1) {
    for (let nextIndex = index + 1; nextIndex < rooms.length; nextIndex += 1) {
      const room = rooms[index];
      const other = rooms[nextIndex];
      if (rectanglesOverlap(room, other)) pairs.push([room, other]);
    }
  }
  return pairs;
}

function rectanglesOverlap(room: FloorPlanRoom, other: FloorPlanRoom) {
  const overlapX = Math.min(room.x + room.width, other.x + other.width) - Math.max(room.x, other.x);
  const overlapY = Math.min(room.y + room.height, other.y + other.height) - Math.max(room.y, other.y);
  return overlapX > 0.5 && overlapY > 0.5;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function roundTo(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
