import { sha256Hex } from "./improntaDocumento.ts";
export class ErroreVerbaleTecnico extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
export const CATEGORIE_VERBALE_TECNICO = [
  "revisione",
  "verifica_periodica",
  "libretto",
  "taratura",
  "manuale_ce",
  "pimus",
  "autorizzazione_ministeriale",
] as const;
export interface ParametriVerbaleTecnico {
  titolo: string;
  categoria: string;
  data_inizio: string | null;
  data_scadenza: string | null;
  conferma_tecnica: boolean;
}
export interface FonteVerbaleTecnico {
  company_id: string;
  mezzo_id: string;
  manutenzione_id: string;
  tipo: string;
  data: string;
  file_name: string;
  impronta: string;
}
export interface RicevutaVerbaleTecnico {
  id: string;
  documento_id: string;
  company_id: string;
  mezzo_id: string;
  manutenzione_id: string;
  titolo: string;
  categoria: string;
  registrato_il: string;
  disponibile: boolean;
}
export const uuidVerbale = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export function normalizzaParametriVerbale(
  v: unknown,
): ParametriVerbaleTecnico {
  const a =
    v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : {};
  return {
    titolo: typeof a.titolo === "string" ? a.titolo.trim() : "",
    categoria: typeof a.categoria === "string" ? a.categoria : "",
    data_inizio:
      typeof a.data_inizio === "string" && a.data_inizio ? a.data_inizio : null,
    data_scadenza:
      typeof a.data_scadenza === "string" && a.data_scadenza
        ? a.data_scadenza
        : null,
    conferma_tecnica: a.conferma_tecnica === true,
  };
}
const data = (v: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !Number.isNaN(Date.parse(`${v}T12:00:00Z`)) &&
  new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) === v;
export function erroriParametriVerbale(v: ParametriVerbaleTecnico) {
  const e: string[] = [];
  if (!v.titolo || v.titolo.length > 180)
    e.push("Indica un titolo da 1 a 180 caratteri");
  if (!CATEGORIE_VERBALE_TECNICO.some((c) => c === v.categoria))
    e.push("Classifica il documento tecnico");
  if (!v.conferma_tecnica)
    e.push(
      "Conferma di aver letto un documento tecnico separato da fatture o altri dati economici",
    );
  if (
    (v.data_inizio && !data(v.data_inizio)) ||
    (v.data_scadenza && !data(v.data_scadenza)) ||
    (v.data_inizio && v.data_scadenza && v.data_scadenza < v.data_inizio)
  )
    e.push("Indica date documentali valide e coerenti");
  return e;
}
export function validaPathVerbale(
  path: unknown,
  company: string,
  mezzo: string,
): asserts path is string {
  if (
    typeof path !== "string" ||
    !path.startsWith(`${company}/${mezzo}/`) ||
    path.split("/").length !== 3 ||
    path.includes("\\") ||
    path.split("/").some((s) => !s || s === "." || s === "..")
  )
    throw new ErroreVerbaleTecnico(
      "Originale non pertinente alla specifica macchina",
      403,
    );
}
// The trusted service gets canonical paths from SQL. No client path or bucket is accepted.
// deno-lint-ignore no-explicit-any
export async function registraVerbaleTecnico(
  db: any,
  autore: string,
  input: {
    companyId: string;
    mezzoId: string;
    manutenzioneId: string;
    richiestaId: string;
    impronta: string;
    parametri: ParametriVerbaleTecnico;
  },
  tentativoId = crypto.randomUUID(),
): Promise<RicevutaVerbaleTecnico> {
  if (
    ![
      input.companyId,
      input.mezzoId,
      input.manutenzioneId,
      input.richiestaId,
      tentativoId,
    ].every(uuidVerbale) ||
    !/^[0-9a-f]{64}$/i.test(input.impronta)
  )
    throw new Error("Identità del verbale non valida");
  const parametri = normalizzaParametriVerbale(input.parametri);
  const err = erroriParametriVerbale(parametri);
  if (err.length) throw new Error(err.join("; "));
  const args = {
    _company: input.companyId,
    _mezzo: input.mezzoId,
    _manutenzione: input.manutenzioneId,
    _richiesta: input.richiestaId,
    _impronta: input.impronta,
    _parametri: parametri,
    _autore: autore,
  };
  const { data: esistente, error: erroreEsistente } = await db.rpc(
    "mezzi_verbale_copia_esistente",
    args,
  );
  if (erroreEsistente) throw erroreEsistente;
  const ricevuta = (r: Record<string, unknown>): RicevutaVerbaleTecnico => ({
    id: String(r.id),
    documento_id: String(r.documento_id),
    company_id: String(r.company_id),
    mezzo_id: String(r.mezzo_id),
    manutenzione_id: String(r.manutenzione_id),
    titolo: String(r.titolo),
    categoria: String(r.categoria),
    registrato_il: String(r.registrato_il),
    disponibile: r.disponibile === true,
  });
  const conferma = (r: Record<string, unknown>) => {
    if (
      !r ||
      !uuidVerbale(r.documento_id) ||
      r.company_id !== input.companyId ||
      r.mezzo_id !== input.mezzoId ||
      r.manutenzione_id !== input.manutenzioneId ||
      r.id !== input.richiestaId ||
      typeof r.copia_path !== "string" ||
      !r.copia_path.startsWith(
        `${input.companyId}/${input.mezzoId}/${input.richiestaId}-`,
      ) ||
      typeof r.disponibile !== "boolean"
    )
      throw new ErroreVerbaleTecnico(
        "Registrazione non confermata: riprova con la stessa richiesta",
        503,
      );
    validaPathVerbale(r.copia_path, input.companyId, input.mezzoId);
    return ricevuta(r);
  };
  if (esistente) return conferma(esistente);
  const { data: fonte, error: erroreFonte } = await db.rpc(
    "mezzi_verbale_fonte",
    {
      _company: input.companyId,
      _mezzo: input.mezzoId,
      _manutenzione: input.manutenzioneId,
      _autore: autore,
    },
  );
  if (erroreFonte) throw erroreFonte;
  if (
    !fonte?.foto ||
    fonte.foto.company_id !== input.companyId ||
    fonte.foto.mezzo_id !== input.mezzoId ||
    fonte.foto.manutenzione_id !== input.manutenzioneId ||
    fonte.foto.impronta !== input.impronta
  )
    throw new ErroreVerbaleTecnico(
      "L’allegato dell’intervento è cambiato: rileggi e verifica il documento",
      409,
    );
  validaPathVerbale(fonte.path, input.companyId, input.mezzoId);
  const nome =
    String(fonte.foto.file_name)
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/^\.+/, "")
      .slice(-100) || "verbale";
  const copia = `${input.companyId}/${input.mezzoId}/${input.richiestaId}-${tentativoId}-${nome}`;
  let caricata = false,
    finalizzazioneTentata = false;
  try {
    const { data: originale, error: err } = await db.storage
      .from("mezzi-documenti")
      .download(fonte.path);
    if (
      err ||
      !originale ||
      originale.size <= 0 ||
      originale.size > 20 * 1024 * 1024
    )
      throw new Error("Originale assente, vuoto o oltre 20 MB");
    const bytes = new Uint8Array(await originale.arrayBuffer());
    if (bytes.length !== originale.size || bytes.length > 20 * 1024 * 1024)
      throw new ErroreVerbaleTecnico(
        "Dimensione dell’originale incoerente o oltre 20 MB",
        422,
      );
    const sha = await sha256Hex(bytes);
    const { error: up } = await db.storage
      .from("mezzi-documenti")
      .upload(copia, bytes, {
        upsert: false,
        contentType: originale.type || "application/octet-stream",
      });
    caricata = true;
    if (up) throw new Error("Copia del verbale non conservata: riprova");
    const { data: riletto, error: readError } = await db.storage
      .from("mezzi-documenti")
      .download(copia);
    if (
      readError ||
      !riletto ||
      riletto.size !== bytes.length ||
      (await sha256Hex(await riletto.arrayBuffer())) !== sha
    )
      throw new Error(
        "La copia non corrisponde ai byte dell’originale: nessun documento registrato",
      );
    finalizzazioneTentata = true;
    const { data: finale, error: errFinale } = await db.rpc(
      "mezzi_verbale_completa",
      {
        ...args,
        _tentativo: tentativoId,
        _copia_path: copia,
        _sha256: sha,
        _dimensione: bytes.length,
      },
    );
    if (errFinale) throw errFinale;
    const r = conferma(finale);
    // A competing retry may have completed a different attempt. Never remove the winner.
    if (finale.copia_path !== copia)
      try {
        await db.storage.from("mezzi-documenti").remove([copia]);
      } catch {
        /* private orphan for later reconciliation */
      }
    return r;
  } catch (e) {
    // After an uncertain RPC response the registration may have committed. Preserve the copy.
    if (caricata && !finalizzazioneTentata)
      try {
        await db.storage.from("mezzi-documenti").remove([copia]);
      } catch {
        /* recoverable private orphan */
      }
    throw e;
  }
}
