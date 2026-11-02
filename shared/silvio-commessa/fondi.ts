/**
 * Fusione dei frammenti e modifiche della bozza (31/10/2026, fase 0, lotto 0.1).
 * Vedi docs/piano-silvio-commessa-ai.md, sezioni 3.3 e 5.1.
 *
 * - `fondi(piano, frammento)`: unisce quello che un lettore ha trovato. Rispetta
 *   l'ordine di fiducia di TIPI_FONTE; un valore scritto da una persona non si tocca;
 *   se due fonti diverse dicono valori diversi nasce un Conflitto e decide l'utente.
 * - `applica(piano, modifica, storia)`: le modifiche a mano e quelle della chat, con
 *   il passo per l'annulla. `annulla(piano, storia)` torna indietro di un passo.
 *
 * Fase 3 (31/10/2026): una modifica che arriva con altre (una risposta della chat, la data
 * d'inizio che data le fasi) ha un `gruppo`, e l'annulla le toglie tutte insieme. Le fasi
 * che una commessa ha già senza date ricevono le date da un'altra fonte come proposta, in
 * `fasi.date_fasi`: aggiungere una data che manca non è sovrascrivere.
 *
 * Funzioni pure: non toccano il piano che ricevono, ne restituiscono uno nuovo.
 * Senza dipendenze, compatibile con Deno.
 */
import {
  AREE, TIPI_FONTE, inVigore, tipoDOrigine,
  type Area, type Conflitto, type FaseDelPiano, type Fonte, type Frammento, type Modifica, type PianoCommessa, type Valore,
} from "./piano.ts";
import { variabile } from "./registro.ts";
import { CALENDARIO_NAZIONALE, spostaLavorativi, type CalendarioCantiere } from "./calendario.ts";
import { conQuadratura } from "./quadratura.ts";

/** Un piano vuoto, da cui parte la bozza. */
export function pianoVuoto(companyId: string, orderId: string | null = null): PianoCommessa {
  return { orderId, companyId, aree: {}, conflitti: [], fonti: [], avvisi: [] };
}

/** Posizione nell'ordine di fiducia: 0 è la più fidata (la persona). */
export function rangoFonte(fonte: Fonte): number {
  const i = TIPI_FONTE.indexOf(fonte.tipo);
  return i < 0 ? TIPI_FONTE.length : i;
}

/** Stessa fonte = stesso documento: stesso tipo e stesso id (o, senza id, stessa etichetta). */
export function stessaFonte(a: Fonte, b: Fonte): boolean {
  if (a.tipo !== b.tipo) return false;
  if (a.id || b.id) return (a.id ?? null) === (b.id ?? null);
  return a.etichetta === b.etichetta;
}

/**
 * Due valori dicono la stessa cosa? Confronto profondo; gli importi si confrontano
 * al centesimo, i testi senza spazi ai bordi, un campo null come un campo assente.
 */
export function stessoValore(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 0.005;
  if (typeof a === "string" && typeof b === "string") return a.trim() === b.trim();
  if (a === b) return true;
  if (a == null || b == null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => stessoValore(x, b[i]));
  }
  // Un campo a null vale come un campo che manca (revisione 1/11, L13): una rata con
  // `trigger_numero: null` e una senza il campo sono la stessa rata, non un conflitto.
  const ka = Object.keys(a as object).filter((k) => (a as Record<string, unknown>)[k] != null);
  const kb = Object.keys(b as object).filter((k) => (b as Record<string, unknown>)[k] != null);
  return ka.length === kb.length
    && ka.every((k) => stessoValore((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

const NOTA_CONFLITTO = "Le fonti non sono d'accordo: scegli tu quale tenere.";

// ── Quando due fonti dicono la stessa cosa (revisione 2/11, G13) ─────────────
// Solo i testi si leggono con larghezza: un numero diverso resta un numero diverso.

const senzaAccenti = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const testoPiano = (s: string) => senzaAccenti(s).toLowerCase().replace(/\s+/g, " ").trim();

/** Come `stessoValore`, ma i testi senza maiuscole, accenti e spazi doppi. */
function stessoTesto(a: unknown, b: unknown): boolean {
  if (typeof a === "string" && typeof b === "string") return testoPiano(a) === testoPiano(b);
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => stessoTesto(x, b[i]));
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    const pieni = (o: object) => Object.entries(o).filter(([, x]) => x != null);
    const pa = pieni(a);
    return pa.length === pieni(b).length && pa.every(([k, x]) => stessoTesto(x, (b as Record<string, unknown>)[k]));
  }
  return stessoValore(a, b);
}

/**
 * Le parole di un indirizzo, senza punteggiatura né sigla della provincia. La sigla è solo
 * l'ultima parola (terza revisione, 5): «Via XX Settembre», «Via Po 3» hanno parole di due lettere
 * che distinguono la via. «Via Po» da sola resta di due parole: lì «po» è la via.
 */
const paroleIndirizzo = (s: string) => {
  const parole = testoPiano(s).split(/[^a-z0-9]+/).filter(Boolean);
  return new Set(parole.length > 2 && /^[a-z]{2}$/.test(parole[parole.length - 1]) ? parole.slice(0, -1) : parole);
};

/** «Via Roma 1 - Milano» e «Via Roma 1, 20121 Milano (MI)»: una dice tutte le parole dell'altra. */
function stessoIndirizzo(a: string, b: string): boolean {
  const [corto, lungo] = [paroleIndirizzo(a), paroleIndirizzo(b)].sort((x, y) => x.size - y.size);
  return corto.size >= 2 && [...corto].every((p) => lungo.has(p));
}

const oggettoDi = (v: unknown): Record<string, unknown> | null =>
  (v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null);
const pieneDi = (o: Record<string, unknown>) => Object.entries(o).filter(([, x]) => x != null && x !== "");

/**
 * «Via Roma» contro «Via Roma 5, Bari»: l'indirizzo `meno` lascia fuori il civico o la città di
 * `piu`. Il CAP e la provincia in più non contano: non dicono un posto diverso.
 */
function diceMenoDi(chiave: string, meno: unknown, piu: unknown): boolean {
  if (chiave !== "cantiere.indirizzo") return false;
  const a = pieneDi(oggettoDi(meno) ?? {})[0]?.[1];
  const b = pieneDi(oggettoDi(piu) ?? {})[0]?.[1];
  if (typeof a !== "string" || typeof b !== "string") return false;
  const dette = paroleIndirizzo(a);
  return [...paroleIndirizzo(b)].some((p) => !dette.has(p) && !/^\d{5}$/.test(p) && !/^[a-z]{2}$/.test(p));
}
const soloCifre = (s: unknown) => String(s ?? "").replace(/\D/g, "").replace(/^(00)?39(?=\d{9,})/, "");

/** Lo stesso dato di una colonna: il telefono per le sue cifre. */
function stessaColonna(colonna: string, a: unknown, b: unknown): boolean {
  if (/phone/.test(colonna)) return soloCifre(a) === soloCifre(b);
  return stessoTesto(a, b);
}

/** I due valori dicono la stessa cosa, anche se uno dice di meno? */
function stessoSenso(chiave: string, a: unknown, b: unknown): boolean {
  if (stessoTesto(a, b)) return true;
  const oa = oggettoDi(a);
  const ob = oggettoDi(b);
  if (!oa || !ob || (variabile(chiave)?.colonne.length ?? 0) < 2) return false;
  if (chiave === "cantiere.indirizzo") {
    const ia = pieneDi(oa)[0]?.[1];
    const ib = pieneDi(ob)[0]?.[1];
    return typeof ia === "string" && typeof ib === "string" && stessoIndirizzo(ia, ib);
  }
  if (chiave === "cliente.nome") {
    // Persona o ditta è una scelta del lettore: conta il nome, in qualunque colonna stia.
    const nomi = (o: Record<string, unknown>) => pieneDi(o).map(([, x]) => testoPiano(String(x)));
    const [corti, lunghi] = [nomi(oa), nomi(ob)].sort((x, y) => x.length - y.length);
    return corti.length > 0 && corti.every((n) => lunghi.includes(n));
  }
  const comuni = pieneDi(oa).filter(([k]) => ob[k] != null && ob[k] !== "");
  return comuni.every(([k, x]) => stessaColonna(k, x, ob[k]));
}

/** Il valore più fidato, con le colonne che dice solo l'altro. */
function valoreUnito(chiave: string, fidato: unknown, altro: unknown): unknown {
  const of = oggettoDi(fidato);
  const oa = oggettoDi(altro);
  if (!of || !oa || chiave === "cantiere.indirizzo" || chiave === "cliente.nome") return fidato;
  return { ...Object.fromEntries(pieneDi(oa)), ...Object.fromEntries(pieneDi(of)) };
}

const FONTI_DEBOLI: readonly string[] = ["modello", "stima"];

function conValore(piano: PianoCommessa, area: Area, chiave: string, valore: Valore | null): PianoCommessa {
  const dellArea = { ...(piano.aree[area] ?? {}) };
  if (valore) dellArea[chiave] = valore;
  else delete dellArea[chiave];
  return { ...piano, aree: { ...piano.aree, [area]: dellArea } };
}

function senzaConflitto(conflitti: Conflitto[], area: Area, chiave: string): Conflitto[] {
  return conflitti.filter((c) => !(c.area === area && c.chiave === chiave));
}

/**
 * Candidati di una variabile dopo l'arrivo di `nuovo`: una rilettura della stessa
 * fonte sostituisce la lettura vecchia; a parità di valore resta la fonte più fidata;
 * l'ordine finale è quello di fiducia (a parità, chi c'era prima).
 */
function candidati(chiave: string, prima: Valore[], nuovo: Valore): Valore[] {
  const tutti = [...prima.filter((c) => !stessaFonte(c.fonte, nuovo.fonte)), nuovo];
  const unici: Valore[] = [];
  // Se il più fidato dice di meno, l'altro non lo completa: lo contraddice finché qualcuno non sceglie.
  const fidatoDiceMeno = (u: Valore, c: Valore) => (rangoFonte(c.fonte) < rangoFonte(u.fonte)
    ? diceMenoDi(chiave, c.valore, u.valore) : diceMenoDi(chiave, u.valore, c.valore));
  for (const c of tutti) {
    const i = unici.findIndex((u) => stessoSenso(chiave, u.valore, c.valore) && !fidatoDiceMeno(u, c));
    if (i < 0) unici.push(c);
    else if (rangoFonte(c.fonte) < rangoFonte(unici[i].fonte)) unici[i] = { ...c, valore: valoreUnito(chiave, c.valore, unici[i].valore) };
    else unici[i] = { ...unici[i], valore: valoreUnito(chiave, unici[i].valore, c.valore) };
  }
  // Un modello o una stima riempiono un vuoto: davanti a una fonte vera non si litiga (G13).
  const vere = unici.filter((c) => !FONTI_DEBOLI.includes(c.fonte.tipo));
  // Un ordine cumulativo contiene quelli di prima: la seconda offerta non contraddice la prima (G12).
  const scelte = chiave === "materiali.acquisti" ? senzaContenuti(vere.length ? vere : unici) : vere.length ? vere : unici;
  return scelte
    .map((c, i) => ({ c, i }))
    .sort((x, y) => rangoFonte(x.c.fonte) - rangoFonte(y.c.fonte) || x.i - y.i)
    .map((x) => x.c);
}

/** Toglie gli elenchi che stanno interi dentro un altro candidato. */
function senzaContenuti(lista: Valore[]): Valore[] {
  const dentro = (a: Valore, b: Valore) => Array.isArray(a.valore) && Array.isArray(b.valore)
    && a.valore.every((x) => (b.valore as unknown[]).some((y) => stessoValore(x, y)));
  return lista.filter((c) => !lista.some((d) => d !== c && dentro(c, d)));
}

/**
 * Il valore viene dalla commessa che si completa (fonte `persona` con l'id della commessa):
 * l'ha scritto una persona, Silvio non lo tocca. Le modifiche fatte nel popup sono `persona`
 * senza id: quelle no.
 */
export function giaNellaCommessa(piano: Pick<PianoCommessa, "orderId">, v: Pick<Valore, "fonte"> | null | undefined): boolean {
  return !!piano.orderId && !!v && v.fonte.tipo === "persona" && v.fonte.id === piano.orderId;
}

/** Il campo delle fasi che contiene la lista; ogni fase è un oggetto con `id?`, `name`, `start_date?`, `end_date?` (AAAA-MM-GG). */
const CHIAVE_FASI = "fasi.order_work_phases";
/** Le date proposte per le fasi che la commessa ha già senza date (fase 3). */
const CHIAVE_DATE_FASI = "fasi.date_fasi";

const nomeFase = (f: unknown) => String((f as { name?: unknown } | null)?.name ?? "").trim().replace(/\s+/g, " ").toLowerCase();
const datata = (f: FaseDelPiano | null | undefined) => !!f?.start_date;

/**
 * Le date che `nuove` dà alle fasi di `esistenti` che non ne hanno: per nome (come
 * `commessa_pianifica_fasi`), o per posizione se nessun nome combacia e gli elenchi sono
 * lunghi uguali. Una fase senza date ma con i giorni li porta, per la data d'inizio che
 * arriverà. Null se non c'è niente da proporre.
 */
export function dateProposteAlleFasi(esistenti: unknown, nuove: unknown): FaseDelPiano[] | null {
  if (!Array.isArray(esistenti) || !Array.isArray(nuove)) return null;
  const vecchie = esistenti as FaseDelPiano[];
  const fonti = (nuove as FaseDelPiano[]).filter((f) => f && typeof f === "object");
  if (!vecchie.some((f) => !datata(f))) return null;
  const perNome = vecchie.some((v) => fonti.some((n) => nomeFase(n) === nomeFase(v)));
  const out: FaseDelPiano[] = [];
  vecchie.forEach((v, i) => {
    if (datata(v)) return;
    const n = perNome ? fonti.find((x) => nomeFase(x) === nomeFase(v)) : fonti.length === vecchie.length ? fonti[i] : undefined;
    if (!n) return;
    const proposta: FaseDelPiano = { name: v.name };
    if (v.id) proposta.id = v.id;
    if (n.start_date && n.end_date) { proposta.start_date = n.start_date; proposta.end_date = n.end_date; }
    else if (n.giorni && n.giorno_inizio) { proposta.giorno_inizio = n.giorno_inizio; proposta.giorni = n.giorni; }
    else return;
    out.push(proposta);
  });
  return out.length ? out : null;
}

/** Un valore che non entra perché la variabile l'ha scritta una persona: si tiene da parte (L5). */
function conScartato(piano: PianoCommessa, area: Area, chiave: string, nuovo: Valore): PianoCommessa {
  const altri = (piano.scartati ?? []).filter((s) => !(s.area === area && s.chiave === chiave && stessaFonte(s.valore.fonte, nuovo.fonte)));
  return { ...piano, scartati: [...altri, { area, chiave, valore: nuovo }] };
}

const conAvviso = (piano: PianoCommessa, testo: string): PianoCommessa =>
  ((piano.avvisi ?? []).includes(testo) ? piano : { ...piano, avvisi: [...(piano.avvisi ?? []), testo] });

const inParole = (v: unknown): string => {
  if (typeof v === "number") return v.toLocaleString("it-IT", { maximumFractionDigits: 2, useGrouping: "always" });
  const o = oggettoDi(v);
  return o ? pieneDi(o).map(([, x]) => String(x)).join(", ") : String(v);
};
const NOMI_COLONNE: Readonly<Record<string, string>> = {
  client_email: "l'email", client_phone: "il telefono", client_name: "il nome", client_company: "la ragione sociale",
  dl_notification_email: "l'email del direttore dei lavori", dl_notification_phone: "il telefono del direttore dei lavori",
};

/**
 * Un documento su una colonna che la commessa ha già (revisione 2/11, G8). Il valore della
 * commessa resta, e se è diverso lo si dice; le colonne che le mancano diventano una proposta,
 * da confermare anche dove il livello della variabile è «da solo» (terza revisione, 8).
 */
function confrontoConCommessa(piano: PianoCommessa, area: Area, chiave: string, esistente: Valore, nuovo: Valore): PianoCommessa {
  const def = variabile(chiave);
  if (!def?.colonne.length || FONTI_DEBOLI.includes(nuovo.fonte.tipo) || nuovo.valore == null) return piano;
  const dice = `${nuovo.fonte.etichetta} dice ${inParole(nuovo.valore)} per «${def.etichetta}», la commessa ha ${inParole(esistente.valore)}: resta quello della commessa.`;
  const inCommessa = oggettoDi(esistente.valore);
  const arrivato = oggettoDi(nuovo.valore);
  if (!inCommessa || !arrivato) return stessoSenso(chiave, esistente.valore, nuovo.valore) ? piano : conAvviso(piano, dice);

  if (chiave === "cantiere.indirizzo") {
    return stessoSenso(chiave, esistente.valore, nuovo.valore) && !diceMenoDi(chiave, esistente.valore, nuovo.valore) ? piano : conAvviso(piano, dice);
  }
  const piena = (k: string) => inCommessa[k] != null && inCommessa[k] !== "";
  const base = pieneDi(arrivato).some(([k, x]) => piena(k) && !stessaColonna(k, x, inCommessa[k])) ? conAvviso(piano, dice) : piano;
  // Il nome scritto in un'altra colonna non è una colonna che manca, è lo stesso dato.
  const giaDetti = pieneDi(inCommessa).map(([, x]) => testoPiano(String(x)));
  const mancanti = pieneDi(arrivato).filter(([k, x]) => !piena(k) && !(chiave === "cliente.nome" && giaDetti.includes(testoPiano(String(x)))));
  if (!mancanti.length) return base;
  const nomi = mancanti.map(([k]) => NOMI_COLONNE[k] ?? "il dato che manca");
  return conValore(base, area, chiave, {
    ...nuovo, valore: { ...inCommessa, ...Object.fromEntries(mancanti) }, stato: "proposta", sopraCommessa: esistente, daConfermare: true,
    nota: `La commessa non ha ${nomi.join(" né ")}: te lo propongo dal ${nuovo.fonte.etichetta}. Il resto resta com'è.`,
  });
}

function fondiValore(piano: PianoCommessa, area: Area, chiave: string, arrivato: Valore): PianoCommessa {
  const esistente = piano.aree[area]?.[chiave];
  const aperto = piano.conflitti.find((c) => c.area === area && c.chiave === chiave);
  let nuovo = arrivato;

  // La commessa riletta (una bozza ripresa) non si porta via le colonne che le si stanno aggiungendo.
  if (giaNellaCommessa(piano, nuovo) && esistente?.sopraCommessa && !giaNellaCommessa(piano, esistente)) {
    return conValore(piano, area, chiave, {
      ...esistente, sopraCommessa: nuovo,
      ...(esistente.fonte.tipo === "persona" ? {} : { daConfermare: true }),
      valore: { ...(oggettoDi(esistente.valore) ?? {}), ...(oggettoDi(nuovo.valore) ?? {}) },
    });
  }
  // Quello che scrive una persona vince sempre, e non si rimette in discussione.
  if (nuovo.fonte.tipo === "persona" || nuovo.toccato) {
    return { ...conValore(piano, area, chiave, nuovo), conflitti: senzaConflitto(piano.conflitti, area, chiave) };
  }
  if (esistente?.fonte.tipo === "persona" || esistente?.toccato) {
    // Le fasi della commessa senza date: le date che dice un'altra fonte diventano una proposta.
    const date = chiave === CHIAVE_FASI && giaNellaCommessa(piano, esistente)
      ? dateProposteAlleFasi(esistente.valore, nuovo.valore) : null;
    if (!date) {
      return giaNellaCommessa(piano, esistente)
        ? confrontoConCommessa(piano, area, chiave, esistente!, nuovo)
        : conScartato(piano, area, chiave, nuovo);
    }
    return fondiValore(piano, "fasi", CHIAVE_DATE_FASI, {
      ...nuovo, valore: date, stato: "proposta",
      nota: `Le fasi della commessa non hanno date: te le propongo dal ${nuovo.fonte.etichetta}. Le fasi restano come sono.`,
    });
  }

  // Sopra una commessa: le colonne che ha già non cambiano, qualunque cosa dica il documento.
  const sopra = esistente?.sopraCommessa;
  if (sopra && oggettoDi(nuovo.valore)) {
    nuovo = { ...nuovo, sopraCommessa: sopra, daConfermare: true, valore: { ...oggettoDi(nuovo.valore), ...oggettoDi(sopra.valore) } };
  }
  const lista = candidati(chiave, aperto ? aperto.candidati : esistente ? [esistente] : [], nuovo);
  const altri = senzaConflitto(piano.conflitti, area, chiave);
  if (lista.length === 1) return { ...conValore(piano, area, chiave, lista[0]), conflitti: altri };

  // Fonti in disaccordo: non si sceglie. Nel piano resta la più fidata, segnata ⚠,
  // finché l'utente non decide con `scegli_fonte` o `cambia_valore`.
  const mostrato: Valore = { ...lista[0], stato: "attenzione", nota: NOTA_CONFLITTO };
  return {
    ...conValore(piano, area, chiave, mostrato),
    conflitti: [...altri, { area, chiave, candidati: lista }],
  };
}

/** Unisce un frammento al piano. Le chiavi che il registro non conosce diventano avvisi. */
export function fondi(piano: PianoCommessa, frammento: Frammento): PianoCommessa {
  const etichetta = frammento.fonte.etichetta;
  const avvisi = [...(piano.avvisi ?? []), ...(frammento.avvisi ?? []).map((a) => `${etichetta}: ${a}`)];
  let out: PianoCommessa = { ...piano, avvisi };

  for (const [nomeArea, valori] of Object.entries(frammento.aree)) {
    if (!(AREE as readonly string[]).includes(nomeArea)) {
      out = { ...out, avvisi: [...(out.avvisi ?? []), `${etichetta}: l'area «${nomeArea}» non esiste, ignorata`] };
      continue;
    }
    const area = nomeArea as Area;
    for (const [chiave, v] of Object.entries(valori ?? {})) {
      if (variabile(chiave)?.area !== area) {
        out = { ...out, avvisi: [...(out.avvisi ?? []), `${etichetta}: «${chiave}» non è una variabile dell'area ${area}, ignorata`] };
        continue;
      }
      out = fondiValore(out, area, chiave, { ...v, fonte: v.fonte ?? frammento.fonte });
    }
  }

  const fonti = out.fonti.some((f) => stessaFonte(f, frammento.fonte)) ? out.fonti : [...out.fonti, frammento.fonte];
  return conQuadratura(conNotaImponibile({ ...out, fonti }));
}

/**
 * Due importi che differiscono esattamente per l'IVA (revisione 2/11, G20): probabilmente sono
 * l'imponibile e l'ivato. Resta un conflitto, ma Silvio dice cosa ha capito.
 */
function conNotaImponibile(piano: PianoCommessa): PianoCommessa {
  const iva = inVigore(piano.aree.economia?.["economia.vat_rate"])?.valore;
  const conflitto = piano.conflitti.find((c) => c.chiave === "economia.total_amount");
  if (!conflitto || typeof iva !== "number" || iva <= 0) return piano;
  const importi = conflitto.candidati.map((c) => c.valore).filter((v): v is number => typeof v === "number");
  const netto = importi.find((a) => importi.some((b) => Math.abs(a * (1 + iva / 100) - b) <= 1));
  if (netto == null) return piano;
  const nota = `${inParole(Math.round(netto * (1 + iva / 100) * 100) / 100)} € è ${inParole(netto)} € più l'IVA al ${inParole(iva)} %: sembra lo stesso importo. Nella commessa va quello senza IVA, ${inParole(netto)} €, se è così.`;
  if (conflitto.nota === nota) return piano;
  const mostrato = piano.aree.economia?.["economia.total_amount"];
  const conN = mostrato && mostrato.alPostoDi === undefined ? conValore(piano, "economia", "economia.total_amount", { ...mostrato, nota }) : piano;
  return { ...conN, conflitti: conN.conflitti.map((c) => (c === conflitto ? { ...c, nota } : c)) };
}

// ── Modifiche e annulla ─────────────────────────────────────────────────────

/** Un passo della storia: com'erano le variabili toccate prima della modifica. */
export interface Passo {
  modifica: Modifica;
  /** Le modifiche nate insieme (una risposta della chat) hanno lo stesso gruppo: si annullano insieme. */
  gruppo?: string | null;
  prima: { area: Area; chiave: string; valore: Valore | null }[];
  /** I conflitti aperti, prima della modifica, sulle sole variabili toccate. */
  conflittiPrima: Conflitto[];
  /** I valori messi da parte che la modifica ha fatto rientrare: l'annulla li rimette da parte. */
  scartatiPrima?: NonNullable<PianoCommessa["scartati"]>;
}

export interface Bozza {
  piano: PianoCommessa;
  storia: Passo[];
}

function controllaChiave(area: Area, chiave: string): void {
  if (variabile(chiave)?.area !== area) throw new Error(`«${chiave}» non è una variabile dell'area ${area}`);
}

/**
 * `da` è il valore che la persona ha toccato: la fonte passa a `persona`, ma resta il tipo della
 * fonte d'origine, perché le voci di un computo spostato sono ancora le voci del computo.
 */
function daPersona(valore: unknown, etichetta: string, base?: Fonte, da?: Pick<Valore, "fonte" | "tipoOrigine"> | null): Valore {
  const fonte: Fonte = base
    ? { ...base, tipo: "persona", etichetta: `${etichetta}: ${base.etichetta}` }
    : { tipo: "persona", etichetta };
  const origine = da ? tipoDOrigine(da) : null;
  return { valore, fonte, fiducia: 1, stato: "fatto", nota: null, ...(origine && origine !== "persona" ? { tipoOrigine: origine } : {}) };
}

/**
 * Un elenco a cui la persona ha tolto o aggiunto un elemento (revisione 2/11, G5): quello che
 * era confermato resta confermato, quello che era una proposta resta una proposta. Prima
 * togliere una persona confermava tutte le altre.
 */
function elencoToccato(attuale: Valore, lista: unknown[]): Valore {
  const stato = attuale.quadratura?.stato ?? attuale.stato;
  if (attuale.fonte.tipo === "persona" || stato === "fatto") return daPersona(lista, "modificato da te", undefined, attuale);
  const { quadratura, ...resto } = attuale;
  if (stato === "attenzione") return { ...resto, valore: lista, stato: "proposta", nota: null, toccato: true, daConfermare: true };
  return { ...resto, valore: lista, stato, ...(quadratura ? { nota: quadratura.nota } : {}), toccato: true };
}

/** Le date singole che seguono la fine dei lavori. */
const DATE_FINALI = ["fasi.work_end_date", "fasi.expected_date"] as const;

/**
 * Sposta una data AAAA-MM-GG di `n` giorni lavorativi. Dalla fase 5 salta anche le feste
 * nazionali (Pasqua e Pasquetta comprese) e, col calendario dell'azienda, patrono, sabato e
 * chiusure (calendario.ts).
 */
export function spostaGiorniLavorativi(data: string, n: number, cal: CalendarioCantiere = CALENDARIO_NAZIONALE): string {
  return spostaLavorativi(data, n, cal);
}

function spostaFase(fase: unknown, n: number, cal: CalendarioCantiere): unknown {
  if (!fase || typeof fase !== "object") return fase;
  const f = { ...(fase as Record<string, unknown>) };
  for (const k of ["start_date", "end_date"]) {
    if (typeof f[k] === "string") f[k] = spostaGiorniLavorativi(f[k] as string, n, cal);
  }
  return f;
}

/** Le variabili toccate da una modifica, coi loro valori nuovi (null = tolta). */
function effetti(piano: PianoCommessa, modifica: Modifica): { area: Area; chiave: string; valore: Valore | null }[] {
  switch (modifica.tipo) {
    case "cambia_valore": {
      controllaChiave(modifica.area, modifica.chiave);
      const attuale = piano.aree[modifica.area]?.[modifica.chiave];
      const nota = modifica.nota !== undefined ? { nota: modifica.nota } : {};
      if (modifica.conservaStato && attuale) {
        const { quadratura, ...resto } = attuale;
        return [{ area: modifica.area, chiave: modifica.chiave, valore: { ...resto, valore: modifica.valore, stato: quadratura?.stato ?? resto.stato, ...(quadratura ? { nota: quadratura.nota } : {}), ...nota } }];
      }
      if (modifica.proposta) {
        return [{ area: modifica.area, chiave: modifica.chiave, valore: {
          valore: modifica.valore, fonte: { tipo: "testo", etichetta: "scritto in chat" }, fiducia: 0.5, stato: "proposta",
          nota: modifica.nota ?? "Scritto in chat: entra nella commessa solo se lo confermi.", daConfermare: true, toccato: true,
          // Finché non si conferma vale quello di prima, e «Toglilo» lo rimette (terza revisione, 2).
          alPostoDi: attuale ? (attuale.alPostoDi !== undefined ? attuale.alPostoDi : attuale) : null,
        } }];
      }
      // Le colonne che mancano a una commessa: quelle che ha già restano lì sotto.
      const commessa = attuale?.sopraCommessa ?? (giaNellaCommessa(piano, attuale) ? attuale : null);
      return [{
        area: modifica.area, chiave: modifica.chiave,
        valore: { ...daPersona(modifica.valore, "modificato da te", undefined, attuale), ...nota, ...(commessa ? { sopraCommessa: commessa } : {}) },
      }];
    }

    case "togli": {
      controllaChiave(modifica.area, modifica.chiave);
      const attuale = piano.aree[modifica.area]?.[modifica.chiave]?.valore;
      if (modifica.indice == null) {
        // Togliere una proposta della chat rimette quello che c'era (null: non c'era niente).
        const prima = piano.aree[modifica.area]?.[modifica.chiave]?.alPostoDi;
        if (prima !== undefined) return [{ area: modifica.area, chiave: modifica.chiave, valore: prima }];
        // Togliere la proposta fatta sopra una commessa rimette la commessa com'è.
        const sotto = piano.aree[modifica.area]?.[modifica.chiave]?.sopraCommessa;
        if (sotto) return [{ area: modifica.area, chiave: modifica.chiave, valore: sotto }];
        // Resta come «tolto da te» (null scritto da una persona): un frammento che arriva
        // dopo non lo rimette.
        return [{ area: modifica.area, chiave: modifica.chiave, valore: daPersona(null, "tolto da te") }];
      }
      if (!Array.isArray(attuale) || modifica.indice < 0 || modifica.indice >= attuale.length) {
        throw new Error(`«${modifica.chiave}» non ha un elemento ${modifica.indice}`);
      }
      const lista = attuale.filter((_, i) => i !== modifica.indice);
      return [{ area: modifica.area, chiave: modifica.chiave, valore: elencoToccato(piano.aree[modifica.area]![modifica.chiave], lista) }];
    }

    case "aggiungi": {
      controllaChiave(modifica.area, modifica.chiave);
      const attuale = piano.aree[modifica.area]?.[modifica.chiave]?.valore;
      if (attuale != null && !Array.isArray(attuale)) throw new Error(`«${modifica.chiave}» non è un elenco`);
      const lista = [...((attuale as unknown[] | null | undefined) ?? []), modifica.valore];
      const v = piano.aree[modifica.area]?.[modifica.chiave];
      return [{ area: modifica.area, chiave: modifica.chiave, valore: v ? elencoToccato(v, lista) : daPersona(lista, "modificato da te") }];
    }

    case "sposta_date": {
      const n = modifica.giorniLavorativi;
      const cal = piano.calendario ?? CALENDARIO_NAZIONALE;
      if (!Number.isInteger(n)) throw new Error("Lo spostamento va in giorni lavorativi interi");
      if (n === 0) return [];
      const fasi = piano.aree.fasi ?? {};
      const out: { area: Area; chiave: string; valore: Valore | null }[] = [];
      // Quello che la commessa ha già non si sposta: si spostano le date che Silvio propone.
      const libera = (chiave: string) => !giaNellaCommessa(piano, fasi[chiave]);
      const sposta = (chiave: string, valore: unknown) => {
        out.push({ area: "fasi", chiave, valore: daPersona(valore, "spostato da te", fasi[chiave]?.fonte, fasi[chiave]) });
      };
      const conData = (f: unknown) => Array.isArray(f) && f.some((x) => typeof (x as FaseDelPiano | null)?.start_date === "string");

      const elenco = libera(CHIAVE_FASI) ? fasi[CHIAVE_FASI]?.valore : fasi[CHIAVE_DATE_FASI]?.valore;
      const chiaveElenco = libera(CHIAVE_FASI) ? CHIAVE_FASI : CHIAVE_DATE_FASI;
      let da = 0;
      if (modifica.daFase) {
        const i = Array.isArray(elenco)
          ? elenco.findIndex((f) => {
            const r = (f ?? {}) as Record<string, unknown>;
            return r.id === modifica.daFase || r.name === modifica.daFase;
          })
          : -1;
        if (i < 0) throw new Error(`La fase «${modifica.daFase}» non c'è`);
        da = i;
      }
      if (conData(elenco)) sposta(chiaveElenco, (elenco as unknown[]).map((f, i) => (i >= da ? spostaFase(f, n, cal) : f)));

      // Da una fase in poi: l'inizio lavori si sposta se la fase è la prima (revisione 1/11, L8).
      const date = modifica.daFase && da > 0 ? [...DATE_FINALI] : ["fasi.work_start_date", ...DATE_FINALI];
      for (const chiave of date) {
        const v = fasi[chiave]?.valore;
        if (typeof v === "string" && libera(chiave)) sposta(chiave, spostaGiorniLavorativi(v, n, cal));
      }
      return out;
    }

    case "scegli_fonte": {
      const conflitto = piano.conflitti.find((c) => c.area === modifica.area && c.chiave === modifica.chiave);
      if (!conflitto) throw new Error(`Su «${modifica.chiave}» non c'è niente da scegliere`);
      // L'id dice quale documento; senza, l'etichetta (revisione 1/11, L1). Prima, senza id, si
      // prendeva il primo candidato di quel tipo: «tieni l'offerta» teneva il capitolato.
      const scelto = conflitto.candidati.find((c) => c.fonte.tipo === modifica.fonte && (modifica.idFonte != null
        ? c.fonte.id === modifica.idFonte
        : modifica.etichettaFonte == null || c.fonte.etichetta === modifica.etichettaFonte));
      if (!scelto) throw new Error(`«${modifica.chiave}»: nessun valore dalla fonte ${modifica.fonte}`);
      // Scelto dall'utente: vale come scritto da una persona, ma la ⓘ porta ancora al documento.
      return [{
        area: modifica.area, chiave: modifica.chiave,
        valore: { ...daPersona(scelto.valore, "scelto da te", scelto.fonte, scelto), ...(scelto.sopraCommessa ? { sopraCommessa: scelto.sopraCommessa } : {}) },
      }];
    }
  }
}

/**
 * Applica una modifica e aggiunge alla storia il passo per annullarla. Con `gruppo`, le
 * modifiche nate insieme si annullano insieme.
 */
export function applica(piano: PianoCommessa, modifica: Modifica, storia: Passo[] = [], gruppo: string | null = null): Bozza {
  const cambi = effetti(piano, modifica);
  if (cambi.length === 0) return { piano, storia };

  const passo: Passo = {
    modifica,
    ...(gruppo ? { gruppo } : {}),
    prima: cambi.map(({ area, chiave }) => ({ area, chiave, valore: piano.aree[area]?.[chiave] ?? null })),
    conflittiPrima: piano.conflitti.filter((c) => cambi.some((x) => x.area === c.area && x.chiave === c.chiave)),
  };
  // Una proposta non decide niente, e neanche toglierla: il disaccordo fra le fonti resta aperto.
  const togliProposta = modifica.tipo === "togli" && modifica.indice == null && piano.aree[modifica.area]?.[modifica.chiave]?.alPostoDi !== undefined;
  const decide = !togliProposta && !(modifica.tipo === "cambia_valore" && modifica.proposta);
  let out = piano;
  for (const { area, chiave, valore } of cambi) {
    out = decide ? { ...conValore(out, area, chiave, valore), conflitti: senzaConflitto(out.conflitti, area, chiave) } : conValore(out, area, chiave, valore);
  }
  // Tolta una proposta della chat, i documenti arrivati mentre era aperta tornano nella fusione.
  if (togliProposta) {
    const { area, chiave } = modifica;
    const rientrano = (out.scartati ?? []).filter((s) => s.area === area && s.chiave === chiave);
    if (rientrano.length && out.aree[area]?.[chiave]?.fonte.tipo !== "persona") {
      passo.scartatiPrima = rientrano;
      out = conScartatiRientrati(out, area, chiave);
    }
  }
  return { piano: conQuadratura(out), storia: [...storia, passo] };
}

/** I valori messi da parte di una variabile rientrano nella fusione: una fonte in disaccordo riapre il conflitto. */
function conScartatiRientrati(piano: PianoCommessa, area: Area, chiave: string): PianoCommessa {
  const rientrano = (piano.scartati ?? []).filter((s) => s.area === area && s.chiave === chiave);
  if (!rientrano.length) return piano;
  let out: PianoCommessa = { ...piano, scartati: (piano.scartati ?? []).filter((s) => !(s.area === area && s.chiave === chiave)) };
  for (const s of rientrano) out = fondiValore(out, area, chiave, s.valore);
  if (out.scartati && !out.scartati.length) delete out.scartati;
  return out;
}

function annullaPasso(piano: PianoCommessa, passo: Passo): PianoCommessa {
  let out = piano;
  let conflitti = piano.conflitti;
  for (const { area, chiave, valore } of passo.prima) {
    out = conValore(out, area, chiave, valore);
    conflitti = senzaConflitto(conflitti, area, chiave);
  }
  out = { ...out, conflitti: [...conflitti, ...passo.conflittiPrima] };
  if (passo.scartatiPrima?.length) out = { ...out, scartati: [...(out.scartati ?? []), ...passo.scartatiPrima] };
  // I valori arrivati mentre la persona aveva scritto la sua: tornano nella fusione, dove
  // una fonte in disaccordo riapre il conflitto (revisione 1/11, L5).
  for (const { area, chiave, valore } of passo.prima) {
    if (valore?.fonte.tipo === "persona") continue;
    out = conScartatiRientrati(out, area, chiave);
  }
  if (out.scartati && !out.scartati.length) delete out.scartati;
  return out;
}

/**
 * Annulla l'ultimo passo della storia (e, se ha un gruppo, tutti quelli del gruppo): le
 * variabili toccate tornano com'erano, coi loro conflitti. Il resto del piano (frammenti
 * arrivati nel frattempo) resta. Con la storia vuota non fa niente.
 */
export function annulla(piano: PianoCommessa, storia: Passo[]): Bozza {
  const ultimo = storia[storia.length - 1];
  if (!ultimo) return { piano, storia };
  let out = piano;
  let resto = storia;
  do {
    out = annullaPasso(out, resto[resto.length - 1]);
    resto = resto.slice(0, -1);
  } while (ultimo.gruppo && resto.length && resto[resto.length - 1].gruppo === ultimo.gruppo);
  return { piano: conQuadratura(out), storia: resto };
}

// ── Valori chiusi ───────────────────────────────────────────────────────────

/**
 * Spostare indietro da una fase in poi non deve farla partire prima che finisca quella
 * precedente (revisione 1/11, L8): il motivo, o null se le fasi restano una dopo l'altra.
 */
function spostamentoSovrapposto(piano: PianoCommessa, m: Extract<Modifica, { tipo: "sposta_date" }>): string | null {
  if (!m.daFase || m.giorniLavorativi >= 0) return null;
  const fasi = piano.aree.fasi ?? {};
  const chiave = giaNellaCommessa(piano, fasi[CHIAVE_FASI]) ? CHIAVE_DATE_FASI : CHIAVE_FASI;
  const elenco = fasi[chiave]?.valore;
  if (!Array.isArray(elenco)) return null;
  const lista = elenco as FaseDelPiano[];
  const i = lista.findIndex((f) => f?.id === m.daFase || f?.name === m.daFase);
  if (i <= 0 || !lista[i].start_date) return null;
  const nuovoInizio = spostaGiorniLavorativi(lista[i].start_date!, m.giorniLavorativi, piano.calendario ?? CALENDARIO_NAZIONALE);
  const prima = lista.slice(0, i).map((f) => f.end_date ?? f.start_date).filter((d): d is string => !!d).sort().pop();
  if (!prima || nuovoInizio > prima) return null;
  return `«${lista[i].name}» partirebbe prima che finisca la fase precedente: sposta di meno, o sposta anche le fasi prima.`;
}

/**
 * Per una variabile a più colonne già nella commessa: il valore nuovo cambia una colonna che ha
 * già? False se aggiunge soltanto quelle che mancano (revisione 2/11, G8). Null se non c'entra.
 */
function toccaLaCommessa(piano: PianoCommessa, m: Extract<Modifica, { tipo: "cambia_valore" }>): boolean | null {
  const attuale = piano.aree[m.area]?.[m.chiave];
  const commessa = attuale?.sopraCommessa ?? (giaNellaCommessa(piano, attuale) ? attuale : null);
  const vecchio = oggettoDi(commessa?.valore);
  const nuovo = oggettoDi(m.valore);
  if (!vecchio || !nuovo || (variabile(m.chiave)?.colonne.length ?? 0) < 2) return null;
  if (m.chiave === "cantiere.indirizzo" || m.chiave === "cliente.nome") return null;
  const cambia = pieneDi(vecchio).some(([k, x]) => !stessaColonna(k, x, nuovo[k]));
  const aggiunge = pieneDi(nuovo).some(([k]) => vecchio[k] == null || vecchio[k] === "");
  return cambia || !aggiunge;
}

/** Le variabili che una modifica toccherebbe. */
function chiaviDellaModifica(piano: PianoCommessa, m: Modifica): string[] {
  if (m.tipo !== "sposta_date") return [m.chiave];
  return [CHIAVE_FASI, CHIAVE_DATE_FASI, "fasi.work_start_date", ...DATE_FINALI].filter((k) => piano.aree.fasi?.[k]);
}

/**
 * Il motivo per cui la modifica non si fa (tocca quello che la commessa ha già), o null.
 * Uno spostamento delle date è fermo solo se non c'è niente di libero da spostare.
 */
export function modificaBloccata(piano: PianoCommessa, m: Modifica): string | null {
  const sovrapposta = m.tipo === "sposta_date" ? spostamentoSovrapposto(piano, m) : null;
  if (sovrapposta) return sovrapposta;
  const chiavi = chiaviDellaModifica(piano, m);
  if (m.tipo === "cambia_valore" && toccaLaCommessa(piano, m) === false) return null;
  const chiuse = chiavi.filter((k) => {
    const v = variabile(k);
    return v && (giaNellaCommessa(piano, piano.aree[v.area]?.[k]) || (m.tipo === "cambia_valore" && !!piano.aree[v.area]?.[k]?.sopraCommessa));
  });
  if (!chiuse.length) return null;
  if (m.tipo === "sposta_date") {
    const libere = chiavi.filter((k) => !chiuse.includes(k));
    if (libere.length) return null;
    return "Le date delle fasi sono già nella commessa: Silvio non le sposta. Si cambiano dalla pagina della commessa.";
  }
  const ferma = chiuse[0];
  return `«${variabile(ferma)?.etichetta ?? ferma}» è già nella commessa: Silvio non lo cambia. Si modifica dalla pagina della commessa.`;
}
