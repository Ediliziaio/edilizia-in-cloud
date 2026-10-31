/**
 * La ⓘ che apre il documento al punto citato (31/10/2026, fase 3, lotto 3.2): funzioni pure,
 * provate senza PDF. Il visore (VisoreFonte.tsx) le usa sulle pagine di pdf.js.
 *
 * - `paginaCitata`: dal «dove» del lettore («pagina 4», «p. 4», «pag. 4 di 9») il numero.
 * - `trovaCitazione`: gli elementi di testo della pagina che contengono la citazione, per
 *   evidenziarli. La citazione è il testo copiato dal modello: si confronta senza spazi,
 *   maiuscole e accenti, e se intera non c'è si cercano i suoi primi 40 caratteri.
 * - `comeSiApre`: se la fonte di un valore ha un documento da aprire, e quale.
 */
import type { Fonte } from "../../../shared/silvio-commessa/piano.ts";

/** Il numero di pagina del «dove», o null («riga 3», «foto», «testo»). */
export function paginaCitata(dove: string | null | undefined): number | null {
  const m = /\b(?:pagina|pag\.?|p\.)\s*(\d{1,4})\b/i.exec(dove ?? "");
  const n = m ? Number(m[1]) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

const pulito = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9€%]+/g, "");

/**
 * Gli indici degli elementi di testo (nell'ordine di pdf.js) dove sta la citazione; vuoto se
 * non si trova. Un elemento conta se anche un solo carattere della citazione ci cade dentro.
 */
export function trovaCitazione(elementi: readonly string[], citazione: string | null | undefined): number[] {
  const cercata = pulito(citazione ?? "");
  if (cercata.length < 4) return [];
  let testo = "";
  const di: number[] = [];
  elementi.forEach((e, i) => {
    const p = pulito(e);
    testo += p;
    for (let k = 0; k < p.length; k++) di.push(i);
  });
  for (const ago of [cercata, cercata.slice(0, 40)]) {
    const da = testo.indexOf(ago);
    if (da < 0) continue;
    return [...new Set(di.slice(da, da + ago.length))];
  }
  return [];
}

/** Il documento di una fonte, come lo apre il visore. */
export type DocumentoDaAprire =
  | { tipo: "file"; file: File }
  | { tipo: "caricato"; path: string; nome: string; mime?: string | null }
  | { tipo: "allegato_commessa"; path: string; nome: string; mime?: string | null }
  | { tipo: "email"; email_id: string; indice: number; nome: string; mime?: string | null };

export function tipoDelDocumento(nome: string, mime?: string | null): "pdf" | "immagine" | null {
  const m = (mime ?? "").toLowerCase();
  if (m === "application/pdf" || /\.pdf$/i.test(nome)) return "pdf";
  if (/^image\/(jpeg|png|webp)$/.test(m) || /\.(jpe?g|png|webp)$/i.test(nome)) return "immagine";
  return null;
}

/**
 * Come si riapre il documento da cui viene un valore: il file che il popup ha già, o
 * dall'id della fonte (il percorso che la lettura ha restituito). Null se non è un documento
 * (preventivo, computo, testo, la commessa) o non si sa dove sta.
 */
export function comeSiApre(
  fonte: Fonte, companyId: string,
  delPopup?: { file?: File; percorso?: string; documento?: { tipo: string; email_id?: string; indice?: number }; mime?: string | null } | null,
): DocumentoDaAprire | null {
  if (!["contratto", "documento", "sopralluogo"].includes(fonte.tipo) && !(fonte.tipo === "persona" && fonte.id)) return null;
  const nome = fonte.etichetta.replace(/^(scelto|modificato|spostato) da te: /, "");
  const mime = delPopup?.mime ?? delPopup?.file?.type ?? null;
  if (delPopup?.file && tipoDelDocumento(delPopup.file.name, delPopup.file.type)) return { tipo: "file", file: delPopup.file };
  const d = delPopup?.documento;
  if (d?.tipo === "allegato_email" && d.email_id && Number.isInteger(d.indice) && tipoDelDocumento(nome, mime)) {
    return { tipo: "email", email_id: d.email_id, indice: d.indice!, nome, mime };
  }
  const id = delPopup?.percorso ?? fonte.id ?? "";
  if (!tipoDelDocumento(nome, mime) && !tipoDelDocumento(id, mime)) return null;
  const email = /^email:([0-9a-f-]{36}):(\d{1,2})$/i.exec(id);
  if (email) return { tipo: "email", email_id: email[1], indice: Number(email[2]), nome, mime };
  if (id.startsWith(`${companyId}/`)) return { tipo: "caricato", path: id, nome, mime };
  if (id.startsWith("orders/")) return { tipo: "allegato_commessa", path: id, nome, mime };
  return null;
}
