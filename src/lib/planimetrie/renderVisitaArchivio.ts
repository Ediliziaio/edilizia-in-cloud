import { createStore, get, update } from "idb-keyval";
import { fotorealisticoLocaleDisponibile } from "./renderFotorealisticoLocale";
import type { RiscontroRenderLocale } from "./riscontroRenderLocale";
import type { Telecamera3D } from "./tred/tipi";

export type VersioneRenderVisita = { planimetriaId: string; ambito: string; versione: number; serie?: "stanze" | "dettagli" };
export type RenderVisitaSalvato = {
  id: string; nome: string; piano: string; data: string; anteprima: Blob; render: Blob;
  riscontri?: RiscontroRenderLocale[];
  telecamera?: Telecamera3D;
  localeCamera?: string;
};

const archivio = createStore("eic-render-visita", "viste");
const chiave = (v: VersioneRenderVisita) => `${v.planimetriaId}/${v.ambito}/${v.versione}${v.serie ? "/" + v.serie + "/1" : ""}`;

export async function salvaRenderVisita(v: VersioneRenderVisita, immagine: RenderVisitaSalvato) {
  await update<RenderVisitaSalvato[]>(chiave(v), precedenti =>
    [immagine, ...(precedenti ?? []).filter(r => r.id !== immagine.id)], archivio);
}

export async function leggiRenderVisita(v: VersioneRenderVisita) {
  if (!fotorealisticoLocaleDisponibile()) return [];
  return (await get<RenderVisitaSalvato[]>(chiave(v), archivio)) ?? [];
}

export { leggiRenderVisita as renderVisitaPerFascicolo };

export type StanzaDaInquadrare = { planimetriaId: string; livelloId: string; localeId: string };
export type InquadraturaSalvata = { id: string; nome: string; telecamera: Telecamera3D; proporzioni: number };
const chiaveInquadrature = (stanza: StanzaDaInquadrare) =>
  `inquadrature:${JSON.stringify([stanza.planimetriaId, stanza.livelloId, stanza.localeId])}`;

export async function leggiInquadrature(stanza: StanzaDaInquadrare) {
  return (await get<InquadraturaSalvata[]>(chiaveInquadrature(stanza), archivio)) ?? [];
}

export function salvaInquadratura(stanza: StanzaDaInquadrare, vista: InquadraturaSalvata) {
  return update<InquadraturaSalvata[]>(chiaveInquadrature(stanza), precedenti =>
    [vista, ...(precedenti ?? []).filter(v => v.id !== vista.id)], archivio);
}

export function eliminaInquadratura(stanza: StanzaDaInquadrare, id: string) {
  return update<InquadraturaSalvata[]>(chiaveInquadrature(stanza), precedenti =>
    (precedenti ?? []).filter(v => v.id !== id), archivio);
}
