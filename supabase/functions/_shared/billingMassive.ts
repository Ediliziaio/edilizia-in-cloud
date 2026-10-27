/** Shared validation for ITALA REST 2.0 and AdE InputMassivo 1.5. */
export type MassiveDirection = "EMESSE" | "RICEVUTE";
export type MassiveDateType = "EMISSIONE" | "RICEZIONE" | "ACCOGLIENZA_SDI";
export interface MassiveInput {
  partita_iva: string;
  data_da: string;
  data_a: string;
  tipo_richiesta: MassiveDirection;
  tipo_data: MassiveDateType;
}
export function vatNumber(value: unknown): string {
  const vat = String(value ?? "").trim().toUpperCase().replace(/^IT/, "");
  if (!/^\d{11}$/.test(vat)) throw new Error("Serve una partita IVA italiana di 11 cifre.");
  return vat;
}
function date(value: unknown): string {
  const s = String(value ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(Date.parse(s)) || new Date(s).toISOString().slice(0, 10) !== s) {
    throw new Error("Data non valida: usa il formato AAAA-MM-GG.");
  }
  return s;
}
export function validateMassiveInput(input: Record<string, unknown>, now = new Date()): MassiveInput {
  const partita_iva = vatNumber(input.partita_iva);
  const data_da = date(input.data_da), data_a = date(input.data_a);
  const tipo_richiesta = input.tipo_richiesta;
  const tipo_data = input.tipo_data ?? "EMISSIONE";
  if (tipo_richiesta !== "EMESSE" && tipo_richiesta !== "RICEVUTE") throw new Error("Scegli fatture emesse o ricevute.");
  if (!["EMISSIONE", "RICEZIONE", "ACCOGLIENZA_SDI"].includes(String(tipo_data))) throw new Error("Criterio della data non valido.");
  if (tipo_data === "RICEZIONE" && tipo_richiesta !== "RICEVUTE") throw new Error("La data di ricezione vale solo per le fatture ricevute.");
  if (data_a < data_da) throw new Error("La data finale precede quella iniziale.");
  // A maximum of three calendar months, with end exclusive; no 90-day approximation.
  const start = new Date(`${data_da}T00:00:00Z`);
  const monthEnd = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 4, 0));
  const endExclusive = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 3,
    Math.min(start.getUTCDate(), monthEnd.getUTCDate()))).toISOString().slice(0, 10);
  if (data_a >= endExclusive) throw new Error("Una richiesta può coprire al massimo tre mesi. Dividi il periodo.");
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(now);
  if (data_a > today) throw new Error("Non puoi richiedere fatture di date future.");
  if (data_da < `${Number(today.slice(0, 4)) - 2}-01-01`) throw new Error("Il periodo deve rientrare negli ultimi tre anni solari, incluso quello corrente.");
  return { partita_iva, data_da, data_a, tipo_richiesta, tipo_data: tipo_data as MassiveDateType };
}
export function providerId(id: unknown): string {
  const s = String(id ?? "");
  if (!/^\d{1,20}$/.test(s)) throw new Error("Identificativo della richiesta non valido.");
  return s;
}
/** Build the INNER request defined by InputMassivo_v1.5.xsd. */
export function inputMassivo(input: MassiveInput): string {
  const p = validateMassiveInput(input as unknown as Record<string, unknown>);
  const range = `<Da>${p.data_da}</Da><A>${p.data_a}</A>`;
  const flow = "<Flusso><Tutte>ALL</Tutte></Flusso>";
  const role = p.tipo_richiesta === "EMESSE" ? "CEDENTE" : "CESSIONARIO";
  const selection = p.tipo_data === "ACCOGLIENZA_SDI"
    ? `<FattureDataAcc><DataAccoglienza>${range}</DataAccoglienza>${flow}<Ruolo><${role === "CEDENTE" ? "Cedente" : "Cessionario"}>${role}</${role === "CEDENTE" ? "Cedente" : "Cessionario"}></Ruolo></FattureDataAcc>`
    : `<${p.tipo_richiesta === "EMESSE" ? "FattureEmesse" : "FattureRicevute"}><${p.tipo_data === "RICEZIONE" ? "DataRicezione" : "DataEmissione"}>${range}</${p.tipo_data === "RICEZIONE" ? "DataRicezione" : "DataEmissione"}>${flow}<Ruolo>${role}</Ruolo></${p.tipo_richiesta === "EMESSE" ? "FattureEmesse" : "FattureRicevute"}>`;
  return `<?xml version="1.0" encoding="UTF-8"?><InputMassivo xmlns="http://www.sogei.it/InputPubblico"><TipoRichiesta><Fatture><Richiesta>FATT</Richiesta><ElencoPiva><Piva>${p.partita_iva}</Piva></ElencoPiva><TipoRicerca>PUNTUALE</TipoRicerca><TipoOutput>FILE_FATTURA</TipoOutput>${selection}</Fatture></TipoRichiesta></InputMassivo>`;
}
