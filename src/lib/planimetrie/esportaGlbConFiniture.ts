import { FOTO_FINITURE } from "./fotoFiniture";
import { esportaGlb, type CampioneGlb } from "./tred/esporta";
import type { Scena3D } from "./tred/tipi";
import { CANALI_PBR, chiaveMappaPbr, urlMappaPbr } from "./tred/campioniPbr";

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
  const scena = base.mesh.some(m => m.auto) ? await (await import("./tred/modelliAuto")).scenaConModelliAuto(base) : base;
  const trame = new Set(scena.mesh.flatMap(m => {
    const trama = scena.materiali[m.materiale]?.tessitura?.trama;
    return trama ? [trama] : [];
  }));
  const letti = await Promise.all([...trame].flatMap(trama => CANALI_PBR.flatMap(canale => {
    const percorso = urlMappaPbr(trama, canale);
    const url = percorso ? import.meta.env.BASE_URL + percorso : canale === "colore" ? FOTO_FINITURE[trama] : undefined;
    const chiave = chiaveMappaPbr(trama, canale);
    if (!url || aggiuntivi.has(chiave)) return [];
    const mimeType = percorso ? canale === "rugosita" ? "image/png" : "image/jpeg" : undefined;
    return [caricaCampione(url, mimeType).then(campione => [chiave, campione] as const).catch((): null => null)];
  })));
  return esportaGlb(scena, new Map([
    ...letti.filter(campione => campione !== null),
    ...aggiuntivi,
  ]));
}
