/**
 * Commessa generale dai documenti — cosa si scrive alla conferma (lotti 4-8 del piano
 * docs/piano-commessa-generale-da-documenti.md, §4-5).
 *
 * Dai dati letti e dalla bozza del popup («Costruisci») esce un PIANO DI SCRITTURA: la generale,
 * i suoi dati, il contratto, le garanzie, i riferimenti PA, l'elenco prezzi e le fasi. Lo esegue
 * in una sola transazione `commessa_generale_crea_da_documenti`. Regole:
 * - entra solo ciò che l'utente ha CONFERMATO: un campo non confermato non si scrive;
 * - il valore di un campo è quello scelto o corretto, altrimenti quello letto se unico;
 * - un campo in conflitto senza scelta non ha valore (e il popup non lascia confermare).
 * Codice puro: lo provano i test e lo usa il popup.
 */
import { catalogoPer, type TipoDaDocumenti } from "./catalogo";
import { statoCampo, type DatiLetti, type Scelte, type Valore } from "./controlli";
import type { Strutturati } from "./strutturati";

export type FormaAppalto = "singolo" | "accordo_quadro" | "applicativo";

export interface BozzaCostruisci {
  nome: string;
  clienteId: string | null;
  forma: FormaAppalto | null;
  scelte: Scelte;
  confermati: string[];
  /** Controlli rossi che l'utente ha visto e accettato, con la nota. */
  accettati: string[];
  /** RTI: la quota dell'impresa, in %. Null = tutto (impresa singola). Scelta del titolare n. 4 (16/11/2026). */
  quotaPct: number | null;
  /** Dal computo strutturato: elenco prezzi e fasi (lotto 6). */
  conElenco: boolean;
  conFasi: boolean;
}

export const BOZZA_VUOTA: BozzaCostruisci = {
  nome: "", clienteId: null, forma: null, scelte: {}, confermati: [], accettati: [], quotaPct: null, conElenco: true, conFasi: true,
};

export function bozzaDa(raw: unknown): BozzaCostruisci {
  const b = (raw && typeof raw === "object" ? raw : {}) as Partial<BozzaCostruisci>;
  return {
    ...BOZZA_VUOTA, ...b,
    scelte: b.scelte && typeof b.scelte === "object" ? b.scelte : {},
    confermati: Array.isArray(b.confermati) ? b.confermati : [],
    accettati: Array.isArray(b.accettati) ? b.accettati : [],
  };
}

/** Il valore di un campo per la scrittura: scelto o letto; null se in conflitto o non trovato. */
export function valoreCampo(tipo: TipoDaDocumenti, chiave: string, dati: DatiLetti, bozza: BozzaCostruisci): Valore | null {
  return statoCampo(tipo, chiave, dati, bozza.scelte).valore;
}

/** I campi confermati con un valore: la sola cosa che si scrive. */
export function valoriConfermati(tipo: TipoDaDocumenti, dati: DatiLetti, bozza: BozzaCostruisci): Record<string, Valore> {
  const out: Record<string, Valore> = {};
  const ok = new Set(bozza.confermati);
  for (const c of catalogoPer(tipo).campi) {
    if (!ok.has(c.chiave) || c.escluso) continue;
    const v = valoreCampo(tipo, c.chiave, dati, bozza);
    if (v !== null && v !== "") out[c.chiave] = v;
  }
  return out;
}

const num = (v: Valore | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const txt = (v: Valore | undefined) => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);
const tondo = (n: number) => Math.round(n * 100) / 100;

export interface PianoScrittura {
  modello: "appalto" | "sviluppo" | "compravendita";
  nome: string;
  cliente_id: string | null;
  valore: number | null;
  dati: Record<string, unknown>;
  contratto: Record<string, unknown> | null;
  garanzie: { tipo: string; importo: number | null; massimale: number | null; note: string | null }[];
  riferimenti_pa: Record<string, unknown>[];
  elenco: { codice: string | null; descrizione: string; unita_misura: string; prezzo: number; quantita_contratto: number | null; soggetto_ribasso: boolean }[];
  fasi: { nome: string; voci: { descrizione: string; unita: string; quantita: number; importo: number }[] }[];
  /** Cosa non si è potuto scrivere e perché: si mostra prima di confermare. */
  note: string[];
}

export function pianoDiScrittura(
  tipo: TipoDaDocumenti, dati: DatiLetti, bozza: BozzaCostruisci, strutturati: Strutturati = {},
): PianoScrittura {
  const v = valoriConfermati(tipo, dati, bozza);
  const note: string[] = [];
  const appalto = tipo === "appalto_pubblico" || tipo === "appalto_privato";
  const piano: PianoScrittura = {
    modello: appalto ? "appalto" : tipo,
    nome: (bozza.nome || txt(v.oggetto) || "").slice(0, 200),
    cliente_id: bozza.clienteId,
    valore: null,
    dati: {},
    contratto: null,
    garanzie: [],
    riferimenti_pa: [],
    elenco: [],
    fasi: [],
    note,
  };

  if (appalto) {
    // RTI (scelta del titolare n. 4): la commessa vale per la quota; il totale resta nel contratto.
    const quota = bozza.quotaPct !== null && bozza.quotaPct > 0 && bozza.quotaPct < 100 ? bozza.quotaPct / 100 : 1;
    const contrattuale = num(v.importo_contrattuale);
    const base = num(v.importo_base);
    const oneri = num(v.oneri_sicurezza);
    // La penale si legge per mille al giorno; nel contratto è in euro al giorno, sull'importo contrattuale.
    const permille = num(v.penale_permille);
    const penaleEuro = permille !== null && contrattuale !== null ? tondo((permille / 1000) * contrattuale * quota) : null;
    if (permille !== null && contrattuale === null) note.push("Penale: serve l'importo contrattuale confermato per calcolarla in euro al giorno.");
    piano.contratto = {
      riferimento: txt(v.contratto_numero),
      data_firma: txt(v.contratto_data),
      importo_base: base !== null ? tondo(base * quota) : null,
      ribasso_pct: num(v.ribasso_pct) ?? 0,
      oneri_sicurezza: oneri !== null ? tondo(oneri * quota) : 0,
      data_consegna_lavori: txt(v.data_consegna),
      data_fine_prevista: txt(v.data_fine_prevista),
      penale_giornaliera: penaleEuro,
      penale_massima_pct: num(v.penale_massima_pct) ?? 10,
      anticipazione_pct: num(v.anticipazione_pct) ?? 0,
      ritenuta_pct: num(v.ritenuta_pct) ?? (tipo === "appalto_pubblico" ? 0.5 : 0),
      cig: txt(v.cig),
      cup: txt(v.cup),
      split_payment: v.split_payment === true,
      costo_manodopera: num(v.costo_manodopera),
      durata_giorni: num(v.durata_giorni),
      a_corpo_misura: txt(v.corpo_misura),
      sal_soglia_importo: num(v.sal_soglia),
      sal_cadenza_giorni: num(v.sal_cadenza_giorni),
      termini_pagamento_giorni: num(v.termini_pagamento_giorni),
      revisione_prezzi: txt(v.revisione_prezzi),
      tetto_accordo: num(v.tetto_accordo) !== null ? tondo(num(v.tetto_accordo)! * quota) : null,
      importo_totale_appalto: quota < 1 ? contrattuale : null,
      quota_pct: quota < 1 ? bozza.quotaPct : null,
      note: [txt(v.subappalto) && `Subappalto: ${txt(v.subappalto)}`, permille !== null && `Penale letta: ${permille.toLocaleString("it-IT")}‰ al giorno.`]
        .filter(Boolean).join("\n") || null,
    };
    if (base === null && contrattuale !== null) {
      // Senza base, il valore del contratto si porta come base con ribasso zero, oneri compresi.
      piano.contratto.importo_base = tondo((contrattuale - (oneri ?? 0)) * quota);
      piano.contratto.ribasso_pct = 0;
      note.push("Base d'asta non confermata: nel contratto l'importo contrattuale vale come base senza ribasso.");
    }
    piano.valore = contrattuale !== null ? tondo(contrattuale * quota) : null;

    // Accordo quadro (scelta del titolare n. 1): la generale vale l'importo massimo dell'accordo e
    // ogni contratto applicativo, figlia, lo «scala» (Assegnato / Da assegnare della generale). Il
    // contratto della generale non ha una base da ribassare: il ribasso unico resta come dato.
    if (tipo === "appalto_pubblico" && bozza.forma === "accordo_quadro") {
      const tetto = num(v.tetto_accordo) ?? contrattuale;
      piano.contratto.importo_base = null;
      piano.contratto.oneri_sicurezza = 0;
      piano.contratto.penale_giornaliera = null;
      piano.contratto.tetto_accordo = tetto !== null ? tondo(tetto * quota) : null;
      piano.valore = tetto !== null ? tondo(tetto * quota) : null;
      if (num(v.tetto_accordo) === null && contrattuale !== null) note.push("Importo massimo dell'accordo non confermato: vale l'importo contrattuale letto.");
      if (permille !== null) note.push("Accordo quadro: la penale si calcola su ogni contratto applicativo.");
      // La base d'asta qui non serve: la nota del caso senza base non vale.
      const i = note.findIndex((n) => n.startsWith("Base d'asta non confermata"));
      if (i >= 0) note.splice(i, 1);
    }

    piano.dati = {
      ...(txt(v.luogo) ? { indirizzo: txt(v.luogo) } : {}),
      ...(txt(v.data_consegna) ? { inizio: txt(v.data_consegna) } : {}),
      ...(txt(v.data_fine_prevista) ? { fine: txt(v.data_fine_prevista) } : {}),
      appalto: Object.fromEntries(Object.entries({
        tipo: tipo === "appalto_pubblico" ? "Pubblico" : "Privato",
        forma: tipo === "appalto_pubblico" ? (bozza.forma === "accordo_quadro" ? "Accordo quadro" : "Contratto singolo") : null,
        stazione_appaltante: txt(v.stazione_appaltante),
        rup: txt(v.rup),
        direttore_lavori: txt(v.direttore_lavori),
        cse: txt(v.cse),
        soa: txt(v.categorie_soa),
        esecutore: txt(v.esecutore_forma),
        quota_pct: quota < 1 ? bozza.quotaPct : null,
        cig_accordo: txt(v.cig_accordo),
      }).filter(([, x]) => x !== null && x !== undefined)),
    };

    if (num(v.cauzione_definitiva) !== null) piano.garanzie.push({ tipo: "cauzione_definitiva", importo: num(v.cauzione_definitiva), massimale: null, note: null });
    if (num(v.car_somma_lavori) !== null || num(v.rct_massimale) !== null) {
      piano.garanzie.push({ tipo: "car", importo: num(v.car_somma_lavori), massimale: num(v.rct_massimale), note: "Polizza CAR/RCT letta dai documenti" });
    }

    if (tipo === "appalto_pubblico" && (txt(v.cig) || txt(v.cup) || txt(v.codice_univoco) || txt(v.contratto_numero))) {
      piano.riferimenti_pa.push({
        tipo: "contratto",
        numero: txt(v.contratto_numero),
        data: txt(v.contratto_data),
        cig: txt(v.cig),
        cup: txt(v.cup),
        codice_univoco_ufficio: txt(v.codice_univoco),
      });
    }
  } else if (tipo === "sviluppo") {
    piano.dati = {
      area: Object.fromEntries(Object.entries({ catasto: txt(v.catasto), superficie: txt(v.superficie) }).filter(([, x]) => x)),
      titolo: Object.fromEntries(Object.entries({ tipo: txt(v.titolo_tipo), numero: txt(v.titolo_numero), data: txt(v.titolo_data), scadenza: txt(v.titolo_scadenza) }).filter(([, x]) => x)),
    };
    piano.valore = null;
  } else {
    piano.dati = {
      immobile: Object.fromEntries(Object.entries({
        indirizzo: txt(v.immobile_indirizzo), catasto: txt(v.immobile_catasto), prezzo: num(v.prezzo_atto),
        data_compromesso: txt(v.data_compromesso), data_rogito: txt(v.data_rogito),
      }).filter(([, x]) => x !== null)),
      ...(txt(v.immobile_indirizzo) ? { indirizzo: txt(v.immobile_indirizzo) } : {}),
    };
  }
  if (bozza.clienteId) piano.dati.cliente_id = bozza.clienteId;

  // Computo strutturato → elenco prezzi e fasi (lotto 6). Solo per gli appalti: è il contratto.
  const quotaFasi = bozza.quotaPct !== null && bozza.quotaPct > 0 && bozza.quotaPct < 100 ? bozza.quotaPct / 100 : 1;
  if (appalto) {
    const tutti = Object.values(strutturati).filter((s) => s.voci?.length);
    const computi = tutti.filter((s) => s.documento === "computo");
    const sicurezze = tutti.filter((s) => s.documento === "sicurezza");
    const elenchi = tutti.filter((s) => s.documento === "elenco_prezzi");
    if (bozza.conElenco) {
      const visti = new Set<string>();
      // L'elenco prezzi del contratto: dal file dell'elenco se c'è, altrimenti dalle voci del computo.
      for (const s of elenchi.length ? elenchi : computi) for (const x of s.voci) {
        const chiave = `${x.codice ?? ""}|${x.descrizione}`;
        if (visti.has(chiave) || !x.descrizione.trim() || !(x.prezzo >= 0)) continue;
        visti.add(chiave);
        piano.elenco.push({ codice: x.codice, descrizione: x.descrizione.slice(0, 2000), unita_misura: x.unita, prezzo: x.prezzo, quantita_contratto: elenchi.length ? null : x.quantita || null, soggetto_ribasso: !x.sicurezza });
      }
      for (const s of sicurezze) for (const x of s.voci) {
        if (!x.descrizione.trim() || !(x.prezzo >= 0)) continue;
        piano.elenco.push({ codice: x.codice, descrizione: x.descrizione.slice(0, 2000), unita_misura: x.unita, prezzo: x.prezzo, quantita_contratto: x.quantita || null, soggetto_ribasso: false });
      }
    }
    // Le fasi portano il venduto: i prezzi del computo sono prima del ribasso, quindi si
    // ribassano col ribasso confermato; la sicurezza va in una fase a parte, senza ribasso.
    // Senza ribasso confermato le fasi non si creano: il venduto verrebbe gonfiato.
    // Nell'appalto privato spesso non c'è ribasso: vale zero. Nel pubblico va confermato.
    const ribasso = num(v.ribasso_pct) ?? (tipo === "appalto_privato" ? 0 : null);
    if (bozza.conFasi && computi.length && ribasso === null) {
      note.push("Fasi dal computo: conferma prima il ribasso, i prezzi del computo sono prima del ribasso. Senza, le fasi non si creano.");
    } else if (bozza.conFasi && computi.length) {
      const fattore = 1 - ribasso! / 100;
      const perCapitolo = new Map<string, PianoScrittura["fasi"][number]>();
      const sicurezza: PianoScrittura["fasi"][number] = { nome: "Oneri della sicurezza", voci: [] };
      for (const s of computi) for (const x of s.voci) {
        // In un raggruppamento le fasi valgono per la quota, come il contratto.
        if (x.sicurezza) { sicurezza.voci.push({ descrizione: x.descrizione.slice(0, 500), unita: x.unita, quantita: x.quantita, importo: tondo(x.importo * quotaFasi) }); continue; }
        const nome = (x.capitolo || "Lavori").slice(0, 160);
        const f = perCapitolo.get(nome) ?? { nome, voci: [] };
        f.voci.push({ descrizione: x.descrizione.slice(0, 500), unita: x.unita, quantita: x.quantita, importo: tondo(x.importo * fattore * quotaFasi) });
        perCapitolo.set(nome, f);
      }
      for (const s of sicurezze) for (const x of s.voci) {
        sicurezza.voci.push({ descrizione: x.descrizione.slice(0, 500), unita: x.unita, quantita: x.quantita, importo: tondo(x.importo * quotaFasi) });
      }
      const tutte = [...perCapitolo.values()];
      if (tutte.length > 59) note.push(`Il computo ha ${tutte.length} capitoli: si creano le prime 59 fasi più la sicurezza, le altre si aggiungono dalla commessa.`);
      piano.fasi = [...tutte.slice(0, 59), ...(sicurezza.voci.length ? [sicurezza] : [])];
      if (ribasso! > 0) note.push(`Fasi dal computo con il ribasso del ${ribasso!.toLocaleString("it-IT")}%; la sicurezza senza ribasso.`);
    }
  }
  return piano;
}

/** Cosa manca per poter creare. Vuoto = si può. */
export function mancaPerCreare(piano: PianoScrittura, bloccanti: number): string[] {
  const out: string[] = [];
  if (!piano.nome.trim()) out.push("il nome della commessa generale");
  if (piano.modello === "appalto" && !piano.cliente_id) out.push("il committente");
  if (bloccanti > 0) out.push(bloccanti === 1 ? "una scelta fra valori diversi o un controllo rosso" : `${bloccanti} scelte o controlli rossi`);
  return out;
}
