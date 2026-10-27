import { request } from "node:https";
import { readFileSync } from "node:fs";
import { X509Certificate } from "node:crypto";
import { leggiXml } from "../../supabase/functions/_shared/xmlMinimo.ts";
import { inputMassivo, type MassiveInput } from "../../supabase/functions/_shared/billingMassive.ts";

const NS = "http://ivaservizi.agenziaentrate.gov.it/docs/wsdl/ServiziMassivi/v1.0/types";
export function xmlEscape(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}
export function smtsId(value: unknown): string {
  const s = String(value ?? "");
  if (!/^[a-zA-Z0-9_.]{1,100}$/.test(s)) throw new Error("Identificativo SMTS non valido.");
  return s;
}
/** This OUTER envelope is the document to sign, not InputMassivo alone. */
export function unsignedRequest(input: MassiveInput, filename: string): string {
  if (!/^[a-zA-Z0-9_.]{9,50}$/.test(filename)) throw new Error("Nome file SMTS non valido.");
  return `<?xml version="1.0" encoding="UTF-8"?><m:FileRichiesta xmlns:m="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/ServiziMassivi/input/RichiestaServiziMassivi/v1.0" versione="1.0"><TipoRichiesta>FATT</TipoRichiesta><NomeFile>${filename}</NomeFile><File>${Buffer.from(inputMassivo(input)).toString("base64")}</File></m:FileRichiesta>`;
}
type Operation = "inoltroRichiesta" | "esitoRichiesta" | "scaricoFile";
export function soapRequest(operation: Operation, values: { id?: string; fileId?: string; filename?: string; base64?: string }): string {
  let content: string, name: string;
  if (operation === "inoltroRichiesta") {
    name = "InoltroRichiestaRequest";
    if (!/^[a-zA-Z0-9_.]{9,50}$/.test(values.filename ?? "") || !/^[A-Za-z0-9+/=]+$/.test(values.base64 ?? "")) throw new Error("File firmato SMTS non valido.");
    content = `<FileRichiesta><NomeFile>${values.filename}</NomeFile><File>${values.base64}</File></FileRichiesta>`;
  } else {
    name = operation === "esitoRichiesta" ? "EsitoRichiestaRequest" : "ScaricoFileRequest";
    content = `<IdRichiesta>${smtsId(values.id)}</IdRichiesta>` + (operation === "scaricoFile" ? `<IdFile>${smtsId(values.fileId)}</IdFile>` : "");
  }
  // ServiziMassiviTypes has unqualified children (no elementFormDefault=qualified).
  return `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:t="${NS}"><soap:Body><t:${name}>${content}</t:${name}></soap:Body></soap:Envelope>`;
}
export function parseSoap(xml: string) {
  const doc = leggiXml(xml);
  if (!doc) throw new Error("Risposta XML AdE non valida.");
  const text = (tag: string) => doc.getElementsByTagName(tag)[0]?.textContent?.trim() ?? "";
  if (doc.getElementsByTagName("Fault").length) throw new Error("AdE ha restituito un SOAP Fault. Verifica configurazione e certificati.");
  const error = doc.getElementsByTagName("Errore")[0];
  if (error) throw new Error(`AdE: ${error.getElementsByTagName("Codice")[0]?.textContent || "errore"}. Verifica l'abilitazione o riprova più tardi.`);
  const file = doc.getElementsByTagName("EsitoFile")[0] ?? doc.getElementsByTagName("ArchivioFile")[0];
  return { id: text("IdRichiesta"), state: text("Stato"), filename: file?.getElementsByTagName("NomeFile")[0]?.textContent ?? "",
    base64: file?.getElementsByTagName("File")[0]?.textContent?.replace(/\s/g, "") ?? "" };
}
export interface Archive { id: string; filename: string; count: number }
export function parseResult(base64: string, vat: string, id: string) {
  const doc = leggiXml(Buffer.from(base64, "base64").toString("utf8"));
  const text = (tag: string) => doc?.getElementsByTagName(tag)[0]?.textContent?.trim() ?? "";
  if (!doc || text("Piva") !== vat || text("IdRichiesta") !== id) throw new Error("L'esito AdE non corrisponde all'azienda o alla richiesta.");
  const errors = Array.from(doc.getElementsByTagName("Errore")).map(e => e.getElementsByTagName("Codice")[0]?.textContent ?? "errore");
  const archives: Archive[] = Array.from(doc.getElementsByTagName("Archivio")).map(a => ({
    id: smtsId(a.getElementsByTagName("IdFile")[0]?.textContent),
    filename: a.getElementsByTagName("NomeFile")[0]?.textContent ?? "archivio.zip",
    count: Number(a.getElementsByTagName("NumeroElementi")[0]?.textContent ?? 0),
  }));
  if (archives.length > 50) throw new Error("Troppi archivi nella risposta AdE.");
  return { archives, errors, expires: text("DataFineDisponibilita") };
}
export function readiness(env = process.env): string[] {
  const missing: string[] = [];
  if (env.SMTS_ACCREDITED !== "true") missing.push("Accreditamento SdICoop e attivazione SMTS");
  for (const [name, label] of [["SMTS_CLIENT_CERT", "Certificato client"], ["SMTS_CLIENT_KEY", "Chiave privata"], ["SMTS_CA", "CA AdE"]]) {
    try {
      if (!env[name]) throw new Error();
      const data = readFileSync(env[name]!);
      if (name === "SMTS_CLIENT_CERT") {
        const cert = new X509Certificate(data);
        if (Date.parse(cert.validTo) <= Date.now() || Date.parse(cert.validFrom) > Date.now()) throw new Error();
      }
    } catch { missing.push(label); }
  }
  return missing;
}
export async function callSmts(operation: Operation, values: Parameters<typeof soapRequest>[1]): Promise<ReturnType<typeof parseSoap>> {
  const missing = readiness();
  if (missing.length) throw new Error(`Canale diretto non pronto: ${missing.join(", ")}.`);
  const xml = soapRequest(operation, values);
  // Fixed official destination. Never disable certificate/hostname verification.
  const response = await new Promise<string>((resolve, reject) => {
    const req = request("https://servizi.fatturapa.it/sm-scarico-file", {
      method: "POST", cert: readFileSync(process.env.SMTS_CLIENT_CERT!), key: readFileSync(process.env.SMTS_CLIENT_KEY!),
      ca: readFileSync(process.env.SMTS_CA!), passphrase: process.env.SMTS_KEY_PASSPHRASE,
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: `"${operation}"`, "Content-Length": Buffer.byteLength(xml) },
    }, res => {
      const chunks: Buffer[] = []; let size = 0;
      res.on("data", chunk => { size += chunk.length; if (size > 55_000_000) { res.destroy(new Error("Risposta AdE troppo grande.")); return; } chunks.push(chunk); });
      res.on("error", reject);
      res.on("end", () => {
        if (res.statusCode !== 200) { reject(new Error(`AdE HTTP ${res.statusCode}: verifica certificati e servizio.`)); return; }
        resolve(Buffer.concat(chunks).toString("utf8"));
      });
    });
    req.setTimeout(45_000, () => req.destroy(new Error("Timeout AdE: verifica l'esito prima di ripetere l'inoltro.")));
    req.on("error", reject); req.end(xml);
  });
  return parseSoap(response);
}
