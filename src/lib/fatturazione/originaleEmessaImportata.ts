import { supabase } from "@/integrations/supabase/client";
import { contenutoP7m, xmlDaFile } from "../../../supabase/functions/_shared/ricevuteOpenapi";

export const BUCKET_ORIGINALI_EMESSE = "fatture-xml";
const MAX_FILE = 20 * 1024 * 1024;

/** Gli originali privati sono riferimenti permanenti, mai URL firmati in scadenza. */
export function riferimentoOriginale(ref: string, companyId: string): { percorso: string } | { url: string } {
  if (ref.startsWith(`${BUCKET_ORIGINALI_EMESSE}/`)) {
    const percorso = ref.slice(BUCKET_ORIGINALI_EMESSE.length + 1);
    if (!companyId || percorso.split("/")[0] !== companyId || percorso.split("/").some(p => !p || p === "." || p === "..") || /[\\?#%]/.test(percorso)) {
      throw new Error("Il file originale non appartiene all'azienda selezionata.");
    }
    return { percorso };
  }
  // Compatibilità con i collegamenti restituiti dai provider esterni.
  const url = new URL(ref);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Collegamento al file originale non valido.");
  return { url: url.href };
}

export async function leggiOriginaleEmessa(ref: string, companyId: string) {
  const riferimento = riferimentoOriginale(ref, companyId);
  let file: Blob;
  let nome: string;
  if ("percorso" in riferimento) {
    const { data, error } = await supabase.storage.from(BUCKET_ORIGINALI_EMESSE).download(riferimento.percorso);
    if (error || !data) throw error ?? new Error("File originale non disponibile.");
    file = data;
    nome = riferimento.percorso.split("/").pop() || "fattura.xml";
  } else {
    const risposta = await fetch(riferimento.url, { signal: AbortSignal.timeout(20_000), credentials: "omit" });
    if (!risposta.ok) throw new Error("Il provider non rende disponibile il file originale. Prova ad aprirlo dal suo portale.");
    if (Number(risposta.headers.get("content-length")) > MAX_FILE) throw new Error("File originale troppo grande.");
    file = await risposta.blob();
    nome = new URL(riferimento.url).pathname.split("/").pop() || "fattura.xml";
  }
  if (file.size > MAX_FILE) throw new Error("File originale troppo grande.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const xml = xmlDaFile(bytes);
  if (!xml) throw new Error("Il file non contiene una fattura XML leggibile.");
  const estratto = contenutoP7m(bytes);
  // L'estrazione conserva i byte e la dichiarazione di encoding, non ricodifica
  // un XML ISO-8859-1 in UTF-8 lasciando un'intestazione non più corretta.
  const xmlEstratto = estratto ? new Blob([new Uint8Array(estratto)], { type: "application/xml" }) : null;
  if (estratto && !/\.p7m$/i.test(nome)) nome += ".xml.p7m";
  return { file, nome, xml, firmato: !!estratto, xmlEstratto };
}

export function scaricaFileOriginale(file: Blob, nome: string): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url; a.download = nome.replace(/[\\/]/g, "_");
  a.click();
  // Il browser deve prima acquisire il Blob, specialmente su telefono.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
