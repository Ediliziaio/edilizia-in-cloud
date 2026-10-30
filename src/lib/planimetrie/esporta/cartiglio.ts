/**
 * I dati del cartiglio dall'azienda: nome e recapiti da `companies`, logo e
 * colore da `company_branding`. Qui non si legge il database: chi chiama passa
 * le righe che ha già (l'app le ha in memoria con `useBranding` e il contesto).
 */
import type { DatiCartiglio, LogoCartiglio } from "./tipi";

export interface BrandingPerCartiglio {
  logo_url?: string | null;
  primary_color?: string | null;
}

/** I campi di `companies` che servono. */
export interface AziendaPerCartiglio {
  name?: string | null;
  legal_address?: string | null;
  legal_postal_code?: string | null;
  legal_city?: string | null;
  legal_province?: string | null;
  vat_number?: string | null;
  phone?: string | null;
  email?: string | null;
}

export function aziendaDelCartiglio(
  azienda: AziendaPerCartiglio,
  branding?: BrandingPerCartiglio | null,
  logo?: LogoCartiglio | null,
): DatiCartiglio["azienda"] {
  const citta = [azienda.legal_postal_code, azienda.legal_city, azienda.legal_province && `(${azienda.legal_province})`]
    .filter((x) => x && x.trim()).join(" ");
  const indirizzo = [azienda.legal_address, citta].filter((x) => x && x.trim()).join(", ");
  return {
    nome: (azienda.name ?? "").trim() || "Impresa",
    indirizzo: indirizzo || undefined,
    partitaIva: azienda.vat_number?.trim() || undefined,
    telefono: azienda.phone?.trim() || undefined,
    email: azienda.email?.trim() || undefined,
    colore: branding?.primary_color ?? null,
    logo: logo ?? null,
  };
}

/** PNG o JPG dai primi byte; il resto (WEBP, SVG) il PDF non lo sa incorporare. */
export function tipoImmagine(dati: Uint8Array): LogoCartiglio["tipo"] | null {
  if (dati[0] === 0x89 && dati[1] === 0x50 && dati[2] === 0x4e && dati[3] === 0x47) return "png";
  if (dati[0] === 0xff && dati[1] === 0xd8) return "jpg";
  return null;
}

/**
 * Scarica il logo per il cartiglio, con un tempo massimo. Nel browser un logo
 * WEBP o SVG passa da un canvas e diventa PNG; se non arriva si va avanti senza.
 */
export async function caricaLogo(url: string | null | undefined, msMassimi = 6000): Promise<LogoCartiglio | null> {
  if (!url) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), msMassimi);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) return null;
    const dati = new Uint8Array(await r.arrayBuffer());
    const tipo = tipoImmagine(dati);
    if (tipo) return { dati, tipo };
    if (typeof document === "undefined") return null;
    const png = await inPng(new Blob([dati], { type: r.headers.get("content-type") ?? "image/webp" }));
    return png ? { dati: png, tipo: "png" } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function inPng(blob: Blob): Promise<Uint8Array | null> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((ok, ko) => {
      img.onload = () => ok();
      img.onerror = () => ko(new Error("logo"));
      img.src = url;
    });
    const lato = 600;
    const k = Math.min(1, lato / Math.max(img.naturalWidth || lato, img.naturalHeight || lato));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round((img.naturalWidth || lato) * k));
    canvas.height = Math.max(1, Math.round((img.naturalHeight || lato) * k));
    canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/png"));
    return png ? new Uint8Array(await png.arrayBuffer()) : null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
