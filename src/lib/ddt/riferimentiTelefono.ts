import type { LetturaDDT } from "./letturaAI";

export type RiferimentiTelefono = {
  numero?: string;
  data?: string;
  fornitore?: string;
};

export const MAX_NUMERO_DDT = 48;
export const MAX_FORNITORE_DDT = 120;

const TITOLO_DDT = /^(?:documento\s+di\s+trasporto|d\.?\s*d\.?\s*t\b\.?)(?!\p{L})/iu;
const ETICHETTA_NUMERO = /^(?:n(?:[.°ºo]|umero)|nr\.?)\s*(?:documento|ddt)?\s*[:#-]?\s*/i;
const ETICHETTA_NOSTRO_DOC = /^(?:ns\.?|nostro)\s+(?:documento|ddt)\s*(?:n(?:[.°ºo]|umero)?|nr\.?)?\s*[:#-]?\s*/i;
const ETICHETTA_DATA = /^(?:data\s+(?:documento|ddt|emissione)|emesso\s+il)\s*[:#-]?\s*/i;
const DATA_NELLA_RIGA = /(?:data\s+(?:documento|ddt|emissione)|emesso\s+il)\s*[:#-]?\s*/i;
const ETICHETTA_FORNITORE = /^(?:fornitore|mittente|cedente)\b\s*[:–-]?\s*/i;
const CAMPO_ALTRA_PERSONA = /\b(?:cliente|destinatario|cessionario|vettore|indirizzo|partita\s+iva|p\.\s*iva|codice\s+fiscale)\b/i;
const DATA_LETTA = /\b(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{4})\b/;
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

function dataValida(s: string): boolean {
  if (!DATA_ISO.test(s)) return false;
  const data = new Date(`${s}T12:00:00Z`);
  return Number.isFinite(data.getTime()) && data.toISOString().slice(0, 10) === s;
}

function dataDaTesto(testo: string): string | undefined {
  const iso = testo.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
  if (iso) return dataValida(iso) ? iso : undefined;
  const italiana = DATA_LETTA.exec(testo);
  if (!italiana) return undefined;
  const [, giorno, mese, anno] = italiana;
  const data = `${anno}-${mese.padStart(2, "0")}-${giorno.padStart(2, "0")}`;
  return dataValida(data) ? data : undefined;
}

function testoBreve(valore: unknown, max: number): string | undefined {
  if (typeof valore !== "string") return undefined;
  const testo = valore.replace(/[\p{Cc}\u202a-\u202e\u2066-\u2069]/gu, " ").replace(/\s+/g, " ").trim();
  return testo && testo.length <= max ? testo : undefined;
}

/** Valida sia la scelta del telefono sia i riferimenti riletti dalla coda o dall'archivio. */
export function riferimentiTelefonoValidi(valore: unknown): RiferimentiTelefono | undefined {
  if (!valore || typeof valore !== "object" || Array.isArray(valore)) return undefined;
  const { numero, data, fornitore } = valore as Record<string, unknown>;
  const n = testoBreve(numero, MAX_NUMERO_DDT);
  const f = testoBreve(fornitore, MAX_FORNITORE_DDT);
  const d = typeof data === "string" && dataValida(data) ? data : undefined;
  if (!n && !d && !f) return undefined;
  return { ...(n && { numero: n }), ...(d && { data: d }), ...(f && { fornitore: f }) };
}

function unico(valori: Array<string | undefined>): string | undefined {
  const distinti = new Map<string, string>();
  for (const valore of valori) {
    if (valore) distinti.set(valore.toLocaleLowerCase("it"), valore);
  }
  return distinti.size === 1 ? distinti.values().next().value : undefined;
}

/** Cerca l'intestazione e le etichette del DDT. Le letture discordanti restano vuote. */
export function proponiRiferimentiTelefono(pagine: readonly string[]): RiferimentiTelefono {
  const numeri: Array<string | undefined> = [];
  const date: Array<string | undefined> = [];
  const fornitori: Array<string | undefined> = [];
  for (const testo of pagine) {
    const righe = testo.slice(0, 5000).normalize("NFKC").split(/\r?\n/).map(s => s.trim()).filter(Boolean).slice(0, 30);
    const intestazione = righe.findIndex(riga => TITOLO_DDT.test(riga));
    for (const [i, riga] of righe.entries()) {
      const titolo = TITOLO_DDT.exec(riga);
      const dopoTitolo = titolo ? riga.slice(titolo.index + titolo[0].length).replace(/^[.\s:#–-]+/u, "") : riga;
      const vicinoAlTitolo = intestazione >= 0 && i >= intestazione && i <= intestazione + 3;
      const numeroEsplicito = /^numero\s+(?:documento|ddt)\b/i.test(riga) || /^n[.°º]\s*ddt\b/i.test(riga);
      const etichetta = dopoTitolo.match(ETICHETTA_NUMERO) ?? (vicinoAlTitolo ? dopoTitolo.match(ETICHETTA_NOSTRO_DOC) : null);
      if (numeroEsplicito || (vicinoAlTitolo && etichetta) || (titolo && /^\d/.test(dopoTitolo))) {
        const coda = dopoTitolo.slice(etichetta?.[0].length ?? 0);
        const n = (coda || righe[i + 1] || "").match(/^[\p{L}\d][\p{L}\d/_.-]*/u)?.[0]?.replace(/[.-]+$/, "");
        if (n && /\d/.test(n) && !DATA_LETTA.test(n) && !DATA_ISO.test(n)) numeri.push(testoBreve(n, MAX_NUMERO_DDT));
        const del = coda.match(/\bdel\s+(.+)/i);
        if (del) date.push(dataDaTesto(del[1]));
      }
      const etichettaData = riga.match(ETICHETTA_DATA)
        ?? (vicinoAlTitolo ? riga.match(/^data(?:\s*[:–-]\s*|\s+(?=\d)|$)/i) : null);
      if (etichettaData) date.push(dataDaTesto(riga.slice(etichettaData[0].length) || righe[i + 1] || ""));
      else {
        const dentro = DATA_NELLA_RIGA.exec(riga);
        if (dentro) date.push(dataDaTesto(riga.slice(dentro.index + dentro[0].length)));
      }
      if (titolo) {
        const del = dopoTitolo.match(/\bdel\s+(.+)/i);
        if (del) date.push(dataDaTesto(del[1]));
      }
      const etichettaFornitore = riga.match(ETICHETTA_FORNITORE);
      if (etichettaFornitore) {
        const nome = (riga.slice(etichettaFornitore[0].length) || righe[i + 1] || "")
          .replace(/^(?:ragione\s+sociale|denominazione)\s*:\s*/i, "").trim();
        if (/\p{L}/u.test(nome) && !TITOLO_DDT.test(nome) && !CAMPO_ALTRA_PERSONA.test(nome) &&
            !/^(?:codice|telefono|email|via|viale)\b/i.test(nome)) {
          fornitori.push(testoBreve(nome, MAX_FORNITORE_DDT));
        }
      }
    }
  }
  return riferimentiTelefonoValidi({ numero: unico(numeri), data: unico(date), fornitore: unico(fornitori) }) ?? {};
}

export function completaLetturaConTelefono(lettura: LetturaDDT, valore: unknown): LetturaDDT {
  const riferimenti = riferimentiTelefonoValidi(valore);
  if (!riferimenti) return lettura;
  return {
    ...lettura,
    numero: lettura.numero ?? riferimenti.numero ?? null,
    data: lettura.data ?? riferimenti.data ?? null,
    fornitoreNome: lettura.fornitoreNome ?? (lettura.fornitorePiva || lettura.fornitoreCodiceFiscale ? null : riferimenti.fornitore ?? null),
  };
}
