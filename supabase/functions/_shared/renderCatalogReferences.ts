// Catalogo render dell'azienda → immagini di riferimento per il modello.
//
// L'azienda carica in Impostazioni le foto dei SUOI prodotti (mobile bagno,
// WC, piastrella, porta...). Nel wizard ne sceglie fino a 4; qui vengono
// scaricate dal bucket privato, convertite in data URL e restituite con una
// legenda testuale da appendere al prompt, nello stesso formato delle
// reference degli infissi ("<TARGET> — <etichetta>"). Il modello le usa come
// bersaglio di colore/finitura/forma: NON e' un ritaglio incollato, il
// prodotto viene reinterpretato nella prospettiva e nella luce della scena.
import type { ImageReferenceInput } from "./ai-provider/image.ts";

export const RENDER_CATALOG_BUCKET = "render-catalogo";
export const MAX_CATALOG_REFERENCES = 4;
const FETCH_TIMEOUT_MS = 8_000;
const SUPPORTED_MIMETYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Etichetta inglese del bersaglio, per categoria del catalogo. */
export const CATALOG_TARGET_LABELS: Record<string, string> = {
  mobile_bagno: "VANITY UNIT TARGET",
  lavabo: "WASHBASIN TARGET",
  specchio: "MIRROR TARGET",
  wc: "TOILET (WC) TARGET",
  bidet: "BIDET TARGET",
  box_doccia: "SHOWER ENCLOSURE TARGET",
  piatto_doccia: "SHOWER TRAY TARGET",
  soffione: "SHOWER HEAD / COLUMN TARGET",
  vasca: "BATHTUB TARGET",
  rubinetteria: "FAUCET / TAPWARE TARGET",
  piastrella_parete: "WALL TILE TARGET",
  pavimento: "FLOOR TARGET",
  battiscopa: "SKIRTING BOARD TARGET",
  porta_interna: "INTERIOR DOOR TARGET",
  porta_blindata: "ENTRANCE SECURITY DOOR TARGET",
  maniglia: "HANDLE MODEL TARGET",
  finestra: "WINDOW MODEL TARGET",
  tapparella: "ROLLER SHUTTER TARGET",
  persiana: "SHUTTER (PERSIANA) TARGET",
  cassonetto: "SHUTTER BOX TARGET",
  arredo: "FURNITURE TARGET",
  parete: "WALL FINISH TARGET",
  facciata: "FACADE FINISH TARGET",
  tetto: "ROOF COVERING TARGET",
  pergola: "PERGOLA MODEL TARGET",
  piscina: "POOL MODEL TARGET",
  pavimento_esterno: "OUTDOOR FLOOR TARGET",
  giardino: "GARDEN ELEMENT TARGET",
};

export function catalogTargetLabel(categoria: string): string {
  return CATALOG_TARGET_LABELS[categoria] ?? "PRODUCT TARGET";
}

export interface CatalogAssetForLegend {
  categoria: string;
  etichetta: string;
}

/** Etichetta della singola reference, nell'ordine in cui e' allegata. */
export function catalogReferenceLabel(asset: CatalogAssetForLegend): string {
  return `${catalogTargetLabel(asset.categoria)} — ${asset.etichetta.trim().slice(0, 80)} (customer's own catalogue)`;
}

/**
 * Legenda da appendere al prompt DOPO la prosa (come le liste di
 * preservazione): dice al modello cosa sono le immagini allegate e come usarle.
 * Stringa vuota se non ci sono reference.
 */
export function buildCatalogLegend(assets: CatalogAssetForLegend[]): string {
  if (assets.length === 0) return "";
  const righe = assets.map((a, i) => `${i + 1}. ${catalogReferenceLabel(a)}`);
  return [
    "REFERENCE IMAGES ATTACHED — the customer's own product catalogue. Reproduce each product shown (shape, colour, finish, proportions) adapted to the room's perspective and lighting. Do NOT copy the reference photo's background, staging or framing into the scene.",
    ...righe,
  ].join("\n");
}

/** Normalizza gli id scelti nel wizard: solo uuid, senza doppioni, max 4. */
export function normalizeCatalogAssetIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string" || !UUID_RE.test(v)) continue;
    const id = v.toLowerCase();
    if (out.includes(id)) continue;
    out.push(id);
    if (out.length >= MAX_CATALOG_REFERENCES) break;
  }
  return out;
}

interface CatalogAssetRow {
  id: string;
  categoria: string;
  etichetta: string;
  storage_path: string;
  attivo: boolean;
}

/**
 * Sottoinsieme del client Supabase usato qui (service role o utente).
 * `from` e' volutamente lasco: il builder PostgREST e' un thenable con tipi
 * generici profondi che, descritti per esteso, fanno esplodere il checker
 * ("type instantiation is excessively deep").
 */
export interface CatalogSupabaseLike {
  // deno-lint-ignore no-explicit-any
  from(table: string): any;
  storage: {
    from(bucket: string): {
      download(path: string): PromiseLike<{ data: Blob | null; error: { message: string } | null }>;
    };
  };
}

interface QueryResult {
  data: unknown;
  error: { message: string } | null;
}

export interface LoadCatalogReferencesResult {
  references: ImageReferenceInput[];
  legend: string;
  assets: Array<{ id: string; categoria: string; etichetta: string }>;
  missing: Array<{ id: string; reason: string }>;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function mimeFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label}: timeout ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

/**
 * Carica le reference scelte nel wizard. Mai lancia: ogni foto mancante o
 * non leggibile finisce in `missing` e il render prosegue senza di lei.
 * L'ordine di `references` e della legenda e' quello della selezione utente.
 */
export async function loadCatalogReferences(args: {
  supabase: CatalogSupabaseLike;
  companyId: string;
  assetIds: unknown;
  log?: (entry: Record<string, unknown>) => void;
}): Promise<LoadCatalogReferencesResult> {
  const empty: LoadCatalogReferencesResult = { references: [], legend: "", assets: [], missing: [] };
  const ids = normalizeCatalogAssetIds(args.assetIds);
  if (ids.length === 0) return empty;

  let rows: CatalogAssetRow[] = [];
  try {
    const { data, error } = (await args.supabase
      .from("render_catalog_assets")
      .select("id, categoria, etichetta, storage_path, attivo")
      .eq("company_id", args.companyId)
      .in("id", ids)) as QueryResult;
    if (error) throw new Error(error.message);
    rows = (Array.isArray(data) ? data : []) as CatalogAssetRow[];
  } catch (e) {
    args.log?.({ lvl: "warn", msg: "catalog_references_query_failed", error: String((e as Error)?.message ?? e) });
    return { ...empty, missing: ids.map((id) => ({ id, reason: "query_failed" })) };
  }

  const byId = new Map(rows.map((r) => [r.id.toLowerCase(), r]));
  const missing: LoadCatalogReferencesResult["missing"] = [];
  const ordered: CatalogAssetRow[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) { missing.push({ id, reason: "not_found_or_other_company" }); continue; }
    if (!row.attivo) { missing.push({ id, reason: "disabled" }); continue; }
    ordered.push(row);
  }

  const fetched = await Promise.all(ordered.map(async (row): Promise<ImageReferenceInput | null> => {
    try {
      const { data, error } = await withTimeout(
        Promise.resolve(args.supabase.storage.from(RENDER_CATALOG_BUCKET).download(row.storage_path)),
        FETCH_TIMEOUT_MS,
        `download ${row.storage_path}`,
      );
      if (error || !data) throw new Error(error?.message ?? "empty download");
      const mime = (data.type && data.type !== "application/octet-stream" ? data.type : mimeFromPath(row.storage_path)).toLowerCase();
      if (!SUPPORTED_MIMETYPES.includes(mime)) {
        missing.push({ id: row.id, reason: `unsupported_mimetype:${mime}` });
        return null;
      }
      const bytes = new Uint8Array(await data.arrayBuffer());
      if (bytes.length === 0) { missing.push({ id: row.id, reason: "empty_file" }); return null; }
      return { label: catalogReferenceLabel(row), dataUrl: `data:${mime};base64,${uint8ToBase64(bytes)}` };
    } catch (e) {
      missing.push({ id: row.id, reason: `download_failed:${String((e as Error)?.message ?? e).slice(0, 120)}` });
      return null;
    }
  }));

  const okRows = ordered.filter((_, i) => fetched[i] !== null);
  const references = fetched.filter((r): r is ImageReferenceInput => r !== null);
  args.log?.({
    lvl: "info", msg: "catalog_references_loaded",
    requested: ids.length, loaded: references.length, missing: missing.length,
    categorie: okRows.map((r) => r.categoria),
  });
  return {
    references,
    legend: buildCatalogLegend(okRows),
    assets: okRows.map((r) => ({ id: r.id, categoria: r.categoria, etichetta: r.etichetta })),
    missing,
  };
}
