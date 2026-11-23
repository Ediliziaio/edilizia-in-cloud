import type { LuceRenderLocale, QualitaRenderLocale } from "../../../shared/planimetrie/renderLocale";
import { soleIndicativo } from "../../../shared/planimetrie/orientamento";
import { esportaGlbConFiniture } from "./esportaGlbConFiniture";
import type { CampioneGlb } from "./tred/esporta";
import type { Scena3D, Telecamera3D } from "./tred";
import { chiamaMotoreOnline, motoreOnlineAttivo } from "./motoreOnline";

/**
 * Il render fotorealistico si può chiedere. Tre motori, in quest'ordine:
 *   1. Blender sul Mac di sviluppo (plugin di Vite);
 *   2. il motore online su server, se acceso (VITE_PLANIMETRIE_MOTORE_ONLINE, 1 credito render);
 *   3. il path tracing nel browser di chi lo chiede: gratis, serve WebGL2 (23/11/2026).
 */
export function fotorealisticoDisponibile() {
  return fotorealisticoLocaleDisponibile() || motoreOnlineAttivo() || pathTracingDisponibile();
}

/** Come si chiama, per chi lo usa, il motore che calcolerà il render, e quanto costa. */
export function descrizioneMotoreFotorealistico(): string {
  if (fotorealisticoLocaleDisponibile()) return "Blender sul computer di sviluppo · 0 crediti";
  if (motoreOnlineAttivo()) return "Render HD sul server · 1 credito render";
  return "Calcolato dalla scheda grafica di questo computer · 0 crediti";
}

let webgl2: boolean | undefined;
/** La scheda grafica può fare path tracing (WebGL2 con colori in virgola mobile). */
export function pathTracingDisponibile(): boolean {
  if (webgl2 !== undefined) return webgl2;
  if (typeof document === "undefined") return false;
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    webgl2 = !!gl && !!gl.getExtension("EXT_color_buffer_float");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webgl2 = false;
  }
  return webgl2;
}

export function fotorealisticoLocaleDisponibile() {
  return import.meta.env.DEV && import.meta.env.VITE_PLANIMETRIE_CYCLES_LOCALE === "1"
    && typeof location !== "undefined" && ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
}

function attendiTurno(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const annulla = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", annulla);
      resolve();
    }, ms);
    signal.addEventListener("abort", annulla, { once: true });
  });
}

export async function renderFotorealisticoLocale(scena: Scena3D, inquadratura: {
  telecamera: Telecamera3D;
  larghezza: number;
  altezza: number;
  ambiente: "sport" | "facciata" | "tecnico" | "interni";
  luce?: LuceRenderLocale;
  qualita?: QualitaRenderLocale;
  alberi?: boolean;
  ora?: number;
}, signal: AbortSignal, campioni?: ReadonlyMap<string, CampioneGlb>, opzioni: { companyId?: string | null; onAvanzamento?: (frazione: number) => void } = {}) {
  const locale = fotorealisticoLocaleDisponibile();
  if (!locale && !motoreOnlineAttivo()) {
    if (!pathTracingDisponibile()) throw new Error("Questo browser non può calcolare il render fotorealistico: prova da un computer con Chrome, Edge o Safari aggiornati.");
    const { renderFotorealisticoBrowser } = await import("@/components/planimetrie/tred/renderBrowser");
    return renderFotorealisticoBrowser(scena, inquadratura, signal, opzioni.onAvanzamento);
  }
  const glb = await esportaGlbConFiniture(scena, campioni);
  const body = new Uint8Array(glb).buffer;
  const sole = scena.nord === undefined ? undefined : soleIndicativo(
    inquadratura.ora ?? (inquadratura.luce === "sera" ? 18.5 : 13), scena.nord,
  ).direzione;
  const headers = { "Content-Type": "model/gltf-binary", "X-Planimetria-Render": JSON.stringify({ ...inquadratura, sole }) };
  // Online: 1 credito render a vista, restituito se il calcolo non riesce.
  if (!locale) {
    const online = await chiamaMotoreOnline(opzioni.companyId, "render", "/render", { body, headers, signal });
    if (!online.ok || !online.headers.get("content-type")?.includes("image/png")) {
      const errore = await online.json().catch((): null => null) as { error?: unknown } | null;
      throw new Error(typeof errore?.error === "string" ? errore.error : "Render fotorealistico non riuscito.");
    }
    return online.blob();
  }
  const invia = () => fetch("/__planimetrie/render-fotorealistico", { method: "POST", signal, body, headers });
  let risposta = await invia();
  for (let tentativo = 1; risposta.status === 429 && tentativo <= 16; tentativo++) {
    await risposta.body?.cancel();
    await attendiTurno(Math.min(12_000, tentativo * 2500), signal);
    risposta = await invia();
  }
  if (!risposta.ok || !risposta.headers.get("content-type")?.includes("image/png")) {
    const errore = await risposta.json().catch((): null => null) as { error?: unknown } | null;
    throw new Error(typeof errore?.error === "string" ? errore.error : "Render fotorealistico locale non disponibile.");
  }
  return risposta.blob();
}
