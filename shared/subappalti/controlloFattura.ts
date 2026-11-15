/**
 * Fattura del subappaltatore ↔ contratto e SAL: il controllo, con regole e dati già presenti.
 * Nessuna AI: P.IVA, numero di contratto e di SAL letti dal testo con regole, importi confrontati.
 *
 * Come sono fatti i dati (verificato sul database il 15/11/2026):
 * - `sal_subappaltatori.importo_lordo` è l'importo DEL PERIODO (i SAL si sommano per avere
 *   l'eseguito). Il cumulativo «a tutto il SAL n» si ricava qui, in `progressiviSal`, e non si
 *   salva da nessuna parte. Una fattura emessa sul cumulativo conterebbe due volte i SAL
 *   precedenti: il controllo la riconosce e la blocca.
 * - Le varianti approvate stanno in `subappalto_varianti_contratto` e aggiornano già
 *   `importo_contrattuale`: il valore autorizzato è importo + oneri del contratto com'è oggi.
 * - Le note di credito (TD04) riducono il fatturato.
 *
 * Esiti (piano del 15/11, §4): unico e verificato → automatico; plausibile → proposta;
 * più candidati → scelta; conflitto → blocco; nessuno → da gestire. Un conflitto su un dato
 * essenziale (P.IVA, numero di contratto o di SAL scritto in fattura) blocca sempre, qualunque
 * sia il resto: non c'è un punteggio che lo compensa. Un SAL mancante chiede una verifica ma
 * non rende sbagliata la fattura.
 */
import { chiaveFiscale } from "../acquisti/normalizza.ts";
import type { Prova as ProvaTraccia } from "../acquisti/riconciliazione.ts";

export type EsitoControllo = "automatico" | "proposta" | "scelta" | "conflitto" | "da_gestire";

export interface ContrattoCtrl {
  id: string;
  company_id: string;
  numero_contratto: string | null;
  piva: string | null;
  importo_contrattuale: number;
  oneri_sicurezza?: number | null;
  stato?: string | null;
  /** Acconto previsto dal contratto: si fattura senza SAL e si recupera nei SAL. */
  acconto_importo?: number | null;
}
export interface SalCtrl {
  id: string;
  company_id: string;
  contratto_id: string;
  numero_sal: number;
  /** Importo del periodo, come sta nel database. */
  importo_lordo: number;
  oneri_quota?: number | null;
  ritenuta_importo?: number | null;
  importo_netto?: number | null;
  /** Acconto recuperato da questo SAL: il netto è già al netto di questo. */
  acconto_recuperato?: number | null;
  stato: string | null;
  data_emissione?: string | null;
}
export interface FatturaCtrl {
  id: string;
  company_id: string;
  cedente_piva: string | null;
  numero_fattura?: string | null;
  data_fattura?: string | null;
  tipo_documento?: string | null;
  imponibile_totale: number | null;
  totale_documento?: number | null;
  stato?: string | null;
  contratto_subappalto_id?: string | null;
  sal_subappaltatore_id?: string | null;
  /** Descrizioni delle righe e note: da qui si leggono numero di contratto, SAL e periodo. */
  testo?: string | null;
}

export interface Problema {
  codice:
    | "piva_diversa" | "contratto_diverso" | "sal_diverso" | "importo_cumulativo" | "sal_gia_fatturato"
    | "oltre_contratto" | "oltre_approvato" | "sal_non_verificato" | "sal_mancante" | "periodo_sovrapposto"
    | "importo_diverso" | "altra_azienda" | "fattura_rifiutata" | "contratto_senza_numero"
    | "acconto_oltre" | "acconto_non_scalato" | "periodo_fuori_sal";
  blocca: boolean;
  testo: string;
}
export interface Prova { dato: string; valore: string }

export interface RisultatoControllo {
  esito: EsitoControllo;
  /** La regola che ha deciso l'esito, in parole. */
  regola: string;
  contrattoId: string | null;
  salId: string | null;
  /** Contratti o SAL fra cui scegliere, col motivo. */
  alternative: Array<{ contrattoId: string; salId: string | null; motivo: string }>;
  problemi: Problema[];
  prove: Prova[];
}

const n = (v: unknown) => Number(v) || 0;
const tondo = (v: number) => Math.round(v * 100) / 100;
const uguale = (a: number, b: number) => Math.abs(a - b) <= 0.01 + Math.abs(b) * 0.0005;
const euro = (v: number) => v.toLocaleString("it-IT", { style: "currency", currency: "EUR" });

/** P.IVA confrontabile: la chiave comune `chiaveFiscale`, uguale a `partner_tax_key` nel database. */
export const chiavePiva = (p: string | null | undefined): string => chiaveFiscale(p);
const numeroPulito = (s: string | null | undefined) => (s ?? "").toUpperCase().replace(/[\s\-_/.]/g, "");

/** Imponibile con segno: le note di credito sono negative. */
export function imponibileFattura(f: Pick<FatturaCtrl, "imponibile_totale" | "totale_documento" | "tipo_documento">): number {
  const base = f.imponibile_totale != null ? n(f.imponibile_totale) : n(f.totale_documento);
  return f.tipo_documento === "TD04" ? -Math.abs(base) : base;
}
const eNotaCredito = (f: Pick<FatturaCtrl, "tipo_documento">) => f.tipo_documento === "TD04";

/** Importo del periodo di un SAL: lavori più la quota oneri della sicurezza. */
export const periodoSal = (s: Pick<SalCtrl, "importo_lordo" | "oneri_quota">) => tondo(n(s.importo_lordo) + n(s.oneri_quota));

/**
 * SAL del periodo e SAL cumulativo, tenuti distinti. I contestati non entrano nel cumulativo.
 * Ordine: numero del SAL.
 */
export function progressiviSal(sal: SalCtrl[]): Array<{ id: string; numero: number; periodo: number; cumulativo: number }> {
  let acc = 0;
  return [...sal]
    .sort((a, b) => a.numero_sal - b.numero_sal)
    .map((s) => {
      const periodo = periodoSal(s);
      if (s.stato !== "contestato") acc = tondo(acc + periodo);
      return { id: s.id, numero: s.numero_sal, periodo, cumulativo: acc };
    });
}

/** «SAL n. 3», «SAL 3», «3° SAL», «stato avanzamento lavori n.3». Più numeri diversi = nessuno. */
export function salDalTesto(testo: string | null | undefined): number | null {
  if (!testo) return null;
  const trovati = new Set<number>();
  const t = testo.replace(/\s+/g, " ");
  for (const m of t.matchAll(/\b(?:S\.?A\.?L\.?|stato (?:di )?avanzamento(?: dei)? lavori)\s*(?:n(?:r|um|umero)?\.?\s*°?\s*)?(\d{1,3})\b/gi)) trovati.add(Number(m[1]));
  for (const m of t.matchAll(/\b(\d{1,3})\s*(?:°|º|o|\^)\s*S\.?A\.?L\b/gi)) trovati.add(Number(m[1]));
  return trovati.size === 1 ? [...trovati][0] : null;
}

/**
 * Il numero di contratto è citato nel testo? Due prove: il numero intero dentro il testo (almeno 3
 * caratteri, senza spazi e separatori), oppure il testo È il primo pezzo del numero. In archivio i
 * numeri sono spesso «02 del 15/09/2025 — commessa 06/2025», e la fattura scrive «contratto n. 02».
 */
function citaContratto(testo: string, numero: string | null): boolean {
  const k = numeroPulito(numero);
  if (k.length >= 3 && numeroPulito(testo).includes(k)) return true;
  const primo = numeroPulito((numero ?? "").trim().split(/\s+/)[0]);
  return !!primo && numeroPulito(testo) === primo;
}
/** Riferimenti a un contratto nel testo: «contratto n. XYZ», «contr. XYZ». */
function contrattiCitati(testo: string): string[] {
  return [...testo.matchAll(/\bcontr(?:atto|\.)\s*(?:di subappalto\s*)?(?:n(?:r|um|umero)?\.?\s*°?\s*)([A-Z0-9][A-Z0-9/\-_.]{1,30})/gi)]
    .map((m) => m[1].replace(/[.\-_/]+$/, ""));
}

/** «dal 01/09/2026 al 30/09/2026» o «periodo 01.09.2026 - 30.09.2026». */
export function periodoDalTesto(testo: string | null | undefined): { dal: string; al: string } | null {
  if (!testo) return null;
  const d = String.raw`(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})`;
  const m = testo.match(new RegExp(String.raw`(?:dal|periodo)\s*${d}\s*(?:al|-|–|a)\s*${d}`, "i"));
  if (!m) return null;
  const iso = (g: string, me: string, a: string) => `${a}-${me.padStart(2, "0")}-${g.padStart(2, "0")}`;
  const dal = iso(m[1], m[2], m[3]);
  const al = iso(m[4], m[5], m[6]);
  return dal <= al ? { dal, al } : null;
}

export interface ContestoControllo {
  contratti: ContrattoCtrl[];
  sal: SalCtrl[];
  /** Le altre fatture già collegate ai contratti dello stesso subappaltatore (questa esclusa). */
  altreFatture: FatturaCtrl[];
}

/**
 * Il controllo di una fattura ricevuta. Se è già collegata, verifica il collegamento; se non lo
 * è, cerca contratto e SAL. Lo stesso input dà sempre lo stesso risultato (rilanciarlo non cambia
 * niente): l'unica scrittura la fa `subappalto_collega_fattura` nel database, su conferma.
 */
export function controllaFatturaSubappalto(fattura: FatturaCtrl, ctx: ContestoControllo): RisultatoControllo {
  const problemi: Problema[] = [];
  const prove: Prova[] = [];
  const alternative: RisultatoControllo["alternative"] = [];
  const testo = fattura.testo ?? "";
  const imp = imponibileFattura(fattura);
  const piva = chiavePiva(fattura.cedente_piva);
  // Isolamento: niente di un'altra azienda entra nel confronto, nemmeno per errore di chi chiama.
  const contratti = ctx.contratti.filter((c) => c.company_id === fattura.company_id);
  const salAzienda = ctx.sal.filter((s) => s.company_id === fattura.company_id);
  const altre = ctx.altreFatture.filter((f) => f.company_id === fattura.company_id && f.id !== fattura.id && f.stato !== "rifiutata");
  const fine = (esito: EsitoControllo, regola: string, contrattoId: string | null, salId: string | null): RisultatoControllo =>
    ({ esito: problemi.some((p) => p.blocca) ? "conflitto" : esito, regola: problemi.find((p) => p.blocca)?.testo ?? regola, contrattoId, salId, alternative, problemi, prove });

  if (fattura.stato === "rifiutata") {
    problemi.push({ codice: "fattura_rifiutata", blocca: true, testo: "La fattura è rifiutata: non si collega." });
    return fine("conflitto", "", null, null);
  }
  if (piva) prove.push({ dato: "P.IVA del fornitore", valore: piva });
  const salNumTesto = salDalTesto(testo);
  if (salNumTesto != null) prove.push({ dato: "SAL citato in fattura", valore: `n. ${salNumTesto}` });
  const citati = contrattiCitati(testo);

  // 1. Il contratto: quello già collegato, altrimenti fra quelli dello stesso subappaltatore.
  let contratto: ContrattoCtrl | null = null;
  if (fattura.contratto_subappalto_id) {
    contratto = ctx.contratti.find((c) => c.id === fattura.contratto_subappalto_id) ?? null;
    if (contratto && contratto.company_id !== fattura.company_id) {
      problemi.push({ codice: "altra_azienda", blocca: true, testo: "Il contratto collegato è di un'altra azienda." });
      return fine("conflitto", "", null, null);
    }
  }
  if (contratto) {
    if (piva && chiavePiva(contratto.piva) && chiavePiva(contratto.piva) !== piva) {
      problemi.push({ codice: "piva_diversa", blocca: true, testo: `La P.IVA della fattura (${piva}) non è quella del subappaltatore del contratto (${chiavePiva(contratto.piva)}).` });
    }
    const altroCitato = citati.find((c) => !citaContratto(c, contratto!.numero_contratto) && contratti.some((k) => k.id !== contratto!.id && citaContratto(c, k.numero_contratto)));
    if (altroCitato) problemi.push({ codice: "contratto_diverso", blocca: true, testo: `La fattura cita il contratto ${altroCitato}, ma è collegata al contratto ${contratto.numero_contratto ?? "senza numero"}.` });
  } else {
    if (!piva) return fine("da_gestire", "La fattura non ha la P.IVA del fornitore: il contratto non si può riconoscere.", null, null);
    const delFornitore = contratti.filter((c) => chiavePiva(c.piva) === piva && c.stato !== "annullato");
    if (!delFornitore.length) return fine("da_gestire", "Nessun contratto di subappalto con questa P.IVA.", null, null);
    const perNumero = delFornitore.filter((c) => citaContratto(testo, c.numero_contratto) || citati.some((x) => citaContratto(x, c.numero_contratto)));
    if (perNumero.length === 1) {
      contratto = perNumero[0];
      prove.push({ dato: "Numero di contratto in fattura", valore: contratto.numero_contratto ?? "" });
    } else if (delFornitore.length === 1 && !citati.length) {
      contratto = delFornitore[0];
      prove.push({ dato: "Unico contratto del subappaltatore", valore: contratto.numero_contratto ?? "senza numero" });
    } else if (delFornitore.length === 1 && citati.length && !numeroPulito(delFornitore[0].numero_contratto)) {
      // Il contratto in archivio non ha numero: non si può dire che sia un altro. Dato mancante, non conflitto.
      contratto = delFornitore[0];
      prove.push({ dato: "Unico contratto del subappaltatore", valore: "senza numero" });
      problemi.push({ codice: "contratto_senza_numero", blocca: false, testo: `La fattura cita il contratto ${citati[0]}, ma il contratto in archivio non ha numero: scrivilo sul contratto.` });
    } else if (delFornitore.length === 1 && citati.length) {
      problemi.push({ codice: "contratto_diverso", blocca: true, testo: `La fattura cita il contratto ${citati[0]}, che non è quello del subappaltatore (${delFornitore[0].numero_contratto}).` });
      return fine("conflitto", "", null, null);
    } else {
      // Più contratti: si restringe con l'importo di un SAL; se resta più d'uno, sceglie l'utente.
      for (const c of perNumero.length ? perNumero : delFornitore) {
        const salC = salAzienda.filter((s) => s.contratto_id === c.id);
        const perImporto = salC.filter((s) => uguale(Math.abs(imp), periodoSal(s)) || uguale(Math.abs(imp), n(s.importo_netto)));
        const s = perImporto.length === 1 ? perImporto[0] : null;
        alternative.push({ contrattoId: c.id, salId: s?.id ?? null, motivo: s ? `SAL n. ${s.numero_sal} di ${euro(periodoSal(s))}, uguale all'imponibile` : `Contratto ${c.numero_contratto ?? "senza numero"} dello stesso subappaltatore` });
      }
      const conSal = alternative.filter((a) => a.salId);
      if (conSal.length === 1) {
        contratto = contratti.find((c) => c.id === conSal[0].contrattoId) ?? null;
        alternative.length = 0;
        prove.push({ dato: "Importo uguale a un solo SAL", valore: euro(Math.abs(imp)) });
      } else {
        return fine("scelta", `${delFornitore.length} contratti dello stesso subappaltatore: scegli quello giusto.`, null, null);
      }
    }
    if (contratto && piva && chiavePiva(contratto.piva) !== piva) {
      problemi.push({ codice: "piva_diversa", blocca: true, testo: "La P.IVA della fattura non è quella del subappaltatore del contratto." });
    }
  }
  if (!contratto) return fine("da_gestire", "Contratto non trovato.", null, null);

  // 2. I SAL del contratto: periodo e cumulativo distinti.
  const salC = salAzienda.filter((s) => s.contratto_id === contratto!.id);
  const prog = progressiviSal(salC);
  let sal: SalCtrl | null = null;
  let salCerto = false;
  if (fattura.sal_subappaltatore_id) {
    sal = salC.find((s) => s.id === fattura.sal_subappaltatore_id) ?? null;
    if (!sal) problemi.push({ codice: "sal_diverso", blocca: true, testo: "Il SAL collegato non è di questo contratto." });
    salCerto = !!sal;
  }
  if (sal && salNumTesto != null && sal.numero_sal !== salNumTesto) {
    problemi.push({ codice: "sal_diverso", blocca: true, testo: `La fattura cita il SAL n. ${salNumTesto}, ma è collegata al SAL n. ${sal.numero_sal}.` });
  }
  if (!sal && !fattura.sal_subappaltatore_id && !eNotaCredito(fattura)) {
    if (salNumTesto != null) {
      sal = salC.find((s) => s.numero_sal === salNumTesto) ?? null;
      if (sal) { salCerto = true; prove.push({ dato: "SAL trovato per numero", valore: `n. ${sal.numero_sal}` }); }
    }
    if (!sal) {
      const perImporto = salC.filter((s) => s.stato !== "contestato" && (uguale(imp, periodoSal(s)) || uguale(imp, n(s.importo_netto))));
      const liberi = perImporto.filter((s) => !altre.some((f) => f.sal_subappaltatore_id === s.id && !eNotaCredito(f)));
      const scelti = liberi.length ? liberi : perImporto;
      if (scelti.length === 1) { sal = scelti[0]; prove.push({ dato: "SAL con lo stesso importo", valore: `n. ${sal.numero_sal} · ${euro(periodoSal(sal))}` }); }
      else if (scelti.length > 1) for (const s of scelti) alternative.push({ contrattoId: contratto.id, salId: s.id, motivo: `SAL n. ${s.numero_sal} di ${euro(periodoSal(s))}` });
    }
  }

  // 2b. Fattura d'acconto: collegata al contratto senza SAL, entro l'acconto previsto.
  const acconto = tondo(n(contratto.acconto_importo));
  const accontoFatturatoAltre = tondo(altre.filter((f) => f.contratto_subappalto_id === contratto!.id && !f.sal_subappaltatore_id)
    .reduce((t, f) => t + imponibileFattura(f), 0));
  const accontoDaFatturare = tondo(acconto - accontoFatturatoAltre);
  const citaAcconto = /\b(acconto|anticipazion)/i.test(testo);
  let eAcconto = false;
  if (!sal && !fattura.sal_subappaltatore_id && !eNotaCredito(fattura) && acconto > 0
      && (citaAcconto || (!alternative.length && uguale(imp, accontoDaFatturare)))) {
    eAcconto = true;
    alternative.length = 0;
    prove.push({ dato: "Fattura d'acconto", valore: `${euro(imp)} su un acconto di ${euro(acconto)}` });
    if (tondo(accontoFatturatoAltre + imp) > acconto + 0.01) {
      problemi.push({ codice: "acconto_oltre", blocca: true,
        testo: `Con questa fattura l'acconto fatturato (${euro(tondo(accontoFatturatoAltre + imp))}) supera l'acconto del contratto (${euro(acconto)}).` });
    }
  }

  // 3. Fattura sul cumulativo: l'importo è il «a tutto il SAL n», non il periodo.
  if (!eNotaCredito(fattura)) {
    const p = sal ? prog.find((x) => x.id === sal!.id) : null;
    const suCumulativo = p
      ? p.numero > 1 && !uguale(imp, p.periodo) && uguale(imp, p.cumulativo)
      : prog.some((x) => x.numero > 1 && uguale(imp, x.cumulativo) && !prog.some((y) => uguale(imp, y.periodo)));
    if (suCumulativo) {
      const x = p ?? prog.find((y) => uguale(imp, y.cumulativo))!;
      problemi.push({ codice: "importo_cumulativo", blocca: true,
        testo: `L'imponibile (${euro(imp)}) è il cumulativo a tutto il SAL n. ${x.numero}, non il periodo (${euro(x.periodo)}): i SAL precedenti sarebbero contati due volte.` });
    } else if (sal && n(sal.acconto_recuperato) > 0 && !uguale(imp, n(sal.importo_netto))
               && (uguale(imp, tondo(n(sal.importo_netto) + n(sal.acconto_recuperato))) || uguale(imp, periodoSal(sal)))) {
      // Il SAL recupera l'acconto, la fattura no: l'acconto già fatturato si pagherebbe due volte.
      problemi.push({ codice: "acconto_non_scalato", blocca: true,
        testo: `Il SAL n. ${sal.numero_sal} recupera ${euro(n(sal.acconto_recuperato))} di acconto, ma la fattura (${euro(imp)}) non lo scala: l'imponibile atteso è ${euro(n(sal.importo_netto))}.` });
    } else if (sal && !uguale(imp, periodoSal(sal)) && !uguale(imp, n(sal.importo_netto))) {
      // Importo diverso dal SAL: può essere una fattura parziale. Proposta, non blocco.
      problemi.push({ codice: "importo_diverso", blocca: false, testo: `L'imponibile (${euro(imp)}) non è l'importo del SAL n. ${sal.numero_sal} (${euro(periodoSal(sal))}).` });
    }
  }

  // 4. SAL già fatturato: altre fatture sullo stesso SAL arrivano già al suo importo.
  if (sal && !eNotaCredito(fattura)) {
    const giaSuSal = tondo(altre.filter((f) => f.sal_subappaltatore_id === sal!.id).reduce((t, f) => t + imponibileFattura(f), 0));
    if (giaSuSal > 0.01 && tondo(giaSuSal + imp) > periodoSal(sal) + 0.01) {
      problemi.push({ codice: "sal_gia_fatturato", blocca: true,
        testo: `Il SAL n. ${sal.numero_sal} (${euro(periodoSal(sal))}) è già fatturato per ${euro(giaSuSal)}: con questa fattura si arriverebbe a ${euro(tondo(giaSuSal + imp))}.` });
    }
  }

  // 5. Oltre l'autorizzato: contratto (con le varianti già dentro l'importo) e SAL approvati.
  const valore = tondo(n(contratto.importo_contrattuale) + n(contratto.oneri_sicurezza));
  const fatturatoAltre = tondo(altre.filter((f) => f.contratto_subappalto_id === contratto!.id).reduce((t, f) => t + imponibileFattura(f), 0));
  const fatturatoTot = tondo(fatturatoAltre + imp);
  const approvato = tondo(salC.filter((s) => s.stato === "verificato" || s.stato === "pagato").reduce((t, s) => t + periodoSal(s), 0));
  // L'acconto non ancora recuperato è autorizzato dal contratto anche senza SAL.
  const recuperato = tondo(salC.filter((s) => s.stato !== "contestato").reduce((t, s) => t + n(s.acconto_recuperato), 0));
  const autorizzato = tondo(approvato + Math.max(0, acconto - recuperato));
  prove.push({ dato: "Valore del contratto (varianti comprese)", valore: euro(valore) });
  prove.push({ dato: "Fatturato con questa fattura", valore: euro(fatturatoTot) });
  if (valore > 0 && fatturatoTot > valore + 0.01) {
    problemi.push({ codice: "oltre_contratto", blocca: true, testo: `Con questa fattura il fatturato (${euro(fatturatoTot)}) supera il valore del contratto (${euro(valore)}): serve una variante approvata.` });
  } else if (fatturatoTot > autorizzato + 0.01 && !eNotaCredito(fattura)) {
    problemi.push({ codice: "oltre_approvato", blocca: false, testo: `Con questa fattura il fatturato (${euro(fatturatoTot)}) supera i SAL approvati${acconto > 0 ? " più l'acconto da recuperare" : ""} (${euro(autorizzato)}): verifica i SAL prima di pagare.` });
  }

  // 6. Periodi sovrapposti con altre fatture dello stesso contratto.
  const periodo = periodoDalTesto(testo);
  if (periodo) {
    prove.push({ dato: "Periodo in fattura", valore: `${periodo.dal} → ${periodo.al}` });
    for (const f of altre.filter((x) => x.contratto_subappalto_id === contratto!.id && !eNotaCredito(x))) {
      const q = periodoDalTesto(f.testo);
      if (q && q.dal <= periodo.al && periodo.dal <= q.al) {
        problemi.push({ codice: "periodo_sovrapposto", blocca: false, testo: `Il periodo si sovrappone a quello della fattura ${f.numero_fattura ?? ""} (${q.dal} → ${q.al}).` });
      }
    }
    // Il periodo del SAL si ricava dalle date di emissione: dal giorno dopo il SAL precedente
    // alla data di questo. Una fattura che dichiara lavori dopo il SAL che cita non torna.
    if (sal?.data_emissione && periodo.dal > sal.data_emissione) {
      problemi.push({ codice: "periodo_fuori_sal", blocca: false,
        testo: `La fattura dichiara lavori dal ${periodo.dal}, dopo la data del SAL n. ${sal.numero_sal} (${sal.data_emissione}): forse è del SAL successivo.` });
    }
  }

  // 7. Lo stato del SAL: non verificato o mancante chiede una verifica, non è un errore della fattura.
  if (sal && sal.stato !== "verificato" && sal.stato !== "pagato") {
    problemi.push({ codice: "sal_non_verificato", blocca: false, testo: `Il SAL n. ${sal.numero_sal} non è ancora verificato: va approvato prima di collegare e pagare.` });
  }
  if (!sal && !eAcconto && !eNotaCredito(fattura) && !alternative.length) {
    problemi.push({ codice: "sal_mancante", blocca: false, testo: "Nessun SAL corrisponde a questa fattura: verifica se manca un SAL o se è un acconto previsto dal contratto." });
  }

  if (alternative.length) return fine("scelta", `${alternative.length} SAL possibili: scegli quello giusto.`, contratto.id, null);
  const avvisi = problemi.filter((p) => !p.blocca);
  const unico = !!sal && salCerto && (sal.stato === "verificato" || sal.stato === "pagato")
    && (uguale(imp, periodoSal(sal)) || uguale(imp, n(sal.importo_netto)));
  if (unico && !avvisi.length) return fine("automatico", "Stesso subappaltatore, SAL citato e verificato, importo uguale al periodo del SAL.", contratto.id, sal!.id);
  if (eAcconto && citaAcconto && uguale(imp, accontoDaFatturare) && !avvisi.length) {
    return fine("automatico", "Fattura d'acconto del subappaltatore: importo uguale all'acconto del contratto ancora da fatturare.", contratto.id, null);
  }
  if (eAcconto) return fine("proposta", avvisi[0]?.testo ?? "Fattura d'acconto: da confermare.", contratto.id, null);
  if (contratto && (sal || eNotaCredito(fattura))) return fine("proposta", avvisi[0]?.testo ?? "Contratto e SAL trovati: da confermare.", contratto.id, sal?.id ?? null);
  return fine("proposta", avvisi[0]?.testo ?? "Contratto trovato, SAL da scegliere.", contratto.id, null);
}

/** Le prove del controllo nel formato della traccia comune (acquisti_collegamenti.prove). */
export function proveTraccia(r: RisultatoControllo): ProvaTraccia[] {
  return r.prove.map((p) => ({
    campo: p.dato.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60),
    ruolo: "conferma",
    esito: "uguale",
    trovato: p.valore,
    testo: `${p.dato}: ${p.valore}`,
  }));
}

/**
 * L'interruttore del collegamento automatico dell'azienda (docs/automazioni-acquisti.md §3):
 * spento, «automatico» si mostra come proposta da confermare. Gli altri esiti non cambiano.
 */
export function conInterruttoreSubappalto(r: RisultatoControllo, automaticoAcceso: boolean): RisultatoControllo {
  if (r.esito !== "automatico" || automaticoAcceso) return r;
  return { ...r, esito: "proposta", regola: `${r.regola} Da confermare: il collegamento automatico è spento.` };
}

/** Il testo su cui leggere contratto, SAL e periodo: descrizioni delle righe e note. */
export function testoFattura(f: { righe?: unknown; note?: string | null }): string {
  const righe = Array.isArray(f.righe) ? f.righe : [];
  const descrizioni = righe
    .map((r) => (r && typeof r === "object" ? String((r as Record<string, unknown>).descrizione ?? (r as Record<string, unknown>).Descrizione ?? "") : ""))
    .filter(Boolean);
  return [...descrizioni, f.note ?? ""].join("\n");
}

export interface DecisioneGiro { fattura: FatturaCtrl; risultato: RisultatoControllo }

/**
 * Il giro su un'azienda: controlla le fatture non collegate, nell'ordine dato, e restituisce
 * solo quelle da collegare da sole («automatico»). Ogni fattura decisa entra fra le «altre» per
 * le successive dello stesso giro: due fatture uguali non prendono lo stesso SAL, e la seconda
 * risulta «SAL già fatturato». L'interruttore lo applica chi scrive (subappalto_collega_fattura).
 */
export function decidiGiro(libere: FatturaCtrl[], ctx: ContestoControllo): { automatiche: DecisioneGiro[]; altre: Record<EsitoControllo, number> } {
  const altre: Record<EsitoControllo, number> = { automatico: 0, proposta: 0, scelta: 0, conflitto: 0, da_gestire: 0 };
  const automatiche: DecisioneGiro[] = [];
  const giaDecise: FatturaCtrl[] = [...ctx.altreFatture];
  for (const f of libere) {
    if (f.contratto_subappalto_id) continue;
    const risultato = controllaFatturaSubappalto(f, { ...ctx, altreFatture: giaDecise });
    if (risultato.esito === "automatico" && risultato.contrattoId) {
      automatiche.push({ fattura: f, risultato });
      giaDecise.push({ ...f, contratto_subappalto_id: risultato.contrattoId, sal_subappaltatore_id: risultato.salId });
    } else {
      altre[risultato.esito]++;
    }
  }
  return { automatiche, altre };
}
