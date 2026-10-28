import { get, set, setMany } from "idb-keyval";
import type { AllegatoComputo } from "./editorNativo";

export interface AllegatoPdfComputo { nome: string; tipo: AllegatoComputo["tipo"]; blob: Blob }
const key = (scope: string, id: string) => `computo-allegato:${scope}:${id}`;

export async function caricaAllegatoLocale(scope: string, file: File, tipo: AllegatoComputo["tipo"]): Promise<AllegatoComputo> {
  if (!["image/jpeg", "image/png", "application/pdf"].includes(file.type)) throw new Error("Formato non supportato: usa JPG, PNG o PDF.");
  if (!file.size || file.size > 20 * 1024 * 1024) throw new Error("Ogni allegato deve essere compreso tra 1 byte e 20 MB.");
  const meta: AllegatoComputo = { id: crypto.randomUUID(), nome: file.name.slice(0, 300), tipo, mime: file.type as AllegatoComputo["mime"], dimensione: file.size, includi: true };
  await set(key(scope, meta.id), new Blob([file], { type: file.type }));
  return meta;
}

export async function leggiAllegatoLocale(scope: string, id: string): Promise<Blob | null> {
  return (await get<Blob>(key(scope, id))) ?? null;
}

export async function salvaAllegatiRipristinati(scope: string, allegati: { id: string; blob: Blob }[]): Promise<void> {
  // Una sola transazione: un errore di spazio non lascia un ripristino parziale.
  await setMany(allegati.map(a => [key(scope, a.id), a.blob]));
}

export async function allegatiDaIncludere(scope: string, allegati: AllegatoComputo[]): Promise<AllegatoPdfComputo[]> {
  const out: AllegatoPdfComputo[] = [];
  for (const meta of allegati.filter(a => a.includi)) {
    const blob = await leggiAllegatoLocale(scope, meta.id);
    if (!blob) throw new Error(`File non disponibile in questo browser: ${meta.nome}. Ricaricalo o escludilo dal PDF.`);
    out.push({ nome: meta.nome, tipo: meta.tipo, blob });
  }
  return out;
}
