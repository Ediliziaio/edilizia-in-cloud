/**
 * La catena di una fattura ricevuta: fattura → DDT → ordine → commessa,
 * fattura → contratto → commessa, fattura → codice/CUP → commessa (§7.5–7.8).
 *
 * Ogni collegamento conserva il PERCORSO che lo giustifica («riga 3 → DDT 1068
 * del 07/09 → ordine ODA-2026-0039 → commessa 25000068»): è quello che si mostra
 * a chi controlla, ed è quello che si salva nella traccia.
 *
 * Regole:
 *   - un numero di DDT vale solo insieme al fornitore e all'anno: lo stesso
 *     numero da un altro fornitore, o dello stesso fornitore un altro anno, è
 *     un altro documento e non è nemmeno candidato;
 *   - un numero d'ordine vale insieme a fornitore, anno e serie: lo stesso
 *     numero su un ordine di un ALTRO fornitore è un conflitto (i nostri ordini
 *     hanno numeri unici, quindi qualcuno ha sbagliato);
 *   - se l'ordine indica una commessa e l'indirizzo un'altra, non si sceglie:
 *     conflitto;
 *   - le righe che il XML lega a documenti diversi (RiferimentoNumeroLinea) si
 *     attribuiscono riga per riga: una fattura su due cantieri si RIPARTISCE,
 *     non è un conflitto;
 *   - trasporto e spese accessorie senza riferimento seguono le altre righe in
 *     proporzione al valore, e si dice che il criterio è quello;
 *   - nessuna memoria per fornitore: «l'ultima volta questo fornitore era sulla
 *     commessa X» non è una prova, e qui non entra.
 */
import { confrontaNumeri, giorniFra, indirizzoConfrontabile, nomeConfrontabile, numeroDocumento, soloAlfanumerico, centesimi } from "./normalizza.ts";
import {
  decidi,
  decidiTraFonti,
  type Candidato,
  type Decisione,
  type Esito,
  type Indicazione,
  type Prova,
} from "./riconciliazione.ts";
import type { RiferimentiFattura, RiferimentoDdt, RiferimentoDocumento, RigaFatturaLetta } from "./riferimentiFattura.ts";
import { ddtNeiTesti, ordiniNeiTesti, testiRiferimentiFattura } from "./riferimentiFattura.ts";

export interface DdtNoto {
  id: string;
  companyId: string;
  fornitoreId: string | null;
  numero: string;
  /** Data della bolla (o di ricezione, se la bolla non l'ha). */
  data: string | null;
  ordiniIds: string[];
  commessaId: string | null;
  magazzinoId: string | null;
}

export interface OrdineNoto {
  id: string;
  companyId: string;
  fornitoreId: string | null;
  numero: string;
  /** Il numero che il fornitore ha dato all'ordine (conferma d'ordine). */
  riferimentoFornitore?: string | null;
  data: string | null;
  commessaId: string | null;
  magazzinoId: string | null;
}

export interface ContrattoNoto {
  id: string;
  companyId: string;
  fornitoreId: string | null;
  numero: string;
  data: string | null;
  commessaId: string | null;
}

export interface CommessaNota {
  id: string;
  companyId: string;
  codice: string | null;
  indirizzoCantiere?: string | null;
  clienteNome?: string | null;
  clienteRagioneSociale?: string | null;
  cup?: string[];
  cig?: string[];
  /** Chiusa o archiviata: si può ancora collegare (fatture tardive), ma non da sola. */
  chiusa?: boolean;
}

export interface FatturaPerCatena {
  id: string;
  companyId: string;
  fornitoreId: string | null;
  data: string | null;
  riferimenti: RiferimentiFattura;
  /** DDT trovati nelle descrizioni (`ddtNelleDescrizioni`), se l'XML non li dichiara. */
  ddtNelTesto?: RiferimentoDdt[];
  /** Testo libero (causale, note, descrizioni) dove cercare codice commessa e indirizzo. */
  testo?: string;
}

export interface OpzioniCatena {
  /** Giorni fra la data del DDT in fattura e quella registrata (default 10: la ricezione può tardare). */
  toleranzaGiorniDdt?: number;
}

export interface Percorso {
  fonte: "ordine" | "ddt" | "ddt_ordine" | "contratto" | "codice_commessa" | "cup" | "cig" | "indirizzo" | "cliente";
  /** I passi, nell'ordine: «riga 3», «DDT 1068 del 2026-09-07», «ordine ODA-2026-0039». */
  passi: string[];
  /** Id dei documenti attraversati, per la traccia. */
  documenti: Array<{ tipo: "ddt" | "ordine" | "contratto" | "commessa" | "magazzino"; id: string }>;
}

// ─── DDT ─────────────────────────────────────────────────────────────────────

function annoDi(d: string | null | undefined): number | null {
  return d && /^\d{4}/.test(d) ? Number(d.slice(0, 4)) : null;
}

/**
 * Il DDT registrato che corrisponde a un DDT citato in fattura.
 * Automatico solo con stesso fornitore, stesso numero e data entro la tolleranza.
 */
export function abbinaDdt(
  rif: RiferimentoDdt,
  fattura: Pick<FatturaPerCatena, "companyId" | "fornitoreId">,
  ddtNoti: DdtNoto[],
  opz: OpzioniCatena = {},
): Decisione<DdtNoto> {
  const tolleranza = opz.toleranzaGiorniDdt ?? 10;
  if (!rif.numero) return decidi([], { datiUtili: ["numero DDT leggibile"] });
  if (!fattura.fornitoreId) return decidi([], { datiUtili: ["fornitore della fattura"] });
  const annoRif = rif.numero.anno ?? annoDi(rif.data);
  const candidati: Candidato<DdtNoto>[] = [];
  for (const d of ddtNoti) {
    if (d.companyId !== fattura.companyId) continue; // isolamento fra aziende: mai, nemmeno come candidato
    if (d.fornitoreId !== fattura.fornitoreId) continue; // un DDT è del suo fornitore
    const n = numeroDocumento(d.numero);
    if (confrontaNumeri(rif.numero, n) === "diverso") continue;
    const annoD = n?.anno ?? annoDi(d.data);
    if (annoRif != null && annoD != null && annoRif !== annoD) continue; // stesso numero, un altro anno
    const prove: Prova[] = [
      { campo: "fornitore", ruolo: "conferma", esito: "uguale", essenziale: true, testo: "stesso fornitore" },
      { campo: "numero_ddt", ruolo: "identifica", esito: "uguale", atteso: rif.testo, trovato: d.numero, testo: `DDT ${d.numero}` },
    ];
    const gg = giorniFra(rif.data, d.data);
    if (gg == null) prove.push({ campo: "data_ddt", ruolo: "conferma", esito: "mancante", testo: "data del DDT non confrontabile" });
    else
      prove.push({
        campo: "data_ddt",
        ruolo: "conferma",
        esito: Math.abs(gg) <= tolleranza ? "uguale" : "diverso",
        atteso: rif.data,
        trovato: d.data,
        testo: Math.abs(gg) <= tolleranza ? `data compatibile (${d.data})` : `date lontane ${Math.abs(gg)} giorni (${rif.data} / ${d.data})`,
      });
    candidati.push({ id: d.id, dato: d, prove });
  }
  const dec = decidi(candidati, { automaticoConsentito: true, datiUtili: ["DDT registrato nel gestionale"] });
  // Automatico solo se anche la data conferma: un numero da solo, senza data, si propone.
  if (dec.esito === "automatico") {
    const c = dec.candidati.find((x) => x.id === dec.sceltoId);
    if (!c?.prove.some((p) => p.campo === "data_ddt" && p.esito === "uguale"))
      return { ...dec, esito: "proposta", mancanti: ["data del DDT"] };
  }
  return dec;
}

// ─── Ordini e contratti ──────────────────────────────────────────────────────

/** L'ordine (nostro) a cui si riferisce un `DatiOrdineAcquisto`. */
export function abbinaOrdine(
  rif: RiferimentoDocumento,
  fattura: Pick<FatturaPerCatena, "companyId" | "fornitoreId">,
  ordini: OrdineNoto[],
): Decisione<OrdineNoto> {
  if (!rif.numero) return decidi([], { datiUtili: ["numero d'ordine leggibile"] });
  const annoRif = rif.numero.anno ?? annoDi(rif.data);
  const candidati: Candidato<OrdineNoto>[] = [];
  for (const o of ordini) {
    if (o.companyId !== fattura.companyId) continue;
    const nostro = numeroDocumento(o.numero);
    const loro = numeroDocumento(o.riferimentoFornitore ?? null);
    const cNostro = confrontaNumeri(rif.numero, nostro);
    const cLoro = confrontaNumeri(rif.numero, loro);
    if (cNostro === "diverso" && cLoro === "diverso") continue;
    const annoO = (cNostro !== "diverso" ? nostro?.anno : loro?.anno) ?? annoDi(o.data);
    if (annoRif != null && annoO != null && annoRif !== annoO) continue;
    const prove: Prova[] = [
      {
        campo: "numero_ordine",
        ruolo: "identifica",
        esito: "uguale",
        atteso: rif.testo,
        trovato: cNostro !== "diverso" ? o.numero : o.riferimentoFornitore,
        testo: cNostro !== "diverso" ? `ordine ${o.numero}` : `conferma d'ordine ${o.riferimentoFornitore} (ordine ${o.numero})`,
      },
    ];
    if (fattura.fornitoreId && o.fornitoreId)
      prove.push({
        campo: "fornitore",
        ruolo: "conferma",
        esito: fattura.fornitoreId === o.fornitoreId ? "uguale" : "diverso",
        essenziale: true,
        testo: fattura.fornitoreId === o.fornitoreId ? "stesso fornitore" : "l'ordine è di un altro fornitore",
      });
    else prove.push({ campo: "fornitore", ruolo: "conferma", esito: "mancante", testo: "fornitore non confrontabile" });
    candidati.push({ id: o.id, dato: o, prove });
  }
  const dec = decidi(candidati, { automaticoConsentito: true, datiUtili: ["ordine registrato nel gestionale"] });
  if (dec.esito === "automatico") {
    const c = dec.candidati.find((x) => x.id === dec.sceltoId);
    if (!c?.prove.some((p) => p.campo === "fornitore" && p.esito === "uguale")) return { ...dec, esito: "proposta", mancanti: ["fornitore"] };
  }
  return dec;
}

export function abbinaContratto(
  rif: RiferimentoDocumento,
  fattura: Pick<FatturaPerCatena, "companyId" | "fornitoreId">,
  contratti: ContrattoNoto[],
): Decisione<ContrattoNoto> {
  return abbinaOrdine(
    rif,
    fattura,
    contratti.map((c): OrdineNoto => ({ ...c, magazzinoId: null, riferimentoFornitore: null })),
  ) as unknown as Decisione<ContrattoNoto>;
}

// ─── La commessa, riga per riga ──────────────────────────────────────────────

export type Destinazione = { tipo: "commessa" | "magazzino"; id: string } | { tipo: "da_attribuire"; id: null };

export interface Allocazione {
  destinazione: Destinazione;
  importo: number;
  righe: number[];
  criterio: "riga" | "proporzionale_accessori";
  percorsi: Percorso[];
}

export interface EsitoRiga {
  numeroLinea: number;
  importo: number;
  decisione: Decisione;
  percorsi: Percorso[];
}

export interface CatenaFattura {
  ddt: Array<{ riferimento: RiferimentoDdt; decisione: Decisione<DdtNoto> }>;
  ordini: Array<{ riferimento: RiferimentoDocumento; decisione: Decisione<OrdineNoto> }>;
  contratti: Array<{ riferimento: RiferimentoDocumento; decisione: Decisione<ContrattoNoto> }>;
  righe: EsitoRiga[];
  /** L'esito complessivo per la destinazione del costo. */
  esito: Esito;
  motivo: string;
  allocazioni: Allocazione[];
}

const ACCESSORIA = /\b(trasport\w*|spedizion\w*|consegna|imball\w*|nolo|porto|contributo\s+(raee|ambientale|conai)|spese\s+(di\s+)?(incasso|bancarie|accessorie)|bollo)\b/i;

/** Riga di spesa accessoria (trasporto, imballo, bollo…): segue le altre righe. */
export function rigaAccessoria(r: RigaFatturaLetta): boolean {
  return r.tipoCessione === "AC" || ACCESSORIA.test(r.descrizione);
}

const DA_ATTRIBUIRE: Destinazione = { tipo: "da_attribuire", id: null };

function chiaveDest(d: Destinazione): string {
  return `${d.tipo}:${d.id ?? ""}`;
}

function destDaValore(v: string): Destinazione {
  const [tipo, id] = v.split(":");
  return tipo === "commessa" || tipo === "magazzino" ? { tipo, id } : { tipo: "da_attribuire", id: null };
}

/**
 * Costruisce la catena completa dai documenti già registrati dell'azienda.
 * Un collegamento confermato da una persona si passa come documento noto
 * (DDT, ordine) e vale come gli altri.
 */
export function costruisciCatena(
  fattura: FatturaPerCatena,
  noti: { ddt: DdtNoto[]; ordini: OrdineNoto[]; contratti: ContrattoNoto[]; commesse: CommessaNota[] },
  opz: OpzioniCatena = {},
): CatenaFattura {
  const commesse = noti.commesse.filter((c) => c.companyId === fattura.companyId);
  const ordiniPerId = new Map(noti.ordini.filter((o) => o.companyId === fattura.companyId).map((o) => [o.id, o]));
  const rif = fattura.riferimenti;
  const unici = <T extends RiferimentoDdt>(rs: T[]): T[] => [...new Map(rs.map(r => [`${r.numero?.chiave ?? r.testo}|${r.data ?? ""}|${[...r.righe].sort((a,b)=>a-b).join(",")}`, r])).values()];
  const ddtCitati = unici([...rif.ddt, ...ddtNeiTesti(rif, fattura.testo), ...(fattura.ddtNelTesto ?? [])]);
  const ordiniCitati = unici([...rif.ordini, ...ordiniNeiTesti(rif, fattura.testo)]);

  const ddt = ddtCitati.map((r) => ({ riferimento: r, decisione: abbinaDdt(r, fattura, noti.ddt, opz) }));
  const ordini = ordiniCitati.map((r) => ({ riferimento: r, decisione: abbinaOrdine(r, fattura, noti.ordini) }));
  const contratti = rif.contratti.map((r) => ({ riferimento: r, decisione: abbinaContratto(r, fattura, noti.contratti) }));

  // Le indicazioni FORTI, con le righe a cui valgono (vuoto = tutto il documento).
  type IndRighe = Indicazione & { righe: number[]; percorso: Percorso };
  const forti: IndRighe[] = [];
  const scelto = <T>(d: Decisione<T>) =>
    d.esito === "automatico" ? (d.candidati.find((c) => c.id === d.sceltoId)?.dato as T | undefined) : undefined;

  const destDiOrdine = (o: OrdineNoto): string | null =>
    o.commessaId ? `commessa:${o.commessaId}` : o.magazzinoId ? `magazzino:${o.magazzinoId}` : null;

  for (const { riferimento: r, decisione } of ddt) {
    const d = scelto(decisione);
    if (!d) continue;
    const base = `DDT ${d.numero}${d.data ? ` del ${d.data}` : ""}`;
    if (d.commessaId || d.magazzinoId) {
      const valore = d.commessaId ? `commessa:${d.commessaId}` : `magazzino:${d.magazzinoId}`;
      forti.push({
        valore,
        fonte: "ddt",
        forte: true,
        testo: `${base} consegnato ${d.commessaId ? "in cantiere" : "a magazzino"}`,
        righe: r.righe,
        percorso: { fonte: "ddt", passi: [base], documenti: [{ tipo: "ddt", id: d.id }] },
      });
    }
    for (const oid of d.ordiniIds) {
      const o = ordiniPerId.get(oid);
      const v = o && destDiOrdine(o);
      if (!o || !v) continue;
      forti.push({
        valore: v,
        fonte: "ddt_ordine",
        forte: true,
        testo: `${base} → ordine ${o.numero}`,
        righe: r.righe,
        percorso: { fonte: "ddt_ordine", passi: [base, `ordine ${o.numero}`], documenti: [{ tipo: "ddt", id: d.id }, { tipo: "ordine", id: o.id }] },
      });
    }
  }
  for (const { riferimento: r, decisione } of ordini) {
    const o = scelto(decisione);
    const v = o && destDiOrdine(o);
    if (!o || !v) continue;
    forti.push({
      valore: v,
      fonte: "ordine",
      forte: true,
      testo: `ordine ${o.numero}`,
      righe: r.righe,
      percorso: { fonte: "ordine", passi: [`ordine ${o.numero}`], documenti: [{ tipo: "ordine", id: o.id }] },
    });
  }
  for (const { riferimento: r, decisione } of contratti) {
    const c = scelto(decisione);
    if (!c?.commessaId) continue;
    forti.push({
      valore: `commessa:${c.commessaId}`,
      fonte: "contratto",
      forte: true,
      testo: `contratto ${c.numero}`,
      righe: r.righe,
      percorso: { fonte: "contratto", passi: [`contratto ${c.numero}`], documenti: [{ tipo: "contratto", id: c.id }] },
    });
  }

  // Un codice nella riga vale per quella riga; la causale vale per il documento.
  const testi = testiRiferimentiFattura(rif, fattura.testo);
  for (const c of commesse) {
    const comm = `commessa:${c.id}`;
    for (const cup of c.cup ?? [])
      if (rif.cup.includes(cup.toUpperCase())) {
        const ambiti = testi.filter(t => parolaIntera(t.testo, cup));
        for (const t of ambiti.length ? ambiti : [{ righe: [] as number[] }])
          forti.push({ valore: comm, fonte: "cup", forte: true, testo: `CUP ${cup}`, righe: t.righe, percorso: { fonte: "cup", passi: [`CUP ${cup}`], documenti: [{ tipo: "commessa", id: c.id }] } });
      }
    for (const cig of c.cig ?? [])
      if (rif.cig.includes(cig.toUpperCase())) {
        const ambiti = testi.filter(t => parolaIntera(t.testo, cig));
        for (const t of ambiti.length ? ambiti : [{ righe: [] as number[] }])
          forti.push({ valore: comm, fonte: "cig", forte: true, testo: `CIG ${cig}`, righe: t.righe, percorso: { fonte: "cig", passi: [`CIG ${cig}`], documenti: [{ tipo: "commessa", id: c.id }] } });
      }
    const cod = soloAlfanumerico(c.codice);
    // Codice con lettere e cifre, o di almeno 6 cifre: un numero corto nudo è anche una quantità o un DDT.
    if (cod.length >= 4 && (/[A-Z]/.test(cod) ? /\d/.test(cod) : cod.length >= 6))
      for (const t of testi.filter(t => parolaIntera(t.testo, c.codice ?? "")))
        forti.push({ valore: comm, fonte: "codice_commessa", forte: true, testo: `codice commessa ${c.codice}`, righe: t.righe, percorso: { fonte: "codice_commessa", passi: [`codice ${c.codice}`], documenti: [{ tipo: "commessa", id: c.id }] } });
  }

  // Indirizzo e nome del cliente sono indizi, sempre da confermare.
  const deboli: IndRighe[] = [];
  for (const c of commesse) for (const t of testi) {
    const testoInd = ` ${indirizzoConfrontabile(t.testo)} `;
    const ind = indirizzoConfrontabile(c.indirizzoCantiere);
    if (ind.length >= 10 && /\d/.test(ind) && testoInd.includes(` ${ind} `))
      deboli.push({
        valore: `commessa:${c.id}`,
        fonte: "indirizzo",
        forte: false,
        testo: `indirizzo del cantiere (${c.indirizzoCantiere})`,
        righe: t.righe,
        percorso: { fonte: "indirizzo", passi: [`indirizzo ${c.indirizzoCantiere}`], documenti: [{ tipo: "commessa", id: c.id }] },
      });
    const testoNome = ` ${nomeConfrontabile(t.testo)} `;
    for (const nome of [...new Set([c.clienteNome, c.clienteRagioneSociale].filter(Boolean))]) {
      const n = nomeConfrontabile(nome);
      if (n.length < 6 || (n.split(" ").length < 2 && n.length < 8) || ["condominio", "cliente", "amministrazione", "costruzioni"].includes(n) || !testoNome.includes(` ${n} `)) continue;
      deboli.push({ valore: `commessa:${c.id}`, fonte: "cliente", forte: false, testo: `cliente citato in fattura (${nome})`, righe: t.righe,
        percorso: { fonte: "cliente", passi: [`cliente ${nome}`], documenti: [{ tipo: "commessa", id: c.id }] } });
    }
  }

  // Riga per riga: le indicazioni della riga + quelle del documento.
  const conDestinazionePropria = (r: RigaFatturaLetta) => [...forti, ...deboli].some(f => f.righe.includes(r.numeroLinea));
  const righeMerce = rif.righe.filter(r => !rigaAccessoria(r) || conDestinazionePropria(r));
  const accessorie = rif.righe.filter(r => rigaAccessoria(r) && !conDestinazionePropria(r));
  const perRiga = (n: number) => {
    const proprie = forti.filter((f) => f.righe.includes(n));
    const docu = forti.filter((f) => f.righe.length === 0);
    // Un riferimento di riga vince su uno di documento SOLO se il documento non lo contraddice:
    // le indicazioni di documento valgono per ogni riga e partecipano al confronto.
    const fortiRiga = [...proprie, ...docu];
    // L'indirizzo che conferma una fonte forte toglie di mezzo gli altri indirizzi
    // (due commesse nello stesso stabile); se nessun indirizzo la conferma, contano tutti.
    const deboliRiga = deboli.filter(d => !d.righe.length || d.righe.includes(n));
    const conferma = deboliRiga.filter((d) => fortiRiga.some((f) => f.valore === d.valore));
    return [...fortiRiga, ...(conferma.length ? conferma : deboliRiga)];
  };
  const esitiRiga: EsitoRiga[] = righeMerce.map((r) => {
    const ind = perRiga(r.numeroLinea);
    const decisione = decidiTraFonti(ind, { automaticoConsentito: true, datiUtili: ["ordine, DDT, codice commessa o CUP"] });
    // Il percorso che giustifica la scelta; in conflitto o in scelta, tutti, perché vanno mostrati.
    const giusti = decisione.sceltoId ? ind.filter((i) => i.valore === decisione.sceltoId) : ind;
    return { numeroLinea: r.numeroLinea, importo: r.totale, decisione, percorsi: giusti.map((i) => i.percorso) };
  });

  // Fattura senza righe merce (solo accessorie, o righe illeggibili): decide il documento.
  const docDecisione = decidiTraFonti([...forti.filter((f) => f.righe.length === 0), ...deboli.filter(d => !d.righe.length)], { automaticoConsentito: true });

  const conflitti = esitiRiga.filter((e) => e.decisione.esito === "conflitto");
  const allocazioni: Allocazione[] = [];
  const add = (dest: Destinazione, importo: number, riga: number, criterio: Allocazione["criterio"], percorsi: Percorso[]) => {
    const k = chiaveDest(dest);
    let a = allocazioni.find((x) => chiaveDest(x.destinazione) === k && x.criterio === criterio);
    if (!a) {
      a = { destinazione: dest, importo: 0, righe: [], criterio, percorsi: [] };
      allocazioni.push(a);
    }
    a.importo = centesimi(a.importo + importo) / 100;
    a.righe.push(riga);
    for (const p of percorsi) if (!a.percorsi.some((x) => JSON.stringify(x) === JSON.stringify(p))) a.percorsi.push(p);
  };
  for (const e of esitiRiga) {
    const ok = e.decisione.esito === "automatico" || e.decisione.esito === "proposta";
    const dest = ok && e.decisione.sceltoId ? destDaValore(e.decisione.sceltoId) : DA_ATTRIBUIRE;
    add(dest, e.importo, e.numeroLinea, "riga", ok ? e.percorsi : []);
  }
  // Accessori: in proporzione al valore delle righe attribuite. Se c'è una sola destinazione, tutto lì.
  const baseMerce = allocazioni.filter((a) => a.destinazione.tipo !== "da_attribuire").reduce((s, a) => s + a.importo, 0);
  for (const r of accessorie) {
    if (!allocazioni.length || baseMerce === 0) {
      const dest = (docDecisione.esito === "automatico" || docDecisione.esito === "proposta") && docDecisione.sceltoId
        ? destDaValore(docDecisione.sceltoId)
        : DA_ATTRIBUIRE;
      add(dest, r.totale, r.numeroLinea, "riga", []);
      continue;
    }
    const attribuite = allocazioni.filter((a) => a.destinazione.tipo !== "da_attribuire" && a.criterio === "riga");
    let resto = centesimi(r.totale);
    attribuite.forEach((a, i) => {
      const quota = i === attribuite.length - 1 ? resto : Math.round((centesimi(r.totale) * a.importo) / baseMerce);
      resto -= quota;
      add(a.destinazione, quota / 100, r.numeroLinea, "proporzionale_accessori", []);
    });
  }

  // Esito complessivo.
  let esito: Esito;
  let motivo: string;
  const esitiTutti = esitiRiga.length ? esitiRiga.map((e) => e.decisione.esito) : [docDecisione.esito];
  if (conflitti.length || (!esitiRiga.length && docDecisione.esito === "conflitto")) {
    esito = "conflitto";
    motivo = (conflitti[0]?.decisione ?? docDecisione).motivo;
  } else if (esitiTutti.every((x) => x === "nessuno")) {
    esito = "nessuno";
    motivo = "nessun ordine, DDT, contratto, codice o CUP porta a una commessa o a un magazzino";
  } else if (esitiTutti.includes("scelta")) {
    esito = "scelta";
    motivo = "più commesse possibili: va scelta";
  } else if (esitiTutti.every((x) => x === "automatico")) {
    esito = "automatico";
    motivo = allocazioni.length > 1 ? "ripartita riga per riga dai documenti collegati" : (esitiRiga[0]?.decisione ?? docDecisione).motivo;
  } else {
    esito = "proposta";
    motivo = esitiTutti.includes("nessuno") ? "una parte delle righe resta da attribuire" : "da confermare";
  }
  return { ddt, ordini, contratti, righe: esitiRiga, esito, motivo, allocazioni };
}

/** Il codice compare come parola a sé (non dentro un numero più lungo). */
function parolaIntera(testo: string, codice: string): boolean {
  const c = codice.trim();
  if (!c) return false;
  const esc = c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^A-Za-z0-9])${esc}([^A-Za-z0-9]|$)`, "i").test(testo);
}
