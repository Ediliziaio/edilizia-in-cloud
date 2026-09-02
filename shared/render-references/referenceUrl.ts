/**
 * URL pubblico delle foto di riferimento in public/render-references/.
 * Stessa risoluzione della base URL usata dagli infissi (catalog.ts):
 * VITE_RENDER_REFERENCES_BASE_URL (frontend) → RENDER_REFERENCES_BASE_URL /
 * SITE_URL (edge) → dominio Cloudflare Pages di produzione.
 */
type ViteImportMeta = { env?: { VITE_RENDER_REFERENCES_BASE_URL?: string } };
type DenoGlobal = { Deno?: { env: { get: (key: string) => string | undefined } } };

export function getRenderReferencesBaseUrl(): string {
  const meta = (typeof import.meta !== "undefined" ? import.meta : undefined) as
    | (ImportMeta & ViteImportMeta)
    | undefined;
  if (meta?.env?.VITE_RENDER_REFERENCES_BASE_URL) return meta.env.VITE_RENDER_REFERENCES_BASE_URL;
  const deno = (globalThis as unknown as DenoGlobal).Deno;
  if (deno) {
    const envUrl = deno.env.get("RENDER_REFERENCES_BASE_URL");
    if (envUrl) return envUrl;
    const siteUrl = deno.env.get("SITE_URL");
    if (siteUrl) return `${siteUrl.replace(/\/+$/, "")}/render-references`;
    return "https://edilizia-in-cloud.pages.dev/render-references";
  }
  return "/render-references";
}

/** Immagine di riferimento pronta per l'edge: etichetta + URL pubblico. */
export interface SharedReferenceImage {
  /** Ruolo per il modello, es. "SHUTTER MODEL TARGET — persiana veneziana in legno". */
  label: string;
  /** Cartella in public/render-references (shutters, roofs, profiles, ...). */
  folder: string;
  filename: string;
  url: string;
}

export function makeReferenceImage(folder: string, filename: string, label: string): SharedReferenceImage {
  const base = getRenderReferencesBaseUrl().replace(/\/+$/, "");
  return { label, folder, filename, url: `${base}/${folder}/${encodeURIComponent(filename)}` };
}
