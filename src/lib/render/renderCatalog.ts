/**
 * Catalogo render per azienda: foto dei prodotti dell'azienda usate come
 * immagini di riferimento nei render (max 4 per render). Tabella
 * render_catalog_assets + bucket privato render-catalogo (`<company>/<uuid>.<ext>`).
 */
import { supabase } from "@/integrations/supabase/client";

export const RENDER_CATALOG_BUCKET = "render-catalogo";
export const MAX_CATALOG_REFERENCES = 4;

export type RenderCatalogVerticale = "bagno" | "pavimento" | "porte" | "infissi" | "stanza" | "esterni";

export interface RenderCatalogCategoria {
  value: string;
  label: string;
}

export interface RenderCatalogVerticaleDef {
  value: RenderCatalogVerticale;
  label: string;
  categorie: RenderCatalogCategoria[];
}

export const RENDER_CATALOG_VERTICALI: RenderCatalogVerticaleDef[] = [
  {
    value: "bagno",
    label: "Bagno",
    categorie: [
      { value: "mobile_bagno", label: "Mobile bagno" },
      { value: "lavabo", label: "Lavabo" },
      { value: "specchio", label: "Specchio" },
      { value: "wc", label: "WC" },
      { value: "bidet", label: "Bidet" },
      { value: "box_doccia", label: "Box doccia" },
      { value: "piatto_doccia", label: "Piatto doccia" },
      { value: "soffione", label: "Soffione / colonna" },
      { value: "vasca", label: "Vasca" },
      { value: "rubinetteria", label: "Rubinetteria" },
      { value: "piastrella_parete", label: "Piastrella parete" },
      { value: "pavimento", label: "Pavimento" },
    ],
  },
  {
    value: "pavimento",
    label: "Pavimenti",
    categorie: [
      { value: "pavimento", label: "Pavimento" },
      { value: "battiscopa", label: "Battiscopa" },
    ],
  },
  {
    value: "porte",
    label: "Porte",
    categorie: [
      { value: "porta_interna", label: "Porta interna" },
      { value: "porta_blindata", label: "Porta blindata" },
      { value: "maniglia", label: "Maniglia" },
    ],
  },
  {
    value: "infissi",
    label: "Infissi",
    categorie: [
      { value: "finestra", label: "Finestra / profilo" },
      { value: "maniglia", label: "Maniglia" },
      { value: "tapparella", label: "Tapparella" },
      { value: "persiana", label: "Persiana" },
      { value: "cassonetto", label: "Cassonetto" },
    ],
  },
  {
    value: "stanza",
    label: "Stanze",
    categorie: [
      { value: "arredo", label: "Arredo" },
      { value: "pavimento", label: "Pavimento" },
      { value: "parete", label: "Finitura parete" },
    ],
  },
  {
    value: "esterni",
    label: "Esterni",
    categorie: [
      { value: "facciata", label: "Facciata" },
      { value: "tetto", label: "Tetto" },
      { value: "pergola", label: "Pergola" },
      { value: "piscina", label: "Piscina" },
      { value: "pavimento_esterno", label: "Pavimento esterno" },
      { value: "giardino", label: "Giardino" },
    ],
  },
];

export function categoriaLabel(verticale: string, categoria: string): string {
  const v = RENDER_CATALOG_VERTICALI.find((x) => x.value === verticale);
  return v?.categorie.find((c) => c.value === categoria)?.label ?? categoria;
}

export interface RenderCatalogAsset {
  id: string;
  company_id: string;
  verticale: RenderCatalogVerticale;
  categoria: string;
  etichetta: string;
  descrizione: string | null;
  storage_path: string;
  larghezza: number | null;
  altezza: number | null;
  bytes: number | null;
  attivo: boolean;
  created_at: string;
}

/**
 * Aggiunge/toglie un id dalla selezione, rispettando il massimo. Se il
 * massimo e' raggiunto e l'id non e' selezionato, la selezione non cambia.
 * Puro: nessun effetto collaterale, l'ordine di selezione e' preservato.
 */
export function toggleCatalogSelection(ids: readonly string[], id: string, max = MAX_CATALOG_REFERENCES): string[] {
  if (ids.includes(id)) return ids.filter((x) => x !== id);
  if (ids.length >= max) return [...ids];
  return [...ids, id];
}

export async function listRenderCatalogAssets(
  companyId: string,
  opts?: { verticale?: RenderCatalogVerticale; includeInactive?: boolean },
): Promise<RenderCatalogAsset[]> {
  let q = supabase
    .from("render_catalog_assets")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  if (opts?.verticale) q = q.eq("verticale", opts.verticale);
  if (!opts?.includeInactive) q = q.eq("attivo", true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as RenderCatalogAsset[];
}

/** URL firmati (bucket privato) per le miniature: path → url. */
export async function signRenderCatalogUrls(paths: string[], expiresIn = 3600): Promise<Record<string, string>> {
  const unique = Array.from(new Set(paths.filter(Boolean)));
  if (unique.length === 0) return {};
  const { data, error } = await supabase.storage.from(RENDER_CATALOG_BUCKET).createSignedUrls(unique, expiresIn);
  if (error || !data) return {};
  const out: Record<string, string> = {};
  for (const row of data) {
    if (row.path && row.signedUrl && !row.error) out[row.path] = row.signedUrl;
  }
  return out;
}

function readImageSize(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(url); };
    img.onerror = () => { resolve(null); URL.revokeObjectURL(url); };
    img.src = url;
  });
}

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const RENDER_CATALOG_ACCEPT = ACCEPTED_TYPES.join(",");
export const RENDER_CATALOG_MAX_BYTES = 10 * 1024 * 1024;

export async function uploadRenderCatalogAsset(args: {
  companyId: string;
  userId: string;
  file: File;
  verticale: RenderCatalogVerticale;
  categoria: string;
  etichetta: string;
  descrizione?: string;
}): Promise<RenderCatalogAsset> {
  const { file } = args;
  if (!ACCEPTED_TYPES.includes(file.type)) throw new Error("Formato non supportato: usa JPG, PNG o WebP");
  if (file.size > RENDER_CATALOG_MAX_BYTES) throw new Error("File troppo grande (max 10 MB)");
  const etichetta = args.etichetta.trim();
  if (!etichetta) throw new Error("Inserisci un'etichetta per la foto");
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${args.companyId}/${crypto.randomUUID()}.${ext}`;
  const size = await readImageSize(file);
  const up = await supabase.storage.from(RENDER_CATALOG_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) throw new Error(`Upload fallito: ${up.error.message}`);
  const { data, error } = await supabase
    .from("render_catalog_assets")
    .insert({
      company_id: args.companyId,
      created_by: args.userId,
      verticale: args.verticale,
      categoria: args.categoria,
      etichetta: etichetta.slice(0, 120),
      descrizione: args.descrizione?.trim() || null,
      storage_path: path,
      larghezza: size?.width ?? null,
      altezza: size?.height ?? null,
      bytes: file.size,
    })
    .select("*")
    .single();
  if (error || !data) {
    await supabase.storage.from(RENDER_CATALOG_BUCKET).remove([path]);
    throw new Error(error?.message ?? "Salvataggio fallito");
  }
  return data as RenderCatalogAsset;
}

export async function updateRenderCatalogAsset(
  id: string,
  patch: Partial<Pick<RenderCatalogAsset, "etichetta" | "descrizione" | "categoria" | "verticale" | "attivo">>,
): Promise<void> {
  const { error } = await supabase.from("render_catalog_assets").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteRenderCatalogAsset(asset: Pick<RenderCatalogAsset, "id" | "storage_path">): Promise<void> {
  const { error } = await supabase.from("render_catalog_assets").delete().eq("id", asset.id);
  if (error) throw new Error(error.message);
  await supabase.storage.from(RENDER_CATALOG_BUCKET).remove([asset.storage_path]);
}
