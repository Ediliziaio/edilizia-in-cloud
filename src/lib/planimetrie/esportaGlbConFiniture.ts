import { FOTO_FINITURE } from "./fotoFiniture";
import { esportaGlb, type CampioneGlb } from "./tred/esporta";
import type { Scena3D } from "./tred/tipi";
import { CANALI_PBR, chiaveMappaPbr, urlMappaPbr } from "./tred/campioniPbr";
import { eTramaGenerata, generaTrama } from "./tred/trameGenerate";

async function campioneGenerato(trama: string, canale: typeof CANALI_PBR[number]): Promise<CampioneGlb> {
  const mappe = generaTrama(trama, 1024)!;
  const tela = document.createElement("canvas");
  tela.width = tela.height = mappe.lato;
  const ctx = tela.getContext("2d");
  if (!ctx) throw new Error("Impossibile preparare la texture");
  const dati = ctx.createImageData(mappe.lato, mappe.lato);
  dati.data.set(mappe[canale]);
  ctx.putImageData(dati, 0, 0);
  if (canale !== "rugosita") return campioneDaTela(tela);
  const png = await new Promise<Blob | null>(ok => tela.toBlob(ok, "image/png"));
  if (!png) throw new Error("Impossibile esportare la texture");
  return { dati: new Uint8Array(await png.arrayBuffer()), mimeType: "image/png" };
}

const campioni = new Map<string, Promise<CampioneGlb>>();

export async function campioneDaTela(tela: HTMLCanvasElement): Promise<CampioneGlb> {
  // GLB di base ammette JPEG e PNG. Il campione incorporato si apre offline.
  const jpeg = await new Promise<Blob | null>(ok => tela.toBlob(ok, "image/jpeg", .92));
  if (!jpeg) throw new Error("Impossibile esportare la texture");
  return { dati: new Uint8Array(await jpeg.arrayBuffer()), mimeType: "image/jpeg" };
}

function caricaCampione(url: string, mimeType?: CampioneGlb["mimeType"]) {
  const presente = campioni.get(url);
  if (presente) return presente;
  const caricato = (async (): Promise<CampioneGlb> => {
    const risposta = await fetch(url);
    if (!risposta.ok) throw new Error("Campione non disponibile");
    if (mimeType) return { dati: new Uint8Array(await risposta.arrayBuffer()), mimeType };
    const bitmap = await createImageBitmap(await risposta.blob());
    try {
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Impossibile preparare la texture");
      ctx.drawImage(bitmap, 0, 0);
      return await campioneDaTela(canvas);
    } finally {
      bitmap.close();
    }
  })().catch((err: unknown) => { campioni.delete(url); throw err; });
  campioni.set(url, caricato);
  return caricato;
}

export async function esportaGlbConFiniture(base: Scena3D, aggiuntivi: ReadonlyMap<string, CampioneGlb> = new Map()) {
  const scena = base.mesh.some(m => m.auto || m.arredoCatalogo)
    ? await (await import("./tred/modelliDettagliati")).scenaConModelliDettagliati(base) : base;
  const trame = new Set(scena.mesh.flatMap(m => {
    const trama = scena.materiali[m.materiale]?.tessitura?.trama;
    return trama ? [trama] : [];
  }));
  const letti = await Promise.all([...trame].flatMap(trama => CANALI_PBR.flatMap(canale => {
    const percorso = urlMappaPbr(trama, canale);
    const url = percorso ? import.meta.env.BASE_URL + percorso : canale === "colore" ? FOTO_FINITURE[trama] : undefined;
    const chiave = chiaveMappaPbr(trama, canale);
    if (eTramaGenerata(trama)) return aggiuntivi.has(chiave) ? [] : [campioneGenerato(trama, canale).then(campione => [chiave, campione] as const).catch((): null => null)];
    if (!url || aggiuntivi.has(chiave)) return [];
    const mimeType = percorso ? canale === "rugosita" ? "image/png" : "image/jpeg" : undefined;
    return [caricaCampione(url, mimeType).then(campione => [chiave, campione] as const).catch((): null => null)];
  })));
  return esportaGlb(scena, new Map([
    ...letti.filter(campione => campione !== null),
    ...aggiuntivi,
  ]));
}
