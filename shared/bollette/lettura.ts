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
 * Acqua e telefono (16/11/2026) non hanno un codice di formato fisso: l'utenza è il documento
 * intero, riconosciuta da gestore (partita IVA) e parole delle righe, col codice che il gestore
 * scrive. Visti su produzione:
 * - acqua: `AltriDatiGestionali` «Fornitura» o «COD.UTENZA» (SMAT, CAP), periodo nella causale
 *   («periodo 02/06/2026 - 01/09/2026»); senza codice (allacciamenti, contributi) non è una bolletta;
 * - telefono: il codice cliente in `CedentePrestatore/RiferimentoAmministrazione` (Wind Tre: un
 *   codice per contratto), altrimenti il numero di linea scritto nelle righe, altrimenti il gestore
 *   (Fastweb non scrive nessun codice); periodo nelle righe («dal 01/08/2026 al 31/08/2026») o in
 *   causale («01 agosto 2026 - 30 settembre 2026»). Le fatture dei soli telefoni a rate, senza
 *   canoni né traffico, non sono bollette.
 * POD e PDR vincono sempre: lo stesso gestore (Fastweb) vende anche luce.
 *
 * Il risultato va a `bolletta_registra` nel database, che decide utenza, doppioni e costo.
 */
import { leggiRiferimentiFattura, senzaPrefissi, type RigaFatturaLetta } from "../acquisti/riferimentiFattura.ts";

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

/** Gestori del servizio idrico: la partita IVA basta a dire che è acqua (il codice serve comunque). */
export const GESTORI_ACQUA: Record<string, string> = {
  "07937540016": "SMAT",
  "13187590156": "CAP Holding",
  "05848061007": "Acea Ato 2",
};
/** Gestori telefonici: solo con la partita IVA (le parole da sole, «canone», «abbonamento», sono di tutti). */
export const GESTORI_TELEFONO: Record<string, string> = {
  "00488410010": "TIM",
  "13378520152": "Wind Tre",
  "12878470157": "Fastweb",
  "08539010010": "Vodafone Italia",
  "13970161009": "Iliad Italia",
};
const PAROLE_ACQUA = /servizio idrico|acquedott|fognatura|depurazion|quota fissa acqua|tariffa acquedotto/i;
const PAROLE_TELEFONO = /canone|abbonament|traffic|chiamat|\bsim\b|esim|ricaric|internet|fibra|adsl|\bgiga|opzione|costi fissi|costi variabili|\blinea\b|unlimited|infinito/i;
const TIPO_CODICE_ACQUA = /^\s*(fornitura|cod(ice)?\.?\s*(utenza|fornitura|servizio)|punto di fornitura|n\.?\s*utenza)\s*$/i;
const CODICE_ACQUA_NEL_TESTO = /\b(?:cod(?:ice)?\.?\s*(?:utenza|fornitura)|n\.?\s*utenza)\s*[:.\-n°]*\s*([0-9A-Z][0-9A-Z/-]{4,24})/i;
const NUMERO_LINEA = /\b(?:numero|linea|utenza|n\.)\s*(?:di\s+linea\s*|telefonic[oa]\s*)?[:.]?\s*((?:3\d{8,9})|(?:0\d{5,10}))\b/gi;

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

const data = (g: string, m: string, a: string) => {
  const d = new Date(Date.UTC(Number(a), Number(m) - 1, Number(g)));
  return d.getUTCMonth() === Number(m) - 1 ? `${a}-${m.padStart(2, "0")}-${g.padStart(2, "0")}` : null;
};

/**
 * Il periodo scritto a parole: «periodo 02/06/2026 - 01/09/2026», «dal 01/08/2026 al 31/08/2026»,
 * «01 agosto 2026 - 30 settembre 2026». Su più righe: dal primo inizio all'ultima fine.
 */
export function periodoDalTesto(testi: string[]): { dal: string; al: string } | null {
  const inizi: string[] = [];
  const fini: string[] = [];
  for (const t of testi) {
    for (const m of t.matchAll(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s*(?:-|–|al|a)\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/gi)) {
      const dal = data(m[1], m[2], m[3]);
      const al = data(m[4], m[5], m[6]);
      if (dal && al && dal <= al) { inizi.push(dal); fini.push(al); }
    }
    const mesi = MESI.join("|");
    for (const m of t.toLowerCase().matchAll(new RegExp(`(\\d{1,2})\\s+(${mesi})\\s+(\\d{4})\\s*(?:-|–|al)\\s*(\\d{1,2})\\s+(${mesi})\\s+(\\d{4})`, "g"))) {
      const dal = data(m[1], String(MESI.indexOf(m[2]) + 1), m[3]);
      const al = data(m[4], String(MESI.indexOf(m[5]) + 1), m[6]);
      if (dal && al && dal <= al) { inizi.push(dal); fini.push(al); }
    }
  }
  if (!inizi.length) return null;
  return { dal: inizi.sort()[0], al: fini.sort()[fini.length - 1] };
}

function indirizzoDi(righe: RigaFatturaLetta[]): string | null {
  for (const r of righe) for (const a of r.altriDati) {
    if (/IND/i.test(a.tipo) && a.testo?.trim()) {
      const comune = r.altriDati.find((x) => /^\s*comune\s*$/i.test(x.tipo) && x.testo?.trim())?.testo?.trim();
      return comune && !a.testo.toLowerCase().includes(comune.toLowerCase()) ? `${a.testo.trim()}, ${comune}` : a.testo.trim();
    }
  }
  return null;
}

/** Partita IVA del fornitore e codice cliente (`RiferimentoAmministrazione`) dal CedentePrestatore. */
function cedenteDi(xml: string): { piva: string | null; codiceCliente: string | null } {
  const cedente = senzaPrefissi(xml).match(/<CedentePrestatore>([\s\S]*?)<\/CedentePrestatore>/)?.[1] ?? "";
  const piva = cedente.match(/<IdFiscaleIVA>[\s\S]*?<IdCodice>\s*([^<\s]+)\s*<\/IdCodice>/)?.[1] ?? null;
  const cliente = cedente.match(/<RiferimentoAmministrazione>\s*([^<]+?)\s*<\/RiferimentoAmministrazione>/)?.[1] ?? null;
  return { piva: piva?.replace(/^IT/i, "") ?? null, codiceCliente: cliente };
}

/**
 * Acqua o telefono: tutto il documento è una sola utenza. Il codice, in ordine: quello che il
 * gestore scrive (fornitura/utenza per l'acqua; codice cliente o numero di linea per il telefono);
 * per il telefono senza nessun codice, il gestore. Null se non è una bolletta di acqua o telefono.
 */
function utenzaDelDocumento(xml: string, rif: ReturnType<typeof leggiRiferimentiFattura>): { codice: string; tipo: TipoUtenza } | null {
  const { piva, codiceCliente } = cedenteDi(xml);
  const testoRighe = rif.righe.map((r) => r.descrizione).join(" ");
  const testo = `${rif.causale} ${testoRighe}`;

  if ((piva && GESTORI_ACQUA[piva]) || PAROLE_ACQUA.test(testo)) {
    for (const r of rif.righe) for (const a of r.altriDati) {
      const v = (a.testo ?? (a.numero != null ? String(a.numero) : "")).trim();
      if (TIPO_CODICE_ACQUA.test(a.tipo) && /[0-9]{5,}/.test(v)) return { codice: v.toUpperCase().replace(/\s/g, ""), tipo: "acqua" };
    }
    const nelTesto = `${testo} ${rif.contratti.map((c) => c.testo).join(" ")}`.match(CODICE_ACQUA_NEL_TESTO);
    if (nelTesto && /\d{5,}/.test(nelTesto[1])) return { codice: nelTesto[1].toUpperCase(), tipo: "acqua" };
    if (piva && GESTORI_ACQUA[piva]) return null; // allacciamenti, contributi: lavori, non consumi
  }

  if (piva && GESTORI_TELEFONO[piva] && PAROLE_TELEFONO.test(testoRighe)) {
    if (codiceCliente && /\d{5,}/.test(codiceCliente)) return { codice: `Cliente ${codiceCliente.toUpperCase()}`, tipo: "telefono" };
    const linee = new Set([...testo.matchAll(NUMERO_LINEA)].map((m) => m[1]));
    if (linee.size === 1) return { codice: `Linea ${[...linee][0]}`, tipo: "telefono" };
    return { codice: `${GESTORI_TELEFONO[piva]} ${piva}`, tipo: "telefono" };
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
  // Niente POD né PDR: acqua o telefono, una sola utenza per tutto il documento.
  if (!perCodice.size) {
    const c = utenzaDelDocumento(xml, rif);
    if (c) { perCodice.set(c.codice, { tipo: c.tipo, righe: rif.righe }); senzaCodice = []; }
  }

  const utenze: UtenzaLetta[] = [...perCodice.entries()].map(([codice, g]) => {
    const inizi = g.righe.map((r) => r.dataInizio).filter((d): d is string => !!d).sort();
    const fini = g.righe.map((r) => r.dataFine).filter((d): d is string => !!d).sort();
    const energia = g.righe.filter((r) => /^(KWH|SMC|MC|M3)$/i.test((r.unitaLetta ?? "").trim()) && r.quantita != null);
    const consumo = energia.length ? Math.max(...energia.map((r) => Number(r.quantita))) : null;
    const testo = g.righe.flatMap((r) => [r.descrizione, ...r.altriDati.map((a) => a.testo ?? "")]).join(" ");
    const scritti = [rif.causale, ...g.righe.map((r) => r.descrizione)];
    const daMese = inizi.length ? null : (periodoDalTesto(scritti) ?? periodoDaMese(scritti.join(" ")));
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

/**
 * Vero se l'XML può essere una bolletta: POD, PDR etichettato, un gestore di acqua o telefono, o
 * le parole del servizio idrico. Filtro veloce prima di leggerla. È un po' più largo di
 * `private.sembra_bolletta` nel database (che per le parole dell'acqua vuole anche un codice
 * utenza): non fa danno, perché senza codice la lettura non crea utenze.
 */
export function sembraBolletta(xml: string): boolean {
  if (POD.test(xml) || /<CodiceTipo>\s*PDR\s*<\/CodiceTipo>/i.test(xml) || PDR_ETICHETTATO.test(xml)) return true;
  const { piva } = cedenteDi(xml);
  return !!piva && (!!GESTORI_ACQUA[piva] || !!GESTORI_TELEFONO[piva]) || PAROLE_ACQUA.test(xml);
}
