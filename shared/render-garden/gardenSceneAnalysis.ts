import type {
  ConfigurazioneGiardino,
  GardenImageOrientation,
  GardenPhotoMeta,
  GardenSceneAnalysis,
} from "./types.ts";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function list(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : fallback;
}

function orientation(meta?: GardenPhotoMeta | null): GardenImageOrientation {
  if (meta?.orientation) return meta.orientation;
  if (!meta?.width || !meta.height) return "unknown";
  if (meta.width > meta.height) return "landscape";
  if (meta.width < meta.height) return "portrait";
  return "square";
}

export function normalizeGardenSceneAnalysis(
  config: ConfigurazioneGiardino,
  rawAnalysis?: unknown,
  photoMeta?: GardenPhotoMeta | null,
): GardenSceneAnalysis {
  const raw = asRecord(rawAnalysis);
  const hasPool = config.target_zones.includes("bordo_piscina") || config.interventi.includes("bordo_piscina_verde");
  const hasPergola = config.target_zones.includes("area_relax") || config.interventi.includes("upgrade_area_relax");

  return {
    version: "1.0",
    outdoorSpaceType: text(raw.outdoorSpaceType ?? raw.tipo_spazio_esterno, "residential garden / private outdoor area inferred from the photo"),
    apparentSize: text(raw.apparentSize ?? raw.dimensione_apparente, "infer apparent size and planting capacity from the uploaded photo"),
    houseRelation: text(raw.houseRelation ?? raw.rapporto_con_casa, "garden connected to the same photographed house/facade; preserve all openings and architecture"),
    existingLawn: text(raw.existingLawn ?? raw.prato_esistente, "existing lawn / grass / green area as photographed"),
    bareSoilOrMineralSurfaces: text(raw.bareSoilOrMineralSurfaces ?? raw.superfici_minerali, "existing bare soil, gravel or mineral surfaces if visible"),
    patioDeckHardscape: text(raw.patioDeckHardscape ?? raw.hardscape, "existing patio, deck, paving and hardscape remain unless targeted"),
    pool: text(raw.pool ?? raw.piscina, hasPool ? "pool is present or poolside zone is in scope; preserve basin and water unless targeted" : "no pool target; preserve any visible pool exactly"),
    pergola: text(raw.pergola ?? raw.pergola_presente, hasPergola ? "pergola/relax structure may be present; preserve structure unless targeted" : "no pergola target; preserve any visible pergola exactly"),
    fencesWallsBorders: text(raw.fencesWallsBorders ?? raw.recizioni_muri_bordi, "existing fences, walls, boundaries and borders as photographed"),
    existingTrees: text(raw.existingTrees ?? raw.alberi_esistenti, "existing significant trees as photographed"),
    existingShrubsHedgesBeds: text(raw.existingShrubsHedgesBeds ?? raw.arbusti_siepi_aiuole, "existing shrubs, hedges and beds as photographed"),
    existingPaths: text(raw.existingPaths ?? raw.camminamenti_esistenti, "existing paths and access routes as photographed"),
    outdoorFurniture: text(raw.outdoorFurniture ?? raw.arredi_esterni, "existing outdoor furniture and objects as photographed"),
    lightAndShadows: text(raw.lightAndShadows ?? raw.luce_ombre, "preserve original outdoor light direction, shadows and contact occlusion"),
    circulationFlows: text(raw.circulationFlows ?? raw.flussi_passaggio, "keep practical walking routes to doors, gates, pool, patio and relax areas"),
    mainViewCorridors: text(raw.mainViewCorridors ?? raw.visuali_principali, "preserve important views toward facade, pool, patio and garden depth"),
    emptyZones: list(raw.emptyZones ?? raw.zone_vuote, ["empty or weak garden zones suitable for softscape upgrade if selected"]),
    untouchableElements: list(raw.untouchableElements ?? raw.elementi_intoccabili, [
      "house facade",
      "windows and doors",
      "non-target pool/pergola/hardscape",
      "fences and walls",
      "significant existing trees unless targeted",
    ]),
    contextToPreserve: list(raw.contextToPreserve ?? raw.contesto_da_preservare, [
      "sky",
      "neighboring buildings",
      "street / driveway context",
      "non-target garden zones",
      "image dimensions and perspective",
    ]),
    imageOrientation: orientation(photoMeta),
  };
}
