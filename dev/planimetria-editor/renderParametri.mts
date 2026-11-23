/**
 * Controlli di una richiesta di render Cycles, comuni al plugin locale
 * (`renderFotorealisticoPlugin.mts`) e al motore online
 * (`services/planimetria-motore/server.mts`), 23/11/2026.
 */
import { LUCI_RENDER_LOCALE, QUALITA_RENDER_LOCALE, RISOLUZIONE_RENDER_LOCALE, type QualitaRenderLocale } from "../../shared/planimetrie/renderLocale.ts";

export const MAX_GLB = 24 * 1024 * 1024;

export function leggiParametri(valore: string | string[] | undefined | null) {
  const d = typeof valore === "string" && valore.length < 2000 ? JSON.parse(valore) : null;
  const vettore = (v: unknown) => Array.isArray(v) && v.length === 3 && v.every(n => Number.isFinite(n) && Math.abs(n) < 50000);
  const luce = d?.luce ?? "giorno", qualita: QualitaRenderLocale = d?.qualita ?? "rapida", alberi = d?.alberi ?? true;
  if (!LUCI_RENDER_LOCALE.includes(luce) || !QUALITA_RENDER_LOCALE.includes(qualita) || typeof alberi !== "boolean") return null;
  const limite = d?.qualita == null ? 1600 : RISOLUZIONE_RENDER_LOCALE[qualita];
  const dimensione = (v: number) => Number.isInteger(v) && v >= 320 && v <= limite;
  const t = d?.telecamera;
  const sole = d?.sole;
  if (!t || !vettore(t.posizione) || !vettore(t.guarda) || (t.alto && !vettore(t.alto))
    || !Number.isFinite(t.fov) || t.fov < 15 || t.fov > 115
    || !dimensione(d.larghezza) || !dimensione(d.altezza) || !["sport", "facciata", "tecnico", "interni"].includes(d.ambiente)) return null;
  if (sole !== undefined && (!vettore(sole) || sole[1] <= 0 || Math.abs(Math.hypot(...sole) - 1) > .01)) return null;
  return { telecamera: t, larghezza: d.larghezza as number, altezza: d.altezza as number, ambiente: d.ambiente as string, luce, qualita, alberi, sole };
}

export type ParametriRender = NonNullable<ReturnType<typeof leggiParametri>>;

/** Un GLB 2.0 con tutta la geometria dentro: niente URI esterni da seguire. */
export function glbAutonomo(glb: Buffer) {
  if (glb.length < 24 || glb.readUInt32LE(0) !== 0x46546c67 || glb.readUInt32LE(4) !== 2
    || glb.readUInt32LE(8) !== glb.length || glb.readUInt32LE(16) !== 0x4e4f534a) return false;
  const fineJson = 20 + glb.readUInt32LE(12);
  if (fineJson > glb.length) return false;
  try {
    const dati = JSON.parse(glb.toString("utf8", 20, fineJson));
    return Array.isArray(dati.meshes) && dati.meshes.length > 0
      && [dati.buffers, dati.images].every(lista => !lista || (Array.isArray(lista) && lista.every(item => !("uri" in item))));
  } catch { return false; }
}

/** Tempo massimo del calcolo: l'alta qualità ha più campioni. */
export const tempoMassimoMs = (p: Pick<ParametriRender, "qualita">) => p.qualita === "alta" ? 380_000 : 245_000;
