/**
 * Client SOAP per Zucchetti Digital Hub / FatelWeb (servizio fatelwV2).
 *
 * Perché esiste. Tutti gli altri provider di fatturazione (Openapi, Fatture in
 * Cloud, Aruba, A-Cube…) parlano REST/JSON. Zucchetti no: il suo web service è
 * SOAP all'indirizzo  https://digitalhubN.zucchetti.it/fatelw/services/fatelwV2
 * (stile RPC/literal, JAX-WS). Questo modulo è l'unico punto che costruisce e
 * legge le buste SOAP; sopra ci va l'adapter (billingAdapter.ts) che lo usa per
 * scaricare le fatture emesse/ricevute e lo stato, come fa ArubaAdapter via REST.
 *
 * Fonte di verità: il WSDL pubblico  …/fatelwV2?wsdl  (namespace
 * urn:ws.fatelw.zucchetti.it). Da lì vengono i nomi e le parti delle operazioni
 * usate qui — niente è inventato. Quello che il WSDL NON dice, e che va
 * verificato sul sandbox Zucchetti alla prima fattura vera, è segnato con
 * «DA VERIFICARE SUL SANDBOX»:
 *   1. la convenzione del campo `code` di fatelwV2Return (quale valore = OK);
 *   2. il formato del campo `response` nelle liste (CSV / delimitato / XML);
 *   3. il namespace esatto degli `item` negli array (qui: array JAXB).
 * Le parti PURE (escaping, costruzione busta, parsing del return e del fault)
 * sono testate in src/test/logic/zucchettiSoap.test.ts e non fanno rete.
 *
 * Autenticazione: a sessione. connect(userName,password,company) → token, poi
 * il token su ogni chiamata, disconnect(token) alla fine. getUtente(user,pwd)
 * non richiede token e serve al «Test collegamento».
 */

export const FATELW_NS = "urn:ws.fatelw.zucchetti.it";
export const FATELW_ARRAY_NS = "http://jaxb.dev.java.net/array";

export interface FatelwCred {
  /** URL completo del servizio, es. https://digitalhub2.zucchetti.it/fatelw/services/fatelwV2 */
  url: string;
  utente: string;
  password: string;
  /** La "company" del pannello Digital Hub, es. "001". */
  company: string;
}

/** Il wrapper di risposta comune a tutte le operazioni (xsd=1 del WSDL). */
export interface FatelwReturn {
  code: number;
  message: string | null;
  response: string | null;
  token: string | null;
}

type ScalarePart = { name: string; value: string | number | boolean };
type ArrayPart = { name: string; array: string[] };
export type Part = ScalarePart | ArrayPart;

// ─────────────────────────── PARTI PURE (testabili) ───────────────────────────

/** Escaping XML minimo per i valori di testo (password con &, < ecc.). */
export function escXml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Decodifica le entità XML standard nel testo letto dalle risposte. */
export function unescXml(s: string): string {
  return String(s)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&"); // per ultimo, per non ri-decodificare
}

function isArrayPart(p: Part): p is ArrayPart {
  return Object.prototype.hasOwnProperty.call(p, "array");
}

/**
 * Costruisce la busta SOAP 1.1 RPC/literal per una operazione fatelwV2.
 * Il wrapper dell'operazione è nel namespace del servizio; le parti (part del
 * WSDL) sono elementi locali non qualificati. Gli array stringArray diventano
 * elementi <item> nel namespace array JAXB.
 */
export function bustaSoap(operation: string, parts: Part[]): string {
  const corpo = parts.map((p) => {
    if (isArrayPart(p)) {
      const items = p.array
        .map((v) => `<arr:item>${escXml(v)}</arr:item>`)
        .join("");
      return `<${p.name} xmlns:arr="${FATELW_ARRAY_NS}">${items}</${p.name}>`;
    }
    return `<${p.name}>${escXml(String(p.value))}</${p.name}>`;
  }).join("");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="${FATELW_NS}">` +
    `<soapenv:Header/>` +
    `<soapenv:Body><urn:${operation}>${corpo}</urn:${operation}></soapenv:Body>` +
    `</soapenv:Envelope>`
  );
}

/** Legge un figlio di testo (eventuale prefisso di namespace ignorato). */
function campoTesto(xml: string, nome: string): string | null {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${nome}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${nome}>`));
  if (!m) {
    // elemento vuoto <nome/> → stringa vuota; assente → null
    return new RegExp(`<(?:\\w+:)?${nome}\\b[^>]*/>`).test(xml) ? "" : null;
  }
  return unescXml(m[1]);
}

/**
 * Estrae il fatelwV2Return dalla risposta. In RPC/literal la risposta è
 * <...Response><...Return><code/><message/><response/><token/></...Return></...>.
 * Il parsing è volutamente tollerante sui prefissi di namespace.
 */
export function parseFatelwReturn(xml: string, _operation?: string): FatelwReturn {
  // Restringe al blocco *Return se presente, per non pescare campi omonimi altrove.
  const ret = xml.match(/<(?:\w+:)?\w*Return\b[^>]*>([\s\S]*?)<\/(?:\w+:)?\w*Return>/);
  const scope = ret ? ret[1] : xml;
  const codeTxt = campoTesto(scope, "code");
  return {
    code: codeTxt === null || codeTxt === "" ? NaN : Number(codeTxt),
    message: campoTesto(scope, "message"),
    response: campoTesto(scope, "response"),
    token: campoTesto(scope, "token"),
  };
}

/** Se la risposta è un SOAP Fault restituisce il faultstring, altrimenti null. */
export function parseSoapFault(xml: string): string | null {
  if (!/<(?:\w+:)?Fault\b/.test(xml)) return null;
  return (
    campoTesto(xml, "faultstring") ??
    campoTesto(xml, "faultcode") ??
    "SOAP Fault"
  );
}

/**
 * Convenzione di esito. DA VERIFICARE SUL SANDBOX: qui assumiamo code === 0 = OK,
 * come fa la maggior parte dei web service Zucchetti. L'adapter non deve fidarsi
 * ciecamente di questo per le liste: usa anche la presenza di `response`/`token`.
 */
export function esitoOk(ret: FatelwReturn): boolean {
  return ret.code === 0;
}

// ─────────────────────────────── I/O (rete) ───────────────────────────────

/** Una singola chiamata SOAP. Lancia su fault o HTTP non 2xx. */
export async function chiamaFatelw(
  cred: FatelwCred,
  operation: string,
  parts: Part[],
  opts?: { timeoutMs?: number },
): Promise<FatelwReturn> {
  const body = bustaSoap(operation, parts);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts?.timeoutMs ?? 30_000);
  let text: string;
  try {
    const r = await fetch(cred.url, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        // fatelwV2 pubblica soapAction vuoto: alcuni server lo pretendono comunque.
        "SOAPAction": "",
      },
      body,
      signal: ctrl.signal,
    });
    text = await r.text();
    const fault = parseSoapFault(text);
    if (fault) throw new Error(`FatelWeb fault (${operation}): ${fault}`);
    if (!r.ok) throw new Error(`FatelWeb HTTP ${r.status} (${operation})`);
  } finally {
    clearTimeout(t);
  }
  return parseFatelwReturn(text, operation);
}

// ───────────────────────── Operazioni (dal WSDL) ─────────────────────────

/**
 * connect(userName, password, company) → token di sessione. Lancia se le
 * credenziali non sono valide.
 *
 * Verificato sull'endpoint reale (credenziali finte): un login sbagliato torna
 * code=101, message="Wrong username or password", e il campo <token> NON è
 * assente ma contiene solo spazi. Quindi il successo si misura su un token
 * NON vuoto una volta ripulito, non sulla semplice presenza del campo.
 */
export async function connect(cred: FatelwCred): Promise<string> {
  const ret = await chiamaFatelw(cred, "connect", [
    { name: "userName", value: cred.utente },
    { name: "password", value: cred.password },
    { name: "company", value: cred.company },
  ]);
  const token = ret.token?.trim();
  if (!token) {
    throw new Error(
      `connect fallito${Number.isNaN(ret.code) ? "" : ` (code ${ret.code})`}` +
        `${ret.message ? `: ${ret.message.trim()}` : ""}`,
    );
  }
  return token;
}

export async function disconnect(cred: FatelwCred, token: string): Promise<void> {
  try {
    await chiamaFatelw(cred, "disconnect", [{ name: "token", value: token }]);
  } catch {
    // la chiusura sessione non deve far fallire l'import: la sessione scade da sola.
  }
}

/** getUtente(userName, password): per il «Test collegamento» (senza token). */
export async function getUtente(cred: FatelwCred): Promise<FatelwReturn> {
  return await chiamaFatelw(cred, "getUtente", [
    { name: "userName", value: cred.utente },
    { name: "password", value: cred.password },
  ]);
}

export interface FiltroPeriodo {
  dateFrom: string; // formato atteso da FatelWeb — DA VERIFICARE SUL SANDBOX (yyyyMMdd o dd/MM/yyyy)
  dateTo: string;
  idPaese?: string;
  idCodice?: string;
  codiceFiscale?: string;
  stato?: string;
}

/** Ciclo ATTIVO: elenco documenti emessi (fatture inviate dall'azienda). */
export async function getDocumentsList(
  cred: FatelwCred,
  token: string,
  f: FiltroPeriodo,
): Promise<FatelwReturn> {
  return await chiamaFatelw(cred, "getDocumentsList", [
    { name: "token", value: token },
    { name: "dateFrom", value: f.dateFrom },
    { name: "dateTo", value: f.dateTo },
    { name: "idPaese", value: f.idPaese ?? "" },
    { name: "idCodice", value: f.idCodice ?? "" },
    { name: "codiceFiscale", value: f.codiceFiscale ?? "" },
    { name: "stato", value: f.stato ?? "" },
  ]);
}

/** Ciclo PASSIVO (FP = fatturazione passiva): elenco documenti ricevuti. */
export async function getDocumentsListFP(
  cred: FatelwCred,
  token: string,
  f: { allDocuments?: boolean; dateFrom: string; dateTo: string; idCessionario?: string },
): Promise<FatelwReturn> {
  return await chiamaFatelw(cred, "getDocumentsListFP", [
    { name: "token", value: token },
    { name: "allDocuments", value: f.allDocuments ?? false },
    { name: "dateFrom", value: f.dateFrom },
    { name: "dateTo", value: f.dateTo },
    { name: "idCessionario", value: f.idCessionario ?? "" },
  ]);
}

/** Stato SDI dei documenti del ciclo attivo (id[]). */
export async function getState(cred: FatelwCred, token: string, ids: string[]): Promise<FatelwReturn> {
  return await chiamaFatelw(cred, "getState", [
    { name: "token", value: token },
    { name: "id", array: ids },
  ]);
}

/** Stato SDI dei documenti del ciclo passivo (id[]). */
export async function getStateFP(cred: FatelwCred, token: string, ids: string[]): Promise<FatelwReturn> {
  return await chiamaFatelw(cred, "getStateFP", [
    { name: "token", value: token },
    { name: "id", array: ids },
  ]);
}

/** Scarica il file FatturaPA di un documento emesso (base64 in `response`). */
export async function getFatturaFile(
  cred: FatelwCred,
  token: string,
  id: string,
  position = 0,
): Promise<FatelwReturn> {
  return await chiamaFatelw(cred, "getFatturaFile", [
    { name: "token", value: token },
    { name: "id", value: id },
    { name: "position", value: position },
  ]);
}

/** Scarica il file di un documento ricevuto; unsignP7M=true per togliere la firma. */
export async function getDocumentFileFP(
  cred: FatelwCred,
  token: string,
  id: string,
  opts?: { idUserExt?: string; unsignP7M?: boolean },
): Promise<FatelwReturn> {
  return await chiamaFatelw(cred, "getDocumentFileFP", [
    { name: "token", value: token },
    { name: "id", value: id },
    { name: "idUserExt", value: opts?.idUserExt ?? "" },
    { name: "unsignP7M", value: opts?.unsignP7M ?? true },
  ]);
}
