import type { LuceRenderLocale, QualitaRenderLocale } from "../../../shared/planimetrie/renderLocale";
import { soleIndicativo } from "../../../shared/planimetrie/orientamento";
import { esportaGlbConFiniture } from "./esportaGlbConFiniture";
import type { CampioneGlb } from "./tred/esporta";
import type { Scena3D, Telecamera3D } from "./tred";

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
}, signal: AbortSignal, campioni?: ReadonlyMap<string, CampioneGlb>) {
  if (!fotorealisticoLocaleDisponibile()) throw new Error("Il render Cycles è disponibile nell’ambiente locale con Blender.");
  const glb = await esportaGlbConFiniture(scena, campioni);
  const body = new Uint8Array(glb).buffer;
  const sole = scena.nord === undefined ? undefined : soleIndicativo(
    inquadratura.ora ?? (inquadratura.luce === "sera" ? 18.5 : 13), scena.nord,
  ).direzione;
  const invia = () => fetch("/__planimetrie/render-fotorealistico", {
    method: "POST", signal, body,
    headers: { "Content-Type": "model/gltf-binary", "X-Planimetria-Render": JSON.stringify({ ...inquadratura, sole }) },
  });
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
