/**
 * La lettura di una bolletta dall'XML FatturaPA, senza AI (area D, 15/11/2026).
 *
 * Le bollette di luce e gas portano il codice del contatore in ogni riga: `CodiceArticolo` con
 * `CodiceTipo` POD/PDR (visto su produzione il 15/11: 93 fatture, 4 aziende), oppure nelle
 * descrizioni e in `AltriDatiGestionali`. Ogni riga ha anche il periodo (`DataInizioPeriodo`,
 * `DataFinePeriodo`). Da qui si ricava, per ogni utenza del documento: periodo, consumo, importo,
 * letture stimate o effettive, indirizzo di fornitura. Le righe senza codice (bollo, canone…)
 * vanno all'unica utenza del documento, o si ripartiscono in proporzione fra le utenze.
 *
 * Il risultato va a `bolletta_registra` nel database, che decide utenza, doppioni e costo.
 */
import { leggiRiferimentiFattura, type RigaFatturaLetta } from "../acquisti/riferimentiFattura.ts";

export type TipoUtenza = "luce" | "gas" | "acqua" | "telefono" | "altro";

export interface UtenzaLetta {
  codice: string;
  tipo_utenza: TipoUtenza;
  periodo_dal: string | null;
  periodo_al: string | null;
  consumo: number | null;
  unita: string | null;
  importo: number;
  letture: "effettive" | "stimate" | null;
  indirizzo: string | null;
  righe: number[];
}

export interface BollettaLetta {
  tipo: "ordinaria" | "conguaglio";
  contratto: string | null;
  fatture_collegate: string[];
  utenze: UtenzaLetta[];
}

const POD = /\bIT\d{3}E[0-9A-Z]{8}\b/;
const PDR_ETICHETTATO = /\bPDR\b[^0-9]{0,12}(\d{14})\b/i;
const tondo = (v: number) => Math.round(v * 100) / 100;

/** Il codice dell'utenza in una riga, se c'è: prima i codici strutturati, poi il testo. */
export function codiceDellaRiga(r: Pick<RigaFatturaLetta, "codici" | "descrizione" | "altriDati">): { codice: string; tipo: TipoUtenza } | null {
  for (const c of r.codici) {
    const tipo = c.tipo.toUpperCase();
    const valore = c.valore.toUpperCase().replace(/\s/g, "");
    if (POD.test(valore) || (tipo.includes("POD") && valore.length >= 10)) return { codice: valore, tipo: "luce" };
    if (tipo.includes("PDR") && /^\d{14}$/.test(valore)) return { codice: valore, tipo: "gas" };
  }
  const testo = [r.descrizione, ...r.altriDati.map((a) => `${a.tipo} ${a.testo ?? ""}`)].join(" ").toUpperCase();
  const pod = testo.match(POD);
  if (pod) return { codice: pod[0], tipo: "luce" };
  const pdr = testo.match(PDR_ETICHETTATO);
  if (pdr) return { codice: pdr[1], tipo: "gas" };
  return null;
}

function lettureDi(testo: string): UtenzaLetta["letture"] {
  if (/stimat|presunt|acconto consumi/i.test(testo)) return "stimate";
  if (/effettiv|rilevat|letture reali|lettura reale/i.test(testo)) return "effettive";
  return null;
}

const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

/** «consumi gennaio 2025» → 2025-01-01 … 2025-01-31 (quando il periodo non è nelle righe). */
export function periodoDaMese(testo: string): { dal: string; al: string } | null {
  const m = testo.toLowerCase().match(new RegExp(`\\b(${MESI.join("|")})\\s+(\\d{4})\\b`));
  if (!m) return null;
  const mese = MESI.indexOf(m[1]) + 1;
  const anno = Number(m[2]);
  const ultimo = new Date(Date.UTC(anno, mese, 0)).getUTCDate();
  const mm = String(mese).padStart(2, "0");
  return { dal: `${anno}-${mm}-01`, al: `${anno}-${mm}-${String(ultimo).padStart(2, "0")}` };
}

function indirizzoDi(righe: RigaFatturaLetta[]): string | null {
  for (const r of righe) for (const a of r.altriDati) {
    if (/IND/i.test(a.tipo) && a.testo?.trim()) return a.testo.trim();
  }
  return null;
}

export function leggiBolletta(xml: string, indiceCorpo = 0): BollettaLetta {
  const rif = leggiRiferimentiFattura(xml, indiceCorpo);
  const perCodice = new Map<string, { tipo: TipoUtenza; righe: RigaFatturaLetta[] }>();
  let senzaCodice: RigaFatturaLetta[] = [];
  for (const r of rif.righe) {
    const c = codiceDellaRiga(r);
    if (!c) { senzaCodice.push(r); continue; }
    const g = perCodice.get(c.codice) ?? { tipo: c.tipo, righe: [] };
    g.righe.push(r);
    perCodice.set(c.codice, g);
  }
  // Nessuna riga col codice: alcuni fornitori lo scrivono solo nella causale o al posto del
  // numero di contratto. Un solo codice nel documento = tutto il documento è di quell'utenza.
  if (!perCodice.size) {
    const testata = [rif.causale, ...rif.contratti.map((c) => c.testo)].join(" ");
    const c = codiceDellaRiga({ codici: [], descrizione: testata, altriDati: [] });
    if (c) { perCodice.set(c.codice, { tipo: c.tipo, righe: rif.righe }); senzaCodice = []; }
  }

  const utenze: UtenzaLetta[] = [...perCodice.entries()].map(([codice, g]) => {
    const inizi = g.righe.map((r) => r.dataInizio).filter((d): d is string => !!d).sort();
    const fini = g.righe.map((r) => r.dataFine).filter((d): d is string => !!d).sort();
    const energia = g.righe.filter((r) => /^(KWH|SMC|MC|M3)$/i.test((r.unitaLetta ?? "").trim()) && r.quantita != null);
    const consumo = energia.length ? Math.max(...energia.map((r) => Number(r.quantita))) : null;
    const testo = g.righe.flatMap((r) => [r.descrizione, ...r.altriDati.map((a) => a.testo ?? "")]).join(" ");
    const daMese = inizi.length ? null : periodoDaMese([rif.causale, ...g.righe.map((r) => r.descrizione)].join(" "));
    return {
      codice, tipo_utenza: g.tipo,
      periodo_dal: inizi[0] ?? daMese?.dal ?? null, periodo_al: fini[fini.length - 1] ?? daMese?.al ?? null,
      consumo, unita: energia[0]?.unitaLetta?.trim() ?? null,
      importo: tondo(g.righe.reduce((t, r) => t + r.totale, 0)),
      letture: lettureDi(testo), indirizzo: indirizzoDi(g.righe),
      righe: g.righe.map((r) => r.numeroLinea),
    };
  });

  // Le righe senza codice: all'unica utenza, o in proporzione agli importi.
  const comuni = tondo(senzaCodice.reduce((t, r) => t + r.totale, 0));
  if (utenze.length && comuni !== 0) {
    const base = utenze.reduce((t, u) => t + Math.abs(u.importo), 0);
    let resto = comuni;
    utenze.forEach((u, i) => {
      const quota = i === utenze.length - 1 ? resto : tondo(base > 0 ? (comuni * Math.abs(u.importo)) / base : comuni / utenze.length);
      resto = tondo(resto - quota);
      u.importo = tondo(u.importo + quota);
      u.righe = [...u.righe, ...senzaCodice.map((r) => r.numeroLinea)].sort((a, b) => a - b);
    });
  }

  const tutto = [rif.causale, ...rif.righe.map((r) => r.descrizione)].join(" ");
  return {
    tipo: /conguagli/i.test(tutto) ? "conguaglio" : "ordinaria",
    contratto: rif.contratti[0]?.testo ?? null,
    fatture_collegate: rif.fattureCollegate.map((f) => f.testo).filter(Boolean),
    utenze,
  };
}

/** Vero se l'XML sembra una bolletta (c'è un POD o un PDR etichettato): filtro veloce prima di leggerla. */
export function sembraBolletta(xml: string): boolean {
  return POD.test(xml) || /<CodiceTipo>\s*PDR\s*<\/CodiceTipo>/i.test(xml) || PDR_ETICHETTATO.test(xml);
}
