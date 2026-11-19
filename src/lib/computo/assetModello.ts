import type { jsPDF } from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import { fotoPerCopertina, leggiLogoPerPdf, type VesteComputo } from "./modelloComputo";
import type { IntestazioneComputo } from "./esportaComputo";
import { registraMemoria } from "@/lib/memorieDaSvuotare";
import { fontDelDocumento, fontStandard } from "./fontDocumento";

export type TipoAssetModello = "copertina" | "logo" | "font";
const BUCKET = "quote-template-assets";
const letture = new Map<string, { scade: number; blob: Promise<Blob> }>();
registraMemoria(() => letture.clear());
const fontSistema = new Map<string, Promise<{ normale: string; grassetto?: string }>>();
registraMemoria(() => fontSistema.clear());

async function leggiFontSistema(id: string) {
  const f = fontDelDocumento(id);
  if (!f?.normale) return null;
  if (!fontSistema.has(id)) {
    const leggi = async (path: string) => {
      const r = await fetch(path);
      if (!r.ok) throw new Error(`Il carattere ${f.nome} non è disponibile. Ricarica la pagina e riprova.`);
      const bytes = await r.arrayBuffer(); validaTtf(bytes); return base64Asset(bytes);
    };
    fontSistema.set(id, Promise.all([leggi(f.normale), f.grassetto ? leggi(f.grassetto) : undefined])
      .then(([normale, grassetto]) => ({ normale, grassetto })).catch(e => { fontSistema.delete(id); throw e; }));
  }
  return fontSistema.get(id)!;
}

function controllaPercorso(companyId: string, percorso: string) {
  if (!companyId || !percorso.startsWith(`${companyId}/`) || percorso.includes("..") || !/^[\w/-]+\.[\w]+$/.test(percorso)) {
    throw new Error("Questo file non appartiene al modello dell'azienda.");
  }
}

export async function urlAssetModello(companyId: string, percorso: string): Promise<string> {
  controllaPercorso(companyId, percorso);
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(percorso, 600);
  if (error || !data?.signedUrl) throw new Error("Impossibile leggere il file del modello. Verifica l'accesso e riprova.");
  return data.signedUrl;
}

async function leggiAsset(companyId: string, percorso: string): Promise<Blob> {
  controllaPercorso(companyId, percorso);
  const precedente = letture.get(percorso);
  if (precedente && precedente.scade > Date.now()) return precedente.blob;
  if (letture.size > 60) letture.clear();
  const blob = (async () => {
    const risposta = await fetch(await urlAssetModello(companyId, percorso));
    if (!risposta.ok) throw new Error("File del modello non disponibile. Ricaricalo prima di scaricare il PDF.");
    const b = await risposta.blob();
    if (b.size > 5 * 1024 * 1024) throw new Error("Il file del modello supera il limite di 5 MB.");
    return b;
  })().catch(e => { letture.delete(percorso); throw e; });
  letture.set(percorso, { scade: Date.now() + 5 * 60_000, blob });
  return blob;
}

export function validaTtf(buffer: ArrayBuffer) {
  const vista = new DataView(buffer);
  if (buffer.byteLength < 12 || vista.getUint32(0) !== 0x00010000) throw new Error("Scegli un carattere TrueType statico (.ttf), non OTF, WOFF o un font variabile.");
  const n = vista.getUint16(4), tabelle = new Set<string>();
  if (!n || n > 200 || 12 + n * 16 > buffer.byteLength) throw new Error("Il file TTF è incompleto.");
  for (let k = 0; k < n; k++) {
    const p = 12 + k * 16, tag = String.fromCharCode(...new Uint8Array(buffer, p, 4));
    const offset = vista.getUint32(p + 8), lunghezza = vista.getUint32(p + 12);
    if (offset + lunghezza > buffer.byteLength) throw new Error("Il file TTF è incompleto.");
    tabelle.add(tag);
  }
  if (["cmap", "head", "hhea", "hmtx", "maxp", "glyf", "loca", "name", "post"].some(t => !tabelle.has(t)) || tabelle.has("fvar")) throw new Error("Usa un font TTF statico con contorni TrueType.");
}

export function base64Asset(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binario = "";
  for (let k = 0; k < bytes.length; k += 8192) binario += String.fromCharCode(...bytes.subarray(k, k + 8192));
  return btoa(binario);
}

/** File immutabili: sostituire il marchio del modello non rompe i documenti precedenti. */
export async function caricaAssetModello(companyId: string, file: File, tipo: TipoAssetModello): Promise<string> {
  const limite = tipo === "copertina" ? 5 : tipo === "font" ? 3 : 2;
  if (!file.size || file.size > limite * 1024 * 1024) throw new Error(`Scegli un file inferiore a ${limite} MB.`);
  let blob: Blob = file, estensione = "ttf", mime = "font/ttf";
  if (tipo === "font") {
    if (!/\.ttf$/i.test(file.name)) throw new Error("Scegli un carattere TrueType (.ttf).");
    const buffer = await file.arrayBuffer(); validaTtf(buffer);
    // Il medesimo motore usato dal PDF deve saperlo incorporare, prima di caricarlo.
    const { jsPDF: Pdf } = await import("jspdf");
    const prova = new Pdf();
    prova.addFileToVFS("verifica.ttf", base64Asset(buffer)); prova.addFont("verifica.ttf", "Verifica", "normal");
    prova.setFont("Verifica"); prova.text("Prova àèìòù € 123", 10, 10);
    if (!prova.output().includes("/FontFile2")) throw new Error("Questo carattere non è compatibile con il PDF. Prova un altro TTF.");
  } else {
    if (!["image/png", "image/jpeg"].includes(file.type)) throw new Error("Scegli un'immagine PNG o JPG.");
    const bitmap = await createImageBitmap(file);
    try {
      if (bitmap.width * bitmap.height > 40_000_000) throw new Error("Immagine troppo grande: riducila a meno di 40 megapixel.");
      const scala = Math.min(1, (tipo === "logo" ? 1000 : 2200) / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(bitmap.width * scala)); canvas.height = Math.max(1, Math.round(bitmap.height * scala));
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      mime = tipo === "logo" ? "image/png" : "image/jpeg"; estensione = tipo === "logo" ? "png" : "jpg";
      blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("Immagine illeggibile.")), mime, .88));
    } finally { bitmap.close(); }
  }
  const percorso = `${companyId}/modello-${tipo}-${crypto.randomUUID()}.${estensione}`;
  controllaPercorso(companyId, percorso);
  const { error } = await supabase.storage.from(BUCKET).upload(percorso, blob, { upsert: false, contentType: mime });
  if (error) throw new Error("Caricamento non riuscito. Il file precedente è ancora disponibile: verifica l'accesso e riprova.");
  return percorso;
}

/** Stessa lettura autenticata per anteprima, download e documenti del preventivo. */
export async function preparaAssetModello(i: IntestazioneComputo): Promise<IntestazioneComputo> {
  const v = i.veste;
  if (!v) return i;
  const company = i.companyId ?? "";
  const [logo, copertina, font] = await Promise.all([
    v.logoPersonalizzato && v.mostraLogo !== false ? (async () => {
      const url = URL.createObjectURL(await leggiAsset(company, v.logoPersonalizzato!));
      try { const l = await leggiLogoPerPdf(url); if (!l) throw new Error("Logo del modello illeggibile."); return l; }
      finally { URL.revokeObjectURL(url); }
    })() : v.logo,
    !i.immagineCopertina && v.immagineCopertina && i.sezioni?.copertina !== false ? (async () => {
      const f = await fotoPerCopertina(await leggiAsset(company, v.immagineCopertina!), 595.28 / (841.89 * .44));
      if (!f) throw new Error("Immagine di copertina illeggibile."); return f;
    })() : i.immagineCopertina,
    v.fontFamiglia === "personalizzato" || v.fontTitoli === "personalizzato" ? (async () => {
      if (v.fontCaricato) return v.fontCaricato;
      if (!v.fontPersonalizzato?.file) throw new Error("Carica il file TTF del carattere personalizzato.");
      const read = async (path: string) => { const b = await (await leggiAsset(company, path)).arrayBuffer(); validaTtf(b); return base64Asset(b); };
      const [normale, grassetto] = await Promise.all([read(v.fontPersonalizzato.file), v.fontPersonalizzato.fileGrassetto ? read(v.fontPersonalizzato.fileGrassetto) : undefined]);
      return { normale, grassetto };
    })() : undefined,
  ]);
  const ids = [...new Set([v.fontFamiglia ?? "helvetica", v.fontTitoli ?? v.fontFamiglia ?? "helvetica"])].filter(id => id !== "personalizzato" && !fontStandard(id));
  const caricati = Object.fromEntries(await Promise.all(ids.map(async id => [id, v.fontSistemaCaricati?.[id] ?? await leggiFontSistema(id)])));
  return { ...i, immagineCopertina: copertina, veste: { ...v, logo, fontCaricato: font, fontSistemaCaricati: caricati } };
}

export function registraFontModello(doc: jsPDF, veste?: VesteComputo) {
  for (const [id, payload] of Object.entries(veste?.fontSistemaCaricati ?? {})) {
    if (!fontDelDocumento(id)?.normale || !payload) continue;
    const nome = `Sistema_${id}`;
    doc.addFileToVFS(`${nome}-Regular.ttf`, payload.normale); doc.addFileToVFS(`${nome}-Bold.ttf`, payload.grassetto ?? payload.normale);
    doc.addFont(`${nome}-Regular.ttf`, nome, "normal"); doc.addFont(`${nome}-Regular.ttf`, nome, "italic");
    doc.addFont(`${nome}-Bold.ttf`, nome, "bold"); doc.addFont(`${nome}-Bold.ttf`, nome, "bolditalic");
  }
  if (!veste?.fontCaricato) return;
  doc.addFileToVFS("Modello-Regular.ttf", veste.fontCaricato.normale);
  doc.addFont("Modello-Regular.ttf", "ModelloPersonalizzato", "normal");
  doc.addFont("Modello-Regular.ttf", "ModelloPersonalizzato", "italic");
  doc.addFileToVFS("Modello-Bold.ttf", veste.fontCaricato.grassetto ?? veste.fontCaricato.normale);
  doc.addFont("Modello-Bold.ttf", "ModelloPersonalizzato", "bold");
  doc.addFont("Modello-Bold.ttf", "ModelloPersonalizzato", "bolditalic");
}

export const nomeFontModello = (veste?: VesteComputo, titolo = false) => {
  const font = titolo ? veste?.fontTitoli ?? veste?.fontFamiglia : veste?.fontFamiglia;
  return font === "personalizzato" ? "ModelloPersonalizzato" : fontDelDocumento(font)?.normale ? `Sistema_${font}` : font ?? "helvetica";
};

/** Millimetri nel builder, punti nel PDF. Il logo conserva sempre le proporzioni. */
export function geometriaLogo(veste: VesteComputo | undefined, logo: NonNullable<VesteComputo["logo"]>, sinistra: number, destra: number, altezzaMax = 80) {
  const desiderata = (veste?.logoLarghezza ?? 60) * 72 / 25.4;
  const w = Math.min(desiderata, destra - sinistra, altezzaMax * logo.larghezza / logo.altezza);
  const h = w * logo.altezza / logo.larghezza;
  const x = veste?.logoAllineamento === "destra" ? destra - w : veste?.logoAllineamento === "centro" ? sinistra + (destra - sinistra - w) / 2 : sinistra;
  return { x, w, h };
}
