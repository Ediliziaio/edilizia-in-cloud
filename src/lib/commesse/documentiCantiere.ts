export const TIPI_DOCUMENTO_CANTIERE = {
  pos: "POS · Piano operativo di sicurezza",
  psc: "PSC · Piano di sicurezza e coordinamento",
  pimus: "PiMUS · Ponteggi",
  sicurezza: "Altri documenti di sicurezza",
  tavole: "Tavole e planimetrie",
  verbali: "Verbali e collaudi",
  altro: "Altro documento di cantiere",
} as const;

export type TipoDocumentoCantiere = keyof typeof TIPI_DOCUMENTO_CANTIERE;
export const URL_DOCUMENTI_CANTIERE = "/documenti-cantiere";

export function tipoDocumentoCantiere(nome: string): TipoDocumentoCantiere | null {
  const parole = nome.toLowerCase().replace(/[^a-z0-9]/g, " ");
  if (/\bpos\b|piano operativo di sicurezza/.test(parole)) return "pos";
  if (/\bpsc\b|piano di sicurezza e coordinamento/.test(parole)) return "psc";
  if (/\bpimus\b/.test(parole)) return "pimus";
  return null;
}

export function documentoAdattoAlQr(doc: {
  order_id: string;
  cantiere_tipo?: TipoDocumentoCantiere | null;
  access_scope?: string;
  stato_revisione?: string | null;
  file_url: string;
}) {
  if (!doc.cantiere_tipo || doc.access_scope !== "operativo" ||
    (doc.stato_revisione != null && doc.stato_revisione !== "approvato")) return false;
  const path = doc.file_url.replace(/^orders\//, "");
  const [order, file, ...rest] = path.split("/");
  return order === doc.order_id && !rest.length && /^[a-z0-9._-]+$/i.test(file ?? "") && file !== "." && file !== "..";
}
