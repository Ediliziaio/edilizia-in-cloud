import { LIMITE_PDF_BROWSER } from "./posRenderer.ts";

/**
 * La richiesta a genera-pos. Quasi tutte le azioni sono JSON; il completamento di un'emissione porta anche il PDF che il
 * browser ha disegnato e arriva come multipart/form-data: il campo «meta» è il JSON di sempre, il campo «pdf» il file.
 * Un PDF troppo grande si rifiuta dall'intestazione, prima di leggerlo. Codice puro: solo API web (Request, FormData).
 */
export class ErroreRichiestaPos extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
// Come req.json() di prima: i campi li legge e valida il chiamante, uno per uno.
// deno-lint-ignore no-explicit-any
export interface RichiestaPos { body: Record<string, any>; pdf?: Uint8Array }

const MARGINE_META = 1024 * 1024;
const oggetto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export async function leggiRichiestaPos(req: Request): Promise<RichiestaPos> {
  if (!(req.headers.get("content-type") || "").toLowerCase().startsWith("multipart/form-data")) {
    const body = await req.json().catch(() => ({}));
    return { body: oggetto(body) ? body : {} };
  }
  const dichiarata = Number(req.headers.get("content-length"));
  if (Number.isFinite(dichiarata) && dichiarata > LIMITE_PDF_BROWSER + MARGINE_META) throw new ErroreRichiestaPos("Il PDF è troppo grande per essere conservato", 413);
  let form: FormData;
  try { form = await req.formData(); } catch { throw new ErroreRichiestaPos("Richiesta non leggibile", 400); }
  const meta = form.get("meta");
  let body: unknown;
  try { body = typeof meta === "string" ? JSON.parse(meta) : undefined; } catch { body = undefined; }
  if (!oggetto(body)) throw new ErroreRichiestaPos("Richiesta non valida: mancano i dati dell'operazione", 400);
  const pdf = form.get("pdf");
  if (pdf === null) return { body };
  if (typeof pdf === "string") throw new ErroreRichiestaPos("Il PDF non è un file", 400);
  if (pdf.size > LIMITE_PDF_BROWSER) throw new ErroreRichiestaPos("Il PDF è troppo grande per essere conservato", 413);
  return { body, pdf: new Uint8Array(await pdf.arrayBuffer()) };
}
